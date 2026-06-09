/**
 * Tests for the `vigiles test` / `vigiles eval` script runner (src/run-scripts.ts).
 * Discovery and formatting are pure-ish; `runScripts` spawns trivial node
 * scripts in a temp dir, so the whole suite stays fast and model-free.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  discoverScripts,
  runScripts,
  formatScriptSummary,
} from "./run-scripts.js";
import { makeTmpDir, cleanupTmpDir } from "./test-utils.js";

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

test("formatScriptSummary marks pass/fail and tallies failures", () => {
  const pass = formatScriptSummary([
    { file: "a.mjs", code: 0 },
    { file: "b.mjs", code: 0 },
  ]);
  assert.match(pass, /✓ a\.mjs/);
  assert.match(pass, /2 passed\./);

  const fail = formatScriptSummary([
    { file: "a.mjs", code: 0 },
    { file: "b.mjs", code: 2 },
  ]);
  assert.match(fail, /✗ b\.mjs \(exit 2\)/);
  assert.match(fail, /1\/2 failed\./);
});
