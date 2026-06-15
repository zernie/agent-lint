/**
 * Worked example — verify a TOKEN-COMPRESSION claim with `runEval`.
 *
 * Tools like "Caveman Mode" make the agent answer in a telegraphic style to cut
 * output tokens (claims ~65–75%). That's a harness change with TWO questions, and
 * a headline % only answers the first:
 *
 *   1. Did it actually save tokens?         → measure `outputTokens` per arm
 *   2. Did it break the behaviour?          → measure the OUTCOME, gate regression
 *
 * vigiles is not a compression tool — it's the instrument that checks the claim
 * AND the blast radius. Two arms over the SAME task:
 *
 *   - arm `verbose` — answer normally (the baseline)
 *   - arm `caveman` — answer in telegraphic style: drop filler, keep every
 *                     technical fact (the compression under test)
 *
 * Metrics: `outputTokens` (the thing being optimized — expect it lower on
 * `caveman`) and `correct` (the fact that must survive — expect it UNCHANGED).
 * The point of the example is the pairing: a token win that silently drops the
 * answer's correctness is not a win, and this is how you'd catch it.
 *
 *   npx vigiles eval --trials=6 examples/harness/skill-compression.eval.mjs
 *   node examples/harness/skill-compression.eval.mjs 6      # standalone
 *
 * Real model → real cost. Needs the `claude` CLI + model auth and a built dist/.
 * External users import from the package: `from "vigiles/eval"`.
 */
import { runEval, formatEvalReport } from "../../dist/eval.js";

const trials = Number(process.env.VIGILES_TRIALS || process.argv[2] || 3);

const CAVEMAN = `# answer-style

Answer in TELEGRAPHIC style. Drop articles, filler, and pleasantries. Keep every
technical fact, name, and number exact. Short fragments over full sentences.
`;

// The task has a checkable fact (the capital) buried in a request that invites
// prose — so a too-aggressive compression that drops the fact is caught.
const TASK =
  "Read SKILL.md if it exists and follow its answer style. In one short reply, " +
  "name the capital city of Australia, then write it alone on the last line " +
  "prefixed with 'ANSWER: '. Write the whole reply to REPLY.txt. Then stop.";

const report = await runEval({
  name: "skill-compression: does telegraphic style cut tokens without dropping the fact?",
  arms: {
    verbose: {},
    caveman: { files: { "SKILL.md": CAVEMAN } },
  },
  task: TASK,
  measure: (ctx) => {
    const reply = ctx.file("REPLY.txt") ?? "";
    const answer = /ANSWER:\s*([A-Za-z .]+)/i.exec(reply)?.[1]?.trim() ?? "";
    return {
      outputTokens: ctx.usage.outputTokens, // the optimization target
      correct: /canberra/i.test(answer) ? 1 : 0, // the fact that must survive
    };
  },
  trials,
  model: "haiku",
});

console.log(formatEvalReport(report));

// The two questions, answered from the arm means (`metrics` = mean per metric):
const verbose = report.arms.verbose.metrics;
const caveman = report.arms.caveman.metrics;
const saved =
  verbose.outputTokens > 0
    ? ((verbose.outputTokens - caveman.outputTokens) / verbose.outputTokens) *
      100
    : 0;
console.log(
  `\ncaveman output-token saving vs verbose: ${saved.toFixed(0)}% ` +
    `(${verbose.outputTokens.toFixed(0)} → ${caveman.outputTokens.toFixed(0)} tok/run)`,
);

// The behavioural guardrail: a token saving that dropped the answer is not a win.
if (caveman.correct < verbose.correct) {
  throw new Error(
    `caveman regressed correctness: ${caveman.correct} < ${verbose.correct} ` +
      `(verbose) — the token saving cost the answer, so it does not count`,
  );
}
