/**
 * Tests for the `vigiles test` / `vigiles eval` script runner (src/run-scripts.ts).
 * Discovery and formatting are pure-ish; `runScripts` spawns trivial node
 * scripts in a temp dir, so the whole suite stays fast and model-free.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

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
  statusFor,
  SKIP_EXIT_CODE,
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

// 🔴 The regression this exists for: a harness under `.claude/` was invisible to
// `vigiles test` and `vigiles eval`, in a tool whose whole subject is Claude Code
// harnesses — `.claude/` is where one lives by definition. The symptom was "no files
// found" printed at a repository holding two of them, and a `Tested` score reporting
// visibility rather than coverage. `node_modules` must stay excluded, so this asserts
// both halves: dot-directories in, dependencies still out.
test("discoverScripts finds harnesses inside dot-directories", () => {
  const dir = makeTmpDir("run-scripts");
  try {
    mkdirSync(join(dir, ".claude", "hooks"), { recursive: true });
    writeFileSync(join(dir, ".claude", "hooks", "hooks.harness.mjs"), "");
    mkdirSync(join(dir, ".claude", "pipeline"), { recursive: true });
    writeFileSync(join(dir, ".claude", "pipeline", "gates.harness.mjs"), "");
    writeFileSync(join(dir, "top.harness.mjs"), "");
    mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true });
    writeFileSync(join(dir, "node_modules", ".bin", "dep.harness.mjs"), "");

    const found = discoverScripts([], "**/*.harness.mjs", dir);
    assert.deepEqual(found, [
      ".claude/hooks/hooks.harness.mjs",
      ".claude/pipeline/gates.harness.mjs",
      "top.harness.mjs",
    ]);
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

// --- the fourth state: ran, verified nothing (dogfood 2026-08-08) -------------
//
// 🔴 The defect. `statusForCode` knew exit codes and nothing else, so a file that
// ran NOTHING printed the same `✓ 1 passed` as one that ran and passed. Measured
// on `export default { "never runs": () => assert.equal(1, 2) }` — a false
// assertion, never called, reported green. A consumer repo hit it and now
// hand-copies a warning into every new harness header, eight of them, because the
// runner could not enforce it.

test("statusFor: 0 reported checks is its own state, and silence is NOT zero", () => {
  assert.equal(statusFor(0, 3), "pass");
  assert.equal(statusFor(0, 0), "vacuous", "ran clean, verified nothing");
  assert.equal(
    statusFor(0, undefined),
    "pass",
    "no report at all is the legacy branch — 'nobody counted' is not 'counted zero'",
  );
  // The other two states are unchanged, count or no count.
  assert.equal(statusFor(SKIP_EXIT_CODE, undefined), "skip");
  assert.equal(statusFor(SKIP_EXIT_CODE, 0), "skip");
  assert.equal(statusFor(1, 5), "fail");
  assert.equal(statusFor(1, 0), "fail");
});

/** The built `check-count.js`, as a URL a spawned fixture script can import. */
function countModuleUrl(): string {
  return pathToFileURL(resolve(process.cwd(), "dist/check-count.js")).href;
}

test("runScripts reports 0 checks for a script that loads the API and runs nothing", () => {
  const dir = makeTmpDir("run-scripts-vacuous");
  try {
    const mod = JSON.stringify(countModuleUrl());
    // The incident, reproduced: tests DEFINED, nothing called. Exits 0.
    writeFileSync(
      join(dir, "vacuous.harness.mjs"),
      `import { recordCheck } from ${mod};\n` +
        `export default { "never runs": () => { recordCheck(); } };\n`,
    );
    // The control: same import, actually calls it.
    writeFileSync(
      join(dir, "real.harness.mjs"),
      `import { recordCheck } from ${mod};\nrecordCheck();\nrecordCheck();\n`,
    );
    // The legacy shape: never touches vigiles, so it cannot report. Unchanged.
    writeFileSync(join(dir, "legacy.harness.mjs"), "process.exit(0);\n");

    const r = runScripts(
      ["vacuous.harness.mjs", "real.harness.mjs", "legacy.harness.mjs"],
      dir,
    );
    assert.deepEqual(
      r.map((x) => [x.status, x.checks]),
      [
        ["vacuous", 0],
        ["pass", 2],
        ["pass", undefined],
      ],
    );
    // …and it must not turn CI red: harnesses in the wild predate the counter.
    assert.equal(anyFailed(r), false);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("a script's spawned CHILD does not inherit the report path", () => {
  // A harness spawns processes for a living. A child that inherited the count
  // path would write ITS count — usually zero — over the parent's, reporting a
  // sub-process's activity as the file's. The variable is read once and dropped,
  // so the child cannot see it at all. Asserted from INSIDE the child, because
  // spawnSync makes the parent write last, which would mask the bug end-to-end.
  const dir = makeTmpDir("run-scripts-nested");
  try {
    const mod = JSON.stringify(countModuleUrl());
    writeFileSync(
      join(dir, "parent.harness.mjs"),
      `import { recordCheck } from ${mod};\n` +
        `import { spawnSync } from "node:child_process";\n` +
        `recordCheck(4);\n` +
        `const probe = "process.exit(process.env.VIGILES_CHECK_COUNT_FILE ? 3 : 0)";\n` +
        `const r = spawnSync(process.execPath, ["-e", probe]);\n` +
        `if (r.status !== 0) process.exit(9); // the child could see the path\n`,
    );
    const [r] = runScripts(["parent.harness.mjs"], dir);
    assert.equal(r?.code, 0, "the spawned child must not see the report path");
    assert.equal(r?.checks, 4, "the parent's own count is what gets reported");
    assert.equal(r?.status, "pass");
  } finally {
    cleanupTmpDir(dir);
  }
});

test("formatScriptSummary shows a 0-check run as its own state, with the remedy", () => {
  const out = formatScriptSummary([
    { file: "a.mjs", code: 0, status: "pass", checks: 2 },
    { file: "b.mjs", code: 0, status: "vacuous", checks: 0 },
  ]);
  assert.match(out, /∅ b\.mjs — 0 CHECKS/);
  assert.doesNotMatch(out, /2 passed/); // NOT folded into the pass tally
  assert.match(out, /1 passed, 1 with 0 checks\./);
  assert.match(out, /recordCheck\(\)/); // the fix is named where it is read
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
  assert.deepEqual(
    decideRunScripts(evalEnv({ matchedCount: 7, isTTY: false })),
    {
      kind: "refuse",
      count: 7,
    },
  );
});

test("decideRunScripts: bare eval over many, at a TTY → CONFIRM", () => {
  assert.deepEqual(
    decideRunScripts(evalEnv({ matchedCount: 7, isTTY: true })),
    {
      kind: "confirm",
      count: 7,
    },
  );
});

test("the runner reads back WHICH surfaces a script exercised", () => {
  // The channel's second job: coverage answers "tested?" from execution, and
  // this is the wire it travels on. The fixture attributes through the tier
  // (runHook derives the hook from the command), not by declaring anything.
  const dir = makeTmpDir("run-scripts-surfaces");
  try {
    const hook = pathToFileURL(resolve(process.cwd(), "dist/run-hook.js")).href;
    const mod = JSON.stringify(countModuleUrl());
    // The hook has to EXIST and run. It used to be absent, and the fixture still
    // "attributed" it: `bash <missing>` exits 127 without launching anything, so
    // the assertion below was satisfied by a hook that never ran — the exact
    // false grant the launch check now closes. Measured 2026-08-12.
    mkdirSync(join(dir, "hooks"), { recursive: true });
    writeFileSync(join(dir, "hooks", "guard.sh"), "#!/bin/bash\nexit 0\n");
    writeFileSync(
      join(dir, "attributes.harness.mjs"),
      `import { runHook } from ${JSON.stringify(hook)};\n` +
        `const r = runHook("bash hooks/guard.sh", { hook_event_name: "PreToolUse" });\n` +
        `if (r.exitCode !== 0) process.exit(1);\n`,
    );
    // The control: same channel, no surface — a unit test of a pure helper.
    writeFileSync(
      join(dir, "plain.harness.mjs"),
      `import { recordCheck } from ${mod};\nrecordCheck();\n`,
    );
    const r = runScripts(["attributes.harness.mjs", "plain.harness.mjs"], dir);
    assert.deepEqual(r[0].surfaces, [
      { how: "command", ref: "hooks/guard.sh" },
    ]);
    assert.equal(r[0].status, "pass");
    // Reported a count, exercised no identifiable surface. Not a finding.
    assert.deepEqual(r[1].surfaces, []);
  } finally {
    cleanupTmpDir(dir);
  }
});
