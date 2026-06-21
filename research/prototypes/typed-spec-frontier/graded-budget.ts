/**
 * PROBE E — graded/indexed budget at the type level (and its HONEST LIMIT).
 *
 * Graded monads (Katsumata) track a quantitative grade in the type — here a
 * token/step budget. The frontier question: can a typed pipeline REJECT at `tsc`
 * a plan whose summed step-cost exceeds a declared budget? TS has no native
 * numeric arithmetic in types; you simulate it with tuple-length peano. This
 * probe shows it WORKS for small budgets and then BLOWS UP — establishing the
 * limit so the doc can recommend the runtime form instead.
 */

// Peano via tuple length. Build a tuple of length N.
type Tuple<
  N extends number,
  Acc extends unknown[] = [],
> = Acc["length"] extends N ? Acc : Tuple<N, [...Acc, unknown]>;

type Add<A extends number, B extends number> = [
  ...Tuple<A>,
  ...Tuple<B>,
]["length"] &
  number;

/** A <= B via tuple prefixing. */
type Lte<A extends number, B extends number> =
  Tuple<B> extends [...Tuple<A>, ...infer _Rest] ? true : false;

// --- Small budgets WORK. ---
type Sum3 = Add<2, Add<3, 1>>; // 6
const _sum: Sum3 = 6;
void _sum;

type Within = Lte<6, 10>; // true
const _within: Within = true;
void _within;

type Over = Lte<11, 10>; // false
const _over: Over = false;
void _over;

// --- The LIMIT: a realistic budget (thousands of tokens) is unrepresentable.
//     `Tuple<2000>` already risks "Type instantiation is excessively deep".
//     Uncommenting the next line reproduces the blow-up on most machines:
//
//   type Boom = Tuple<5000>;
//
//     So a token budget in the TYPE is an academic toy. The budget belongs in a
//     RUNTIME check (the eval tier already meters cost/latency/tokens and
//     maxCostUsd) — types can grade a small STEP COUNT, not a token count.

export type { Sum3, Within, Over };
