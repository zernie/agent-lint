/**
 * Example subagent (error track): reporter.
 *
 * Source of truth for `agents/reporter.md`. The railway's onError handler: it
 * runs with the failing step's error payload and records the failure clearly so
 * a human can pick it up.
 */
import { experimental_agent, result, prose } from "../../src/core/spec.js";

export default experimental_agent({
  name: "reporter",
  description:
    "Summarize a railway failure for a human. Dispatched on the error track when recovery is exhausted.",
  model: "haiku",
  tools: ["Read"],
  body: prose`You receive the error payload of the step that failed and the
recovery attempts that were exhausted. Write a concise, factual report: what was
attempted, where it failed, and what a human should look at next.`,
  output: result(
    { reported: "boolean", summary: "string" },
    { reason: "string", retryable: "boolean" },
  ),
});
