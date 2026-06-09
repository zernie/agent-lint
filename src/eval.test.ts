/**
 * Tests for the eval aggregation/formatting (deterministic, no model). The full
 * `runEval` drives the real `claude` CLI and is exercised by the `bench/`
 * harness rather than the unit suite.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { aggregate, aggregateStats, formatEvalReport } from "./eval.js";

test("aggregateStats reports mean, sample std, se, and n", () => {
  const s = aggregateStats([{ x: 2 }, { x: 4 }, { x: 6 }]);
  assert.equal(s.x.mean, 4);
  assert.equal(s.x.n, 3);
  // sample std of [2,4,6] = 2
  assert.ok(Math.abs(s.x.std - 2) < 1e-9);
  assert.ok(Math.abs(s.x.se - 2 / Math.sqrt(3)) < 1e-9);
});

test("aggregateStats gives std 0 for a single observation", () => {
  const s = aggregateStats([{ x: 5 }]);
  assert.equal(s.x.std, 0);
  assert.equal(s.x.se, 0);
});

test("aggregateStats reports pass^k: 1 only when every trial succeeds", () => {
  // booleans: all true → passK 1; any false → 0
  const all = aggregateStats([{ ok: true }, { ok: true }]);
  assert.equal(all.ok.passK, 1);
  const some = aggregateStats([{ ok: true }, { ok: false }]);
  assert.equal(some.ok.passK, 0);
  // counts: a trial succeeds when > 0
  const counts = aggregateStats([{ marks: 2 }, { marks: 0 }]);
  assert.equal(counts.marks.passK, 0);
  assert.equal(aggregateStats([{ marks: 1 }, { marks: 3 }]).marks.passK, 1);
});

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
      vanilla: { runs: 6, metrics: { caught: 0 }, stats: {} },
      gated: { runs: 6, metrics: { caught: 0.5 }, stats: {} },
    },
  });
  assert.match(out, /demo \(6 trials\/arm\)/);
  assert.match(out, /vanilla\s+caught=0\.00/);
  assert.match(out, /gated\s+caught=0\.50/);
});

test("formatEvalReport shows ± se and pass^k when stats are present", () => {
  const out = formatEvalReport({
    name: "demo",
    trials: 3,
    arms: {
      gated: {
        runs: 3,
        metrics: { caught: 0.5 },
        stats: { caught: { mean: 0.5, std: 0.5, se: 0.25, n: 3, passK: 0 } },
      },
    },
  });
  assert.match(out, /caught=0\.50±0\.25/);
  assert.match(out, /pass\^k=0/);
});
