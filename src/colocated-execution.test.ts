/**
 * A COLOCATED TEST THAT RAN IS EXECUTION EVIDENCE — and an empty one still is not.
 *
 * ## The defect
 *
 * Coverage had two tiers: a recorded run (`executed`) and a file sitting beside
 * the surface (`colocated`). The second printed its own caveat — *"this says the
 * file EXISTS, not that it ran"* — and on a real 52-surface repo it carried 23 of
 * the 27 covered surfaces. Those 23 are ordinary `*.harness.mjs` files that
 * `vigiles test` RUNS on every push. The run happened, the runner watched it, and
 * the metric described it as a directory listing, because a harness asserting
 * through `node:assert` reports a CHECK COUNT and no surface probe.
 *
 * 🔴 THE HAZARD WHILE FIXING IT POINTS THE OTHER WAY, which is why the negatives
 * below matter more than the positive. `touch <skill>/<skill>.harness.mjs` — zero
 * bytes — already drops the untested count by one, and `vigiles test` then runs it
 * and prints `✓ passed`, because an empty script exits 0. Attributing on "it ran
 * and exited 0" would promote that file from `colocated` to "MEASURED BY A RUN":
 * the same emptiness wearing the stronger label, which is worse than the hole
 * being closed. The bar is therefore a REPORTED CHECK, not an exit code.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  COVERAGE_ARTIFACT_VERSION,
  readCoverageArtifact,
  recordsFrom,
  runsFromResults,
  writeCoverageArtifact,
  type CoverageRun,
} from "./coverage-artifact.js";
import { parseCheckReport } from "./check-count.js";
import { isColocatedTest } from "./coverage-evidence.js";
import type { Surface } from "./test-coverage.js";
import { makeTmpDir, cleanupTmpDir } from "./core/test-utils.js";

const skill = (name: string, path: string): Surface => ({
  kind: "skill",
  path,
  name,
  tokens: [],
  ignored: false,
});

const ARC = skill("argument-arc", ".claude/skills/argument-arc/SKILL.md");
const HARNESS = ".claude/skills/argument-arc/argument-arc.harness.mjs";

function records(
  run: { file: string; checks?: number },
  surfaces: readonly Surface[] = [ARC],
): ReturnType<typeof recordsFrom> {
  return recordsFrom({
    runs: [{ ...run, probes: [] }],
    surfaces,
    tier: "harness",
    at: "2026-08-17T00:00:00.000Z",
    readSurface: () => "body",
  });
}

// ---------------------------------------------------------------------------
// FIRES — the half that was missing
// ---------------------------------------------------------------------------

test("a colocated script that reported a check attributes its surface", () => {
  const out = records({ file: HARNESS, checks: 3 });
  assert.equal(out.length, 1);
  assert.equal(out[0]?.path, ARC.path);
  assert.equal(out[0]?.by, HARNESS);
  // The attribution is NAMED, so a reader of the artifact can tell this from a
  // probe the script reported about itself.
  assert.equal(out[0]?.how, "colocated");
  assert.equal(out[0]?.tier, "harness");
});

test("runsFromResults keeps a passing run that reported checks and no probes", () => {
  // The clause that used to be `surfaces.length > 0` and discarded exactly the
  // ordinary case: a harness that asserts through node:assert.
  assert.deepEqual(
    runsFromResults([
      { file: HARNESS, status: "pass", checks: 2, surfaces: [] },
    ]),
    [{ file: HARNESS, probes: [], checks: 2 }],
  );
});

// ---------------------------------------------------------------------------
// SILENT — the halves that keep this from becoming the defect it closes
// ---------------------------------------------------------------------------

test("an EMPTY colocated script earns nothing — it reported no check", () => {
  // `touch foo.harness.mjs` → runs → exits 0 → `checks` is undefined, because a
  // script that never imports vigiles cannot report. Silence is the legacy
  // branch, never a verdict (check-count.ts), so it keeps its colocated credit
  // and gains no execution credit.
  assert.deepEqual(records({ file: HARNESS }), []);
  assert.deepEqual(
    runsFromResults([{ file: HARNESS, status: "pass", surfaces: [] }]),
    [],
  );
});

test("a script reporting ZERO checks earns nothing", () => {
  assert.deepEqual(records({ file: HARNESS, checks: 0 }), []);
});

test("a script that is not colocated with anything earns nothing", () => {
  // The generic root harness that walks every skill at runtime. It is discarded
  // deliberately: a conformance lint over 21 skills is not 21 tests, which is the
  // measurement that retired the `vigiles:covers` tier (coverage-evidence.ts).
  assert.deepEqual(records({ file: "skills.harness.mjs", checks: 21 }), []);
  // Right name, WRONG PLACE — a sibling directory is not beside it.
  assert.deepEqual(
    records({ file: "test/argument-arc.harness.mjs", checks: 4 }),
    [],
  );
  // Right place, WRONG NAME — the defect №17 shape, reached through execution.
  assert.deepEqual(
    records({
      file: ".claude/skills/argument-arc/grade-paper-writing.harness.mjs",
      checks: 4,
    }),
    [],
  );
});

test("an AMBIGUOUS colocation earns nothing rather than crediting both", () => {
  // Colocation asks only that the basename START with `<name>.`, so one script
  // can match two surfaces when one name prefixes the other. Exactly one of them
  // is what the test is about and nothing here can say which; crediting both
  // would INVENT a record. Same rule `resolveProbe` applies to probes.
  const foo = skill("foo", "skills/foo/SKILL.md");
  const fooBar = skill("foo.bar", "skills/foo/foo.bar.SKILL.md");
  assert.deepEqual(
    records({ file: "skills/foo/foo.bar.harness.mjs", checks: 9 }, [
      foo,
      fooBar,
    ]),
    [],
  );
  // The control: drop the second surface and the SAME run attributes cleanly, so
  // the emptiness above is the ambiguity rule and not a broken match.
  assert.equal(
    records({ file: "skills/foo/foo.bar.harness.mjs", checks: 9 }, [foo])
      .length,
    1,
  );
});

test("colocation does not DOWNGRADE an attribution the run already made", () => {
  // 🔴 MEASURED REGRESSION, not a hypothetical. The first run of this tier on a
  // 52-surface repo turned `.claude/hooks/paper-lint.mjs` from `command` — the
  // harness executed that exact path — into `colocated`, and took three `fired`
  // skill activations with it. `mergeRuns` dedupes on (surface, tier, script) and
  // does NOT include `how`, so a second attribution of the same pair REPLACES the
  // first rather than joining it; same `at` on both, so the last one pushed wins.
  const hook: Surface = {
    kind: "hook",
    path: ".claude/hooks/paper-lint.mjs",
    name: "paper-lint",
    tokens: [],
    ignored: false,
  };
  const out = recordsFrom({
    runs: [
      {
        file: ".claude/hooks/paper-lint.harness.mjs",
        probes: [{ how: "command", ref: ".claude/hooks/paper-lint.mjs" }],
        checks: 7,
      },
    ],
    surfaces: [hook],
    tier: "harness",
    at: "2026-08-17T00:00:00.000Z",
    readSurface: () => "body",
  });
  // Colocation ALSO holds here (the harness is named after the hook and sits
  // beside it), so this is exactly the collision — and the direct observation
  // must survive it.
  assert.equal(
    isColocatedTest(hook, ".claude/hooks/paper-lint.harness.mjs"),
    true,
  );
  assert.deepEqual(
    out.map((r) => r.how),
    ["command"],
  );
});

test("a surface cannot be its own colocated test", () => {
  // Degenerate, but the probe path guards it (`t.path === surface.path`) and this
  // path must not be the one place a file covers itself.
  assert.deepEqual(records({ file: ARC.path, checks: 5 }, [ARC]), []);
});

test("the artifact accepts `colocated` and still rejects an unknown attribution", () => {
  // 🔴 NEITHER HALF WAS PINNED BY ANYTHING, and that was measured, not assumed:
  // mutating the validator to `return typeof value === "string"` — accept ANY
  // string as an attribution — left the whole coverage suite green (67 passed).
  //
  // Both directions matter. If `colocated` were not in the accepted set, records
  // would be written and then silently DISCARDED on read, and the tier would
  // appear to work inside one process and evaporate between runs. If the set were
  // open, a hand-edited artifact could name any attribution it liked.
  const dir = makeTmpDir("colocated-artifact");
  try {
    writeCoverageArtifact(dir, {
      v: COVERAGE_ARTIFACT_VERSION,
      generated: "2026-08-17T00:00:00.000Z",
      runs: [
        {
          kind: "skill",
          path: ARC.path,
          name: "argument-arc",
          tier: "harness",
          how: "colocated",
          by: HARNESS,
          at: "2026-08-17T00:00:00.000Z",
          sha: "deadbeefdeadbeef",
        },
        // Not an attribution. Hand-written, or a record from a future version.
        {
          kind: "skill",
          path: ARC.path,
          name: "argument-arc",
          tier: "harness",
          how: "declared",
          by: HARNESS,
          at: "2026-08-17T00:00:00.000Z",
          sha: "deadbeefdeadbeef",
        } as unknown as CoverageRun,
      ],
    });
    assert.deepEqual(
      readCoverageArtifact(dir)?.runs.map((r) => r.how),
      ["colocated"],
    );
  } finally {
    cleanupTmpDir(dir);
  }
});

// ---------------------------------------------------------------------------
// The attribution cannot be DECLARED — `vigiles:covers` must not return
// ---------------------------------------------------------------------------

test("a script cannot hand-write a `colocated` probe over the wire", () => {
  // `colocated` is deliberately NOT a ProbeOrigin: the origins are the wire
  // vocabulary `parseCheckReport` reads out of a file the CHILD writes. If a
  // harness could spell it, it could mint execution coverage for any surface by
  // declaring it — which is the retired `vigiles:covers` marker returning through
  // the back door.
  const report = parseCheckReport(
    JSON.stringify({
      checks: 1,
      surfaces: [
        { how: "colocated", ref: ".claude/skills/argument-arc/SKILL.md" },
        { how: "command", ref: "hooks/real.sh" },
      ],
    }),
  );
  assert.deepEqual(report, {
    checks: 1,
    surfaces: [{ how: "command", ref: "hooks/real.sh" }],
  });
});

// ---------------------------------------------------------------------------
// One predicate, not two — the mirror that was deleted
// ---------------------------------------------------------------------------

test("the colocation rule is one body: name AND place, separators folded", () => {
  assert.equal(isColocatedTest(ARC, HARNESS), true);
  assert.equal(
    isColocatedTest(ARC, ".claude/skills/argument-arc/other.harness.mjs"),
    false,
  );
  assert.equal(isColocatedTest(ARC, "argument-arc.harness.mjs"), false);
  // A root SKILL.md lives at "." and discovery returns top-level files bare, so
  // dirname is "." on both sides with no special case.
  const root = skill("solo", "SKILL.md");
  assert.equal(isColocatedTest(root, "solo.harness.mjs"), true);
  assert.equal(isColocatedTest(root, "test/solo.harness.mjs"), false);
  // Windows spellings reach the DISK caller (globSync yields `\` there) while the
  // browser caller always passes `/`. One body serves both because separators are
  // folded first — this is what removed the second copy.
  assert.equal(
    isColocatedTest(
      skill("argument-arc", ".claude\\skills\\argument-arc\\SKILL.md"),
      ".claude\\skills\\argument-arc\\argument-arc.harness.mjs",
    ),
    true,
  );
});
