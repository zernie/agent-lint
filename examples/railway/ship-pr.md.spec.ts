/**
 * Example railway: ship-pr — railway-oriented orchestration over flat subagents.
 *
 * Source of truth for `ship-pr.md` (the orchestrator command the lead agent
 * reads). Each step is a flat worker that returns a typed Result (vigiles:ok /
 * vigiles:err); the success track flows planner → implementer → reviewer, the
 * first error short-circuits, bounded recovery retries via the fixer, and an
 * exhausted failure routes to the reporter. No loop combinator — the value is a
 * finite tree, so it always terminates and every delegate() target is resolved
 * against the real agent specs in this directory at compile time.
 *
 * The two later steps also declare what they `needs()` from their predecessor's
 * result().ok — so `vigiles generate harness` emits a CROSS-FILE handoff check:
 * planner.ok supplies the implementer's `steps`, and implementer.ok supplies the
 * reviewer's `summary`. A mismatch would be a `tsc` error naming the field.
 */
import { experimental_agent } from "../../src/core/spec.js";
const { railway, delegate, needs } = experimental_agent;

export default railway({
  name: "ship-pr",
  steps: [
    delegate("planner", "break the request into an ordered plan"),
    delegate(
      "implementer",
      "implement the plan; prove build + tests pass",
      needs({ steps: "string[]" }),
    ),
    delegate(
      "reviewer",
      "review the diff for correctness",
      needs({ summary: "string" }),
    ),
  ],
  recover: {
    step: delegate(
      "fixer",
      "address the failing step's findings, then re-verify",
    ),
    max: 2,
  },
  onError: delegate("reporter", "report the exhausted failure for a human"),
});
