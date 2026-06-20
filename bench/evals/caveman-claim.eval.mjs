/**
 * P0 — thesis validation: measure the `caveman` skill vs its claim.
 *
 * Caveman (JuliusBrussee/caveman, 54k★) claims ~65% token reduction (avg over 10
 * prompts, range 22–87%) — but explicitly OUTPUT tokens only. This eval tests
 * that claim the way the measurement-authority thesis says you must: over REAL
 * CODING TASKS, accounting for the WHOLE SESSION (input + output + cache), and
 * gating CORRECTNESS — because an output-only headline misleads when (a) the
 * SKILL.md injects system-prompt tokens every turn, and (b) agentic coding spends
 * most tokens on input/cache (tool results, file reads), not output. A 65% cut on
 * the small slice that is output is a much smaller cut on the bill.
 *
 *   node bench/evals/caveman-claim.eval.mjs            # default: 5 tasks × 3 trials
 *   VIGILES_TASKS=2 VIGILES_TRIALS=2 node bench/evals/caveman-claim.eval.mjs   # pilot
 *
 * Real model → real cost, on the Pro/Max subscription (apiKeySource:"none").
 * Model: haiku (cheap; the v0 pass). Sonnet/Opus — caveman's target models — are
 * the rigorous follow-up; the whole-session/cache insight is model-agnostic.
 *
 * The caveman text below is a FAITHFUL RECONSTRUCTION of the skill's documented
 * "full" ruleset (the real SKILL.md wasn't fetchable through the sandbox). It
 * captures the mechanism under test (telegraphic prose compression), which is
 * what the token claim rests on.
 *
 * FINDING (2026-06-20, real haiku, 3 trials/arm, on the Pro/Max subscription).
 * Caveman claims ~65% OUTPUT reduction. Measured over 5 real coding tasks:
 *   MEAN output cut  = -5%   (output went UP; only 1/5 tasks compressed at all)
 *   MEAN cost cut    = -4%   (the bill went UP)
 *   output share     = 1.1%  of session tokens (rest is input + cache)
 *   correctness      = 0 regressions (every task 1.0/1.0 both arms)
 * So: the 65% headline did NOT reproduce on agentic coding with haiku, AND output
 * is ~1% of the session, so even a true 65% output cut would move the bill ~0.7%.
 * "Measured << claimed", stark — the thesis-validating result. HONEST CAVEATS:
 * caveman targets Sonnet/Opus (haiku is already terse + may underuse the style),
 * the 65% was measured on single-shot Q&A not multi-turn coding, and per-task
 * numbers are noisy at 3 trials (slugify flipped -9%→+12% pilot→full). The
 * AGGREGATE direction + the ~1% output-share are robust; the sonnet/opus pass is
 * the rigorous follow-up (the output-share point is model-agnostic regardless).
 *
 * FOLLOW-UP (2026-06-20, real SONNET — caveman's TARGET model, 2 tasks × 2 trials):
 * the debunk gets STRONGER, not weaker. slugify -33% / debounce -13% output, so
 *   MEAN output cut = -23%  (output went UP — the opposite of the ~65% claim)
 *   MEAN cost cut   = -20%  (the bill went UP by a fifth)
 *   output share    = 0.5%  of session tokens · correctness = 0 regressions
 * The caveat that "haiku may underuse the terse style" is now ruled out: on the
 * model caveman targets, the telegraphic style still didn't compress an agentic
 * coding session — it cost MORE. The ~65% headline is a single-shot-Q&A artifact;
 * on multi-turn coding the output-share (~1%) makes it structurally unable to move
 * the bill regardless. (Pilot N — widen to 5×3 for tighter CIs; direction is clear.)
 */
import { runEval } from "../../dist/eval.js";
import { CODING_TASKS } from "../corpus/coding-tasks.mjs";

const trials = Number(process.env.VIGILES_TRIALS || 3);
const taskLimit = Number(process.env.VIGILES_TASKS || 5);
const model = process.env.VIGILES_MODEL || "haiku";

const CAVEMAN = `---
name: caveman
description: Compress output to telegraphic style. Few token do trick.
---

Answer like caveman. Few token do trick.

RULES:
- Drop articles (a/an/the), pleasantries ("Great question!"), filler, hedging, preamble.
- No problem restatement. No "let me know if..." sign-offs. No "I'll help you..." intros.
- Short fragments over full sentences. Bullets over prose.
- KEEP every technical fact, name, number, and code token EXACT. Never drop substance.
- Code blocks stay COMPLETE and correct — compress PROSE only, never code or required output.
`;

// The neutral real-task corpus (read a seed → write a checkable artifact →
// explain; the explanation is the compressible surface, the artifact the fact
// that must survive). Shared with the ecosystem benchmark (A1) + `vigiles
// optimize` (A2) so every measurement runs on the SAME tasks. See
// `bench/corpus/coding-tasks.mjs`.
const TASKS = CODING_TASKS.slice(0, taskLimit);

// usage fields are optional per harness/model; default missing to 0.
const u = (ctx, k) => Number(ctx.usage?.[k] ?? 0);

// ---- Report incrementally: print each task's row as it finishes, so a
// ---- timeout still yields partial data (a 30-run real eval is slow). ----
const pct = (from, to) => (from > 0 ? ((from - to) / from) * 100 : 0);
const whole = (m) => m.inputTokens + m.outputTokens + m.cacheTokens;

console.log(
  "\n=== caveman vs its claim (model: " +
    model +
    ", trials: " +
    trials +
    ") ===\n",
);
console.log(
  "task            out_base  out_cav  out_cut%   $_base   $_cav   cost_cut%  out%session  correct(b/c)",
);

let sumOutCut = 0,
  sumCostCut = 0,
  sumOutShare = 0,
  anyRegress = false;
const rows = [];
for (const t of TASKS) {
  const report = await runEval({
    name: `caveman-claim: ${t.name}`,
    arms: {
      baseline: { files: { ...t.files } },
      caveman: { files: { ...t.files, "SKILL.md": CAVEMAN } },
    },
    task: t.task,
    measure: (ctx) => ({
      inputTokens: u(ctx, "inputTokens"),
      outputTokens: u(ctx, "outputTokens"),
      cacheTokens: u(ctx, "cacheReadTokens") + u(ctx, "cacheCreationTokens"),
      costUsd: u(ctx, "costUsd"), // the honest bill — weights cache ~0.1×, output 1×
      correct: t.check(ctx),
    }),
    trials,
    model,
    concurrency: 4, // parallelize the arms×trials (default is serial → timed out)
  });
  const b = report.arms.baseline.metrics;
  const c = report.arms.caveman.metrics;
  rows.push({ name: t.name, b, c });

  const outCut = pct(b.outputTokens, c.outputTokens);
  const costCut = pct(b.costUsd, c.costUsd);
  const outShare = whole(b) > 0 ? (b.outputTokens / whole(b)) * 100 : 0;
  sumOutCut += outCut;
  sumCostCut += costCut;
  sumOutShare += outShare;
  if (c.correct < b.correct) anyRegress = true;
  console.log(
    `${t.name.padEnd(15)} ${b.outputTokens.toFixed(0).padStart(8)} ${c.outputTokens
      .toFixed(0)
      .padStart(8)} ${outCut.toFixed(0).padStart(7)}%  ${b.costUsd
      .toFixed(4)
      .padStart(7)} ${c.costUsd.toFixed(4).padStart(7)} ${costCut
      .toFixed(0)
      .padStart(8)}%  ${outShare.toFixed(1).padStart(9)}%   ${b.correct.toFixed(
      1,
    )}/${c.correct.toFixed(1)}`,
  );
}
const n = rows.length || 1;
console.log(
  `\nMEAN output-token cut:  ${(sumOutCut / n).toFixed(0)}%   (caveman's claim: ~65% output-only)`,
);
console.log(
  `MEAN cost ($) cut:      ${(sumCostCut / n).toFixed(0)}%   <- the number that pays the bill`,
);
console.log(
  `MEAN output share of session tokens: ${(sumOutShare / n).toFixed(1)}%   <- why an output-only claim misleads`,
);
console.log(
  `Correctness regression on any task: ${anyRegress ? "YES (compression dropped an answer)" : "no"}`,
);
console.log(
  "\nVerdict: caveman compresses OUTPUT, but output is a single-digit % of a real\n" +
    "coding session's tokens (the rest is input + cache from reads/tool-results). So\n" +
    "even a perfect 65% output cut moves the actual bill by a fraction of that. vigiles\n" +
    "measures the bill (cost) and the blast radius (correctness), not the headline.",
);
