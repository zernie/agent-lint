/**
 * The run artifact — resolution, merging, and the staleness contract.
 *
 * Every behaviour here has both halves, because the failure modes point in
 * opposite directions: a resolver that matches too little loses real coverage
 * (a false untested), and one that matches too much manufactures coverage for a
 * surface nothing ran against — the exact defect (`vigiles/s54.md` №10/№17)
 * this tier exists to close, re-committed one layer up.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  COVERAGE_ARTIFACT_VERSION,
  executedScripts,
  indexRuns,
  mergeRuns,
  readCoverageArtifact,
  recordsFrom,
  resolveProbe,
  runsFromResults,
  surfaceSha,
  writeCoverageArtifact,
  type CoverageRun,
} from "./coverage-artifact.js";
import type { Surface } from "./test-coverage.js";
import { makeTmpDir, cleanupTmpDir } from "./core/test-utils.js";

const skill = (name: string, path: string): Surface => ({
  kind: "skill",
  path,
  name,
  tokens: [],
  ignored: false,
});
const hook = (name: string, path: string): Surface => ({
  kind: "hook",
  path,
  name,
  tokens: [],
  ignored: false,
});

const run = (over: Partial<CoverageRun> = {}): CoverageRun => ({
  kind: "skill",
  path: "skills/alpha/SKILL.md",
  name: "alpha",
  tier: "harness",
  how: "fired",
  by: "t.harness.mjs",
  at: "2026-08-11T10:00:00.000Z",
  sha: "aaaa",
  ...over,
});

// --- resolution --------------------------------------------------------------

test("a command ref resolves to the hook it names, by path or by basename", () => {
  const surfaces = [hook("guard", ".claude/hooks/guard.sh")];
  for (const ref of [
    ".claude/hooks/guard.sh",
    "/abs/checkout/.claude/hooks/guard.sh",
    "guard.sh",
  ]) {
    assert.deepEqual(
      resolveProbe({ how: "command", ref }, surfaces).map((s) => s.path),
      [".claude/hooks/guard.sh"],
      ref,
    );
  }
});

test("a command ref NEVER resolves to a non-hook surface", () => {
  // A command runs a program; the only surface kind that IS a program is a hook.
  // A skill's bundled helper being executed is a test of THAT SCRIPT, not of the
  // skill — the "a test NEAR it" for "a test OF it" substitution that colocation
  // by directory was making (defect №17), reached by a different route.
  //
  // Asserted against a hand-built surface whose path WOULD match, because in a
  // real repo it cannot: skills and agents are `.md` and a command ref always
  // ends in a script extension. That makes this a guard on an invariant of
  // surface discovery rather than a live filter — and a guard nothing tests is
  // one that quietly stops holding when discovery changes.
  const bundled: Surface = {
    kind: "skill",
    path: "skills/vc/scripts/verify.mjs",
    name: "vc",
    tokens: [],
    ignored: false,
  };
  const ref = { how: "command" as const, ref: "skills/vc/scripts/verify.mjs" };
  assert.deepEqual(resolveProbe(ref, [bundled]), []);
  // The control: the same path, declared a hook, resolves.
  assert.equal(resolveProbe(ref, [{ ...bundled, kind: "hook" }]).length, 1);
});

test("a fired ref resolves by name, namespace stripped", () => {
  const surfaces = [skill("alpha", "skills/alpha/SKILL.md")];
  assert.deepEqual(
    resolveProbe({ how: "fired", ref: "myplug:alpha" }, surfaces).map(
      (s) => s.name,
    ),
    ["alpha"],
  );
});

test("an unresolvable ref resolves to nothing — never guessed into a match", () => {
  const surfaces = [skill("alpha", "skills/alpha/SKILL.md")];
  // Claude Code reports hook fires as an `Event:Matcher` label; it names no file.
  assert.deepEqual(
    resolveProbe({ how: "fired", ref: "PreToolUse:Edit" }, surfaces),
    [],
  );
  assert.deepEqual(
    resolveProbe({ how: "command", ref: "hooks/not-a-surface.sh" }, surfaces),
    [],
  );
});

// --- ambiguity ---------------------------------------------------------------

test("an AMBIGUOUS fired ref resolves to nothing — the shadowed copy earns no coverage", () => {
  // A skill shipped at `skills/foo/` and overridden at `.claude/skills/foo/`.
  // The transcript says `plugin:foo` and cannot say which file ran. Returning
  // both looks conservative and is the opposite: exactly one ran, so the other
  // is handed execution coverage it never earned, and the record asserts
  // something false. Dropping loses a real record; recording both invents one.
  const shipped = skill("foo", "skills/foo/SKILL.md");
  const override = skill("foo", ".claude/skills/foo/SKILL.md");
  assert.deepEqual(
    resolveProbe({ how: "fired", ref: "plugin:foo" }, [shipped, override]),
    [],
  );
  // The control: with one `foo` in the repo the same probe still resolves.
  assert.deepEqual(
    resolveProbe({ how: "fired", ref: "plugin:foo" }, [shipped]).map(
      (s) => s.path,
    ),
    ["skills/foo/SKILL.md"],
  );
});

test("no record is written for an ambiguous probe", () => {
  // The end the ambiguity rule exists for: two records off one fire, one of them
  // for a file that did not run.
  const records = recordsFrom({
    runs: [{ file: "t.harness.mjs", probes: [{ how: "fired", ref: "p:foo" }] }],
    surfaces: [
      skill("foo", "skills/foo/SKILL.md"),
      skill("foo", ".claude/skills/foo/SKILL.md"),
    ],
    tier: "harness",
    at: "2026-08-12T00:00:00.000Z",
    readSurface: () => "body",
  });
  assert.deepEqual(records, []);
});

test("a command ref matches on the most precise rung available, not on all of them", () => {
  // The rungs OVERLAP: with both hooks discovered, `.claude/hooks/pre.sh` is an
  // exact match for one and a `/`-suffix match for the other, so flat filtering
  // made a fully-qualified filename ambiguous.
  const shipped = hook("pre", "hooks/pre.sh");
  const override = hook("pre", ".claude/hooks/pre.sh");
  const both = [shipped, override];
  const paths = (ref: string) =>
    resolveProbe({ how: "command", ref }, both).map((s) => s.path);
  assert.deepEqual(paths(".claude/hooks/pre.sh"), [".claude/hooks/pre.sh"]);
  assert.deepEqual(paths("hooks/pre.sh"), ["hooks/pre.sh"]);
  // An absolute ref lands on the suffix rung, where the LONGEST matching surface
  // path wins — it cannot be the shorter one unless the repo root is the other
  // surface's parent, which that surface's existence rules out.
  assert.deepEqual(paths("/repo/.claude/hooks/pre.sh"), [
    ".claude/hooks/pre.sh",
  ]);
  assert.deepEqual(paths("/repo/hooks/pre.sh"), ["hooks/pre.sh"]);
  // The bare basename names neither, and is dropped rather than guessed.
  assert.deepEqual(paths("pre.sh"), []);
});

// --- records -----------------------------------------------------------------

test("records stamp the surface's content hash AT RUN TIME", () => {
  const surfaces = [skill("alpha", "skills/alpha/SKILL.md")];
  const records = recordsFrom({
    runs: [
      { file: "a.harness.mjs", probes: [{ how: "fired", ref: "p:alpha" }] },
    ],
    surfaces,
    tier: "harness",
    at: "2026-08-11T10:00:00.000Z",
    readSurface: () => "version one",
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].sha, surfaceSha("version one"));
  assert.equal(records[0].tier, "harness");
  assert.equal(records[0].by, "a.harness.mjs");
});

test("an unreadable surface produces NO record", () => {
  // A record with no hash could never be checked for staleness, and would
  // therefore be permanent, unfalsifiable coverage.
  const records = recordsFrom({
    runs: [
      { file: "a.harness.mjs", probes: [{ how: "fired", ref: "p:alpha" }] },
    ],
    surfaces: [skill("alpha", "skills/alpha/SKILL.md")],
    tier: "harness",
    at: "2026-08-11T10:00:00.000Z",
    readSurface: () => null,
  });
  assert.deepEqual(records, []);
});

// --- merging -----------------------------------------------------------------

test("a harness run does not erase what an eval measured", () => {
  // The two cadences are days apart: `vigiles test` every push, `vigiles eval` on
  // a schedule. Replacing rather than merging would make the paid tier's result
  // survive only until the next push.
  const previous = [run({ tier: "eval", by: "a.eval.mjs", sha: "old-eval" })];
  const next = [run({ tier: "harness", by: "a.harness.mjs", sha: "new" })];
  assert.deepEqual(
    mergeRuns(previous, next)
      .map((r) => r.tier)
      .sort(),
    ["eval", "harness"],
  );
});

test("…and the same SCRIPT run under both tiers keeps both records", () => {
  // Reachable in one command: `vigiles test some.eval.mjs` names an eval file
  // explicitly and runs it under the deterministic runner. Without the tier in
  // the merge key that free run silently overwrites the paid measurement, and
  // "firing was never measured" would go quiet with no model ever consulted.
  const merged = mergeRuns(
    [
      run({
        tier: "eval",
        by: "a.eval.mjs",
        sha: "measured-by-model",
        at: "2026-08-01T00:00:00.000Z",
      }),
    ],
    [run({ tier: "harness", by: "a.eval.mjs", sha: "measured-by-harness" })],
  );
  assert.deepEqual(merged.map((r) => `${r.tier}:${r.sha}`).sort(), [
    "eval:measured-by-model",
    "harness:measured-by-harness",
  ]);
});

test("a re-run of the same script in the same tier replaces its record", () => {
  const merged = mergeRuns(
    [run({ at: "2026-08-01T00:00:00.000Z", sha: "old" })],
    [run({ at: "2026-08-11T00:00:00.000Z", sha: "new" })],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].sha, "new");
});

// --- retraction --------------------------------------------------------------
//
// Merging can only OVERWRITE keys present in `next`, so without a retraction set
// a script that stops exercising a surface leaves its record behind — and that
// record stays FRESH for as long as the SURFACE is not edited, which rewriting
// the test does not do. Reproduced end-to-end 2026-08-11 on a two-hook fixture:
// a harness repointed from `hooks/a.sh` to `hooks/b.sh` produced records for
// both, and `lint` printed "2 MEASURED BY A RUN".

test("a script that STOPS exercising a surface retracts its old record", () => {
  const merged = mergeRuns(
    [run({ path: "hooks/a.sh", name: "a", kind: "hook" })],
    [run({ path: "hooks/b.sh", name: "b", kind: "hook" })],
    { scripts: ["t.harness.mjs"], tier: "harness" },
  );
  assert.deepEqual(
    merged.map((r) => r.path),
    ["hooks/b.sh"],
  );
});

test("…and a script that now reports NOTHING retracts everything it claimed", () => {
  // The sharper half: with no new records there is no key to overwrite, so this
  // is the case merging alone can never reach. A test emptied of its assertions
  // must not leave the surface it used to exercise looking measured.
  assert.deepEqual(
    mergeRuns([run({ path: "hooks/a.sh" })], [], {
      scripts: ["t.harness.mjs"],
      tier: "harness",
    }),
    [],
  );
});

test("…but a script that was NOT run keeps its records", () => {
  // `vigiles test one.harness.mjs` runs one file. Retracting on behalf of files
  // that never ran would make naming a single test erase the suite.
  const merged = mergeRuns(
    [
      run({ path: "hooks/a.sh", by: "t.harness.mjs" }),
      run({ path: "hooks/b.sh", by: "u.harness.mjs" }),
    ],
    [],
    { scripts: ["t.harness.mjs"], tier: "harness" },
  );
  assert.deepEqual(
    merged.map((r) => r.by),
    ["u.harness.mjs"],
  );
});

test("…and retraction never crosses the tier boundary", () => {
  // Same file, other tier: the free per-push run must not withdraw what the paid
  // scheduled run measured. Same reason the merge key already carries the tier.
  const merged = mergeRuns(
    [run({ tier: "eval", by: "a.eval.mjs", sha: "measured-by-model" })],
    [],
    { scripts: ["a.eval.mjs"], tier: "harness" },
  );
  assert.deepEqual(
    merged.map((r) => r.sha),
    ["measured-by-model"],
  );
});

test("without a retraction set, merge behaves exactly as it did", () => {
  // The control for the four above: the parameter is optional, and a caller that
  // cannot say which scripts ran must not silently start deleting records.
  assert.equal(
    mergeRuns([run({ path: "hooks/a.sh" })], [run({ path: "hooks/b.sh" })])
      .length,
    2,
  );
});

// --- one script, many spellings ----------------------------------------------
//
// 🔴 Reproduced 2026-08-12 through the real CLI (see cli-coverage-record.test.ts):
// `vigiles test` then `vigiles test ./t.harness.mjs` left `hooks/a.sh` "MEASURED
// BY A RUN" after the harness had been emptied, because the two spellings are
// different keys. `discoverScripts` hands an existing file's argument through
// verbatim, so `./x`, `x` and an absolute path all reach `by` as typed.

test("a `./`-spelled run retracts what the bare spelling recorded", () => {
  assert.deepEqual(
    mergeRuns([run({ path: "hooks/a.sh", by: "t.harness.mjs" })], [], {
      scripts: ["./t.harness.mjs"],
      tier: "harness",
    }),
    [],
  );
});

test("…and so does an ABSOLUTE one, once the root is known", () => {
  assert.deepEqual(
    mergeRuns([run({ path: "hooks/a.sh", by: "t.harness.mjs" })], [], {
      scripts: ["/repo/t.harness.mjs"],
      tier: "harness",
      root: "/repo",
    }),
    [],
  );
});

test("…and a `..` detour is the same file too", () => {
  assert.deepEqual(
    mergeRuns([run({ by: "tests/t.harness.mjs" })], [], {
      scripts: ["tests/fixtures/../t.harness.mjs"],
      tier: "harness",
    }),
    [],
  );
});

test("two spellings of one script hold ONE record, not two", () => {
  // The second symptom, and the reason the MERGE key is canonicalised as well as
  // the retraction set: running once by `./t.harness.mjs` and once by the glob
  // left two entries for one script on the measured fixture.
  const merged = mergeRuns(
    [
      run({
        path: "hooks/a.sh",
        by: "./t.harness.mjs",
        at: "2026-08-11T10:00:00.000Z",
      }),
    ],
    [
      run({
        path: "hooks/a.sh",
        by: "t.harness.mjs",
        at: "2026-08-12T10:00:00.000Z",
      }),
    ],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].at, "2026-08-12T10:00:00.000Z");
});

test("…but a DIFFERENT script is still a different script", () => {
  // The quiet half. Canonicalising must collapse spellings, not files: if `./u`
  // retracted `t`, naming one test would erase another's records — the property
  // the retraction set was scoped by script to preserve in the first place.
  const merged = mergeRuns(
    [
      run({ path: "hooks/a.sh", by: "t.harness.mjs" }),
      run({ path: "hooks/b.sh", by: "u.harness.mjs" }),
    ],
    [],
    { scripts: ["./t.harness.mjs"], tier: "harness" },
  );
  assert.deepEqual(
    merged.map((r) => r.by),
    ["u.harness.mjs"],
  );
});

test("…and an unrelated absolute script retracts nothing", () => {
  // The other quiet half: relativising is injective from a fixed root, so an
  // absolute path that is NOT the recorded file must leave the record alone.
  assert.deepEqual(
    mergeRuns([run({ by: "t.harness.mjs" })], [], {
      scripts: ["/repo/other/t.harness.mjs"],
      tier: "harness",
      root: "/repo",
    }).map((r) => r.by),
    ["t.harness.mjs"],
  );
});

test("a Windows-recorded `by` is retracted by its POSIX equivalent", () => {
  // The artifact outlives the machine that wrote it; a checkout shared by a
  // Windows dev and a CI runner would otherwise accumulate two records per
  // script, one of them permanently unretractable.
  assert.deepEqual(
    mergeRuns([run({ by: "test\\t.harness.mjs" })], [], {
      scripts: ["test/t.harness.mjs"],
      tier: "harness",
    }),
    [],
  );
});

test("every status but a skip is an execution", () => {
  // A skip did not run: the deterministic tier skips when `claude` is missing,
  // and dropping a record because today's machine lacks a CLI would delete a
  // measurement taken on the machine that had it. `fail` and `vacuous` DID run
  // and established nothing, so their old green records must not outlive them —
  // the same rule `runsFromResults` applies when refusing to WRITE one.
  assert.deepEqual(
    executedScripts([
      { file: "pass.harness.mjs", status: "pass" },
      { file: "fail.harness.mjs", status: "fail" },
      { file: "vacuous.harness.mjs", status: "vacuous" },
      { file: "skip.harness.mjs", status: "skip" },
    ]),
    ["pass.harness.mjs", "fail.harness.mjs", "vacuous.harness.mjs"],
  );
});

// --- staleness ---------------------------------------------------------------

test("a run against the CURRENT text is fresh; against older text it is stale", () => {
  const artifact = {
    v: COVERAGE_ARTIFACT_VERSION,
    generated: "2026-08-11T10:00:00.000Z",
    runs: [run({ sha: surfaceSha("v1") })],
  };
  assert.equal(
    indexRuns(artifact, () => surfaceSha("v1")).get(
      "skills/alpha/SKILL.md",
    )?.[0].fresh,
    true,
  );
  assert.equal(
    indexRuns(artifact, () => surfaceSha("v2")).get(
      "skills/alpha/SKILL.md",
    )?.[0].fresh,
    false,
  );
});

test("a record for a surface that no longer exists is dropped, not counted", () => {
  const artifact = {
    v: COVERAGE_ARTIFACT_VERSION,
    generated: "",
    runs: [run()],
  };
  assert.equal(indexRuns(artifact, () => null).size, 0);
});

// --- the file ----------------------------------------------------------------

test("round-trips through disk", () => {
  const dir = makeTmpDir("cov-artifact");
  writeCoverageArtifact(dir, {
    v: COVERAGE_ARTIFACT_VERSION,
    generated: "2026-08-11T10:00:00.000Z",
    commit: "abc1234",
    runs: [run()],
  });
  const read = readCoverageArtifact(dir);
  assert.equal(read?.commit, "abc1234");
  assert.equal(read?.runs.length, 1);
  cleanupTmpDir(dir);
});

test("no artifact reads as no artifact — not as an empty verdict", () => {
  const dir = makeTmpDir("cov-none");
  assert.equal(readCoverageArtifact(dir), undefined);
  cleanupTmpDir(dir);
});

test("a torn or foreign-versioned artifact is not a report", () => {
  // Same discipline as the check-count scratch file: corrupt input must never be
  // turned into a claim about somebody's tests.
  const dir = makeTmpDir("cov-torn");
  mkdirSync(join(dir, ".vigiles"), { recursive: true });
  writeFileSync(join(dir, ".vigiles", "coverage.json"), '{"v":1,"runs":[');
  assert.equal(readCoverageArtifact(dir), undefined);
  writeFileSync(
    join(dir, ".vigiles", "coverage.json"),
    JSON.stringify({ v: 99, generated: "", runs: [run()] }),
  );
  assert.equal(readCoverageArtifact(dir), undefined);
  cleanupTmpDir(dir);
});

test("a malformed RECORD is dropped while the rest of the artifact survives", () => {
  const dir = makeTmpDir("cov-partial");
  mkdirSync(join(dir, ".vigiles"), { recursive: true });
  writeFileSync(
    join(dir, ".vigiles", "coverage.json"),
    JSON.stringify({
      v: COVERAGE_ARTIFACT_VERSION,
      generated: "",
      runs: [run(), { kind: "skill" }, { nonsense: true }],
    }),
  );
  assert.equal(readCoverageArtifact(dir)?.runs.length, 1);
  // …and the file it wrote is JSON a human can read in a diff.
  assert.match(
    readFileSync(join(dir, ".vigiles", "coverage.json"), "utf-8"),
    /"runs"/,
  );
  cleanupTmpDir(dir);
});

// --- what a whole run contributes --------------------------------------------

test("a FAILED script contributes nothing, however much it exercised", () => {
  // It ran against the surface, but it did not establish that the surface
  // behaves. Recording it would let a RED test paint a surface covered —
  // activity taken for the property, one layer up.
  const probes = [{ how: "fired" as const, ref: "p:alpha" }];
  assert.deepEqual(
    runsFromResults([
      { file: "red.harness.mjs", status: "fail", surfaces: probes },
    ]),
    [],
  );
  // The control: the same script, green.
  assert.deepEqual(
    runsFromResults([
      { file: "red.harness.mjs", status: "pass", surfaces: probes },
    ]),
    [{ file: "red.harness.mjs", probes }],
  );
});

test("a script that reported no surfaces is not a run record", () => {
  assert.deepEqual(
    runsFromResults([
      { file: "unit.harness.mjs", status: "pass", surfaces: [] },
      { file: "legacy.harness.mjs", status: "pass" },
    ]),
    [],
  );
});
