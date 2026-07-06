/**
 * Tests for the `vigiles test` / `vigiles eval` script runner (src/run-scripts.ts).
 * Discovery and formatting are pure-ish; `runScripts` spawns trivial node
 * scripts in a temp dir, so the whole suite stays fast and model-free.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  discoverScripts,
  runScripts,
  formatScriptSummary,
  anyFailed,
  interpreterArgs,
  detectNodeCaps,
  scriptGlob,
  SCRIPT_EXTS,
  decideRunScripts,
} from "./run-scripts.js";
import { makeTmpDir, cleanupTmpDir } from "../../core/test-utils.js";

test("discoverScripts expands the default glob, deduped and sorted", () => {
  const dir = makeTmpDir("run-scripts");
  try {
    writeFileSync(join(dir, "b.harness.mjs"), "");
    writeFileSync(join(dir, "a.harness.mjs"), "");
    writeFileSync(join(dir, "ignore.eval.mjs"), "");
    mkdirSync(join(dir, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(dir, "node_modules", "pkg", "x.harness.mjs"), "");

    const found = discoverScripts([], "**/*.harness.mjs", dir);
    assert.deepEqual(found, ["a.harness.mjs", "b.harness.mjs"]);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("discoverScripts passes an explicit file path through", () => {
  const dir = makeTmpDir("run-scripts");
  try {
    writeFileSync(join(dir, "only.eval.mjs"), "");
    writeFileSync(join(dir, "other.eval.mjs"), "");
    const found = discoverScripts(["only.eval.mjs"], "**/*.eval.mjs", dir);
    assert.deepEqual(found, ["only.eval.mjs"]);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("runScripts reports per-file exit codes and forwards env", () => {
  const dir = makeTmpDir("run-scripts");
  try {
    writeFileSync(join(dir, "ok.mjs"), "process.exit(0);\n");
    writeFileSync(join(dir, "bad.mjs"), "process.exit(3);\n");
    writeFileSync(
      join(dir, "env.mjs"),
      "process.exit(process.env.VIGILES_TRIALS === '7' ? 0 : 9);\n",
    );

    const results = runScripts(["ok.mjs", "bad.mjs", "env.mjs"], dir, {
      VIGILES_TRIALS: "7",
    });
    assert.deepEqual(
      results.map((r) => r.code),
      [0, 3, 0],
    );
  } finally {
    cleanupTmpDir(dir);
  }
});

test("scriptGlob matches both JS and TS extensions", () => {
  assert.equal(scriptGlob("harness"), "**/*.harness.{mjs,cjs,js,mts,cts,ts}");
  assert.equal(scriptGlob("eval"), "**/*.eval.{mjs,cjs,js,mts,cts,ts}");
  assert.ok(SCRIPT_EXTS.includes("ts") && SCRIPT_EXTS.includes("mjs"));
});

test("discoverScripts finds TS scripts alongside JS via the default glob", () => {
  const dir = makeTmpDir("run-scripts");
  try {
    writeFileSync(join(dir, "a.harness.mjs"), "");
    writeFileSync(join(dir, "b.harness.ts"), "");
    writeFileSync(join(dir, "c.harness.mts"), "");
    const found = discoverScripts([], scriptGlob("harness"), dir);
    assert.deepEqual(found, ["a.harness.mjs", "b.harness.ts", "c.harness.mts"]);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("interpreterArgs runs plain JS directly", () => {
  for (const f of ["x.harness.mjs", "x.harness.cjs", "x.harness.js"]) {
    assert.deepEqual(interpreterArgs(f, { tsx: false, stripTypes: false }), [
      f,
    ]);
  }
});

test("interpreterArgs prefers tsx for TS, else native strip-types", () => {
  assert.deepEqual(
    interpreterArgs("x.harness.ts", { tsx: true, stripTypes: true }),
    ["--import", "tsx", "x.harness.ts"],
  );
  assert.deepEqual(
    interpreterArgs("x.harness.mts", { tsx: false, stripTypes: true }),
    ["--experimental-strip-types", "x.harness.mts"],
  );
});

test("interpreterArgs throws an actionable error when TS can't run", () => {
  assert.throws(
    () => interpreterArgs("x.harness.ts", { tsx: false, stripTypes: false }),
    /install tsx.*Node >= 22\.6/s,
  );
});

test("detectNodeCaps reports tsx presence from node_modules", () => {
  const dir = makeTmpDir("run-scripts");
  try {
    assert.equal(detectNodeCaps(dir).tsx, false);
    mkdirSync(join(dir, "node_modules", "tsx"), { recursive: true });
    writeFileSync(join(dir, "node_modules", "tsx", "package.json"), "{}");
    assert.equal(detectNodeCaps(dir).tsx, true);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("runScripts surfaces an error code for an unrunnable TS script", () => {
  const dir = makeTmpDir("run-scripts");
  try {
    // A .ts file with no tsx and (on older node) no strip-types still yields a
    // non-zero result rather than throwing out of runScripts.
    writeFileSync(join(dir, "t.harness.ts"), "export {};\n");
    const results = runScripts(["t.harness.ts"], dir);
    assert.equal(results.length, 1);
    assert.equal(typeof results[0]?.code, "number");
  } finally {
    cleanupTmpDir(dir);
  }
});

test("formatScriptSummary tallies pass/skip/fail; skips are loud, not a pass", () => {
  const pass = formatScriptSummary([
    { file: "a.mjs", code: 0, status: "pass" },
    { file: "b.mjs", code: 0, status: "pass" },
  ]);
  assert.match(pass, /✓ a\.mjs/);
  assert.match(pass, /2 passed\./);

  const mixed = formatScriptSummary([
    { file: "a.mjs", code: 0, status: "pass" },
    { file: "b.mjs", code: 77, status: "skip" },
    { file: "c.mjs", code: 2, status: "fail" },
  ]);
  assert.match(mixed, /⊘ b\.mjs — SKIPPED/); // shown, not silent
  assert.match(mixed, /✗ c\.mjs \(exit 2\)/);
  assert.match(mixed, /1 passed, 1 skipped, 1 failed\./);
});

test("anyFailed: a skip never counts as a failure", () => {
  assert.equal(
    anyFailed([
      { file: "a.mjs", code: 0, status: "pass" },
      { file: "b.mjs", code: 77, status: "skip" },
    ]),
    false,
  );
  assert.equal(anyFailed([{ file: "c.mjs", code: 2, status: "fail" }]), true);
});

test("runScripts classifies exit 77 as skip, 0 as pass, else fail", () => {
  const dir = makeTmpDir("run-scripts");
  try {
    writeFileSync(join(dir, "ok.mjs"), "process.exit(0);\n");
    writeFileSync(join(dir, "skip.mjs"), "process.exit(77);\n");
    writeFileSync(join(dir, "bad.mjs"), "process.exit(1);\n");
    const r = runScripts(["ok.mjs", "skip.mjs", "bad.mjs"], dir);
    assert.deepEqual(
      r.map((x) => x.status),
      ["pass", "skip", "fail"],
    );
    assert.equal(anyFailed(r), true);
  } finally {
    cleanupTmpDir(dir);
  }
});

// --- decideRunScripts: the eval no-target consent gate --------------------------

const evalEnv = (o: Partial<Parameters<typeof decideRunScripts>[0]> = {}) => ({
  kind: "eval" as const,
  explicitTargets: false,
  matchedCount: 5,
  isTTY: false,
  all: false,
  yes: false,
  ...o,
});

test("decideRunScripts: `test` always runs (free/deterministic), never gated", () => {
  assert.deepEqual(
    decideRunScripts(evalEnv({ kind: "test", matchedCount: 999 })),
    { kind: "run" },
  );
});

test("decideRunScripts: explicit targets always run (clear intent)", () => {
  assert.deepEqual(
    decideRunScripts(evalEnv({ explicitTargets: true, isTTY: false })),
    { kind: "run" },
  );
});

test("decideRunScripts: --all opts into the whole set with no prompt", () => {
  assert.deepEqual(decideRunScripts(evalEnv({ all: true })), { kind: "run" });
});

test("decideRunScripts: --yes / --no-interactive runs (agent/CI)", () => {
  assert.deepEqual(decideRunScripts(evalEnv({ yes: true })), { kind: "run" });
});

test("decideRunScripts: 0 or 1 discovered eval is bounded → runs, no gate", () => {
  assert.deepEqual(decideRunScripts(evalEnv({ matchedCount: 0 })), {
    kind: "run",
  });
  assert.deepEqual(decideRunScripts(evalEnv({ matchedCount: 1 })), {
    kind: "run",
  });
});

test("decideRunScripts: bare eval over many, headless → REFUSE (the footgun)", () => {
  assert.deepEqual(decideRunScripts(evalEnv({ matchedCount: 7, isTTY: false })), {
    kind: "refuse",
    count: 7,
  });
});

test("decideRunScripts: bare eval over many, at a TTY → CONFIRM", () => {
  assert.deepEqual(decideRunScripts(evalEnv({ matchedCount: 7, isTTY: true })), {
    kind: "confirm",
    count: 7,
  });
});
