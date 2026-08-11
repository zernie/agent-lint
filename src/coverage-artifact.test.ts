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
