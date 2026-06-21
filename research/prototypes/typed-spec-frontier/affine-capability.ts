/**
 * PROTOTYPE C — affine ("use at most once") capability, and the HONEST LIMIT.
 *
 * Linear/affine types (Rust ownership, Linear Haskell, Pony) model a resource
 * that may be consumed AT MOST ONCE: one deploy, one charge, one push. The
 * frontier question: can a typed spec make "this pipeline pushes twice" a COMPILE
 * error? This file shows BOTH what TS can do (a static-count check over a `const`
 * tuple of steps) and where it CANNOT reach (true value-flow linearity).
 *
 * Self-contained; does NOT touch src/.
 */

// ---------------------------------------------------------------------------
// PART 1 — What WORKS: a once-capability as a static count over the step tuple.
//
// We don't track a moving value (TS can't); instead the pipeline is a `const`
// tuple of step descriptors, and a type-level fold counts how many steps carry
// a `once`-marked capability. More than one ⇒ the type collapses to an error.
// This catches the real bug — a railway that lists `deploy` twice — at `tsc`.
// ---------------------------------------------------------------------------

type Cap = "deploy" | "push" | "charge" | "read" | "write";

/** Capabilities that may be used AT MOST ONCE in a pipeline. */
type OnceCap = "deploy" | "push" | "charge";

interface Step<C extends Cap> {
  readonly name: string;
  readonly cap: C;
}
function step<const C extends Cap>(name: string, cap: C): Step<C> {
  return { name, cap };
}

/** Count occurrences of a specific once-cap in a tuple of steps (peano-ish). */
type CountCap<
  Steps extends readonly Step<Cap>[],
  Target extends OnceCap,
  Acc extends unknown[] = [],
> = Steps extends readonly [infer Head, ...infer Tail]
  ? Head extends Step<infer C>
    ? Tail extends readonly Step<Cap>[]
      ? CountCap<Tail, Target, C extends Target ? [...Acc, unknown] : Acc>
      : Acc
    : Acc
  : Acc;

/** True iff EVERY once-cap appears at most once across the steps. */
type AllOnceOk<Steps extends readonly Step<Cap>[]> = {
  [T in OnceCap]: CountCap<Steps, T> extends [unknown, unknown, ...unknown[]]
    ? T // a once-cap used 2+ times — surfaces the offending cap name
    : never;
}[OnceCap] extends never
  ? true
  : { __AFFINE_VIOLATION: { usedTwice: AllOnceOkBad<Steps> } };

type AllOnceOkBad<Steps extends readonly Step<Cap>[]> = {
  [T in OnceCap]: CountCap<Steps, T> extends [unknown, unknown, ...unknown[]]
    ? T
    : never;
}[OnceCap];

/**
 * Build a pipeline. Well-typed ONLY when no once-cap is used twice; otherwise
 * the parameter collapses to the affine-violation error naming the offending cap.
 */
function railway<const Steps extends readonly Step<Cap>[]>(
  steps: AllOnceOk<Steps> extends true ? Steps : AllOnceOk<Steps>,
): { steps: Steps } {
  return { steps: steps as Steps };
}

// ---------------------------------------------------------------------------
// Passing case — at most one deploy, one push. COMPILES.
// ---------------------------------------------------------------------------

export const ship = railway([
  step("build", "write"),
  step("test", "read"),
  step("push", "push"),
  step("deploy", "deploy"),
]);

export { railway, step, type Cap, type OnceCap };
