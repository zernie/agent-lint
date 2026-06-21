/**
 * PROTOTYPE B — typestate / session types for the multi-agent PROTOCOL.
 *
 * The prior round (#1, typed-spec-power.md) typed the DATA handed between agents
 * (A.ok must supply B.needs). This goes one level up the behavioral-types ladder
 * (session types / typestate, Honda / Strom-Yemini): type the PROTOCOL itself —
 * the ORDER and PHASE of the pipeline — so an ILLEGAL SEQUENCE doesn't compile,
 * independent of whether the data lines up.
 *
 * The harness invariant we want is the "plan-before-mutate" safety property
 * (a temporal-logic G(mutate → P plan) the model-checking seed asks for): a
 * pipeline must run its READ-ONLY planning/review phase BEFORE any agent that
 * MUTATES the world (writes files, pushes, deploys). A markdown railway lists
 * steps as strings in whatever order; nothing stops a `deploy` step before a
 * `plan` step. Here the pipeline carries a PHASE in its type (a typestate), and
 * the combinators only permit a phase TRANSITION that respects the protocol:
 *
 *     start → (planning)* → enterMutation → (mutating)* → done
 *
 * A `mutating` agent appended while still in `planning` is a COMPILE error; an
 * `enterMutation` after the pipeline already mutated is a COMPILE error. This is
 * the typestate "an operation is permitted only in a given state" transferred to
 * the agent pipeline.
 *
 * Self-contained; does NOT touch src/.
 *   pass:  npx tsc --noEmit --strict typestate-protocol.ts   (exit 0)
 *   fail:  ./typestate-fails.ts
 */

// ---------------------------------------------------------------------------
// The phase typestate. A pipeline is in exactly one phase.
// ---------------------------------------------------------------------------

type Phase = "planning" | "mutating";

/** An agent declares the phase it RUNS IN — read-only planners vs mutators. */
interface PhasedAgent<P extends Phase> {
  readonly name: string;
  readonly phase: P;
}

function planner(name: string): PhasedAgent<"planning"> {
  return { name, phase: "planning" };
}
function mutator(name: string): PhasedAgent<"mutating"> {
  return { name, phase: "mutating" };
}

/** A pipeline carrying its current phase (the typestate) in the type. */
interface Pipe<P extends Phase> {
  readonly steps: readonly string[];
  readonly phase: P;
}

/** Every pipeline starts in `planning` — you cannot begin by mutating. */
function start(a: PhasedAgent<"planning">): Pipe<"planning"> {
  return { steps: [a.name], phase: "planning" };
}

/**
 * Append a PLANNING agent. Legal ONLY while still in the planning phase — a
 * planner after mutation has begun is rejected (the type requires `Pipe<"planning">`).
 */
function thenPlan(
  prior: Pipe<"planning">,
  a: PhasedAgent<"planning">,
): Pipe<"planning"> {
  return { steps: [...prior.steps, a.name], phase: "planning" };
}

/**
 * The one-way phase TRANSITION. Legal ONLY from `planning` (you cannot
 * re-enter mutation, and you cannot enter it twice). After this, only mutators
 * may be appended.
 */
function enterMutation(prior: Pipe<"planning">): Pipe<"mutating"> {
  return { steps: prior.steps, phase: "mutating" };
}

/** Append a MUTATING agent. Legal ONLY after `enterMutation` (phase `mutating`). */
function thenMutate(
  prior: Pipe<"mutating">,
  a: PhasedAgent<"mutating">,
): Pipe<"mutating"> {
  return { steps: [...prior.steps, a.name], phase: "mutating" };
}

// ---------------------------------------------------------------------------
// Worked example — a legal ship pipeline. Plan, review (both read-only),
// THEN cross into mutation and write/push. This COMPILES.
// ---------------------------------------------------------------------------

export const ship = thenMutate(
  thenMutate(
    enterMutation(thenPlan(start(planner("plan")), planner("review"))),
    mutator("implement"),
  ),
  mutator("push"),
);

const _phase: "mutating" = ship.phase; // the carried typestate is precise
void _phase;

export {
  planner,
  mutator,
  start,
  thenPlan,
  enterMutation,
  thenMutate,
  type Pipe,
  type PhasedAgent,
};
