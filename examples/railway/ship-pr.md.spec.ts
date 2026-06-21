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
 */
import { railway, delegate } from "../../src/core/spec.js";

export default railway({
  name: "ship-pr",
  steps: [
    delegate("planner", "break the request into an ordered plan"),
    delegate("implementer", "implement the plan; prove build + tests pass"),
    delegate("reviewer", "review the diff for correctness"),
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
