# Typed-spec FRONTIER — PL-theory + formal-methods transfers into the harness

> Status: research + prototypes (2026-06-21). The founder's "go wild, but survive
> the buildability + non-replicability filter" brief: what can a TYPED, executable
> `.spec.ts` give the agent harness that markdown/YAML fundamentally cannot —
> drawing from the DEEP toolbox of programming-language theory and formal methods?
>
> **Builds on, does not duplicate:** `typed-spec-power.md` (the prior round —
> already established #1 typed handoff composition and #2 typed purity; this doc
> goes BEYOND them) and `harness-state-space.md` (the "minimize the harness
> state-space / make invalid states unreachable" thesis + the lethal-trifecta as a
> deterministic scan check — this doc lifts that ONE rung higher: trifecta as a
> compile-time TYPE, not just a runtime intersection).
>
> Prototypes (all ground their tsc/runtime claims): `research/prototypes/typed-spec-frontier/`.

## What this round adds over the prior one

The prior round answered "is a typed spec worth it at all?" with two wins inside a
SINGLE agent's contract (its purity) and a LINEAR data pipeline (A.ok → B.needs).
This round mines harder PL theory for the things that live at the SAME two leverage
points the brief names:

- **(A) compile-time** — TS's type system makes an invalid harness state
  _unrepresentable_ (template-literal, conditional, mapped, recursive, branded,
  `const` type params).
- **(B) runtime-after-compile** — the spec also EMITS hooks + parse-time checks +
  tests, so a guarantee the TYPE can't express ("parse, don't validate") compiles
  into a runtime gate that still can't be bypassed in the loop.

The organizing insight that's new here: **the best transfers split cleanly across A
and B, and WHICH side a property lands on is itself a finding.** A property over a
single _declared shape_ (the trifecta, plan-before-mutate ordering) is a TYPE; a
property over a single _live value_ (the actual write path, the actual Bash
command) is a generated RUNTIME gate; a property over a _pair of runs_
(noninterference / a leak) is structurally an A/B EVAL and cannot be either. That
third bucket — hyperproperties — is the most surprising transfer and is covered
last.

## The ranking

Filter applied to every row: **non-replicable** (could markdown + a linter do it? —
if yes, ranked down), **buildability class** (`TS-types` / `runtime-check` /
`hybrid` / `aspirational`), **value** (does it stop a real failure — a leaked
secret, an unsafe push, a clobbered file, a broken pipeline).

| #      | Idea                                                                                                                                      | PL-theory source                                                                   | vigiles application                                                                                                                  | Non-replicable?                                                                                      | Build class                                                   | Value                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------ |
| **F1** | **Trifecta as a forbidden TYPE** — a tool set holding {private ∧ untrusted ∧ exfil} doesn't COMPILE without a typed sign-off              | Information-flow / taint typing (Denning, Volpano)                                 | tag tools with taint legs, fold legs over the `const` tools tuple, collapse the param to an error unless `allowTrifecta` is supplied | **Yes** — a type-level set-fold over the contract; lifts the scan check to edit-time-unrepresentable | **TS-types** (PROTOTYPED)                                     | **Very high**            |
| **F2** | **Typestate protocol** — a mutating step before the plan/review phase doesn't COMPILE                                                     | Session types / typestate (Honda; Strom-Yemini)                                    | the pipeline carries a PHASE in its type; combinators permit only legal transitions (`planning*→enter→mutating*`)                    | **Yes** — order/phase is a temporal property no string list carries                                  | **TS-types** (PROTOTYPED)                                     | **High**                 |
| **F3** | **Disjoint-write separation** — parallel workers may only write their OWNED file region; a cross-region write is blocked at the live call | Separation logic / frame rule (Reynolds, O'Hearn)                                  | static prefix-disjointness (lint) + a spec-generated per-worker PreToolUse gate on the LIVE path                                     | **Yes** — the live path is a value no type sees; the gate can't be bypassed in-loop                  | **hybrid** (PROTOTYPED)                                       | **High**                 |
| **F4** | **Noninterference = A/B pair** — a leak test compares secret-present vs secret-absent runs; "no significant public-output difference"     | 2-safety / hyperproperties (Clarkson-Schneider); noninterference (Goguen-Meseguer) | a leak test is a `runEval` arm PAIR verified as `assertSignificant` INVERTED (want NO difference)                                    | **Yes** — structurally impossible on one trace; needs the two-run primitive vigiles already has      | **runtime-check** (eval tier, PROTOTYPED shape)               | **High**                 |
| **F5** | **Affine "use-once" capability** — a railway that deploys/pushes/charges twice doesn't COMPILE                                            | Linear/affine types (Rust, Linear Haskell, Pony)                                   | type-level COUNT of a once-cap over the step tuple; >1 collapses the param naming the cap                                            | Partly — a static count, NOT true value-flow linearity (TS limit)                                    | **TS-types** (PROTOTYPED)                                     | Med                      |
| F6     | **Refinement contracts** — a `result()` field constrained by a predicate (`score ∈ 0..1`, `path matches glob`)                            | Refinement/dependent types (LiquidHaskell, F\*, Dafny)                             | template-literal patterns encode SOME refinements; the rest drop to a spec-generated parse/postcondition check                       | Partly                                                                                               | **hybrid**                                                    | Med                      |
| F7     | **Hook totality** — every hook decides every event it registers on (no silent fall-through)                                               | Totality/exhaustiveness (Agda/Idris)                                               | `assertNever` over the event union at author time + `propertyHook` fuzz at test time                                                 | Yes (md has no `switch`)                                                                             | **TS-types** + test                                           | Med (rider)              |
| F8     | **Model-checked protocol** — generate a TLA+/Alloy model from the railway, check temporal invariants                                      | Model checking / temporal logic (TLA+, Alloy)                                      | emit a state-machine model from the typed railway; check `G(mutate → P plan)`, "every dispatched subagent eventually Stops"          | Yes                                                                                                  | **aspirational** (F2 recovers the headline case in-language)  | Low-Med                  |
| F9     | **Graded token budget in the type** — a plan whose summed cost > budget doesn't COMPILE                                                   | Graded/indexed monads (Katsumata)                                                  | type-level peano sum of step costs vs a declared budget                                                                              | Yes for tiny counts                                                                                  | **aspirational** — TS2589 blow-up past ~2k (PROVEN) → runtime | Low (kill the type form) |

The four genuine frontier wins are **F1, F2, F3, F4**. F5 is a real-but-honest
partial (a count, not linearity). F6–F9 are riders, recoveries, or — for F9 — a
crisp NO at the type level.

---

## F1 — The lethal trifecta as a forbidden TYPE (the headline) — PROTOTYPED

**The claim.** `harness-state-space.md` ships the lethal trifecta (private-data
access ∧ untrusted-content intake ∧ an exfiltration channel — Simon Willison, the
Jan-2026 four-exploits-in-five-days cluster) as a deterministic `scan`/lint
set-intersection — a RUNTIME (well, scan-time) check. The frontier move is to lift
it to a **compile-time TYPE**: a spec that grants all three legs to one agent does
not COMPILE, and the only way to reach the dangerous-but-legitimate case (a triage
bot that reads logs, fetches an issue, and posts a summary) is to NAME it with a
typed `allowTrifecta: "<reason>"` sign-off. The forbidden state isn't
detected-then-rejected; it's **unrepresentable** — the linter polices the window
the type closes (`harness-state-space.md`'s own framing, now realized one rung up).

**Why markdown + a linter cannot do this.** The scan rule already does the
intersection, so "detect it" is replicable. What's NOT replicable:

1. The check runs at the author's `tsc`, at the keystroke, with **no vigiles run** —
   the author cannot even type the contradiction.
2. The sign-off is **part of the type**: an unacknowledged trifecta is a missing
   _required_ property, so the recovery path ("set `allowTrifecta`") is enforced by
   the compiler, not by a convention a reviewer might miss. The "warn + explicit
   sign-off, not block" posture the scan rule reasons about becomes a typed
   obligation.
3. It composes with F2/F5 on the same `const` tools tuple — one fold, many
   properties.

**The mechanism (real, compiles).** Tag each tool with its taint leg(s) in a
`ToolLegs` interface (the typed mirror of the dialect's three leg catalogs), fold
the union of legs over the declared `const` tools tuple, and gate the `agent()`
parameter:

```ts
type Leg = "private" | "untrusted" | "exfil";
type LegsOf<T> = T extends keyof ToolLegs ? ToolLegs[T] : never;
type LegsOfAll<Tools extends readonly Tool[]> = LegsOf<Tools[number]>;

type HasTrifecta<Tools extends readonly Tool[]> =
  "private" extends LegsOfAll<Tools>
    ? "untrusted" extends LegsOfAll<Tools>
      ? "exfil" extends LegsOfAll<Tools>
        ? true
        : false
      : false
    : false;

function agent<const Tools extends readonly Tool[]>(
  spec: HasTrifecta<Tools> extends true
    ? AgentSpec<Tools> & { readonly allowTrifecta: string } // sign-off REQUIRED
    : AgentSpec<Tools>,
): AgentSpec<Tools> {
  return spec;
}
```

The pass cases compile (a two-leg researcher; a signed-off triage bot). The
violations in `trifecta-fails.ts` are rejected by `tsc` alone — including the
trifecta **hidden among extra tools**:

```
trifecta-fails.ts(14,29): error TS2345: ... is not assignable to parameter of type
  'AgentSpec<readonly ["Read", "WebFetch", "Bash"]> & { readonly allowTrifecta: string; }'.
  Property 'allowTrifecta' is missing ... but required in type '{ readonly allowTrifecta: string; }'.
trifecta-fails.ts(20,32): error TS2345: ... ["mcp__github__get_file_contents", "mcp__fetch__get",
  "mcp__github__create_pull_request"] ... Property 'allowTrifecta' is missing ...
trifecta-fails.ts(30,29): error TS2345: ... ["TodoWrite","Read","Edit","WebSearch","Write","Bash"]
  ... Property 'allowTrifecta' is missing ...
```

FAILURE 2 proves it works through MCP tool names, FAILURE 3 proves the legs fold
correctly when the trifecta is buried in a six-tool list. The error tells the
author exactly what to do (supply `allowTrifecta`).

**The honest TS limit + why it's still a win.** Two caveats, neither fatal:

- The diagnostic is "`allowTrifecta` is missing," not "lethal trifecta." A
  `& { allowTrifecta }` intersection gives the cleanest message TS will produce
  here; the `__LETHAL_TRIFECTA` error-object variant (also in the file) names the
  flow but yields a busier TS2345. Pick the intersection for ergonomics and put the
  word "trifecta" in the JSDoc the editor surfaces on hover.
- The TYPE sees the DECLARED tools, not what the agent actually does — so this is
  the author-time **floor**, not a runtime guarantee. That's correct and
  intentional: it's the exact analogue of typed-purity (#2 prior round) sitting
  ABOVE the runtime gate. The type forbids _writing_ the contradiction; the
  capability-graph scan still runs on the compiled markdown for hand-written /
  non-spec harnesses, and the runtime egress wall still confines a live exfil. Three
  layers, the type being the cheapest and earliest.

**Non-replicable verdict: YES, and it's the strongest in the doc** — it takes the
single hottest agent-security property and makes it _unrepresentable_ at the
keystroke, with a typed escape hatch that records the sign-off. Markdown can declare
three tools; only a typed spec can refuse to compile their dangerous _combination_.

## F2 — Typestate protocol: plan-before-mutate as an illegal SEQUENCE — PROTOTYPED

**The claim.** The prior round typed the DATA between agents (A.ok ⊇ B.needs). F2
goes one rung up the behavioral-types ladder (session types / typestate) and types
the PROTOCOL — the ORDER and PHASE. The harness invariant: a pipeline must run its
READ-ONLY planning/review phase BEFORE any agent that MUTATES the world. This is a
temporal property — `G(mutate → P plan)`, the very thing the model-checking seed in
`harness-state-space.md` asks for — and a markdown railway, which lists steps as
strings in arbitrary order, cannot express it. A `deploy` step before a `plan` step
is just two strings.

**The mechanism (real, compiles).** The pipeline carries a `Phase` typestate in its
type; the combinators are the transition function of a tiny automaton
(`planning*→enterMutation→mutating*`), and an illegal transition is an
unassignable phase:

```ts
function start(a: PhasedAgent<"planning">): Pipe<"planning">;
function thenPlan(
  p: Pipe<"planning">,
  a: PhasedAgent<"planning">,
): Pipe<"planning">;
function enterMutation(p: Pipe<"planning">): Pipe<"mutating">; // the one-way door
function thenMutate(
  p: Pipe<"mutating">,
  a: PhasedAgent<"mutating">,
): Pipe<"mutating">;
```

The legal `plan → review → enterMutation → implement → push` pipeline compiles. The
violations in `typestate-fails.ts` are rejected by `tsc`, with the CLEANEST messages
in the doc (native phase mismatch, no error-object wrapper):

```
typestate-fails.ts(22,3): error TS2345: Argument of type 'Pipe<"planning">' is not
  assignable to parameter of type 'Pipe<"mutating">'.   // mutate before the plan phase
typestate-fails.ts(29,3): error TS2345: Argument of type 'Pipe<"mutating">' is not
  assignable to parameter of type 'Pipe<"planning">'.   // plan after mutation began
typestate-fails.ts(36,3): error TS2345: Argument of type 'Pipe<"mutating">' is not
  assignable to parameter of type 'Pipe<"planning">'.   // enter mutation twice
```

**Why non-replicable.** Order is a relation between steps; a frontmatter list has no
relational structure. A linter COULD parse a railway and check "no mutator index <
the last planner index" with a custom rule — but it cannot do it at edit time, it
re-implements the automaton by hand, and (the real point) the typed combinators make
the _whole class_ of order bugs unrepresentable rather than enumerating them. This is
the in-language recovery of F8's headline (model-checking the protocol) without
generating a TLA+ model: the type IS the model checker for the safety fragment.

**Honest limit.** This is a TWO-state typestate (planning/mutating) and a LINEAR
protocol; richer session types (branching choice — "reviewer approves XOR rejects,
each opening a different continuation"; recursion) are expressible in TS but the
combinator surface and inference get heavy fast. The two-phase plan-before-mutate
gate is the high-value, low-cost slice — ship that, leave full session types as a
research curiosity. It also gates ORDER, not the runtime guarantee that a "planning"
agent truly does no writes — that's typed-purity (#2) on each agent, composed with
this. F2 + typed-purity together: each agent's effects are bounded by its purity
type, and the phase type bounds WHEN effects may occur.

## F3 — Disjoint-write separation: the spec-generated runtime gate — PROTOTYPED

**The claim (and why it's a RUNTIME check, deliberately).** Separation logic's frame
rule: computations on DISJOINT regions don't interfere. Transferred: when a spec
fans out parallel subagents, each declares the file region it OWNS (a path prefix),
and the safety property is pairwise-disjoint write-sets — two parallel workers that
can both write `src/api/` race and clobber. The STATIC half (declared prefixes are
pairwise-disjoint) is decidable and could be a lint rule. But the property that
actually matters is **"the worker only writes inside the region it declared"** — and
that depends on the LIVE path, a value the type cannot see. This is "parse, don't
validate" exactly: the spec compiles a per-worker PreToolUse gate that, at the live
Write/Edit, rejects a path outside the worker's owned region. It can't be bypassed in
the loop, and it enforces what the type provably cannot — the perfect illustration
that the spec's _runtime emission_ is a first-class leverage point, not a fallback.

**The mechanism (runs green).** `disjoint-writes.mjs` shows both halves — the static
prefix check AND the pure runtime decision the generated hook runs:

```
[ok] good plan: declared regions pairwise-disjoint
[ok] bad plan caught statically: w1 ∩ w2 (src/api/ vs src/)
[ok] runtime: api-worker writing src/api/routes.ts allowed
[ok] runtime: api-worker writing src/ui/button.tsx DENIED        ← the live-path property
[ok] runtime: cross-region READ allowed (disjointness is write-only)
```

`decideDisjointWrite(ownedRegion, tool, path)` is the pure seam — the same
`one-detector` shape as the shipped `decidePurityGate`, ready to drop beside the
agent-runtime rail. The `owns` field would be a new `delegate("api-worker", { owns:
"src/api/" })` option compiled into the worker's contract + the hook's
`VIGILES_OWNED_REGION` env, mirroring how the effect-boundary marker is compiled and
read back.

**Why non-replicable + valuable.** Markdown can DECLARE "this worker owns src/api/,"
and a linter can check the declared prefixes are disjoint — that part IS replicable
(so the static half is "just" a good lint rule). The non-replicable part is the
runtime ENFORCEMENT of the live write against the declared region, which is a
spec-emitted hook gating a value no static analysis sees. The value is a concrete
multi-agent failure (parallel clobber) the field has no answer to. It rides on the
same PreToolUse machinery the purity/tool-contract rails already use — low net new
surface.

## F4 — Noninterference is a 2-safety HYPERPROPERTY → an A/B eval PAIR — PROTOTYPED (shape)

**The most surprising transfer.** The brief explicitly wanted the "pairs of
states/traces" angle, and it pays off concretely. Noninterference
(Goguen-Meseguer) — "varying the SECRET input leaves the PUBLIC output unchanged" —
is a property over PAIRS of executions (a 2-safety property, Clarkson-Schneider's
hyperproperties). You **cannot refute it by inspecting one trace**; you must compare
two runs that differ only in the secret and check the public outputs agree.

This draws a hard line through vigiles's own test tiers:

- A **single-run** check (runHook, one runHarness turn) verifies SAFETY — "this run
  didn't push," "this hook fired." It is structurally blind to interference.
- A **leak / noninterference** test is a **2-run** check — and vigiles already has
  the two-run primitive: `runEval` A/B arms + `compareArms`/Welch. So a leak test is
  an arm pair (secret-present vs secret-absent), and the verdict is "the public
  outputs are INDISTINGUISHABLE" — `assertSignificant` **inverted** (you want NO
  significant difference; a significant divergence is the leak).

`hyperproperty.mjs` demonstrates the shape deterministically: two fake runs that
differ only in the secret, each of which passes a single-trace safety check, yet
whose PAIR reveals the public output depends on the secret:

```
[ok] each run inspected alone passes a single-trace safety check
[ok] the PAIR reveals interference a single trace could not:
      A: Read the config. No issues.
      B: Read the config. Detected a production key — escalating.
      public output depends on the secret → noninterference VIOLATED
[ok] a noninterferent agent: identical public output across the pair
```

**Why this is non-replicable AND a positioning insight.** No static file and no
single-run linter can express a hyperproperty — it's a relation between runs, by
definition. More importantly, it RECLASSIFIES a chunk of "agent security testing"
into vigiles's existing A/B eval lane and gives that lane a crisp new primitive: an
**inverted-significance** assertion (`assertIndistinguishable` — fail if the arms
differ). It explains, from theory, WHY some harness questions can't be answered by
the cheap deterministic tiers and MUST touch the (sub-affordable) real-model A/B
tier — they're hyperproperties. That's a clean story for the eval-tier positioning,
not just a check.

**Honest status.** F4 is a SHAPE + a positioning claim, prototyped with fake traces;
the build is a thin `assertIndistinguishable` wrapper over `compareArms` plus a
secret-injecting arm pair. It's model-gated (real-model A/B), so by the
`one-detector-no-drift` rule it lives ONLY in the eval tier, never a lint rule —
which is exactly right for a hyperproperty.

## F5 — Affine "use-once" capability: a real partial, honestly — PROTOTYPED

Linear/affine types want "deploy/push/charge AT MOST once." TS has **no linear
types** — it cannot track a moving value's consumption. What it CAN do is a
type-level COUNT of a once-cap over a `const` step tuple; >1 collapses the parameter
and names the cap. `affine-fails.ts` is rejected:

```
affine-fails.ts(14,37): error TS2345: ... not assignable to '{ __AFFINE_VIOLATION:
  { usedTwice: "deploy"; }; }'.
affine-fails.ts(21,35): error TS2345: ... '{ __AFFINE_VIOLATION: { usedTwice: "push"; }; }'.
```

This catches the REAL bug (a railway literally listing `deploy` twice) but it is
**not** true linearity — it's a static multiplicity check over a literal list, and it
only works if the steps are a `const` tuple (a dynamically-built array escapes it).
A genuine "the deploy capability, once passed to a worker, can't be passed again"
needs ownership semantics TS lacks. Verdict: a nice cheap rider on the same tuple
F1/F2 already constrain, valuable for the literal-double-deploy case, but don't
oversell it as linear types — and the robust form (a worker may only call the deploy
tool once per run) is, again, a RUNTIME counter in a PreToolUse gate, not a type.

## F6–F9 — riders, recoveries, and one crisp NO

- **F6 refinement contracts** (LiquidHaskell/F\*). Template-literal types encode SOME
  predicates (a path matching a glob shape, an enum-of-literals), so a `result()`
  field _can_ carry a narrow refinement. But arithmetic/relational refinements
  (`score ∈ 0..1`, `len(a) == len(b)`) are not encodable without the peano blow-up
  (see F9), so they drop to a spec-generated postcondition check at parse/test time.
  Hybrid, Med value — fold into the typed-`result()` lift the prior round's #1 needs
  anyway.
- **F7 hook totality** (Agda/Idris). `assertNever` over the event union makes "every
  event handled" a compile error when a case is added; `propertyHook` fuzzes the
  rest. Genuinely non-replicable (md has no `switch`) but an internal discipline +
  the existing test primitive, not a new headline. `harness-state-space.md` already
  demotes pure totality to matcher-coverage; agreed.
- **F8 model-checked protocol** (TLA+/Alloy). Generating a TLA+ model from the
  railway and checking temporal invariants is the "wild" idea — but F2 recovers the
  single highest-value invariant (plan-before-mutate) IN-LANGUAGE at `tsc`, with no
  external model checker, no TLA+ toolchain in the user's loop. Generating a model
  for richer liveness ("every dispatched subagent eventually Stops") is aspirational
  and heavy; park it. The transfer still earned F2.
- **F9 graded token budget** (graded monads). **Crisp NO at the type level.**
  `graded-budget.ts` shows small step-count sums work (`Add<2, Add<3,1>> = 6`,
  `Lte<6,10> = true`), but a realistic token budget triggers the TS recursion limit:

  ```
  boom.ts(2,13): error TS2589: Type instantiation is excessively deep and possibly infinite.
  ```

  (reproduced at `Tuple<5000>`). A token/cost budget belongs in the RUNTIME eval
  tier, which already meters cost/latency/tokens + `maxCostUsd`. Types can grade a
  small STEP COUNT, not a token count. Don't build the type form.

---

## If we build ONE more thing: F1 (trifecta as a forbidden type)

**Pick F1.** It is the single strongest combination of non-replicable + buildable +
valuable in either round:

- **Non-replicable** at the deepest level: it makes the hottest agent-security
  property (the lethal trifecta — name-brand exploits, CVEs, the Jan-2026 cluster)
  _unrepresentable at the keystroke_, with a typed sign-off that records the
  acknowledgement. Markdown declares tools; only a typed spec refuses to compile
  their dangerous combination.
- **Buildable today** — PROVEN against `tsc` 5.9.3: a `const` tools tuple + a
  leg-fold conditional type + an `& { allowTrifecta }` gate. The real lift is a
  `ToolLegs` catalog on the dialect (the typed mirror of the scan rule's three leg
  sets) and a typed `agent()` overload — the same shape as the typed-purity lift the
  prior round already scoped.
- **It pays into the existing thesis twice.** It's the compile-time TYPE form of
  `harness-state-space.md`'s Tier-1 trifecta scan check (one source of leg catalogs,
  enforced at three altitudes: type → scan → runtime egress), and it composes on the
  SAME `const` tools tuple as typed-purity (#2) and F2/F5 — one tuple, a fold of
  safety properties. Ship F1 and the tools field becomes the harness's typed
  capability lattice.

Second pick if there's room: **F2 (typestate protocol)** — cleanest error messages,
recovers the model-checking headline in-language, and composes with F1 on the same
pipeline. F3 (disjoint-write runtime gate) is the best _runtime-side_ build and the
clearest "parse, don't validate" showcase, but it's a net-new `owns` field + hook;
F1/F2 are pure type additions to fields that already exist.

## The most surprising transferable idea

**F4 — noninterference as a 2-safety hyperproperty.** Not because it's the biggest
build (it's a thin wrapper), but because it gives a THEORETICAL reason for an
architectural fact vigiles already lives: some harness questions (does the agent's
visible behaviour depend on a secret?) are RELATIONS BETWEEN RUNS and are therefore
structurally unanswerable by the cheap single-run tiers — they require the A/B eval
pair, verified as `assertSignificant` INVERTED (`assertIndistinguishable`). It turns
"why do we even have an A/B eval tier" from an engineering convenience into a
hyperproperty necessity, and hands the eval tier a new primitive for free.

## Rejected / cute-but-useless (the crisp NOs)

- **Token budget in the type (F9).** Killed at the type level — TS2589 blow-up past
  ~2k. Real value, wrong altitude; it's already a runtime eval metric.
- **Full session types with branching/recursive choice (beyond F2's two phases).**
  Expressible but the combinator surface + inference cost outweigh the value over the
  one plan-before-mutate gate. Academic past the two-state slice.
- **True linear types (F5's robust form).** TS has no value-flow linearity; the
  static count is the honest ceiling. The robust "call deploy once per run" is a
  runtime counter, not a type — don't dress it as Linear Haskell.
- **Generating a TLA+/Alloy model the user must run (F8).** A whole external model
  checker in the author's loop for invariants F2 already gets in-language. Wrong
  cost/benefit; the transfer's value was the IDEA (typestate), realized without the
  toolchain.
- **Arithmetic refinement types (F6's relational half).** Same peano wall as F9;
  drops to a runtime postcondition. Keep only the template-literal-encodable
  refinements (path/enum shapes).

## Prototype files (all under `research/prototypes/typed-spec-frontier/`)

- `trifecta-types.ts` — F1: leg-fold + `allowTrifecta` gate; pass cases compile.
- `trifecta-fails.ts` — three unacknowledged trifectas (built-in, MCP, hidden),
  each rejected by `tsc`.
- `typestate-protocol.ts` — F2: phase typestate + transition combinators; the legal
  ship pipeline compiles.
- `typestate-fails.ts` — three protocol violations (mutate-early, plan-late,
  double-enter), each rejected by `tsc`.
- `affine-capability.ts` — F5: type-level once-cap count; the at-most-once pipeline
  compiles.
- `affine-fails.ts` — double-deploy / double-push, rejected by `tsc` naming the cap.
- `graded-budget.ts` — F9: small budgets compile; the TS2589 blow-up documented (the
  crisp NO).
- `disjoint-writes.mjs` — F3: static prefix-disjointness + the live-path runtime
  gate firing.
- `hyperproperty.mjs` — F4: a single trace passes safety while the PAIR reveals
  interference (the 2-safety shape).
- `run.mjs` — one-shot reproducer: asserts every pass file compiles, every fails file
  is rejected (printing the diagnostic), and both runtime demos run green. Run:
  `node research/prototypes/typed-spec-frontier/run.mjs` (exits 0).

All self-contained — they COPY minimal type-parameterized variants of the builders
and do NOT modify the shipped `src/` (whose `tools`/`result()`/`delegate()` are
string-erased today, which is exactly why the type system can't see these properties
yet — the gap F1/F2/F5 would close).

## See also

- `typed-spec-power.md` — the PRIOR round (#1 typed handoff composition, #2 typed
  purity). This doc goes beyond them; F1 composes ON #2's typed `tools` field.
- `harness-state-space.md` — the state-space thesis + the trifecta as a deterministic
  SCAN check (F1 lifts it to a compile-time TYPE; F3/F5's robust forms are its
  runtime gates; F4 explains why the model-gated tier is irreducible).
- `railway-subagents.md` / `spec-syntax-and-railway-scope.md` — the orchestration
  layer F2's typestate protocol and F3's fan-out extend.
- `side-effect-separation.md` / `effect-boundary-design.md` — the runtime purity gate
  F1 (type) sits above and F3 (disjoint-write gate) mirrors.
- `eval-api-landscape.md` / `stats.ts` — `compareArms`/Welch, the two-run primitive
  F4's `assertIndistinguishable` (inverted significance) wraps.
