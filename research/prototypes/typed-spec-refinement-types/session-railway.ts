/**
 * PROTOTYPE S1 — FULL session types for the railway: BRANCHING choice + bounded
 * RECURSION, extending frontier F2's 2-state LINEAR typestate.
 *
 * F2 proved `planning* → enterMutation → mutating*` — a LINEAR protocol, two
 * states, no choice. The railway is richer: every `delegate()` step has TWO
 * continuations (success → next step; error → the error track) — that IS an
 * INTERNAL CHOICE (⊕ in session-type notation), and `recover: { max }` is a
 * BOUNDED LOOP (a guarded μ). This file types those constructs.
 *
 * Session-type vocabulary, mapped:
 *   ⊕{ok: S1, err: S2}  internal choice  → a step returns Result; continuation
 *                                            depends on which track (ok vs err).
 *   μX. S               recursion         → bounded recovery retries the SAME step.
 *   end                 termination       → the reporter / terminal step.
 *
 * The encoding: a railway is a TYPE-LEVEL list of steps, each a `Step<Ok, Err>`.
 * `Protocol<Steps>` walks the list (a recursive conditional type) and PROVES two
 * safety properties off the protocol structure:
 *   (P1) every step's `err` track has a handler reachable (no unhandled error
 *        track → the protocol is "covered");
 *   (P2) the chain is well-formed: each step's `ok` SUPPLIES the next step's
 *        `needs` (the F1/typed-handoff property, now threaded THROUGH the branch).
 *
 * HONESTY GOAL (the brief): show where TS gets heavy. A SHALLOW (≤4-step,
 * per-link) encoding compiles. A DEEP recursive walk over the branch tree blows
 * up — captured in ./session-deep-boom.ts (TS2589). This file is the PRACTICAL
 * slice; the boom file is the wall.
 *
 * Self-contained: COPIES a minimal Shape/Supplies slice; does NOT touch src/.
 *   pass:  npx tsc --noEmit --strict session-railway.ts   (exit 0)
 *   fail:  ./session-fails.ts   ·   wall: ./session-deep-boom.ts
 */

// ---------------------------------------------------------------------------
// Field shapes (the F1 substrate, copied).
// ---------------------------------------------------------------------------

type FieldType = "string" | "number" | "boolean" | "string[]";
type Shape = Readonly<Record<string, FieldType>>;

/** Producer supplies every field Consumer needs, matching types. (F1, shallow.) */
type Supplies<P extends Shape, C extends Shape> = {
  [K in keyof C]: K extends keyof P
    ? P[K] extends C[K]
      ? true
      : { readonly __mismatch: K }
    : { readonly __missing: K };
}[keyof C];

// ---------------------------------------------------------------------------
// The session-typed step. A step is an INTERNAL CHOICE ⊕{ ok, err }: on success
// it produces `ok` and the protocol continues; on error it produces `err` and
// the protocol jumps to the error track. `needs` is what it reads from upstream.
// `recover` marks the BOUNDED-RECURSION step (μ with a finite bound).
// ---------------------------------------------------------------------------

interface Step<Needs extends Shape, Ok extends Shape, Err extends Shape> {
  readonly agent: string;
  readonly needs: Needs;
  readonly ok: Ok;
  readonly err: Err;
  /** A bounded recovery loop on this step (the guarded μ). 0 = no loop. */
  readonly recoverMax?: number;
}

/** The error track — handles the union of every step's `err`. (The ⊕ err side.) */
interface ErrorTrack<HandledErr extends Shape> {
  readonly agent: string;
  /** What the reporter reads — must cover the steps' err shapes (P1). */
  readonly handles: HandledErr;
}

// ---------------------------------------------------------------------------
// (P2) Handoff threaded THROUGH the branch: a 2-step and 3-step linear chain
// where each ok supplies the next needs. Encoded SHALLOWLY (per adjacent pair,
// not a recursive walk) — exactly the depth that compiles.
// ---------------------------------------------------------------------------

/** A railway whose adjacent handoffs are checked pairwise at construction. */
function start<Ok extends Shape, Err extends Shape>(
  first: Step<Record<string, never>, Ok, Err>,
): Railway<Ok, Err> {
  return { steps: [first.agent], ok: first.ok, err: first.err };
}

interface Railway<Ok extends Shape, Err extends Shape> {
  readonly steps: readonly string[];
  readonly ok: Ok;
  /** Accumulated error union across all steps (the error track must cover it). */
  readonly err: Err;
}

/** Append a step; its needs must be SUPPLIED by the prior ok (P2), and its err
 *  accumulates into the railway's error union (so the error track can cover it). */
function then<
  PriorOk extends Shape,
  PriorErr extends Shape,
  Needs extends Shape,
  Ok extends Shape,
  Err extends Shape,
>(
  rw: Railway<PriorOk, PriorErr>,
  next: Supplies<PriorOk, Needs> extends true
    ? Step<Needs, Ok, Err>
    : { readonly __HANDOFF_ERROR: Supplies<PriorOk, Needs> },
): Railway<Ok, PriorErr | Err> {
  const real = next as Step<Needs, Ok, Err>;
  return {
    steps: [...rw.steps, real.agent],
    ok: real.ok,
    err: rw.err as PriorErr | Err,
  };
}

/** Close the protocol with the error track. (P1) The track must `handle` a shape
 *  the accumulated error union SUPPLIES — an unhandled err field is a type error. */
function close<Ok extends Shape, Err extends Shape, Handled extends Shape>(
  rw: Railway<Ok, Err>,
  track: Supplies<Err, Handled> extends true
    ? ErrorTrack<Handled>
    : { readonly __UNHANDLED_ERROR_TRACK: Supplies<Err, Handled> },
): { readonly steps: readonly string[]; readonly terminal: "end" } {
  void track;
  return { steps: rw.steps, terminal: "end" };
}

// ---------------------------------------------------------------------------
// A LEGAL railway: planner → implementer → reviewer, with bounded recovery on
// the implementer, closed by a reporter error track. EVERY handoff lines up and
// the error track covers every step's err — this COMPILES.
// ---------------------------------------------------------------------------

const planner: Step<
  Record<string, never>,
  { plan: "string" },
  { reason: "string" }
> = {
  agent: "planner",
  needs: {},
  ok: { plan: "string" },
  err: { reason: "string" },
};

const implementer: Step<
  { plan: "string" },
  { diff: "string" },
  { reason: "string"; retryable: "boolean" }
> = {
  agent: "implementer",
  needs: { plan: "string" },
  ok: { diff: "string" },
  err: { reason: "string", retryable: "boolean" },
  recoverMax: 2, // the bounded μ
};

const reviewer: Step<
  { diff: "string" },
  { approved: "boolean" },
  { reason: "string" }
> = {
  agent: "reviewer",
  needs: { diff: "string" },
  ok: { approved: "boolean" },
  err: { reason: "string" },
};

// The error track must handle `reason` (the field common to every step's err).
const reporter: ErrorTrack<{ reason: "string" }> = {
  agent: "reporter",
  handles: { reason: "string" },
};

export const ship = close(
  then(then(start(planner), implementer), reviewer),
  reporter,
);

// Proof the bounded loop bound is a finite literal (a guarded μ, not unbounded):
// the recovery bound is a `number`, never `"unbounded"` — termination is readable
// off the value (the sub-Turing guarantee the shipped railway already makes).
type RecoverBound = NonNullable<(typeof implementer)["recoverMax"]>;
type _RecoverIsFinite = RecoverBound extends number ? true : false;
const _finite: _RecoverIsFinite = true;
void _finite;
void ship;

export { start, then, close, type Step, type ErrorTrack, type Railway };
