/**
 * Example subagent (railway step): reviewer.
 *
 * Source of truth for `agents/reviewer.md`. The last success-track step: it
 * either approves (ok) or returns blocking findings (err) that route to the
 * recovery / error track.
 */
import { experimental_agent, prose, cmd } from "../../src/core/spec.js";
const { result } = experimental_agent;

export default experimental_agent({
  name: "reviewer",
  description:
    "Review the implemented diff for correctness. Dispatch LAST on the success track.",
  model: "opus",
  tools: ["Read", "Grep", "Bash"],
  body: prose`You review the diff for correctness and regressions. Re-run
${cmd("npm test")} yourself — do not trust the report. Approve only when the change
is correct; otherwise return concrete, actionable findings.`,
  output: result(
    { summary: "string" },
    { findings: "string[]", blocking: "boolean" },
  ),
});
