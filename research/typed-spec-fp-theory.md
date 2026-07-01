---
status: active
topic: spec
---

# Typed-spec — DEEP FP / MONAD THEORY (round 3): the analyzability boundary

> Status: research + prototypes (2026-06-21). Round-3 frontier dive into the
> cluster round-2a (`typed-spec-effects-monads.md`) dismissed too fast as
> "repackaging." The brief: find the DEEP, non-obvious FP results that actually
> BOUND or POWER the typed-spec moat — past effect rows + handlers.
>
> **The headline this round:** there is a precise theorem under the whole
> programme. A typed pipeline's effect/capability blast radius is computable at
> COMPILE TIME _exactly as long as the pipeline stays SELECTIVE-APPLICATIVE_. A
> real monadic `bind` (data-dependent dispatch) destroys the guarantee. And the
> JUST-SHIPPED `pipe`/`andThen` is applicative — so vigiles already sits on the
> right side of the line, and that's the property to protect, not a feature to
> bolt on. This is a **design-result** (a theorem + authoring guidance), partly
> buildable as a tsc-checkable surface derivation.
>
> **Builds on, does not duplicate** (go read, don't re-derive):
>
> - `typed-spec-effects-monads.md` (round 2a) — M1 effect ROW, M2 handler
>   discharge, M3 free-monad AST (verdict "repackaging"), M4 graded/writer. This
>   doc does NOT re-litigate M1–M6; it supplies the THEORY M3 lacked (why the
>   AST-fold is sound: it's abstract interpretation over a join-semilattice) and
>   the boundary result M-anything didn't reach (selective vs monadic).
> - `typed-spec-frontier.md` — F1 trifecta-as-type, F2 typestate, F4
>   noninterference-as-2-safety. T1 here is the GENERAL law F1/F2's folds are
>   instances of; T1 explains WHY F4 must be an A/B pair (a hyperproperty is
>   monadic-grade non-locality across runs).
> - `typed-spec-power.md` — #1 typed handoff (`pipe`), #2 typed purity. T1 proves
>   #1's `pipe` is applicative and therefore statically analyzable — the
>   theoretical license for the whole composition story.
> - `proofs.ts` — ALREADY ships a monotonicity lattice + `latticeJoin/Meet` + NCD
>   - `propertyTest`. T3 proves effect accumulation is the join-semilattice
>     SIBLING of that strength lattice (same algebra, product vs chain) — REUSE it,
>     don't reinvent.
> - `fp-for-agent-harness.md` / `fp-for-deterministic-ai.md` — the existing FP
>   sketches; T4 lands idea #6 (lenses) honestly; T1 lands #8 (Kleisli) with the
>   crucial caveat the sketch missed (Kleisli = monad = the analyzability cliff).
>
> Prototypes (every tsc/runtime claim grounded): `research/prototypes/typed-spec-fp-theory/`.
> `node …/run.mjs` exits 0.

## The one-paragraph answer

The deep result round-2a missed is a **boundary theorem**, not another effect
gadget: **an Applicative pipeline's entire effect+capability surface is a
compile-time fold; a Selective one (statically-known branches — the railway
ok/err arms) is still a fold over the JOIN of its arms; a Monadic one (`bind`,
where the next step is COMPUTED FROM a prior runtime value) is NOT statically
analyzable — the surface must widen to the conservative top.** So the moat's
edge is sharp and nameable: _typed pipelining gives the compile-time blast-radius
guarantee precisely while the pipeline stays selective-applicative_. The
just-shipped `pipe`/`andThen` IS applicative (fixed left-fold of `start`/`andThen`,
every step's `result()` Shape carried statically, zero data-dependent dispatch) —
**proven against `tsc` 5.9.3** (the monadic encoding LOSES the surface; the
applicative + selective ones keep it exact). That reframes the whole typed-spec
story from "we added types" to "we kept the pipeline on the analyzable side of a
known PL cliff — and the discipline is: don't add a monadic `bind` combinator."
The second deep result: M3's free-monad AST is **abstract interpretation** (Cousot 1977) over a **join-semilattice**, which makes round-2a's "elegant but
repackaging" verdict an UNDERSELL of the right artifact (one AST, many sound
abstract interpreters = the moat engine for blast-radius #1, capability-diff #2,
cost #3) — and that semilattice is structurally the SAME object as `proofs.ts`'s
monotonicity lattice. Optics (T4) are a narrow real win for a spec EDITOR, a
repackaging of the fold for the diff. Comonads / recursion schemes / profunctors /
indexed monads are the crisp NOs.

## The ranking

Filter on every row: **non-replicable** (could markdown + a linter do it? → ranked
down), **build class** (`TS-types` / `runtime` / `hybrid` / `aspirational` /
`design-result` — a theorem/guidance, not code), **value** (does it BOUND or POWER
the moat / prevent a real failure / give principled authoring guidance — vs
elegant repackaging?).

| #      | Idea (FP source)                                                                                                                         | vigiles application                                                                                                                                       | Non-replicable?                                                                                              | Build class                                         | Value            |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ---------------- |
| **T1** | **Applicative/Selective/Monad = the BOUNDARY of static analyzability** (McBride-Paterson 2008 applicative; Mokhov et al. 2019 selective) | the blast-radius guarantee holds iff `pipe` stays selective-applicative; a monadic `bind` combinator would forfeit it. `pipe` IS applicative — confirmed  | **Yes** — markdown has no notion of "analyzable structure"; the theorem is about the TYPE's shape            | **design-result** + partial `TS-types` (PROTOTYPED) | **Very high**    |
| **T2** | **Spec as AST → many ABSTRACT INTERPRETERS** (free monad / tagless-final, grounded as abstract interpretation, Cousot-Cousot 1977)       | one pipeline AST; ≥2 interpreters fold it abstractly (over effects/caps/cost, never values) to derive #1/#2/#3 WITHOUT running the model                  | **Partly** — vigiles shares one detector already; the AST adds open extension + a SOUNDNESS framing          | **runtime** (PROTOTYPED) — the moat ENGINE          | **High**         |
| **T3** | **Effect accumulation is a join-SEMILATTICE / monoid** (idempotent commutative monoid; Cousot lattice)                                   | the cross-step `∪`-fold's laws (assoc/identity/idempotent/MONOTONE) are why sub-pipelines compose + why the fold is sound; ≡ `proofs.ts` strength lattice | **Yes** — the algebra is what licenses composition; replicating it by hand is re-deriving the proof          | **runtime** (PROTOTYPED) — reuses `proofs.ts`       | **High** (rider) |
| **T4** | **Optics / lenses for the capability-diff** (van Laarhoven / profunctor optics)                                                          | a composed `lens∘getter` views the surface; a diff is `view(v2) ∖ view(v1)`. The lawful `set` is a separate spec-EDITOR win                               | **Partly** — the getter-diff is T2's fold in optics clothing; the lawful `set` (spec editor) is the real bit | **runtime** (PROTOTYPED) — honest split             | Med / Low        |
| T5     | **Comonads / context-as-comonad** (Uustalu-Vene)                                                                                         | "a hook reads its surrounding context" framed as `extract`/`extend`                                                                                       | No — it's the Reader/plumbing convenience round-2a's M6 already killed, dualized; no guarantee, no shrink    | n/a                                                 | Low (kill)       |
| T6     | **Recursion schemes (cata/ana/hylo)** (Meijer-Fokkinga-Paterson)                                                                         | fold/unfold the pipeline AST with a generic `cata`                                                                                                        | No — T2's `interpret` IS a catamorphism; naming it a "scheme" buys nothing over the plain fold               | n/a (subsumed by T2)                                | Low (fold in)    |
| T7     | **Parser combinators for `parseAgentResult`** (Hutton-Meijer)                                                                            | build the `vigiles:ok/err` parser from combinators                                                                                                        | No — the block grammar is a fixed 2-case split; combinators are over-engineering for a `JSON.parse` + shape  | n/a                                                 | Low (kill)       |
| T8     | **Indexed / parameterised monads** (Atkey)                                                                                               | a monad whose pre/post INDEX changes (the typestate of F2)                                                                                                | Partly — but F2 already realizes the one useful instance (phase typestate) WITHOUT the monad machinery       | aspirational                                        | Low (F2 has it)  |
| T9     | **Profunctors** (the optics basis)                                                                                                       | the general optic encoding behind T4                                                                                                                      | No — strictly heavier than T4's `{get,set}`; no extra power at this scale                                    | n/a                                                 | Low (kill)       |

The genuine deep wins are **T1** (the boundary theorem — the headline) and **T2**
(the abstract-interpretation engine that COMPUTES the moats), with **T3** (the
semilattice that makes T2 sound and connects to `proofs.ts`) as the load-bearing
rider. T4 is a narrow keeper split honestly. T5–T9 are the crisp NOs.

---

## T1 — The Applicative / Selective / Monad analyzability boundary (the headline) — PROTOTYPED

**The claim, precisely.** Three points on the structure ladder, each with a sharp
consequence for what the compiler can know about a pipeline's effects WITHOUT
running the model:

- **Applicative** (McBride & Paterson, _Applicative Programming with Effects_,
  2008). `<*>` combines effectful steps whose STRUCTURE is fixed up front — no
  step's identity depends on a prior step's runtime VALUE. You can enumerate every
  effect before running any. → **the total effect surface is a static fold over
  the structure.**
- **Selective** (Mokhov, Lukyanov, Marlow, Dimino, _Selective Applicative
  Functors_, ICFP 2019). Adds `branch`/`ifS`: STATICALLY-KNOWN branches where
  BOTH arms are part of the structure. You can't know WHICH arm runs without a
  value, but you can SEE BOTH — so the surface is the **JOIN (union) of the
  branches**. Still fully analyzable. **The railway `ok`/`err` arms ARE a
  selective branch** — both tracks are declared, so the blast radius is
  `legs(ok) ∪ legs(err)`, computable with no run.
- **Monad**. Real `bind` (`>>=`): the NEXT computation is COMPUTED FROM the prior
  result's VALUE (`bind(m, a => …a…)`). The continuation is an arbitrary function
  of a runtime value; its effects are unknowable without RUNNING it on a real `a`
  — i.e. without running the model. → **the static surface is LOST; the only sound
  answer is the conservative top (all legs).**

So the moat's edge is nameable to the millimetre: **typed pipelining yields the
compile-time blast-radius guarantee exactly while the pipeline stays
selective-applicative. A monadic `bind` forfeits it.**

**The shipped `pipe` IS applicative — confirmed (not assumed).** Reading
`src/core/spec.ts`: `pipe(a, b, c)` / `andThen(prior, next)` take each step as a
VALUE, every step's `result()` `Ok`/`Err` `Shape` rides in the type
(`TypedAgentSpec<Ok,Err>`, `PipeStep<Needs,Ok,Err>`), the handoff check
`Supplies<PriorOk, Needs>` is a per-field mapped type over STATIC shapes, and the
runtime body is a **fixed left-fold** — `let pipeline = start(first); for (const s
of rest) pipeline = andThen(pipeline, s)`. There is NO point where the next step is
chosen from a prior step's runtime output. That is the textbook applicative shape.
The `err` track is the union of every step's `Err` (`Pipeline<Ok, PriorErr | Err>`)
— the selective JOIN, realized. **vigiles already sits on the analyzable side of
the cliff.** The contribution of T1 is to NAME that, prove it, and turn it into a
discipline.

**The proof (real, captured `tsc` 5.9.3).** `selective-applicative.ts` encodes all
three and derives each surface as a type:

```
ApplicativeSurface<docFetcher>  =  "fs-read" | "net"                     // exact
SelectiveSurface<railway>       =  "fs-read" | "fs-write" | "net"        // exact JOIN of arms
MonadicSurface<dynamic>         =  "fs-read" | "fs-write" | "net" | "exec"  // ALL legs — WIDENED
```

The file carries compile-time `Expect<A,B>` proofs that each equality holds, and
the load-bearing NEGATIVE proof that the monadic surface is STRICTLY WIDER than the
applicative one (`Exclude<DynamicSurface, DocFetcherSurface> = "fs-write" | "exec"`
— precision was lost). All compile (exit 0). The dual `monadic-loss-fails.ts`
proves you cannot RECOVER the precise surface by claiming it: an author asserting
their dynamic pipeline only touches `{fs-read, fs-write}` is REJECTED —

```
_strip-probe.tmp.ts(61,1): error TS2554: Expected 2 arguments, but got 1.
```

— the under-stated claim makes the proof-tuple parameter `[error: never]`,
demanding an argument that can't be supplied. (In the committed file a single
`@ts-expect-error` consumes exactly that rejection; `run.mjs` strips it to show the
error is real, not vacuous.) **The compiler refuses to let the blast radius
under-state itself the moment the pipeline goes monadic — the loss is loud.**

**Why the monadic widening is the RIGHT answer, not a TS limitation.** It is the
sound abstract-interpretation result. A `bind`'s continuation `a => Step<Leg>`
returns SOME step for SOME runtime input; no `infer` can reach "the step that
function picks for an unknown `a`," because that is undecidable in general (it
depends on the model's output). The only sound over-approximation is the top of the
lattice. A markdown linter that tried to "analyze" a data-dependent pipeline would
face the identical wall — except it would do it post-hoc, off-editor, and would be
TEMPTED to guess a narrower surface (unsound). The type system is honest by
construction.

**Non-replicable verdict: YES — and it's a different KIND of non-replicable.** T1
isn't a check markdown can't run; it's a STRUCTURAL PROPERTY of the authoring
format. Markdown has no notion of "the pipeline's combinator algebra," so it cannot
distinguish an analyzable selective pipeline from an unanalyzable monadic one — the
distinction only EXISTS in a typed, composed surface. The result also explains a
fact vigiles already lives: the `pipe` overloads are a FIXED arity set (not a
recursive variadic), the railway is "deliberately sub-Turing — a finite list of
steps + bounded recovery, no loop combinator" (`spec.ts` comment). That sub-Turing
choice is EXACTLY staying applicative/selective. T1 gives the theory behind the
design instinct.

**The build class is `design-result` — and that's the honest label.** The
highest-value output is a THEOREM + a DISCIPLINE, not a new feature:

1. **The discipline (free, ship as docs/a rule):** never add a monadic combinator
   to the composition surface. No `pipeDynamic(a, prevResult => pickStep(prevResult))`.
   The moment a step is chosen from a runtime value, the blast-radius guarantee is
   gone — and the doc/rule should say so in those words. This is the FP analogue of
   the `analogical-transfer` filter: keep the spec on the side of the cliff where
   the deterministic guarantee survives.
2. **The buildable slice (`TS-types`, optional):** the `ApplicativeSurface` /
   `SelectiveSurface` type-level fold could become a real `surfaceOf(pipeline)`
   derivation on the shipped `Pipeline<Ok,Err>` — a compile-time effect-row for the
   WHOLE pipeline, not just per-agent (the M1 row lifted to the composition level
   via the selective JOIN). That's the concrete TS encoding, and it's small once
   the per-tool `ToolLegs` catalog from M1 exists.

## T2 — Spec AST → many ABSTRACT INTERPRETERS: the moat ENGINE (M3 done right) — PROTOTYPED

**The reframe that rescues M3 from "repackaging."** Round-2a built the free-monad
AST, saw it gave open backend-extension + a no-drift proof, and shrugged ("~80%
already held by sharing one detector"). That undersells the artifact because it
missed WHAT the folds ARE: **abstract interpretation** (Cousot & Cousot, POPL
1977). An interpreter that folds the AST over a lattice of EFFECTS (not values) is
literally an abstract semantics — it computes a SOUND OVER-APPROXIMATION of what
the concrete run (the model executing tools) could do, without running it. That is
not a refactor; it's the **mechanism by which moats #1 (blast radius), #2
(capability diff), and #3 (cost) are computed at all.** "Derive the blast radius
without running the model" is precisely "run the abstract interpreter instead of
the concrete one."

**The prototype (`abstract-interpreters.mjs`, runs green).** ONE applicative/
selective AST (`tool` / `seq` / `branch` — deliberately NO `bind`, the T1
boundary), folded by THREE interpreters via a single generic `interpret(ast, alg)`:

```
one AST, three abstract interpreters (no model run):
  effect surface : fs-read, fs-write, net          ← the JOIN over the selective branch (moat #1)
  capabilities   : mutate, network, observe        ← feeds the capability diff   (moat #2)
  cost ≤         : 4                                ← worst-arm upper bound       (moat #3)
  v1→v2 capability DIFF (added): exec               ← a new shell-out caught structurally
  unknown tool ⇒ surface widens to TOP (sound)     ← over-approximation, never under-reports
```

The three interpreters are the SAME fold over three monoids (effect-leg set,
capability set, cost — with `branch` taking `max` for the cost upper bound). Adding
a fourth (Cedar policy, OTel spans) is zero edits to the others — the Expression
Problem's "add an interpretation" axis, free. The capability DIFF (#2) falls out as
`view(v2) ∖ view(v1)` over the derived sets, and the soundness witness shows an
unknown/MCP tool widens every surface to the top (never silently narrow).

**Why this is the right framing AND still bounded.** It's `Partly` non-replicable:
the no-drift win is ~80% held by sharing one detector (round-2a was right about
that). What the abstract-interpretation framing ADDS is (a) the SOUNDNESS argument
— the derived surface is a guaranteed upper bound, so "we didn't run the model but
this IS the blast radius" is a theorem, not a hope; and (b) the open-extension axis
for the #2/#3/Cedar/OTel artifacts that genuinely share the AST. Verdict unchanged
from round-2a in SCOPE (adopt the AST+fold LOCALLY for the effect/capability
contract, NOT a ground-up compiler rewrite) but UPGRADED in framing: it's the moat
engine, and its soundness is the abstract-interpretation theorem, not a convention.

## T3 — Effect accumulation is a join-SEMILATTICE: why T2 is sound + the proofs.ts link — PROTOTYPED

**The claim.** The cross-step `combine` in T2 (`∪`, with `∅` as identity) is not an
arbitrary reducer: `(P(Leg), ∪, ∅)` is a **commutative idempotent monoid** = a
**bounded join-semilattice**. Those laws are exactly what make the abstract
interpreter sound and composable:

- **Associativity** → sub-pipelines compose: re-bracketing the spec
  (`seq(a, seq(b,c))` vs `seq(seq(a,b), c)`) gives the identical surface. This is
  the algebraic license for "analyze a sub-pipeline, then plug it in."
- **Identity (∅)** → a no-op step contributes nothing.
- **Commutativity** → step ORDER doesn't change the SURFACE. (Order is a SEPARATE
  axis — F2's typestate / T8's indexed monad. The surface monoid is
  order-insensitive _by design_, which is why effects and ordering are orthogonal
  guarantees.)
- **Idempotence** → re-declaring a tool doesn't inflate the surface (`a∪a = a`).
- **Monotonicity** → adding a step can only GROW the surface (`s ⊆ s∪t`).

**The prototype (`monoid-laws.mjs`, runs green).** A seeded property test (256
iterations, the SAME xorshift32 PRNG `proofs.ts` uses) checks all four laws +
monotonicity over random leg-sets, reporting the first failing witness (the
`propertyTest` shape). All hold.

**The load-bearing connection to `proofs.ts` (structural, not metaphor).**
`proofs.ts` already ships a monotonicity lattice with `latticeJoin`/`latticeMeet`
over rule STRENGTH (`guidance < guard = enforce`) — a TOTAL ORDER, i.e. a CHAIN.
The effect semilattice is the **PRODUCT** of one chain per leg — the SAME algebraic
object (a join-semilattice), one dimension generalized to N. The prototype
replicates `proofs.ts`'s `latticeJoin` shape and proves the join law holds on the
strength chain too, witnessing that effect accumulation and `proofs.ts`'s
"rules only strengthen over time" are the same monotone-lattice discipline at two
carriers. **So when T1/T2's surface fold ships, it should REUSE `proofs.ts`'s
lattice vocabulary, not introduce a parallel one** — the monotonicity invariant
(`scan`'s surface can only grow as you add tools/steps; a spec edit that SHRINKS a
declared capability is the auditable event) is the join-semilattice mirror of the
strength-monotonicity `proofs.ts` already gates. That's the concrete reuse the
brief asked for.

## T4 — Optics / lenses for the capability diff: a narrow keeper, split honestly — PROTOTYPED

**The honest evaluation (`capability-lens.mjs`, runs green).** A lens is a
composable `{get, set}` focus. Two halves, two verdicts:

- **The GET half (the diff).** A composed `toolsLens ∘ capabilityGetter` views the
  derived capability set; the diff is `view(v2) ∖ view(v1)` (`added: ["exec"]` when
  v2 gains `Bash`). But the derivation is a GETTER (a one-way `Fold`, NOT a lawful
  lens — capabilities are a FUNCTION of tools, so there's no lawful `set` inverse).
  A getter is just T2's fold. **So the capability diff via optics is T2's
  interpreter in optics clothing — no new power.** Don't sell lenses as the diff
  engine; the abstract interpreter already is it.
- **The SET half (the real, SEPARATE win).** A LAWFUL lens onto the STORED `tools`
  field DOES round-trip (`set(get(s),s) = s`), so `over(toolsLens, dropExec)` is a
  principled, composable, reversible spec EDIT ("remove every tool granting exec").
  That is `fp-for-agent-harness.md` idea #6 (lenses for settings.json) — a spec
  EDITOR win, NOT the capability diff. It earns its place there, not here.

Verdict: **Med for a future spec-editor; Low/repackaging for the diff.** Optics are
real but narrow; keep the two uses separate in any pitch.

## T5–T9 — the crisp NOs (the honest sweep)

- **T5 — Comonads / context-as-comonad** (Uustalu-Vene). "A hook reads its
  surrounding context" dualized to `extract`/`extend`. This is the Reader-monad
  plumbing convenience round-2a's M6 already KILLED, turned inside-out. No
  user-facing guarantee, no state-space shrink — an internal threading detail dressed
  in category theory. **NO** (same reason as M6).
- **T6 — Recursion schemes (cata/ana/hylo)** (Meijer-Fokkinga-Paterson). T2's
  `interpret(ast, alg)` IS a catamorphism — a fold over the AST. Naming it a
  "recursion scheme" and pulling in a `Fix`/functor-instance encoding buys NOTHING
  over the plain three-case fold at this AST size, and the `Fix` boilerplate fights
  TS inference. **Subsumed by T2** — the fold is the scheme; don't import the
  machinery.
- **T7 — Parser combinators for `parseAgentResult`** (Hutton-Meijer). The
  `vigiles:ok`/`err` block grammar is a FIXED two-case split (find the last block,
  `JSON.parse`, validate the shape) — `agent-result.ts` already does it in a few
  lines. Combinators are for ambiguous/recursive grammars; this is a `JSON.parse` +
  a shape check. Over-engineering. **NO** (`analogical-transfer` filter: a cute
  analogy, no deterministic gain).
- **T8 — Indexed / parameterised monads** (Atkey). A monad whose pre/post INDEX
  changes is the general form of F2's phase typestate (`planning → mutating`). But
  F2 already realizes the ONE useful instance (plan-before-mutate) with plain typed
  combinators and CLEANER error messages, WITHOUT the indexed-monad surface (which
  inflates inference). The transfer's value (phase-in-the-type) is BANKED by F2;
  the monad machinery is the part to leave on the shelf. **F2 has it already.**
- **T9 — Profunctors** (the optics basis). The general `Strong`/`Choice` profunctor
  encoding behind T4's lens. Strictly heavier than `{get, set}` with no extra power
  at vigiles's scale, and notoriously inference-hostile in TS. **NO** — T4's plain
  pair is the right altitude.

---

## If we build/adopt ONE thing: T1's DISCIPLINE (keep `pipe` selective-applicative), backed by T2's surface fold

**Pick T1 — but understand what "build" means here: it's a DESIGN-RESULT first, a
small TS feature second.**

- **The free, highest-leverage half (adopt now):** name and protect the boundary.
  Document — and ideally encode as a contributor rule — that the composition
  surface MUST stay selective-applicative: **never add a monadic combinator** (a
  step chosen from a prior step's runtime value). The shipped `pipe`/`andThen` is
  already on the right side; the risk is a future "dynamic pipeline" feature that
  quietly forfeits the compile-time blast-radius guarantee for the convenience of
  data-dependent dispatch. T1 makes that tradeoff VISIBLE and gives reviewers the
  vocabulary to reject it. This is the single most valuable output of the round and
  it costs a doc + a sentence in `CLAUDE.md`'s analogical-transfer lineage.
- **The buildable half (when the M1 `ToolLegs` catalog lands):** a `surfaceOf(pipeline)`
  type-level fold that derives the WHOLE pipeline's effect row via the selective
  JOIN (T1's `SelectiveSurface`), computed by T2's abstract interpreter and made
  sound by T3's semilattice — reusing `proofs.ts`'s lattice. That's the moat engine
  shipped: blast radius #1 at the pipeline level, capability diff #2, cost #3, all
  from one AST, all sound because the structure is applicative.

T2 is the ENGINE and T3 the SOUNDNESS proof, so they ship WITH T1's feature half —
but T1's discipline is the thing to internalize TODAY, because it's the property
the whole typed-composition moat rests on and the one a careless feature could
silently destroy.

## Is the strongest pick a theorem or buildable? Both — and that split is the finding.

T1 is a **theorem + guidance** (the boundary, the discipline) with a **buildable
TS-types rider** (the surface fold). The most important deliverable is the
THEOREM-as-discipline: it bounds the moat from the inside (here is exactly how far
typed composition's guarantee reaches) and protects it from the inside (here is the
one move that would forfeit it). That's rarer and more durable than a feature — it's
the kind of result that tells you what NOT to build, which the brief explicitly
values ("a confident NO is as valuable as a yes").

## The most surprising transferable idea

**The railway ok/err arms are a SELECTIVE applicative functor — and that's why the
blast radius stays computable.** The surprise is that the EXACT structure vigiles
already shipped (a finite step list + a two-track ok/err railway, "deliberately
sub-Turing, no loop combinator") is, in precise PL terms, the selective-applicative
fragment — the largest fragment for which the effect surface is still a static fold.
Mokhov et al. introduced selective functors in 2019 specifically to recover
"static analysis of effects with a degree of dynamic behaviour (branching)" that
applicatives lack and monads forfeit. vigiles independently re-derived the same
sweet spot by an engineering instinct ("keep it sub-Turing so termination is
readable"). Naming it selective-applicative converts that instinct into a theorem
and a guardrail: the railway can grow branches (selective) but must never grow a
data-dependent `bind` (monadic), or the whole compile-time guarantee evaporates.

## The crispest NO

**Parser combinators for `parseAgentResult` (T7).** It's the textbook FP reach —
"you're parsing, use combinators!" — but the `vigiles:ok`/`err` grammar is a fixed
two-case, last-block-wins, `JSON.parse`-plus-shape-check that `agent-result.ts`
already nails in a handful of lines. Combinators exist to tame ambiguity and
recursion; importing them here adds a dependency and a DSL to parse a JSON blob.
Pure cargo-culting — the `analogical-transfer` filter rejects it outright (no
deterministic gain, no failure prevented, just elegance for its own sake).

## Rejected / repackaging-only

- **Recursion schemes (T6).** T2's fold IS a catamorphism; the `Fix`/functor
  machinery is ceremony over a three-case `switch`. Subsumed, not separate.
- **Profunctor optics (T9) + the comonad framing (T5).** Heavier encodings of T4's
  `{get,set}` and round-2a's already-killed Reader plumbing (M6), respectively. No
  added power; inference-hostile in TS.
- **Indexed monads (T8) as a NEW build.** The one valuable instance (phase
  typestate) is already realized by F2 with cleaner ergonomics; the monad surface is
  the part to leave on the shelf.
- **Optics as the capability-DIFF engine (T4 get-half).** A getter is T2's fold in
  costume — real composition syntax, zero new power for the diff. Keep optics for
  the lawful spec EDITOR (set-half), not the diff.
- **Monadic `bind` in the composition surface (the T1 anti-pattern).** The one thing
  this whole doc says DON'T BUILD: a data-dependent pipeline combinator. It would be
  the most "powerful"-looking feature and would silently forfeit the compile-time
  blast-radius guarantee the moat is built on. The crispest NO of all, because it's
  a NO to a tempting FUTURE feature, not a dismissal of a toy.

## Prototype files (all under `research/prototypes/typed-spec-fp-theory/`)

- `selective-applicative.ts` — T1: the three encodings + compile-time `Expect<>`
  proofs that the applicative surface is exact, the selective surface is the exact
  JOIN, and the monadic surface WIDENS to all legs (precision provably lost). Compiles.
- `monadic-loss-fails.ts` — T1 (dual): an under-stated monadic surface claim is
  REJECTED by `tsc` (a single `@ts-expect-error` consumes it; `run.mjs` strips it to
  show the TS2554 is real).
- `strip-probe.mjs` — helper proving the monadic rejection is non-vacuous.
- `abstract-interpreters.mjs` — T2: one applicative/selective AST, three abstract
  interpreters (effect / capability / cost) + the v1→v2 capability diff + the
  unknown-tool soundness widening. Runs green.
- `monoid-laws.mjs` — T3: seeded property test of the join-semilattice laws
  (assoc/identity/idempotent/commutative/MONOTONE) reusing `proofs.ts`'s PRNG shape,
  plus the structural `≡ proofs.ts strength lattice` witness. Runs green.
- `capability-lens.mjs` — T4: the composed-optic capability diff + the lawful
  `over(toolsLens, dropExec)` edit, with the honest getter-vs-lens verdict. Runs green.
- `run.mjs` — one-shot reproducer: asserts T1 compiles, the monadic under-claim is
  rejected (and the rejection is real), and T2/T3/T4 run green.
  `node research/prototypes/typed-spec-fp-theory/run.mjs` exits 0.

All self-contained — they COPY minimal typed/data variants of the spec builders and
do NOT modify the shipped `src/` (whose `pipe` is already applicative — exactly the
property T1 names and protects).

## See also

- `typed-spec-effects-monads.md` — round 2a (M1 effect ROW, M2 handler, M3
  free-monad AST, M4 graded/writer). T2 supplies the abstract-interpretation
  SOUNDNESS framing M3 lacked; this doc does not re-litigate M1–M6.
- `typed-spec-frontier.md` — F1 trifecta-as-type + F2 typestate (instances of T1's
  fold over a leg/phase catalog); F4 noninterference-as-2-safety (a hyperproperty =
  the cross-RUN analogue of monadic non-locality — why it can't be a single-trace
  check, T1's lesson one level up).
- `typed-spec-power.md` — #1 typed handoff (`pipe`, proven applicative here) + #2
  typed purity (the per-agent row T1's selective JOIN lifts to the pipeline).
- `proofs.ts` — the monotonicity lattice + `latticeJoin`/`Meet` + `propertyTest` +
  NCD that T3 proves effect accumulation is the join-semilattice sibling of (REUSE,
  don't reinvent).
- `fp-for-agent-harness.md` — idea #6 lenses (T4's lawful-set half lands it), #8
  Kleisli (T1 supplies the missing caveat: Kleisli = monad = the analyzability cliff).
- `harness-state-space.md` — "make invalid states unreachable"; T1 bounds HOW FAR
  the compile-time half of that reaches (up to selective-applicative, not past it).
