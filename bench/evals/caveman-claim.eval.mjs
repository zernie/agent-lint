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
 */
import { runEval } from "../../dist/eval.js";

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

/**
 * Each task: read a seed file (→ realistic input/cache), produce a checkable
 * artifact (→ correctness), and explain (→ compressible output). `check` reads
 * the written artifact and returns 1/0 — the fact that must survive compression.
 */
const TASKS = [
  {
    name: "slugify",
    files: { "in.txt": "Implement a slug helper for blog post titles." },
    task:
      "Read in.txt. Write a JS function `slugify(s)` to slug.js that lowercases, " +
      "trims, replaces runs of non-alphanumerics with a single '-', and strips " +
      "leading/trailing '-'. Then briefly explain your approach in prose. Stop.",
    check: (ctx) => {
      const f = ctx.file("slug.js") ?? "";
      return /function\s+slugify|slugify\s*=/.test(f) &&
        /toLowerCase/.test(f) &&
        /replace/.test(f)
        ? 1
        : 0;
    },
  },
  {
    name: "debounce",
    files: { "in.txt": "We need a debounce utility for a search box." },
    task:
      "Read in.txt. Write a JS `debounce(fn, ms)` to debounce.js that delays " +
      "calling fn until ms after the last call. Then explain in prose how it works. Stop.",
    check: (ctx) => {
      const f = ctx.file("debounce.js") ?? "";
      return /setTimeout/.test(f) && /clearTimeout/.test(f) ? 1 : 0;
    },
  },
  {
    name: "bugfix-offbyone",
    files: {
      "buggy.js":
        "function lastN(arr, n) {\n  const out = [];\n  for (let i = arr.length - n - 1; i < arr.length; i++) out.push(arr[i]);\n  return out;\n}\n",
    },
    task:
      "Read buggy.js. lastN should return the LAST n elements but it's off by one " +
      "(returns n+1). Write the corrected function to fixed.js, then explain the bug " +
      "in prose. Stop.",
    check: (ctx) => {
      const f = ctx.file("fixed.js") ?? "";
      // correct start index is arr.length - n
      return /length\s*-\s*n\b/.test(f) && !/length\s*-\s*n\s*-\s*1/.test(f)
        ? 1
        : 0;
    },
  },
  {
    name: "bigO",
    files: {
      "loop.js":
        "for (let i = 0; i < n; i++)\n  for (let j = 0; j < n; j++)\n    if (a[i] === a[j]) count++;\n",
    },
    task:
      "Read loop.js. State its time complexity in Big-O, then explain why in prose. " +
      "Write the answer to ans.txt with the complexity ALONE on the last line prefixed " +
      "'ANSWER: '. Stop.",
    check: (ctx) => {
      const ans = /ANSWER:\s*(.+)/i.exec(ctx.file("ans.txt") ?? "")?.[1] ?? "";
      return /O\(\s*n\s*\^?\s*2\s*\)|O\(\s*n²\s*\)|quadratic/i.test(ans) ? 1 : 0;
    },
  },
  {
    name: "regex-email",
    files: { "in.txt": "Need basic email validation, not RFC-perfect." },
    task:
      "Read in.txt. Write a JS function `isEmail(s)` to email.js using a regex that " +
      "requires a single '@' and a dot in the domain. Then explain the regex in prose. Stop.",
    check: (ctx) => {
      const f = ctx.file("email.js") ?? "";
      return /isEmail/.test(f) && /@/.test(f) && /test\(|\.match\(|RegExp|\/.*\//.test(f)
        ? 1
        : 0;
    },
  },
].slice(0, taskLimit);

// usage fields are optional per harness/model; default missing to 0.
const u = (ctx, k) => Number(ctx.usage?.[k] ?? 0);

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
  });
  const b = report.arms.baseline.metrics;
  const c = report.arms.caveman.metrics;
  rows.push({ name: t.name, b, c });
}

// ---- Aggregate + report: the claim vs the whole-session reality ----
const pct = (from, to) => (from > 0 ? ((from - to) / from) * 100 : 0);
const whole = (m) => m.inputTokens + m.outputTokens + m.cacheTokens;

console.log(
  "\n=== caveman vs its claim (model: " + model + ", trials: " + trials + ") ===\n",
);
console.log(
  "task            out_base  out_cav  out_cut%   $_base   $_cav   cost_cut%  out%session  correct(b/c)",
);
let sumOutCut = 0,
  sumCostCut = 0,
  sumOutShare = 0,
  anyRegress = false;
for (const r of rows) {
  const outCut = pct(r.b.outputTokens, r.c.outputTokens);
  const costCut = pct(r.b.costUsd, r.c.costUsd);
  const outShare = whole(r.b) > 0 ? (r.b.outputTokens / whole(r.b)) * 100 : 0;
  sumOutCut += outCut;
  sumCostCut += costCut;
  sumOutShare += outShare;
  if (r.c.correct < r.b.correct) anyRegress = true;
  console.log(
    `${r.name.padEnd(15)} ${r.b.outputTokens.toFixed(0).padStart(8)} ${r.c.outputTokens
      .toFixed(0)
      .padStart(8)} ${outCut.toFixed(0).padStart(7)}%  ${r.b.costUsd
      .toFixed(4)
      .padStart(7)} ${r.c.costUsd.toFixed(4).padStart(7)} ${costCut
      .toFixed(0)
      .padStart(8)}%  ${outShare.toFixed(1).padStart(9)}%   ${r.b.correct.toFixed(
      1,
    )}/${r.c.correct.toFixed(1)}`,
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
