---
status: active
topic: spec
---

# Typed-spec REFINEMENT / DEPENDENT / FULL-SESSION types — round 2

> Status: research + prototypes (2026-06-21). Round-2 deep-dive on ONE cluster of
> the PL-theory toolbox: **refinement types, dependent types, and full session/
> behavioral types.** The founder's brief: go DEEPER than round 1 — F6 (refinement)
> was only named, and F2 was a TWO-state linear typestate; this doc maps refinement
> precisely (type-encodable vs runtime-guard vs impossible) and EXTENDS F2 to full
> session types (branching choice `&`/`⊕`, recursion `μ`, bounded recovery loops).
>
> **Builds on, does not duplicate:**
>
> - `typed-spec-power.md` — round 1: #1 typed handoff composition (`A.ok ⊇ B.needs`),
>   #2 typed purity. This doc threads #1's `Supplies` THROUGH a branch and lands
>   refinement on the same `result()` it depends on.
> - `typed-spec-frontier.md` — round 1.5: F1 trifecta-as-a-type, **F2 the 2-state
>   typestate** (the thing this doc's session types extend), F6 refinement (named
>   only — mapped here), F9 the graded-budget TS2589 NO (the wall this doc re-hits).
> - `reference-verification-limits.md` — the parse-vs-validate / undecidability
>   boundary this doc's runtime-guard pick lives on (the brand minted only after the
>   predicate passes).
>
> Prototypes (every tsc/runtime claim grounded, `tsc` 5.9.3):
> `research/prototypes/typed-spec-refinement-types/` — `run.mjs` exits 0.

## The organizing finding

Round 1 found that the best transfers split across compile-time (A) and
runtime-after-compile (B). Round 2 sharpens that for THIS cluster into a precise,
evidence-backed taxonomy of **where each refinement/dependent/session property
LANDS**, and the surprising result is that the dividing line is not the PL feature
but **the arity of the thing being constrained**:

- A predicate over a **literal SHAPE** (an enum label, a path glob, a tool
  restriction, "≥1 element") → **TS-encodable** as a template-literal / union /
  tuple type. Caught at the keystroke, no vigiles run.
- A predicate over an **arbitrary VALUE** (a numeric bound, "every element is a
  test path", a cross-field length equality) → **NOT TS-encodable** for a non-literal
  (TS can only prove it for a frozen literal, uselessly), so it **drops to a
  spec-generated runtime guard** under "parse, don't validate" — the brand is minted
  only after the predicate passes.
- A predicate over the **protocol STRUCTURE** (ordering, branch handoff, error-arm
  coverage) → **TS-encodable SHALLOWLY** (per-link), and the full recursive walk
  **hits TS2589**. The practical railway (≤ a handful of steps) is fine; the deep
  walk is the honest ceiling.

That taxonomy is the deliverable; the "build one thing" pick falls out of it.

## The ranking

Filter on every row: **non-replicable** (could markdown + a linter do it? — ranked
down if yes), **build class** (`TS-types` / `runtime-guard` / `hybrid` /
`aspirational`), **value** (stops a real failure: a bad result fed downstream, an
out-of-range score trusted, a mis-ordered protocol).

| #      | Idea                                                                                                                    | PL-theory source                                                   | vigiles application                                                                                             | Non-replicable?                                          | Build class                        | Value                |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------- | -------------------- |
| **R1** | **Encodable refinements** — a `result()`/tool field refined by a SHAPE predicate (enum, glob path, `Bash(git:*)`, ≥1)   | Refinement types (LiquidHaskell, F\*) — the decidable-shape subset | template-literal / union / non-empty-tuple types on existing fields; out-of-refinement literal = `tsc` error    | **Yes** for the keystroke check                          | **TS-types** (PROTOTYPED)          | Med-High             |
| **R2** | **Refinement → runtime guard (parse-don't-validate)** — the predicate TS can't prove becomes a generated boundary check | Refinement types + "parse, don't validate" (Wlaschin)              | spec declares a predicate as DATA; compiles to a parse that mints a brand only on pass + a return-value gate    | **Yes** — a live value no type sees; ungameable boundary | **runtime-guard** (PROTOTYPED)     | **High**             |
| **R3** | **Full session types: branching + bounded recursion** — the railway's ok/err tracks + recovery loop typed off STRUCTURE | Session types (Honda) — `⊕` internal choice, `μ` bounded recursion | `Supplies` threaded through the branch (handoff per arm) + error-arm coverage; shallow per-link encoding        | **Yes** — order/branch/coverage is relational            | **TS-types** (PROTOTYPED, w/ wall) | **High**             |
| R4     | **Dependent `result()` shape** (Π/Σ: a field's TYPE depends on another field's VALUE)                                   | Dependent types (Agda/Idris/Lean)                                  | a `kind: "ok"` carries `files`, `kind: "err"` carries `reason` — recovered by a DISCRIMINATED UNION, not true Π | Partly (the union recovers the common case)              | **TS-types** (the union slice)     | Med                  |
| R5     | **Relational/arithmetic refinement** (`len(a) == len(b)`, `score ∈ 0..1` IN THE TYPE)                                   | Refinement/dependent (LiquidHaskell SMT)                           | peano-encodable for tiny counts; **TS2589 past ~2k** (F9 wall, re-confirmed) → R2 runtime guard                 | n/a — wrong altitude                                     | **aspirational** → runtime         | Low (kill type form) |

The three genuine wins are **R1, R2, R3**. R4 is an honest partial (a discriminated
union recovers the COMMON dependent case; true Π/Σ is genuinely lost). R5 is the
crisp NO — the same peano wall F9 hit, re-confirmed, with the work pushed to R2.

---

## R1 — Encodable refinements: what TS proves at the keystroke — PROTOTYPED

**The claim.** A refinement type is a base type + a predicate. F6 named this and
stopped. The precise finding: TS 5.9 proves the SHAPE-decidable subset of
refinements on a LITERAL, with no vigiles run — so an out-of-refinement value is a
red squiggle. Four refinement classes are encodable, proven against `tsc`:

| refinement class                     | encoding                 | example (compiles)        | rejected literal              |
| ------------------------------------ | ------------------------ | ------------------------- | ----------------------------- |
| **enum membership** (`v ∈ {a,b,c}`)  | literal union            | `verdict: "needs-review"` | `"approved"` → TS2345         |
| **string shape** (path matches glob) | template-literal type    | `"src/core/spec.test.ts"` | `"src/core/spec.ts"` → TS2345 |
| **tool restriction** (`Bash(git:*)`) | template-literal pattern | `"Bash(git:status)"`      | bare `"Bash"` → TS2345        |
| **non-empty** (`len ≥ 1`)            | `readonly [T, ...T[]]`   | `["Read", "Write"]`       | `[]` → TS2345                 |

**Why this is the same idea vigiles already half-ships.** `OutputFieldType` is
already an enum refinement (a field is `"string" | "number" | "boolean" |
"string[]"`, a 5th is unrepresentable). The `Tool(restriction)` form `Bash(git:*)`
is already a STRING the runtime gate parses — R1c lifts that restriction into the
TYPE so a `tools` field typed `BashGit` admits only the git-narrowed capability, not
the broader bare `Bash`. So R1 is not new machinery; it is **tightening fields that
already exist** from `string` to a refined template-literal.

**Real `tsc` 5.9.3 output** (`refinement-fails.ts`, NO vigiles run):

```
refinement-fails.ts(23,42): error TS2345: Argument of type '"approved"' is not assignable to parameter of type 'Verdict'.
refinement-fails.ts(28,32): error TS2345: Argument of type '"src/core/spec.ts"' is not assignable to parameter of type 'TestPath'.
refinement-fails.ts(32,27): error TS2345: Argument of type '"Bash"' is not assignable to parameter of type '`Bash(git:${string})`'.
refinement-fails.ts(35,27): error TS2345: Argument of type '"Bash(rm:-rf)"' is not assignable to parameter of type '`Bash(git:${string})`'.
refinement-fails.ts(40,32): error TS2345: Argument of type '[]' is not assignable to parameter of type 'NonEmptyTools'.
  Source has 0 element(s) but target requires 1.
```

The error messages are **native and clean** — they name the bad literal and the
refined type, no error-object wrapper needed (unlike the handoff/trifecta gates,
because a refinement is a plain assignability check, not a conditional-type fold).

**The honest TS limit.** The check only fires on a **literal** the compiler sees. A
`result().files` populated by the agent at RUNTIME is a `string[]`, and TS cannot
prove an arbitrary runtime `string[]` is all test paths — that's R2's job. So R1 is
the **author-time floor** (the spec author can't TYPE a non-test path into a
`TestPath` field), exactly parallel to typed-purity sitting above the runtime purity
gate. It catches the spec-author's mistake, not the agent's output — which is the
correct division of labour.

**Non-replicable verdict: YES for the keystroke**, modest in scope. A linter could
check a glob shape on a string field — but not at edit time with zero tool run, and
not by tightening the field's TYPE so the bad value is unrepresentable. Med-High:
real but bounded to the shape-decidable subset.

## R2 — Refinement → runtime guard (parse, don't validate): the BUILD-ONE pick — PROTOTYPED

**The claim, and why it's THE pick.** The refinements R1 can't reach — a numeric
bound, "every element is a test path", a cross-field equality, a live-command
restriction — are exactly the ones that matter for the AGENT'S OUTPUT, because the
agent populates `result()` at runtime with values no type ever sees. This is the
"parse, don't validate" boundary (`reference-verification-limits.md`): the spec
declares the predicate as DATA, vigiles compiles it into a guard, and a **brand is
minted only after the predicate passes** — so any consumer that asks for a refined
value provably holds one that satisfied the predicate. It is the runtime twin of
vigiles's SHIPPED `VerifiedPath`/`VerifiedCmd` brands (minted only after `existsSync`
/ package.json verification) — the exact pattern, applied to a `result()` field
instead of a path.

**Two halves, both run green** (`refinement-runtime-guard.mjs`):

1. **Author-time parse.** `parseRefined(field, value)` returns
   `{ ok:true, value: branded } | { ok:false, error }`. A bad score fails UP FRONT
   (a typed parse failure), not as an exception deep in a consumer; a consumer
   (`consumeRefined`) refuses an unbranded value — so an unparsed value cannot reach
   the code that trusts the refinement. That is parse-don't-validate made concrete.

2. **Runtime gate on a RETURNED result.** The SAME contract is emitted as a boundary
   check on a subagent's returned payload — the live value. `parseAgentResult` would
   call this before handing the result to the orchestrator, so a worker that returns
   `score: 2.0, changedTests: ["notatest.ts"], ranCommand: "rm -rf /"` is caught at
   the seam.

**Real runtime output** (NO model, deterministic):

```
[ok] score 0.82 parses and brands (consumer accepts the refined value)
[ok] score 1.7 rejected at parse: refinement failed: score must be in [0,1] (got 1.7)
[ok] consumer refuses an unbranded (unparsed) value — parse-don't-validate holds
[ok] dependent "every element is a test path" caught: refinement failed: every path must be a test file (...)
[ok] runtime gate ALLOWS a well-formed subagent result
[ok] runtime gate DENIES a malformed subagent result: score: ...[0,1]...; changedTests: ...test file...; ranCommand: ...git command...
```

**Why this is the strongest non-replicable + buildable pick in the cluster.**

- **Non-replicable + ungameable.** It enforces a property of the **live value** no
  static file or single-trace linter sees, at a boundary the agent cannot bypass
  in-loop — the same leverage point F3 (disjoint-write gate) showed, applied to the
  `result()` contract vigiles already owns. And unlike the refs-hook's "mark your
  references" (a JUDGMENT, gameable via `vigiles:ignore` — see
  `reference-verification-limits.md`), a refinement predicate is a FACT about the
  returned value: `0 ≤ score ≤ 1` is decidable and unfakeable. It sits on the
  gap-free side of the proxy/judgment line.
- **Buildable today, small surface.** It rides the SHIPPED `result()` contract + the
  SHIPPED brand pattern + the SHIPPED `parseAgentResult` seam. The lift is: a
  `refine(base, predicateName, label)` entry in the `OutputFieldType` vocabulary
  (a tiny dependency-free predicate registry — `inRange`, `everyMatches`,
  `restrictedTo`), `compile` emits the predicate into the `vigiles:ok` block's
  validation, and `parseAgentResult` runs it. One detector, reused by the parser and
  a `scan`-side static note (the predicate NAME is a static fact even when the value
  isn't) — `one-detector-no-drift`.
- **It closes a real gap the typed handoff (#1) leaves open.** Round 1's typed
  composition proves `A.ok` SUPPLIES `B.needs` by field NAME + TYPE. It cannot prove
  `A` actually RETURNED a value in range — that's a value property, R2's exact job.
  R2 is the runtime completion of the compile-time handoff: the type proves the
  wiring, the guard proves the payload.

**The honest limit.** The predicate is spec-author-written JS, so a buggy predicate
mis-validates — but that's true of any assertion, and the predicate registry keeps
the common ones (range, glob, membership) canonical and tested. It runs at the
result boundary, not on every intermediate value (you don't get LiquidHaskell's
flow-sensitive refinement everywhere) — but the result boundary is exactly where a
subagent's contract lives, so that's the right and sufficient place.

## R3 — Full session types: branching choice + bounded recursion — PROTOTYPED (with the wall)

**The claim (extending F2).** F2 typed a LINEAR two-state protocol
(`planning* → enterMutation → mutating*`). The railway is richer and the brief asked
to go there: every `delegate()` step has TWO continuations — success → next step,
error → the error track — which is an **internal choice `⊕{ok, err}`** in
session-type notation, and `recover: { max }` is a **bounded recursion `μ`** (a
guarded loop). R3 types those constructs and proves two safety properties off the
protocol STRUCTURE:

- **(P2) branch handoff** — each step's `ok` must SUPPLY the next step's `needs`
  (round 1's `Supplies`, now threaded THROUGH the success arm of the choice, so a
  mis-wired or out-of-order continuation is a type error);
- **(P1) error-arm coverage** — the error track must `handle` a shape the
  accumulated error union supplies, so an error track written against the WRONG shape
  (a field no step's `err` produces) is rejected.

**The legal railway compiles** (`session-railway.ts`, `tsc` exit 0):
`planner → implementer → reviewer`, with bounded recovery (`recoverMax: 2`, the
guarded μ) on the implementer, closed by a reporter error track. Every handoff lines
up and the track covers every step's err.

**Three protocol bugs rejected** (`session-fails.ts`, real `tsc` output):

```
session-fails.ts(41,42): error TS2345: Argument of type 'Step<{ diff: "string"; }, ...>' is not assignable
  to parameter of type '{ readonly __HANDOFF_ERROR: { readonly __missing: "diff"; }; }'.   // branch handoff broken
session-fails.ts(63,62): error TS2345: ... '{ readonly __UNHANDLED_ERROR_TRACK: { readonly __missing: "severity"; }; }'.  // error track covers wrong shape
session-fails.ts(68,47): ... '{ readonly __HANDOFF_ERROR: { readonly __missing: "diff"; }; }'.   // reviewer-before-implementer (out-of-order branch)
```

The diagnostics NAME the offending field (`__missing: "diff"`, `__missing:
"severity"`) — the same `__HANDOFF_ERROR` ergonomics as round 1's typed pipe, now
extended to the branch and the error arm. The bounded-recovery bound is proven to be
a finite `number` literal at the type level (a guarded μ, never `"unbounded"` — the
sub-Turing termination guarantee the shipped railway already makes, now visible in
the type).

**Where it stops being practical — the TS2589 wall, captured live**
(`session-deep-boom.ts`). R3 encodes handoffs SHALLOWLY (per adjacent pair). The
tempting "real" session type is a RECURSIVE WALK over the whole protocol — unfold the
chain in one type, re-proving every handoff and accumulating the error union. That
walk is peano recursion over the step list, and a DEEP protocol exceeds TS's
instantiation-depth guard:

```
session-deep-boom.ts(40,13): error TS2589: Type instantiation is excessively deep and possibly infinite.
```

A SHALLOW protocol (`DeepProtocol<8>` — a realistic railway of a handful of steps)
compiles fine; the deep walk (`DeepProtocol<5000>`) is the wall. **This is the
honest answer to "how heavy does TS get":** the branching/recursive session type is
EXPRESSIBLE and the practical slice (a real railway is ≤ ~5 steps) is comfortable,
but a full recursive protocol walk is not evaluable — which is precisely why R3 uses
the shallow per-link encoding (`start`/`then`/`close`), exactly as the shipped typed
`pipe` is a fixed-arity overload fold, not a recursive variadic type, for the same
reason. The session type IS the model checker for the protocol's safety fragment
(P1/P2) — F8's headline recovered in-language — but only at shallow depth.

**Non-replicable + value.** Order, branch handoff, and error-arm coverage are
RELATIONS between steps; a frontmatter step list has no relational structure and a
linter re-implements the automaton by hand and only after the fact. R3 makes the
WHOLE CLASS of branch-wiring bugs unrepresentable at the keystroke. High value: it
extends the shipped railway's string-name resolution to the DATA + ERROR edges of
the branch, catching the multi-agent orchestration bugs (wrong-track wiring,
uncovered error arm, swapped continuation) the field has no answer to.

## R4 — Dependent `result()` shape: what the discriminated union recovers, what's lost

**The tempting dependent-typed idea.** A true dependent (Π/Σ) result would let a
field's TYPE depend on another field's VALUE: `{ kind: "ok" }` carries `files:
string[]`, `{ kind: "err" }` carries `reason: string` — the presence of `files`
DEPENDS on `kind`'s value. TS has no Π/Σ.

**What's recovered (the honest, real slice).** A **discriminated union** recovers the
COMMON dependent case exactly: `result(ok, err)` already IS `{ ok } | { err }`, and
`parseAgentResult` discriminates on the `vigiles:ok`/`vigiles:err` tag — so "this
field exists only on the success track" is enforced today, by the union, not by Π.
TS narrows the type after the discriminant check, so a consumer reading `reason` on
the `ok` track is a type error. That covers ~all real `result()` dependency.

**What's genuinely lost.** A field whose type depends on a NUMERIC or open value —
`vec: Array<len>` where `len` is a sibling field, or "the `n`th element's type
depends on `n`" — is not encodable (it needs value-indexed types). But these don't
arise in a `result()` contract (fields are flat named scalars/arrays), so the loss is
academic for this surface. A spec-generated runtime guard (R2) recovers the
value-dependency ("`files.length === count`") as a cross-field predicate. Verdict:
the union is enough; don't reach for dependent types here.

## R5 — Relational / arithmetic refinement IN THE TYPE — the crisp NO (re-confirmed)

`score ∈ 0..1` or `len(a) == len(b)` AS A TYPE needs type-level arithmetic, which TS
simulates with tuple-length peano — and that's the F9 wall. Re-confirmed against
`tsc` 5.9.3: small counts work, a realistic bound triggers TS2589 (`Tuple<5000>` →
`error TS2589: Type instantiation is excessively deep and possibly infinite`, fast).
**Don't build the type form.** Arithmetic/relational refinement belongs in the R2
runtime guard (a numeric predicate is one line of JS) — and the eval tier already
meters cost/latency/tokens for the budget case. Types grade a small STEP COUNT (R3's
finite recovery bound is fine), never a numeric VALUE.

---

## If we build ONE thing: R2 (refinement → runtime guard, parse-don't-validate)

**Pick R2.** It is the strongest non-replicable + buildable + valuable item in the
cluster, and it is the one that closes a gap the SHIPPED design actually has:

- **Non-replicable AND ungameable** — it enforces a property of the agent's LIVE
  returned value (a number in range, every path a test file, a command restricted)
  at a boundary no static file or single-trace linter reaches and the loop cannot
  bypass. It sits on the gap-free FACT side of the proxy/judgment line
  (`reference-verification-limits.md`): `0 ≤ score ≤ 1` is decidable and unfakeable,
  unlike "mark your references" (a gameable judgment).
- **Buildable on shipped surface** — it reuses `result()`, the `VerifiedPath`/
  `VerifiedCmd` brand pattern, and the `parseAgentResult` seam. The lift is a small
  `refine(base, predicate, label)` registry folded into `OutputFieldType` + a
  predicate emitted into the `vigiles:ok` validation. One detector, parser + scan
  share it.
- **It completes round 1's headline.** Typed handoff (#1) proves the wiring lines up
  by name+type; R2 proves the PAYLOAD satisfies its contract. Type proves the wires,
  guard proves the value — together they make the railway's data edge fully checked,
  compile-time AND runtime.

**Second pick if there's room: R3 (full session types).** It is the purest
type-system win (the branch + error-arm + bounded-loop typed off structure, extending
F2), with clean field-naming diagnostics — but it's a larger combinator surface than
R2 and the practical slice is shallow-only. R1 (encodable refinements) is the
cheapest (tighten existing fields' types) and ships almost for free, but its value is
bounded to the spec-author floor. R2 is the one that changes what the harness can
GUARANTEE about a worker's output.

## The most surprising transferable idea

**The dividing line is ARITY, not the PL feature.** Whether a refinement is
TS-encodable or must drop to a runtime guard is decided NOT by "is it a refinement vs
a dependent type" but by **what it ranges over**: a predicate over a literal SHAPE
(enum/glob/restriction/non-empty) is a template-literal type at the keystroke; the
SAME logical predicate over an arbitrary VALUE (the agent's runtime output) is
fundamentally a parse-don't-validate runtime brand; and a predicate over the protocol
STRUCTURE is shallow-type-encodable with a hard recursive-walk ceiling. So "refinement
types for the spec" is not one feature — it's three landing zones, and knowing which
zone a given guarantee falls in (by its arity) is what tells you whether to write a
type or generate a guard. That taxonomy, not any single check, is the transferable
result.

## Rejected / cute-but-useless (the crisp NOs)

- **Arithmetic/relational refinement in the TYPE (R5).** TS2589 past ~2k, re-confirmed.
  A numeric bound is one line of R2 runtime predicate; the type form is an academic toy.
- **True dependent (Π/Σ) `result()` (R4's lost half).** TS has no value-indexed types;
  the discriminated union recovers every dependency a flat `result()` actually has, and
  the rest (value-indexed array lengths) doesn't arise on this surface. Don't import a
  dependent-type encoding for a problem the union already solves.
- **A full RECURSIVE session-protocol walk (R3's deep form).** Expressible, not
  evaluable past shallow depth (TS2589, captured live). A real railway is ≤ a handful
  of steps, so the shallow per-link encoding is not a compromise — it's the right tool;
  the recursive walk is the wall, documented, not shipped.
- **Refinement everywhere (LiquidHaskell flow-sensitivity).** vigiles refines at the
  `result()` BOUNDARY (where a subagent's contract lives), not every intermediate value.
  Chasing whole-program refinement inference is the wrong scope for an instruction-file
  verifier; the boundary is sufficient and is the surface vigiles owns.

## Prototype files (all under `research/prototypes/typed-spec-refinement-types/`)

- `refinement-encodable.ts` — R1: the four TS-encodable refinement classes (enum,
  glob path, `Bash(git:*)` restriction, non-empty tuple); pass cases compile, with
  type-level precision proofs.
- `refinement-fails.ts` — R1: five out-of-refinement literals, each rejected by `tsc`
  (clean native TS2345 naming the bad literal).
- `refinement-runtime-guard.mjs` — **R2 (the pick)**: parse-don't-validate (brand
  minted only on predicate pass; consumer refuses an unbranded value) + the
  return-value runtime gate on a malformed subagent result. Runs green.
- `session-railway.ts` — R3: branching choice (`⊕` ok/err) + bounded recursion (`μ`,
  finite `recoverMax`) + per-arm handoff (P2) + error-arm coverage (P1); the legal
  railway compiles.
- `session-fails.ts` — R3: three protocol bugs (broken branch handoff, uncovered
  error arm, out-of-order continuation), each rejected by `tsc` naming the field.
- `session-deep-boom.ts` — R3 the WALL: a shallow protocol compiles; the deep
  recursive walk emits `TS2589` (captured live, line 40).
- `run.mjs` — one-shot reproducer: asserts every pass file compiles, every fail/wall
  file is rejected (printing the diagnostic incl. the TS2589), and the runtime-guard
  demo runs green. `node research/prototypes/typed-spec-refinement-types/run.mjs`
  (exits 0).

All self-contained — they COPY minimal type-parameterized variants of the spec
builders and do NOT modify shipped `src/` (whose `result()`/`tools`/`delegate()` are
string-erased today, which is exactly why the type system can't see these refinements
yet — the gap R1/R2/R3 would close).

## See also

- `typed-spec-power.md` — round 1: #1 typed handoff composition (R2 completes its
  payload half; R3 threads its `Supplies` through the branch), #2 typed purity (R1 is
  the same author-time-floor-above-a-runtime-gate shape).
- `typed-spec-frontier.md` — round 1.5: F2 the 2-state typestate (R3 extends it to
  branching + recursion), F6 refinement (named — R1/R2/R5 map it precisely), F9 the
  graded-budget TS2589 NO (R5 re-confirms the same wall), F3 the disjoint-write
  runtime gate (R2 is the same parse-don't-validate leverage on `result()`).
- `reference-verification-limits.md` — the parse-vs-validate / proxy-vs-judgment
  boundary R2 lives on (the brand minted only after the predicate passes; a
  refinement is a FACT, gap-free, not a gameable judgment).
- `railway-subagents.md` / `spec-syntax-and-railway-scope.md` — the orchestration
  layer R3's branching session type extends; the sub-Turing bounded-recovery guarantee
  R3 now makes visible in the type.
- `side-effect-separation.md` / `effect-boundary-design.md` — the runtime purity gate
  R2's return-value guard mirrors (a spec-emitted PreToolUse-style boundary on a value
  no type sees).
