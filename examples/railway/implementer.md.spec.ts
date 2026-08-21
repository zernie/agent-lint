/**
 * Example subagent (railway step): implementer.
 *
 * Source of truth for `agents/implementer.md`. Receives the planner's success
 * payload, makes the edits, and returns the files it changed — or a structured
 * failure (where it stopped + whether a retry could help).
 */
import { experimental_agent, result, prose, cmd } from "../../src/core/spec.js";

export default experimental_agent({
  name: "implementer",
  description:
    "Implement an approved plan: make the edits and prove the build passes. Dispatch after the planner.",
  model: "sonnet",
  tools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"],
  body: prose`You implement the plan handed to you, one step at a time. After
the edits, run ${cmd("npm run build")} and ${cmd("npm test")}; only report success
once both pass. On failure, report where you stopped so the fixer can recover.`,
  output: result(
    { files: "string[]", summary: "string" },
    { failedAt: "string", logs: "string", retryable: "boolean" },
  ),
});
