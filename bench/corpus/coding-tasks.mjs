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
];

/** Look up a corpus task by name (the benchmark/optimizer selects a subset). */
export function corpusTask(name) {
  return CODING_TASKS.find((t) => t.name === name);
}
