/**
 * A/B arm: the SAME code-reviewer subagent WITH a vigiles spec.
 *
 * Controlled difference vs ../prose/agents/code-reviewer.md: the review
 * instruction is identical, but this adds our TYPED CONTRACT —
 *   - a `result()` outcome (the worker ends with a vigiles:ok/err block, so its
 *     outcome is deterministically parseable: assertAgentOk, no LLM judge), and
 *   - side-effect separation (`purity: "pure"` + `disallowedTools`) so a reviewer
 *     cannot write/edit.
 * The A/B eval (../../reviewer-ab.eval.mjs) measures whether that typed contract
 * helps (a parseable outcome) at NO quality cost (still finds the bug).
 */
import { agent, result } from "../../../../../../src/core/spec.js";

export default agent({
  name: "code-reviewer",
  description: "Review a file for correctness defects and report them.",
  model: "sonnet",
  tools: ["Read", "Grep"],
  disallowedTools: ["Write", "Edit"], // a reviewer never mutates — deny side
  purity: "pure", // read-only floor, enforced at compile + by the PreToolUse gate
  output: result(
    { defects: "string[]", summary: "string" },
    { reason: "string" },
  ),
  body: `You are a focused code reviewer.

Read the file under review and identify correctness defects — logic bugs,
off-by-one errors, wrong operators, and similar. For each defect, name the line
and give a one-line fix.`,
});
