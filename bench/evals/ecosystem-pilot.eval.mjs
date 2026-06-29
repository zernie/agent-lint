/**
 * Ecosystem benchmark — COMPRESSION CLUSTER (the multi-skill generalization of
 * `caveman-claim.eval.mjs`).
 *
 * Loops a SET of hyped output-compression skills over the neutral corpus, A/B
 * (skill ON vs OFF) per task, and reports the honest economics — output + cost
 * delta, the output-SHARE of the session (why an output-only % misleads), and the
 * correctness GUARDRAIL (a compression that drops a required answer is not a win).
 * One leaderboard row per skill.
 *
 *   node bench/evals/ecosystem-pilot.eval.mjs                    # 3 tasks × 2 trials
 *   VIGILES_TRIALS=3 VIGILES_TASKS=slugify,review-doc node bench/evals/ecosystem-pilot.eval.mjs
 *
 * Real model → real cost, on the Pro/Max subscription (apiKeySource:"none").
 * Model: haiku (the cheap v0 pass; sonnet is the rigorous follow-up).
 *
 * The skill texts are FAITHFUL RECONSTRUCTIONS of each tool's DOCUMENTED mechanism
 * (telegraphic / bullet-only / minimal-prose), labeled as such — the real
 * SKILL.md files weren't fetchable through the sandbox. They capture the mechanism
 * under test (prose compression), which is what the token claim rests on.
 *
 * PILOT FINDING (2026-06-28, haiku, 2 trials, 3 tasks — DIRECTION clear, CIs not):
 *   bullets +43% out / +41% cost (INFLATED by one near-empty-output artifact on
 *     bigO — see ARTIFACT_FLOOR below; robust signal is review-doc +28%)
 *   caveman -13% out / -3% cost (output went UP — the caveman debunk holds)
 *   minify  -29% out / -13% cost + 1 CORRECTNESS REGRESSION (dropped required
 *     content on review-doc) — a compression that BROKE the task
 *   output share ~1% of session tokens across all three (the model-agnostic kicker:
 *     even a real output cut barely moves the bill).
 * Widen to 5 tasks × 5 trials + sonnet for a publishable leaderboard.
 */
import { runEval } from "../../dist/eval.js";
import { CODING_TASKS } from "../corpus/coding-tasks.mjs";

const trials = Number(process.env.VIGILES_TRIALS || 2);
const model = process.env.VIGILES_MODEL || "haiku";
const pick = (process.env.VIGILES_TASKS || "slugify,bigO,review-doc").split(
  ",",
);
const TASKS = CODING_TASKS.filter((t) => pick.includes(t.name));

// Below this many output tokens on the SKILL arm, a per-task "cut%" is a likely
// artifact (the model produced a near-empty answer), not a real compression — the
// pilot's bigO 100% case. Flag it in the row and DROP it from the skill's mean.
const ARTIFACT_FLOOR = 20;

const SKILLS = {
  // JuliusBrussee/caveman — telegraphic style (claims ~65% OUTPUT reduction).
  caveman: `---
name: caveman
description: Compress output to telegraphic style. Few token do trick.
---
Answer like caveman. Few token do trick.
RULES:
- Drop articles (a/an/the), pleasantries, filler, hedging, preamble.
- No problem restatement. No sign-offs. Short fragments over full sentences.
- KEEP every technical fact, name, number, code token EXACT. Code blocks stay COMPLETE.`,
  // Bullet-only style — replace all prose with terse bullets.
  bullets: `---
name: bullets-only
description: Replace all prose with terse bullet points. No paragraphs.
---
Output ONLY bullet points — never paragraphs or full sentences.
- One fact per bullet, no connective prose.
- Strip every adjective/adverb not load-bearing.
- Keep code blocks and required answers verbatim and complete.`,
  // Minimal-prose style — cut explanation to the absolute minimum.
  minify: `---
name: minify-prose
description: Minimize explanatory prose to the absolute minimum that stays correct.
---
Be maximally concise. Cut explanation to the single most essential sentence.
- Prefer naming a thing over describing it.
- Never restate the question or summarize what you did.
- Code and required output stay complete and exact; compress PROSE only.`,
};

const u = (ctx, k) => Number(ctx.usage?.[k] ?? 0);
const pct = (from, to) => (from > 0 ? ((from - to) / from) * 100 : 0);
const whole = (m) => m.inputTokens + m.outputTokens + m.cacheTokens;

console.log(
  `\n=== ecosystem benchmark: compression cluster (model: ${model}, trials: ${trials}, tasks: ${TASKS.map((t) => t.name).join("/")}) ===\n`,
);

const board = [];
for (const [name, skillMd] of Object.entries(SKILLS)) {
  const outs = [];
  const costs = [];
  const shares = [];
  let regress = 0;
  for (const t of TASKS) {
    const report = await runEval({
      name: `ecosystem:${name}:${t.name}`,
      arms: {
        baseline: { files: { ...t.files } },
        skill: { files: { ...t.files, "SKILL.md": skillMd } },
      },
      task: t.task,
      measure: (ctx) => ({
        inputTokens: u(ctx, "inputTokens"),
        outputTokens: u(ctx, "outputTokens"),
        cacheTokens: u(ctx, "cacheReadTokens") + u(ctx, "cacheCreationTokens"),
        costUsd: u(ctx, "costUsd"),
        correct: t.check(ctx),
      }),
      trials,
      model,
      concurrency: 4,
    });
    const b = report.arms.baseline.metrics;
    const s = report.arms.skill.metrics;
    const artifact = s.outputTokens < ARTIFACT_FLOOR;
    const o = pct(b.outputTokens, s.outputTokens);
    const c = pct(b.costUsd, s.costUsd);
    if (!artifact) {
      outs.push(o);
      costs.push(c);
      shares.push(whole(b) > 0 ? (b.outputTokens / whole(b)) * 100 : 0);
    }
    if (s.correct < b.correct) regress++;
    console.log(
      `  [${name}/${t.name}] out ${o.toFixed(0)}% cost ${c.toFixed(0)}% correct ${b.correct.toFixed(1)}/${s.correct.toFixed(1)}${artifact ? "  ⚠ artifact (skill output < floor — dropped from mean)" : ""}`,
    );
  }
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  board.push({
    name,
    out: mean(outs),
    cost: mean(costs),
    share: mean(shares),
    regress,
    n: outs.length,
  });
}

console.log("\n--- LEADERBOARD (mean over non-artifact tasks) ---");
console.log("skill          out_cut%  cost_cut%  out%session  regressions");
for (const r of board.sort((a, b) => b.cost - a.cost)) {
  console.log(
    `${r.name.padEnd(15)} ${r.out.toFixed(0).padStart(7)}%  ${r.cost.toFixed(0).padStart(8)}%  ${r.share.toFixed(1).padStart(9)}%   ${r.regress}`,
  );
}
console.log(
  "\n(positive cut% = the skill SAVED; negative = it cost MORE. output-share% = why an\n" +
    "output-only claim misleads. A regression means the compression dropped a required answer.)",
);
