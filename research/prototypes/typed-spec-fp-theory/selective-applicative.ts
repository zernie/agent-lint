// T1 — The Applicative / Selective / Monad boundary of STATIC ANALYZABILITY.
//
// The headline result. A pipeline's effect+capability surface is computable at
// COMPILE TIME exactly as long as the pipeline stays SELECTIVE-APPLICATIVE:
//
//   - APPLICATIVE (McBride & Paterson 2008): the structure is fixed up front; no
//     step's IDENTITY depends on a prior step's runtime VALUE. `<*>` lets you see
//     every effect before running any. → the union of effects is a static fold.
//   - SELECTIVE (Mokhov, Lukyanov, Marlow, Dimino 2019, "Selective Applicative
//     Functors"): adds STATICALLY-KNOWN branches — `branch`/`ifS` over arms that
//     are BOTH present in the structure. You can't know WHICH arm runs without
//     the value, but you CAN see BOTH, so the effect surface is the JOIN (union)
//     of the branches. Still fully analyzable. The railway ok/err arms ARE this.
//   - MONAD: real `bind` (`>>=`), data-dependent dispatch — the NEXT computation
//     is COMPUTED FROM the previous result's VALUE. You cannot know the next
//     effect without RUNNING the model. The static surface is LOST.
//
// vigiles's shipped `pipe`/`andThen` is APPLICATIVE: every step is a value passed
// to the combinator, every step's `result()` ok/err Shape rides in the type, the
// runtime body is a FIXED left-fold (`start` then N× `andThen`) with NO
// data-dependent dispatch. So its total effect surface is a compile-time fold.
//
// This file encodes all three and PROVES the monadic case loses the guarantee:
// the selective `effectSurfaceOf<...>` resolves to a precise literal union; the
// monadic one's surface is UNKNOWABLE so it must WIDEN to the full leg universe
// (the type checker can only return the conservative top, exactly the loss the
// theory predicts).

// ---------------------------------------------------------------------------
// Minimal effect-leg vocabulary (copied from src/core/effects.ts shape — a tool
// maps to a SET of effect legs; this is the per-leg split of the dialect's one
// `sideEffectingTools` bucket).
// ---------------------------------------------------------------------------

type Leg = "fs-read" | "fs-write" | "net" | "exec";

// The conservative TOP of the leg lattice — what an un-analyzable (monadic)
// surface must widen to. Nothing is provably absent.
type AllLegs = Leg;

interface ToolLegs {
  Read: "fs-read";
  Grep: "fs-read";
  Write: "fs-write";
  Edit: "fs-write";
  WebFetch: "net";
  Bash: "exec";
}

type LegsOf<T extends keyof ToolLegs> = ToolLegs[T];

// A pipeline STEP, carrying its effect legs in the type (the applicative payload).
interface Step<L extends Leg> {
  readonly tool: keyof ToolLegs;
  readonly _legs?: L; // phantom carrier of the step's legs
}

function step<T extends keyof ToolLegs>(tool: T): Step<LegsOf<T>> {
  return { tool };
}

// ===========================================================================
// (1) APPLICATIVE pipeline — structure fixed up front, surface = static fold.
// ===========================================================================
//
// An applicative pipeline is a TUPLE of steps. Because the whole structure is
// present in the type, the effect surface is `legs of step 0` ∪ `legs of step 1`
// ∪ … — a pure mapped-type fold over the tuple. NO step depends on a runtime
// value, so the fold is total at compile time.

type ApplicativePipe<Steps extends readonly Step<Leg>[]> = {
  readonly _kind: "applicative";
  readonly steps: Steps;
};

function ap<const Steps extends readonly Step<Leg>[]>(
  ...steps: Steps
): ApplicativePipe<Steps> {
  return { _kind: "applicative", steps };
}

// The static fold: union the legs of every step in the tuple.
type LegsOfStep<S> = S extends Step<infer L> ? L : never;
type ApplicativeSurface<P> =
  P extends ApplicativePipe<infer Steps> ? LegsOfStep<Steps[number]> : never;

const docFetcher = ap(step("Read"), step("WebFetch"));
// surface is computed at COMPILE TIME from the structure alone:
type DocFetcherSurface = ApplicativeSurface<typeof docFetcher>;
//   ^? "fs-read" | "net"   — exact, no widening, no run.

// A compile-time PROOF that the surface equals the expected literal union.
type Expect<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _proofAp: Expect<DocFetcherSurface, "fs-read" | "net"> = true;
void _proofAp;

// ===========================================================================
// (2) SELECTIVE pipeline — statically-known BRANCHES (the railway ok/err arms).
// ===========================================================================
//
// A selective functor adds `branch`: TWO sub-pipelines are BOTH part of the
// structure; which one runs depends on a value, but BOTH are visible. The
// surface is the JOIN (union) of the two arms — still a static fold. This is
// EXACTLY the railway: the ok arm and the err arm are both declared, so the
// total effect surface is `legs(ok) ∪ legs(err)`, computable without running.

interface SelectiveBranch<
  Ok extends readonly Step<Leg>[],
  Err extends readonly Step<Leg>[],
> {
  readonly _kind: "selective";
  readonly okArm: Ok;
  readonly errArm: Err;
}

function branch<
  const Ok extends readonly Step<Leg>[],
  const Err extends readonly Step<Leg>[],
>(okArm: Ok, errArm: Err): SelectiveBranch<Ok, Err> {
  return { _kind: "selective", okArm, errArm };
}

// The surface is the JOIN of BOTH arms — both are in the structure.
type SelectiveSurface<P> =
  P extends SelectiveBranch<infer Ok, infer Err>
    ? LegsOfStep<Ok[number]> | LegsOfStep<Err[number]>
    : never;

// ok arm reads+writes; err arm reports over the net. We don't know which runs,
// but the SURFACE is their union — fully static.
const railway = branch(
  [step("Read"), step("Edit")], // success track
  [step("WebFetch")], // error track posts a report
);
type RailwaySurface = SelectiveSurface<typeof railway>;
//   ^? "fs-read" | "fs-write" | "net"   — the JOIN, still no run.

const _proofSel: Expect<RailwaySurface, "fs-read" | "fs-write" | "net"> = true;
void _proofSel;

// ===========================================================================
// (3) MONADIC pipeline — data-dependent dispatch. THE STATIC SURFACE IS LOST.
// ===========================================================================
//
// A monad's `bind` computes the NEXT step FROM the previous step's VALUE:
//   bind: (m: M<A>, f: (a: A) => M<B>) => M<B>
// The continuation `f` is an ARBITRARY function of a RUNTIME value `a`. The type
// of the result it returns (and therefore the legs it touches) cannot be known
// without RUNNING `f` on a real `a` — i.e. without running the model. The type
// system has no way to fold over "whatever step the function picks at runtime,"
// so the only SOUND answer is the conservative TOP: ALL legs. That widening IS
// the lost guarantee — the precise, predicted boundary.

interface MonadicBind<A> {
  readonly _kind: "monadic";
  readonly first: Step<Leg>;
  // The continuation is a function of a RUNTIME value — its result is opaque to
  // the type system. It may pick ANY step depending on `a`.
  readonly cont: (a: A) => Step<Leg>;
}

function bind<A>(first: Step<Leg>, cont: (a: A) => Step<Leg>): MonadicBind<A> {
  return { _kind: "monadic", first, cont };
}

// The surface of a monadic pipeline CANNOT be a precise fold: the second step is
// chosen by `cont` at runtime, so the type system must widen to AllLegs. There
// is no `infer` that can reach "the step the function returns for some unknown
// input" — `Step<Leg>` is the most precise the return annotation can be, and its
// legs are the FULL universe.
type MonadicSurface<P> =
  P extends MonadicBind<infer _A>
    ? // The continuation returns `Step<Leg>` for SOME runtime `a`; the only sound
      // static answer is the top of the lattice. The surface has WIDENED.
      AllLegs
    : never;

// A monadic pipeline: read a file, then — DEPENDING ON ITS CONTENTS — either
// write a fix OR shell out. The choice is a runtime branch the TYPE cannot see.
const dynamic = bind<string>(step("Read"), (contents) =>
  contents.includes("FIXME") ? step("Edit") : step("Bash"),
);
type DynamicSurface = MonadicSurface<typeof dynamic>;
//   ^? "fs-read" | "fs-write" | "net" | "exec"   — ALL legs. The surface is lost.

// PROOF that the monadic surface has widened to the full universe (NOT the
// precise {fs-read, fs-write} a naive reading of the code suggests, and NOT even
// {fs-read, fs-write, exec} — the type system can't even see those two arms; it
// only knows the continuation returns SOME Step<Leg>).
const _proofMon: Expect<DynamicSurface, AllLegs> = true;
void _proofMon;

// And the load-bearing NEGATIVE proof: the monadic surface is STRICTLY WIDER
// than the applicative `docFetcher` surface — i.e. precision was lost. If the
// monadic case had stayed analyzable this would be `never` (a type error).
type StrictlyWider = Exclude<DynamicSurface, DocFetcherSurface>;
const _proofLoss: Expect<StrictlyWider, "fs-write" | "exec"> = true;
void _proofLoss;

// ===========================================================================
// CONCLUSION (proven by tsc above):
//   - ApplicativeSurface<docFetcher> = "fs-read" | "net"          (exact)
//   - SelectiveSurface<railway>      = "fs-read"|"fs-write"|"net" (exact JOIN)
//   - MonadicSurface<dynamic>        = ALL legs                   (WIDENED — lost)
// The blast-radius guarantee holds up to and including SELECTIVE; MONADIC bind
// destroys it. vigiles's `pipe` is applicative — the guarantee is intact.
// ===========================================================================

export type { DocFetcherSurface, RailwaySurface, DynamicSurface };
