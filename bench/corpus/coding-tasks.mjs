/**
 * The reusable real-task corpus — the substrate the MEASUREMENT layer runs on.
 *
 * A benchmark task (see `research/benchmark-methodology.md` §2 "what counts as a
 * real task") is NOT trivia. Each task here is:
 *   - self-contained   — seeds its own input files, reproducible anywhere;
 *   - checkable        — `check(ctx) → 1|0`, a DETERMINISTIC correctness oracle
 *                        (a predicate over the written artifact, never an LLM judge);
 *   - exercises behavior — reads a seed file + writes an artifact + explains in
 *                          prose (the compressible/optimizable surface);
 *   - agentic          — file reads, so the token profile matches real coding
 *                        (input + cache dominate, output is a single-digit %);
 *   - cheap at N trials.
 *
 * The tasks are NEUTRAL — they bake in no "thing under test". A benchmark/optimizer
 * supplies the treatment (a skill's SKILL.md, a model, a rule set) as the A arm and
 * runs the SAME task with/without it; the signal is the per-task delta. This module
 * is consumed by:
 *   - `bench/evals/caveman-claim.eval.mjs` (P0 — caveman vs its token claim);
 *   - the ecosystem benchmark (A1) and `vigiles optimize` (A2), which loop A/B over
 *     a SET of skills using exactly this corpus.
 *
 * `target` names the metric the task's compressible/optimizable surface stresses
 * (so a benchmark can pick tasks that actually exercise the claim under test).
 *
 * `check(ctx)` reads via `ctx.file(name) → string` (the eval context's artifact
 * reader) and returns 1 (correct) or 0 (regressed). `verify.mjs` proves each
 * predicate discriminates a known-good vs known-bad artifact.
 */

/** @typedef {{ file: (name: string) => string | undefined }} CheckCtx */
/**
 * @typedef {Object} CorpusTask
 * @property {string} name           Stable id (the benchmark row label).
 * @property {Record<string,string>} files  Seed files written before the run.
 * @property {string} task           The prompt (reads a seed, writes an artifact, explains).
 * @property {"outputTokens"} target The metric the compressible surface stresses.
 * @property {(ctx: CheckCtx) => 0 | 1} check  Deterministic correctness oracle.
 */

/** @type {CorpusTask[]} */
export const CODING_TASKS = [
  {
    name: "slugify",
    files: { "in.txt": "Implement a slug helper for blog post titles." },
    task:
      "Read in.txt. Write a JS function `slugify(s)` to slug.js that lowercases, " +
      "trims, replaces runs of non-alphanumerics with a single '-', and strips " +
      "leading/trailing '-'. Then briefly explain your approach in prose. Stop.",
    target: "outputTokens",
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
    target: "outputTokens",
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
    target: "outputTokens",
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
    target: "outputTokens",
    check: (ctx) => {
      const ans = /ANSWER:\s*(.+)/i.exec(ctx.file("ans.txt") ?? "")?.[1] ?? "";
      return /O\(\s*n\s*\^?\s*2\s*\)|O\(\s*n²\s*\)|quadratic/i.test(ans)
        ? 1
        : 0;
    },
  },
  {
    name: "regex-email",
    files: { "in.txt": "Need basic email validation, not RFC-perfect." },
    task:
      "Read in.txt. Write a JS function `isEmail(s)` to email.js using a regex that " +
      "requires a single '@' and a dot in the domain. Then explain the regex in prose. Stop.",
    target: "outputTokens",
    check: (ctx) => {
      const f = ctx.file("email.js") ?? "";
      return /isEmail/.test(f) &&
        /@/.test(f) &&
        /test\(|\.match\(|RegExp|\/.*\//.test(f)
        ? 1
        : 0;
    },
  },
  {
    // The PROSE-HEAVY, multi-step task: read a module, fix a bug, AND write a
    // thorough prose review across several files. It forces many turns + a large
    // explanatory surface — the closest the corpus gets to a real multi-turn
    // session (vs the ~2-turn tasks above), and the STEELMAN for a compression
    // skill: the more explanatory prose a task elicits, the more room caveman has
    // to hit its claim. If it still doesn't compress here, the debunk is strongest.
    name: "review-doc",
    files: {
      "cart.js":
        "// Shopping-cart utilities\n" +
        "function subtotal(items) { let s = 0; for (const it of items) s += it.price * it.qty; return s; }\n" +
        "function applyDiscount(amount, pct) { return amount - (amount * pct) / 100; }\n" +
        "function withTax(amount, rate) { return amount + amount * rate; }\n" +
        "function total(items, rate, discountPct) {\n" +
        "  const sub = subtotal(items);\n" +
        "  const disc = applyDiscount(sub, discountPct);\n" +
        "  return withTax(disc, rate).toFixed(0); // returns a money value\n" +
        "}\n" +
        "module.exports = { subtotal, applyDiscount, withTax, total };\n",
    },
    task:
      "Read cart.js — a shopping-cart money module. Do THREE things, each in detail:\n" +
      "1) `total` has a precision bug: it truncates cents with `toFixed(0)`. Write a " +
      "corrected `total` (keeping cents, e.g. `toFixed(2)`) to cart.fixed.js.\n" +
      "2) Write a THOROUGH code review to review.md: explain in prose what EACH of the " +
      "four functions (subtotal, applyDiscount, withTax, total) does, describe the bug " +
      "and why it loses money, and justify your fix. Be detailed.\n" +
      "3) Write the buggy function's name ALONE on the last line of bug.txt, prefixed " +
      "'ANSWER: '.\n" +
      "Be thorough in your explanations. Stop when all three files exist.",
    target: "outputTokens",
    check: (ctx) => {
      const fixed = ctx.file("cart.fixed.js") ?? "";
      const review = ctx.file("review.md") ?? "";
      const ans = /ANSWER:\s*(\w+)/i.exec(ctx.file("bug.txt") ?? "")?.[1] ?? "";
      // (a) the truncation bug is gone AND total still computes via the helpers;
      const fixedOk =
        /total/.test(fixed) &&
        /withTax/.test(fixed) &&
        !/toFixed\(\s*0\s*\)/.test(fixed);
      // (b) a substantial review naming at least two functions;
      const reviewOk =
        review.length > 200 && /subtotal/.test(review) && /total/.test(review);
      // (c) the bug is attributed to `total`.
      const ansOk = /total/i.test(ans);
      return fixedOk && reviewOk && ansOk ? 1 : 0;
    },
  },
  {
    // The LONGEST, most-multi-file task: a 3-file module with (i) a real logic
    // bug and (ii) duplicated logic, asking for a fix + a refactor + a test +
    // a thorough review + an answer marker. Reading three seed files and writing
    // five artifacts forces the most turns and the largest explanatory surface
    // in the corpus — the hardest steelman for a compression skill (maximal
    // prose to compress) and the closest stand-in for a real multi-turn session.
    // If a "save 65%" skill can't cut output HERE, it can't anywhere.
    name: "refactor-suite",
    files: {
      "money.js":
        "// money helpers\n" +
        "function round2(x) { return Math.round(x * 100) / 100; }\n" +
        "function addTax(amount, rate) { return round2(amount + amount * rate); }\n" +
        "module.exports = { round2, addTax };\n",
      "report.js":
        "// reporting helpers\n" +
        "function round2(x) { return Math.round(x * 100) / 100; }\n" +
        "function average(nums) { let s = 0; for (const n of nums) s += n; return round2(s / nums.length); }\n" +
        "function percentChange(oldV, newV) { return round2(((newV - oldV) / oldV) * 100); }\n" +
        "module.exports = { average, percentChange };\n",
      "summary.js":
        "const { addTax } = require('./money');\n" +
        "// finalPrice: apply a percentage discount, then tax.\n" +
        "function finalPrice(base, taxRate, discountPct) {\n" +
        "  const discounted = base - discountPct; // treats a percent as a flat amount\n" +
        "  return addTax(discounted, taxRate);\n" +
        "}\n" +
        "module.exports = { finalPrice };\n",
    },
    task:
      "Read money.js, report.js, and summary.js — a small money/reporting module " +
      "split across three files. Do FOUR things, each in detail:\n" +
      "1) `finalPrice` in summary.js has a bug: it subtracts `discountPct` as a flat " +
      "amount instead of a PERCENTAGE of base. Write a corrected `finalPrice` (e.g. " +
      "`base - base * discountPct / 100`) to summary.fixed.js.\n" +
      "2) `round2` is duplicated in money.js and report.js. Extract it into a new " +
      "shared.js that exports `round2` (keep the `Math.round(x*100)/100` logic).\n" +
      "3) Write tests.js with a few assertions covering the fixed `finalPrice` and " +
      "`round2`.\n" +
      "4) Write a THOROUGH code review to review.md: explain in prose what each of the " +
      "three files does, describe the discount bug and why it mischarges, and justify " +
      "both the fix and the refactor. Be detailed.\n" +
      "Then write the buggy function's name ALONE on the last line of answer.txt, " +
      "prefixed 'ANSWER: '. Be thorough. Stop when all five files exist.",
    target: "outputTokens",
    check: (ctx) => {
      const fixed = ctx.file("summary.fixed.js") ?? "";
      const shared = ctx.file("shared.js") ?? "";
      const tests = ctx.file("tests.js") ?? "";
      const review = ctx.file("review.md") ?? "";
      const ans =
        /ANSWER:\s*(\w+)/i.exec(ctx.file("answer.txt") ?? "")?.[1] ?? "";
      // (a) the flat-subtraction bug is gone AND the discount is now proportional;
      const fixedOk =
        /finalPrice/.test(fixed) &&
        /discountPct\s*\/\s*100|\*\s*discountPct|1\s*-\s*discountPct/.test(
          fixed,
        ) &&
        !/base\s*-\s*discountPct\b/.test(fixed);
      // (b) round2 was extracted into shared.js with its rounding logic intact;
      const sharedOk = /round2/.test(shared) && /Math\.round/.test(shared);
      // (c) a real test file exercising the fixed behavior;
      const testsOk =
        tests.length > 40 &&
        /finalPrice|round2/.test(tests) &&
        /assert|expect|===|toBe/.test(tests);
      // (d) a substantial review naming the bug function + a helper;
      const reviewOk =
        review.length > 300 &&
        /finalPrice/.test(review) &&
        /round2|addTax|average/.test(review);
      // (e) the bug is attributed to `finalPrice`.
      const ansOk = /finalPrice/i.test(ans);
      return fixedOk && sharedOk && testsOk && reviewOk && ansOk ? 1 : 0;
    },
  },
];

/** Look up a corpus task by name (the benchmark/optimizer selects a subset). */
export function corpusTask(name) {
  return CODING_TASKS.find((t) => t.name === name);
}
