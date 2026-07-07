/**
 * HEADROOM benchmark — does a non-compression "make-it-better" skill actually
 * LIFT correctness on tasks the baseline gets WRONG?
 *
 * The ecosystem benchmark (`bench/ecosystem/benchmark.mjs`) measures token deltas
 * on the saturated-correctness corpus. This measures the OTHER, higher-value claim:
 * "this skill makes the agent smarter / catch more bugs." That's only measurable
 * where the baseline FAILS — the headroom corpus (`headroom-tasks.mjs`). A/B
 * (skill ON vs OFF) per task; the metric is the correctness PASS RATE and the
 * LIFT (skill pass − baseline pass, in percentage points).
 *
 *   node bench/evals/headroom-pilot.eval.mjs                 # 2 tasks × 3 trials
 *   VIGILES_TRIALS=5 VIGILES_MODEL=sonnet node bench/evals/headroom-pilot.eval.mjs
 *
 * Real model → real cost, on the subscription. Model: haiku (weak enough to miss
 * the edge cases → headroom). The skill is a faithful "edge-case-first / planning"
 * intervention — the mechanism the hyped planning skills claim.
 *
 * READING IT: headroom = baseline < 100%. A positive lift means the skill helped;
 * ~0 lift on a failing baseline means the skill is hype; if baseline is already
 * 100% the task has no headroom (make it harder).
 *
 * FINDING (2026-06-28, haiku, 3 trials). Three hand-crafted tasks — merge-intervals,
 * roman-numerals (textbook, memorized), and parse-query (a 6-rule spec) — ALL hit
 * 100% baseline. Haiku is a capable coder on well-specified tasks, so there was no
 * headroom and the planning skill could not show a correctness lift (0pp on every
 * task). BUT the run is not empty: on parse-query the skill arm spent ~88% MORE
 * output (2584 → 4850 tok) for ZERO correctness gain — on tasks the model already
 * handles, "edge-case-first planning" is PURE OVERHEAD (the same hype shape as the
 * compression debunk: cost without benefit). TWO conclusions: (1) measuring whether
 * planning HELPS needs tasks the model FAILS, and hand-crafting those against a
 * capable model is unreliable — use a known-hard source (SWE-bench-style); (2) on
 * solvable tasks, a "do-more" skill is measurable COST, which is itself a finding.
 */
import { runEval } from "../../dist/eval.js";
import { HEADROOM_TASKS } from "../corpus/headroom-tasks.mjs";

const trials = Number(process.env.VIGILES_TRIALS || 3);
const model = process.env.VIGILES_MODEL || "haiku";
const pick = (
  process.env.VIGILES_TASKS || "merge-intervals,roman-numerals"
).split(",");
const TASKS = HEADROOM_TASKS.filter((t) => pick.includes(t.name));

// A faithful "planning / edge-case-first" intervention — the mechanism the hyped
// planning skills claim. Non-compression: it asks the agent to do MORE, not less.
const SKILL = `---
name: edge-case-first
description: Before writing code, enumerate the edge cases and verify the solution handles each one.
---
Before writing any implementation:
1. List the EDGE CASES this problem can hit (empty, boundary, unsorted, duplicates, nested, subtractive forms, off-by-one).
2. Write the solution so EACH listed edge case is explicitly handled.
3. Trace the solution against every listed edge case before you finish.
Correctness on the edge cases matters more than brevity.`;

const u = (ctx, k) => Number(ctx.usage?.[k] ?? 0);

console.log(
  `\n=== headroom benchmark: does edge-case-first LIFT correctness? (model: ${model}, trials: ${trials}) ===\n`,
);
console.log(
  "task              base_pass  skill_pass   lift   out_base  out_skill",
);

const rows = [];
for (const t of TASKS) {
  const report = await runEval({
    name: `headroom:${t.name}`,
    arms: {
      baseline: { files: { ...t.files } },
      skill: { files: { ...t.files, "SKILL.md": SKILL } },
    },
    task: t.task,
    measure: (ctx) => ({
      correct: t.check(ctx),
      outputTokens: u(ctx, "outputTokens"),
      costUsd: u(ctx, "costUsd"),
    }),
    trials,
    model,
    concurrency: 4,
  });
  const b = report.arms.baseline.metrics;
  const s = report.arms.skill.metrics;
  rows.push({ name: t.name, b, s });
  console.log(
    `${t.name.padEnd(17)} ${(b.correct * 100).toFixed(0).padStart(8)}%  ${(s.correct * 100).toFixed(0).padStart(9)}%  ${((s.correct - b.correct) * 100).toFixed(0).padStart(4)}pp  ${b.outputTokens.toFixed(0).padStart(8)} ${s.outputTokens.toFixed(0).padStart(9)}`,
  );
}

const mean = (f) => rows.reduce((a, r) => a + f(r), 0) / (rows.length || 1);
console.log(
  `\nMEAN baseline pass: ${(mean((r) => r.b.correct) * 100).toFixed(0)}%   ` +
    `skill pass: ${(mean((r) => r.s.correct) * 100).toFixed(0)}%   ` +
    `lift: ${(mean((r) => r.s.correct - r.b.correct) * 100).toFixed(0)}pp`,
);
console.log(
  "\n(headroom = baseline < 100%. lift in percentage POINTS. baseline 100% = no\n" +
    "headroom, make the task harder. positive lift = the skill helped; ~0 = hype.)",
);
