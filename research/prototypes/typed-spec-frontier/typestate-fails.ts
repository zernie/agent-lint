/**
 * FAIL CASES for typestate-protocol.ts — REJECTED by `tsc` alone.
 *
 *   npx tsc --noEmit --strict --module nodenext --moduleResolution nodenext \
 *     --target es2022 typestate-fails.ts
 *
 * Each violates the plan-before-mutate protocol: a mutating step while still
 * planning, a planner after mutation began, or entering mutation twice.
 */
import {
  planner,
  mutator,
  start,
  thenPlan,
  enterMutation,
  thenMutate,
} from "./typestate-protocol.js";

// FAILURE 1 — mutate before crossing into the mutation phase.
// `thenMutate` requires Pipe<"mutating">, but the pipeline is still planning.
export const mutateEarly = thenMutate(start(planner("plan")), mutator("push"));

// FAILURE 2 — append a planning agent AFTER mutation began.
// `thenPlan` requires Pipe<"planning">, but enterMutation moved us to mutating.
export const planLate = thenPlan(
  enterMutation(start(planner("plan"))),
  planner("late-review"),
);

// FAILURE 3 — enter the mutation phase TWICE (the one-way door).
// The second enterMutation requires Pipe<"planning">, but we're already mutating.
export const doubleEnter = enterMutation(enterMutation(start(planner("plan"))));
