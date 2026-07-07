/**
 * Post-run analysis for an ecosystem-benchmark JSON — the airtight read the
 * article leans on. Reuses vigiles's own `welchTTest` (dist/stats.js) so a per-cell
 * A/B gap is a p-value, not eyeballed ±se bars. Also computes the OUTPUT DOLLAR
 * SHARE (output tokens × $15/M ÷ the run's real cost) — the honest "how much of the
 * bill is even output?" number (cache-read is 50× cheaper, so token-share ≪ $-share).
 *
 *   node bench/ecosystem/analyze.mjs bench/ecosystem/results-archive/<run>.json
 */
import { readFileSync } from "node:fs";
import { welchTTest } from "../../dist/stats.js";

const OUT_PER_M = 15; // sonnet output $/M — the price on the tokens these skills cut
const file = process.argv[2];
if (!file) {
  console.error("usage: node bench/ecosystem/analyze.mjs <results.json>");
  process.exit(1);
}
const d = JSON.parse(readFileSync(file, "utf-8"));
const cmp = (a, b) =>
  a && b
    ? welchTTest(
        { mean: a.mean, se: a.se, n: a.n },
        { mean: b.mean, se: b.se, n: b.n },
      )
    : null;
const sig = (p) =>
  p == null ? "  n/a" : p < 0.05 ? `p=${p.toFixed(3)}*` : `p=${p.toFixed(2)} `;
const outShareDollar = (m) => {
  const outUsd = (m.outputTokens * OUT_PER_M) / 1e6;
  return m.costUsd > 0 ? (outUsd / m.costUsd) * 100 : 0;
};

console.log(`\n# ${file}`);
console.log(
  `model ${d.model} · trials ${d.trials} · tasks ${d.tasks.join(", ")} · bill $${d.runningCost.toFixed(2)} (API-equiv)\n`,
);

for (const s of d.leaderboard) {
  console.log(`\n## ${s.title}  — claim ${s.claim.pct ?? "n/a"}%`);
  console.log(
    "task            outΔ%   out_signif    $Δ%    $_signif     out$share  correct",
  );
  let poolB = 0,
    poolS = 0,
    outShareSum = 0,
    n = 0;
  for (const t of s.tasks) {
    const bs = t.baselineStats,
      ss = t.skillStats;
    const outP = cmp(ss?.outputTokens, bs?.outputTokens);
    const costP = cmp(ss?.costUsd, bs?.costUsd);
    const oShare = outShareDollar(t.baseline);
    poolB += t.baseline.costUsd;
    poolS += t.skill.costUsd;
    outShareSum += oShare;
    n++;
    console.log(
      t.task.padEnd(15),
      (t.outCut >= 0 ? "-" : "+") +
        Math.abs(t.outCut).toFixed(0).padStart(2) +
        "%",
      "  ",
      sig(outP?.pValue).padEnd(11),
      (t.costCut >= 0 ? "-" : "+") +
        Math.abs(t.costCut).toFixed(0).padStart(2) +
        "%",
      "  ",
      sig(costP?.pValue).padEnd(11),
      (oShare.toFixed(0) + "%").padStart(6),
      "   ",
      `${t.baseline.correct.toFixed(1)}/${t.skill.correct.toFixed(1)}`,
    );
  }
  const poolCut = poolB > 0 ? ((poolB - poolS) / poolB) * 100 : 0;
  console.log(
    `  → POOLED bill: $${poolB.toFixed(4)} base vs $${poolS.toFixed(4)} skill ` +
      `= ${poolCut >= 0 ? "-" : "+"}${Math.abs(poolCut).toFixed(0)}% (the honest whole-run number, not a mean-of-ratios)`,
  );
  console.log(
    `  → mean output $-share of the bill: ${(outShareSum / n).toFixed(0)}% ` +
      `(a perfect ${s.claim.pct ?? 0}% output cut caps the bill saving at ~${(((s.claim.pct ?? 0) / 100) * (outShareSum / n)).toFixed(0)}%)`,
  );
}
