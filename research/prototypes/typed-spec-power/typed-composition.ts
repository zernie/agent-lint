/**
 * PROTOTYPE — Typed composition of a railway (seed #1).
 *
 * Goal: prove a TYPED spec can make the compiler reject a pipeline where agent
 * A's success output does NOT supply the fields agent B declares it NEEDS — a
 * cross-reference no markdown/YAML format can perform.
 *
 * This is a SELF-CONTAINED proof-of-concept. It deliberately COPIES a minimal,
 * type-parameterized variant of the shipped builders (the shipped `agent()` /
 * `result()` / `delegate()` in src/core/spec.ts are intentionally NOT touched —
 * see the doc). The shipped versions erase the field shapes to `string` keys, so
 * the type system cannot see a handoff mismatch today; this POC keeps the shapes
 * in the type parameters so it can.
 *
 * Run the demonstration:  (these lines compile)        — see `goodPipeline`
 * Run the failure proof:   `tsc --noEmit fails.ts`      — see ./fails.ts
 */

// ---------------------------------------------------------------------------
// Minimal field-type vocabulary (mirrors OutputFieldType in src/core/spec.ts)
// ---------------------------------------------------------------------------

type FieldType = "string" | "number" | "boolean" | "string[]";

/** A field SHAPE is a record of field-name -> field-type. Kept in the TYPE. */
type Shape = Readonly<Record<string, FieldType>>;

// ---------------------------------------------------------------------------
// A subagent that REMEMBERS its contract shapes at the type level.
//
// `Needs`  — the input fields this agent requires from its predecessor.
// `Ok`     — the success fields it produces.
// `Err`    — the error fields it produces.
// ---------------------------------------------------------------------------

interface TypedAgent<Needs extends Shape, Ok extends Shape, Err extends Shape> {
  readonly _specType: "agent";
  readonly name: string;
  /** Input contract: the fields the agent reads from the prior step's `ok`. */
  readonly needs: Needs;
  /** Success contract. */
  readonly ok: Ok;
  /** Error contract. */
  readonly err: Err;
}

function agent<
  const Needs extends Shape,
  const Ok extends Shape,
  const Err extends Shape,
>(spec: {
  name: string;
  needs: Needs;
  result: { ok: Ok; err: Err };
}): TypedAgent<Needs, Ok, Err> {
  return {
    _specType: "agent",
    name: spec.name,
    needs: spec.needs,
    ok: spec.result.ok,
    err: spec.result.err,
  };
}

// ---------------------------------------------------------------------------
// The composition combinator.
//
// `pipe(a, b)` is well-typed ONLY when a's `Ok` shape SUPPLIES every field b
// `needs`, with matching field types. The constraint is expressed as a
// conditional type that collapses to a descriptive error literal when the
// handoff is unsatisfiable — so the failure shows up AT the mismatched call,
// naming the offending field.
// ---------------------------------------------------------------------------

/** True iff `Producer` provides every field `Consumer` needs, same types. */
type Supplies<Producer extends Shape, Consumer extends Shape> = {
  [K in keyof Consumer]: K extends keyof Producer
    ? Producer[K] extends Consumer[K]
      ? true
      : { __mismatch: K; expected: Consumer[K]; got: Producer[K] }
    : { __missing: K; required: Consumer[K] };
}[keyof Consumer];

/** A pipeline carries the LAST agent's ok/err forward for further chaining. */
interface Pipeline<Ok extends Shape, Err extends Shape> {
  readonly agents: readonly string[];
  readonly ok: Ok;
  readonly err: Err;
}

/** Start a pipeline from a first agent (no upstream, so `needs` must be {}). */
function start<Ok extends Shape, Err extends Shape>(
  a: TypedAgent<Record<string, never>, Ok, Err>,
): Pipeline<Ok, Err> {
  return { agents: [a.name], ok: a.ok, err: a.err };
}

/**
 * Append `b` to a pipeline. The `Supplies` check is enforced as a constraint on
 * the call: when the prior `Ok` does not supply `b`'s `Needs`, the second
 * parameter's expected type becomes `never`/the error object and `tsc` rejects
 * the call, pointing at the mismatched field.
 */
function then<
  PriorOk extends Shape,
  PriorErr extends Shape,
  Needs extends Shape,
  Ok extends Shape,
  Err extends Shape,
>(
  prior: Pipeline<PriorOk, PriorErr>,
  b: Supplies<PriorOk, Needs> extends true
    ? TypedAgent<Needs, Ok, Err>
    : {
        __HANDOFF_ERROR: Supplies<PriorOk, Needs>;
      },
): Pipeline<Ok, PriorErr | Err> {
  const real = b as TypedAgent<Needs, Ok, Err>;
  return {
    agents: [...prior.agents, real.name],
    ok: real.ok,
    err: real.err,
  };
}

// ---------------------------------------------------------------------------
// Worked example — a real ship-PR railway with three workers.
// ---------------------------------------------------------------------------

const planner = agent({
  name: "planner",
  needs: {},
  result: {
    ok: { plan: "string", files: "string[]" },
    err: { reason: "string" },
  },
});

const implementer = agent({
  name: "implementer",
  // implementer CONSUMES the planner's `files` + `plan`.
  needs: { plan: "string", files: "string[]" },
  result: {
    ok: { diff: "string", touched: "string[]" },
    err: { reason: "string", retryable: "boolean" },
  },
});

const reviewer = agent({
  name: "reviewer",
  // reviewer CONSUMES the implementer's `diff`.
  needs: { diff: "string" },
  result: {
    ok: { approved: "boolean", notes: "string[]" },
    err: { reason: "string" },
  },
});

// This pipeline is well-typed: planner.ok ⊇ implementer.needs, and
// implementer.ok ⊇ reviewer.needs. It COMPILES.
export const goodPipeline = then(then(start(planner), implementer), reviewer);

// Prove the carried type is precise — the pipeline's final ok is reviewer's ok.
const _approved: "boolean" = goodPipeline.ok.approved;
void _approved;

export { agent, start, then, type TypedAgent, type Shape, type Supplies };
