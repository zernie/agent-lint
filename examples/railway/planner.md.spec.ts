/**
 * Example subagent (railway step): planner.
 *
 * The source of truth — `agents/planner.md` is a compiled build artifact. A flat
 * worker that returns a typed Result: a plan on success, a reason on failure.
 * Run `vigiles compile` to regenerate the markdown.
 */
import { agent, result, instructions, cmd } from "../../src/core/spec.js";

export default agent({
  name: "planner",
  description:
    "Break a change request into an ordered, reviewable plan. Dispatch FIRST in the ship-pr railway.",
  model: "sonnet",
  tools: ["Read", "Grep", "Glob"],
  body: instructions`You turn a change request into a concrete, ordered plan. Read the
relevant code first; do not write any. Verify the build is green with ${cmd("npm run build")}
before planning around it.`,
  output: result(
    { steps: "string[]", summary: "string" },
    { reason: "string", retryable: "boolean" },
  ),
});
