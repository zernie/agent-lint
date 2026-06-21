/**
 * Example subagent (railway step): reviewer.
 *
 * Source of truth for `agents/reviewer.md`. The last success-track step: it
 * either approves (ok) or returns blocking findings (err) that route to the
 * recovery / error track.
 */
import { agent, result, instructions, cmd } from "../../src/core/spec.js";

export default agent({
  name: "reviewer",
  description:
    "Review the implemented diff for correctness. Dispatch LAST on the success track.",
  model: "opus",
  tools: ["Read", "Grep", "Bash"],
  body: instructions`You review the diff for correctness and regressions. Re-run
${cmd("npm test")} yourself — do not trust the report. Approve only when the change
is correct; otherwise return concrete, actionable findings.`,
  output: result(
    { summary: "string" },
    { findings: "string[]", blocking: "boolean" },
  ),
});
