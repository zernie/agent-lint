/**
 * The paid tier must not be reachable from somebody else's test runner. Pure:
 * the argv paths below were MEASURED from real runs, not invented.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import { foreignRunner, foreignRunnerRefusal } from "./foreign-runner.js";

test("recognises the path vitest actually starts a worker with", () => {
  // Measured 2026-08-11 by writing process.argv[1] to a file from inside a test.
  assert.equal(
    foreignRunner("/repo/node_modules/vitest/dist/workers/forks.js"),
    "vitest",
  );
});

test("recognises jest and its worker", () => {
  assert.equal(foreignRunner("/repo/node_modules/jest/bin/jest.js"), "jest");
  assert.equal(foreignRunner("/repo/node_modules/jest-worker/build/index.js"), "jest");
  assert.equal(foreignRunner("/repo/node_modules/.bin/jest"), "jest");
});

test("a direct `node <file>` run is NOT a foreign runner — that is how an eval is meant to run", () => {
  // The quiet half, and the one that matters most: a guard that fires on the
  // correct invocation is a guard someone deletes within a day.
  assert.equal(foreignRunner("/repo/.claude/skills/foo/foo.eval.mjs"), null);
  assert.equal(foreignRunner("/repo/dist/cli.js"), null);
  assert.equal(foreignRunner(undefined), null);
});

test("a project that merely HAS vitest as a dependency is not running under it", () => {
  // The argv path is what node was started with, not what is installed. A repo
  // with vitest in node_modules but started as `node script.mjs` must run.
  assert.equal(foreignRunner("/repo/scripts/nightly.mjs"), null);
});

test("windows separators resolve the same", () => {
  assert.equal(foreignRunner("C:\\repo\\node_modules\\vitest\\dist\\workers\\forks.js"), "vitest");
});

test("the refusal names the runner, the cost and the way out", () => {
  const m = foreignRunnerRefusal("vitest", "measureTriggerRate");
  assert.match(m, /vitest/);
  assert.match(m, /spends real model calls/);
  assert.match(m, /vigiles eval/);          // what to run instead
  assert.match(m, /\.eval\.mjs/);           // and what to call the file
});
