/**
 * Tests for the eval aggregation/formatting (deterministic, no model). The full
 * `runEval` drives the real `claude` CLI and is exercised by the `bench/`
 * harness rather than the unit suite.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { aggregate, formatEvalReport } from "./eval.js";

test("aggregate averages numbers and takes the true-fraction of booleans", () => {
  const agg = aggregate([
    { marks: 2, caught: true },
    { marks: 0, caught: false },
    { marks: 4, caught: true },
  ]);
  assert.equal(agg.marks, 2); // (2+0+4)/3
  assert.ok(Math.abs(agg.caught - 2 / 3) < 1e-9); // 2 of 3 true
});

test("aggregate tolerates missing keys across rows", () => {
  const agg = aggregate([{ a: 1 }, { b: true }]);
  assert.equal(agg.a, 1); // averaged over the 1 row that has it
  assert.equal(agg.b, 1);
});

test("formatEvalReport renders one line per arm", () => {
  const out = formatEvalReport({
    name: "demo",
    trials: 6,
    arms: {
      vanilla: { runs: 6, metrics: { caught: 0 } },
      gated: { runs: 6, metrics: { caught: 0.5 } },
    },
  });
  assert.match(out, /demo \(6 trials\/arm\)/);
  assert.match(out, /vanilla\s+caught=0\.00/);
  assert.match(out, /gated\s+caught=0\.50/);
});
