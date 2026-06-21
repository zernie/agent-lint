# The typed-spec MOAT — synthesis & durable record

> Status: synthesis + endorsed thesis (2026-06-21). This is the consolidated RECORD
> of five research rounds into what a TYPED, executable `.spec.ts` gives an agent
> harness that a markdown / YAML instruction file structurally cannot — plus the
> moat thesis the founder endorsed. It exists so the founder can pick what to build
> later WITHOUT re-reading six docs: every finding from every round is captured here
> in full, with its verdict, its build-class, and whether it is a MOAT, a HELPER, or
> an INTERNAL-QUALITY item.
>
> **Source rounds (all read into this synthesis; nothing dropped):**
>
> - `typed-spec-power.md` — round 1a: typed composition (#1) + typed purity (#2).
> - `typed-spec-frontier.md` — round 1b: F1–F9 (PL-theory + formal-methods transfers).
> - `typed-spec-effects-monads.md` — round 2a: M1–M6 (algebraic effects / monads / interpreters).
> - `typed-spec-formal-verification.md` — round 2b: V1–V6 (model checking — **found a REAL bug**).
> - `typed-spec-refinement-types.md` — round 2c: R1–R5 (refinement / dependent / session types).
> - `covering-arrays-for-harness.md` — round 2d: covering arrays 1–7 (NIST pairwise).
>
> Positioning anchors: `measurement-authority.md` (the offense pivot — measurement
> is the headline, the spec is the on-ramp to testability), `CLAUDE.md` (the
> deterministic-constraints-layer positioning, the adoption ladder, the rules).
>
> ⚠️ **READ THE COMPETITIVE CHECK FIRST (§ "Competitive reality check", before See
> also) — it was MARKET-CORRECTED.** First pass said these moats are "commoditizing";
> grounded re-check found that was a **market conflation**. The tools that ship these
> capabilities (riftmap, AgentAuditKit/PolicyLayer, Mastra, promptfoo) are in **DIFFERENT
> markets** (infra, MCP-server security, app-building) and never touch a coding-agent
> harness. In vigiles's ACTUAL market the only rivals are **pure surface linters**
> (claudelint/cclint/agnix/`claude plugin validate`) that do **none** of vigiles's
> cross-ref / typed / test-eval work — and the whole category is **pre-mindshare** (vigiles
> 11★; biggest rival agnix 296★/1-HN-pt). So the moats aren't "taken" in-market — they're
> unoccupied; the real bottleneck is **distribution, not capability**, and the durable
> edge is the **substrate + sub-affordable measurement**. Don't re-inflate the
> per-row "TAKEN" labels below without the market correction. Full segmented matrix:
> `landscape-mid-2026.md`; see also `spec-value-model.md`.

## Contents

1. The moat in one line
2. The three concrete moats
3. The keystone: type-safe pipelining
4. The complete ranked record — every finding, every round
5. The adoption tension (OPEN — for the founder to resolve)
6. Proposed build order
7. Competitive reality check (2026-06-21, market-corrected) — capabilities live in adjacent markets; vigiles's own market is wide open
8. See also

---

## 1. The moat in one line

**The harness becomes a compilable, analyzable formal object.** Markdown is inert
prose — you read it, you lint individual references, and that's the ceiling. A typed
spec is a _program_, so the entire 50-year toolbox (type-checking, taint/information-
flow analysis, model checking, combinatorial sampling, refinement contracts) applies
to your agent harness — and none of it can _ever_ apply to a markdown file. The
category line:

> **vigiles is a compiler/verifier for agent harnesses; everyone else is a linter
> for prose.**

A linter for prose can, at most, check that a referenced rule/file/command exists
(vigiles already does this for plain markdown via inline comments + frontmatter). It
fundamentally cannot fold the _combination_ of a contract's tools into a forbidden
state, propagate a data shape forward through a pipeline, prove an ordering invariant,
sample a constrained config space, or diff a harness's _capabilities_. Those all
require the harness to be a typed program.

### The second wall: more rigorous than the code-based orchestration frameworks too

The obvious objection is "but LangGraph / CrewAI / AutoGen / the Claude Agent SDK are
already code — so they're typed programs too." They are code, but the harness they
assemble is **not statically checked end-to-end**: they pass **UNTYPED state** (Python
dicts, loosely-typed message objects) between nodes at _runtime_. A node reads
`state["diff"]`, and whether the upstream node produced it is discovered when the graph
RUNS and a `KeyError` (or a silent wrong value) surfaces. vigiles checks that handoff
at **compile time** — the computed pipeline type (§3) rejects a graph whose seams don't
line up before anything runs. So the typed spec is not only above the markdown tools;
it is _more rigorous than the orchestration frameworks_ on the one property that
matters most for multi-agent reliability — the wiring between steps.

---

## 2. The three concrete moats

These are the three things no markdown tool — and, for #1/#2's wiring half, no
untyped orchestration framework — can ship, ever. They are the headline products the
research converges on.

### Moat #1 — "Unsafe harnesses don't compile."

A harness configuration that is unsafe in any of four structural ways becomes a TYPE
error → a red squiggle in the author's editor → CI red, with **no vigiles run at
all**. Markdown _always_ compiles. The four unsafe shapes, each backed by a proven
prototype:

- **leaks** (the lethal trifecta — private ∧ untrusted ∧ exfil in one contract) →
  F1: doesn't compile without a typed `allowTrifecta` sign-off.
- **exceeds its effect floor** (a `pure` agent handed `Bash`; a contract whose tools
  leak a leg its declared row omits) → typed purity (#2) / the effect-row (M1):
  a plain assignability error naming the leaked dimension.
- **hands off mismatched data** (A emits `diff: string`, B expects `diff: string[]`;
  a consumer needs a field no producer emits; steps in the wrong order) → typed
  composition (#1): rejected, naming the offending field.
- **mutates out of order** (a `deploy` step before the `plan`/review phase) → the
  typestate protocol (F2): an unassignable phase.

**Status: partly SHIPPED.** Typed purity shipped (commit `249aead`). Typed
composition shipped this session. The remaining shapes (trifecta-as-type, effect-row,
typestate) are prototyped against real `tsc` 5.9.3 and scoped, not yet in `src/`.

### Moat #2 — Semantic capability-diff at PR time (the founder's favorite; the most novel)

When a PR edits the spec, vigiles tells the reviewer not "these lines changed" but
**"this PR WIDENED the agent's blast radius"** — concretely:

- a new `net` effect leg appeared on a contract that had none;
- a review/approval gate was removed from the pipeline;
- an agent that previously couldn't `git push` now can;
- a cross-step trifecta was opened (the assembled capability — see §3 — newly
  satisfies private ∧ untrusted ∧ exfil across the pipeline, even though no single
  step does).

Markdown gives a reviewer a **TEXT diff** (words changed). Only a typed spec gives a
**CAPABILITY diff** (what the agent can now _do_ that it couldn't before), because the
diff is computed over the pipeline's **computed type** (§3), not its source text. This
is the strongest "why a typed spec" product because it is _novel_ — nobody, markdown
tool or orchestration framework, surfaces a semantic capability delta at review time —
and it is the natural PR-time face of the measurement-authority pivot's "is this
config safe AND effective" frame: the capability-diff is the _safe_ axis, computed for
free from the types, gating every harness change.

### Moat #3 — Affordable empirical interaction-testing

The spec enumerates the harness CONFIG SPACE (which skills on/off, model, flags, tool
sets); the types PRUNE the impossible region (a `pure` agent can't have Bash; B can't
be installed without A); a 2-way **covering array** SAMPLES the legal remainder; and
the **subscription** real-model eval runs the sampled rows → "which of the 2^N harness
configs actually break, and on which model" — at **~N²/2 cost instead of 2^N**. Measured:
**3072 → 18 rows (99.4% fewer real-model runs)** on a 10-skill × 3-model space;
**192 → 13 rows (93.2%)** on a realistic constrained space.

This moat is **triple-locked** — it needs all three of vigiles's assets at once, and
no competitor has even two:

1. the **structured, enumerable config space** (no markdown roster can be fed to a
   covering-array generator);
2. **type-pruning** of the invalid region (PICT-style exclusions ARE the spec's typed
   `purity`/dependency fields — markdown has no machine-checkable exclusions);
3. a **cheap real-model eval** (the subscription-affordable A/B engine — a per-token
   completion-grader like promptfoo can't afford to run the grid).

It ties the EVAL moat specifically (not the free lint tier — see covering-arrays
round, row 6: lint cells are free, so "just run them all" beats sampling; covering
arrays only pay off when each cell is an expensive real-model run).

---

## 3. The keystone: type-safe pipelining

Every keeper across all five rounds composes into ONE thing: the multi-agent pipeline
acquires a **COMPUTED TYPE, layer by layer.** Each research finding contributes one
layer of that type.

| Layer of the pipeline type                                | From (finding)                                       | Status       |
| --------------------------------------------------------- | ---------------------------------------------------- | ------------ |
| Data handoffs line up (A.ok ⊇ B.needs, by name AND type)  | typed composition (`Supplies<>`, `pipe`/`andThen`)   | **SHIPPED**  |
| Payload is valid (the VALUE, not just the shape)          | R2 refinement → runtime guard (parse-don't-validate) | proposed     |
| Order / branching (ok/err arms, plan-before-mutate)       | R3 session types / F2 typestate                      | proposed     |
| Effects accumulate (pipeline total = union of step legs)  | M1 effect-row                                        | proposed     |
| Capabilities accumulate (trifecta ASSEMBLED across steps) | F1 lethal-trifecta-as-type                           | proposed (★) |

Reading each layer:

- **Data handoffs (SHIPPED).** Typed composition keeps each worker's `ok`/`needs`
  shapes in the type parameters; `then(pipeline, agent)` type-checks _only_ when the
  prior `ok` supplies the agent's `needs`. After `then(A, B)` the pipeline's type IS
  B's output, so the NEXT `then` is checked against the real, computed downstream
  shape — _computation over the spec_, the thing a string format has no access to.
- **Payload validity (R2).** Typed composition proves the wiring lines up by name +
  type; it cannot prove A actually _returned_ a value in range. R2's parse-don't-
  validate guard mints a brand only after a predicate passes (`0 ≤ score ≤ 1`, every
  path a test file, a restricted command) at the `result()` boundary — the runtime
  completion of the compile-time handoff. The type proves the wires; the guard proves
  the value.
- **Order / branching (F2 + R3).** F2 types the LINEAR phase (`planning* →
enterMutation → mutating*`) so a mutator before the plan phase is an unassignable
  phase. R3 extends it to the railway's `⊕{ok,err}` branching choice + `μ` bounded
  recovery: each arm's handoff is threaded through `Supplies`, and the error track
  must cover every step's err shape. (Honest ceiling: a recursive protocol _walk_
  hits TS2589 — the shipped typed `pipe` is fixed-arity per-link, which is the right
  tool since a real railway is ≤ a handful of steps.)
- **Effects accumulate (M1).** The pipeline's total effect is the union of its steps'
  effect ROWS (independent legs `fs-read`/`fs-write`/`net`/`exec`/`spawn`) — the
  strict generalization of the purity LEVEL (purity is the 1-D projection of the row
  onto a chain). The type names the exact leaked dimension.
- **Capabilities accumulate (F1 — the novel one).** The trifecta is not a per-step
  property — it can be **assembled ACROSS the pipeline**: step 1 reads private data,
  step 3 fetches untrusted content, step 5 has an exfil channel. No single contract
  is a trifecta, but the _composed_ capability set is. Folding the legs over the whole
  pipeline (not one contract) is the cross-step extension that makes the capability
  layer the genuinely new engine work.

**Why #1/#2/#3 all fall out of this type.** Once the pipeline carries the computed
type: (a) Moat #1 is just "the type rejects a bad pipeline"; (b) Moat #2 is "diff the
computed type at PR time" (the capability-diff is a diff of the effect + capability
layers); (c) Moat #3 is "sample the typed config space, pruned by the type's own
constraints." The three moats are not three separate builds — they are three readings
of one computed pipeline type. (vs LangGraph/CrewAI/AutoGen: they wire agents into a
graph, but the handoffs are untyped dicts resolved at runtime, so none of these three
readings is available to them.)

---

## 4. The complete ranked record — every finding, every round

Verbatim verdicts preserved. Build-class: `TS-type` (a compile-time type) /
`runtime-guard` (a spec-generated hook/parse check on a live value) / `hybrid` (both)
/ `eval` (model-gated A/B tier) / `one-time-proof` (an internal verification, run once
by the maintainers). Tag: **MOAT** (a non-replicable product capability), HELPER (a
rider on a moat or an internal discipline that's non-replicable but not a headline),
INTERNAL-QUALITY (a vigiles correctness/codebase item), or a crisp **NO/KILLED**.

### Round 1a — `typed-spec-power.md` (composition + purity)

| #   | Idea                                                            | Non-replicable   | Verdict                                               | Build-class | Tag                          |
| --- | --------------------------------------------------------------- | ---------------- | ----------------------------------------------------- | ----------- | ---------------------------- |
| 1   | **Typed handoff composition** (`A.ok` ⊇ `B.needs`, via `tsc`)   | Yes (structural) | **PURSUE — the killer use**                           | TS-type     | **MOAT** (SHIPPED)           |
| 2   | **Typed purity** (a `pure` agent can't be given `Bash`)         | Yes              | **PURSUE — cheapest big win**                         | TS-type     | **MOAT** (SHIPPED `249aead`) |
| 3   | Exhaustiveness via discriminated unions (`assertNever`)         | Yes              | Adopt where a union exists                            | TS-type     | INTERNAL-QUALITY             |
| 4   | Test-generation from typed fields (exhaustive `result()` cases) | Partly           | Sibling workstream; types add exhaustiveness          | TS-type     | HELPER (gated on #1)         |
| 5   | Refactor/rename safety + queryable model                        | Mostly           | Real but modest; falls out of #1/#2                   | TS-type     | HELPER                       |
| 6   | Higher-order / parameterized specs (`(cfg) => spec`)            | **No**           | DRY only — markdown-replicable via a generator        | —           | **NO** (markdown-replicable) |
| 7   | One source → many _formats_ (`.mdc`, `.clinerules`)             | No               | **KILLED** (divergent-bets #2); compose, don't absorb | —           | **KILLED**                   |
| 7b  | One source → a consistency-CRITICAL artifact (tools → Cedar)    | Yes              | Narrow keeper, parked (downstream of #1/#2)           | hybrid      | HELPER (parked)              |

### Round 1b — `typed-spec-frontier.md` (F1–F9)

| #   | Idea                                                           | Non-replicable                     | Verdict                                                | Build-class                      | Tag                           |
| --- | -------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------ | -------------------------------- | ----------------------------- |
| F1  | **Lethal trifecta as a forbidden TYPE** (sign-off required)    | **Yes — the strongest in the doc** | **BUILD if one more — the headline**                   | TS-type (PROTOTYPED)             | **MOAT** (the novel one)      |
| F2  | **Typestate: plan-before-mutate as an illegal sequence**       | Yes                                | Second pick — cleanest errors, recovers F8 in-language | TS-type (PROTOTYPED)             | **MOAT**                      |
| F3  | **Disjoint-write separation** (live-path runtime gate)         | Yes (the live path)                | Best runtime-side build; net-new `owns` field          | hybrid (PROTOTYPED)              | **MOAT** (runtime)            |
| F4  | **Noninterference = a 2-safety hyperproperty → A/B eval pair** | Yes (relation between runs)        | The most SURPRISING transfer; eval-tier only           | eval (`assertIndistinguishable`) | **MOAT** (positioning)        |
| F5  | Affine "use-once" capability (deploy/push at most once)        | Partly (a count, not linearity)    | A real partial — don't oversell as linear types        | TS-type (PROTOTYPED)             | HELPER                        |
| F6  | Refinement contracts (`score ∈ 0..1`, path glob)               | Partly                             | Fold into the typed-`result()` lift (see R1/R2)        | hybrid                           | HELPER → R2                   |
| F7  | Hook totality (every hook decides every event)                 | Yes (md has no `switch`)           | Internal discipline + existing test primitive          | TS-type + test                   | INTERNAL-QUALITY              |
| F8  | Model-checked protocol (generate TLA+/Alloy from the railway)  | Yes                                | Aspirational; F2 recovers the headline in-language     | aspirational                     | **DON'T** (user feature) → V1 |
| F9  | **Graded token budget IN THE TYPE**                            | Yes for tiny counts                | **CRISP NO — TS2589 blow-up past ~2k (PROVEN)**        | aspirational → runtime           | **KILLED** (type form)        |

### Round 2a — `typed-spec-effects-monads.md` (M1–M6)

| #   | Idea                                                                        | Non-replicable                                | Verdict                                                                        | Build-class                    | Tag                |
| --- | --------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------ | ------------------ |
| M1  | **Granular effect ROW** (fs-read/fs-write/net/exec/spawn)                   | **Yes — strongest in the doc**                | **BUILD — the headline; generalizes typed purity**                             | TS-type + runtime (PROTOTYPED) | **MOAT**           |
| M2  | **Effect HANDLER discharge** (net allowed-but-ROUTED, residual row shrinks) | Yes                                           | **BUILD — M1's runtime completion**                                            | runtime-check (PROTOTYPED)     | **MOAT** (runtime) |
| M3  | Spec as a free-monad AST → many backends (markdown/gate/Cedar/OTel)         | Partly (vigiles already shares one detector)  | Real but incremental; adopt the AST+fold LOCALLY, NOT a compiler rewrite       | hybrid (PROTOTYPED)            | HELPER (parked)    |
| M4  | Runtime graded + writer monad (escalation grade + audit trail)              | Partly (cost grade duplicates the eval meter) | Med rider; keep only escalation grade + writer trail; **type form stays dead** | runtime-check (PROTOTYPED)     | HELPER             |
| M5  | Skill combinators (retry/fallback/parallel/race) as Kleisli                 | **No**                                        | **CRISP NO — compiles to PROSE the harness can't honor**                       | aspirational (prose)           | **KILLED**         |
| M6  | Reader monad for hook/skill context                                         | **No**                                        | **KILL — internal plumbing, no guarantee, no state-space shrink**              | n/a (internal)                 | **KILLED**         |

### Round 2b — `typed-spec-formal-verification.md` (V1–V6) — found a REAL bug

| #   | Idea                                                                               | What a checker gives                                 | Verdict                                                                             | Build-class           | Tag                             |
| --- | ---------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------- | ------------------------------- |
| V1  | **Model-check OUR runtime** (`agent-runtime.ts` active-agent window under nesting) | the shortest contract-escape trace + a certified fix | **BUILD THIS ONE — found a real bug, validated the fix**                            | one-time-proof (DONE) | **INTERNAL-QUALITY (must-fix)** |
| V2  | Railway bounded-recovery termination (the sub-Turing claim)                        | a machine-checked termination proof                  | **fold into V1** — proven trivially, free rider                                     | one-time-proof (DONE) | INTERNAL-QUALITY                |
| V3  | Liveness: no orphaned subagent window                                              | a stale-window liveness witness                      | **fold into V1** — the checker found this too                                       | one-time-proof (DONE) | INTERNAL-QUALITY                |
| V4  | `vigiles verify --model` (generate TLA+/Alloy from a USER's railway)               | per-user temporal invariants                         | **DON'T ship — wrong cost/benefit (JVM + TLA+ to the wrong audience)**              | spec→model-gen        | **DON'T**                       |
| V5  | Alloy structural model of the plugin graph                                         | bounded structural counterexamples                   | **DON'T — `scan`/`danglingRefs`/`validateRailway` already cover this**              | aspirational          | **DON'T**                       |
| V6  | Proof-gated evolution (every Merkle mutation discharges a proof)                   | formally-verified spec mutations                     | **DON'T — already the crisp NO in `formal-proofs-for-agents.md` §5.3 (PhD-shaped)** | aspirational          | **DON'T**                       |

**The REAL BUG V1 found (a must-fix CORRECTNESS item, NOT a moat).** The shipped
`agent-runtime.ts` tracks the active subagent in a SINGLE `.vigiles/active-agent.json`
slot, bracketed by `PreToolUse(Task)` (open) and `SubagentStop` (close). Under CC
v2.1.172's depth-5 nesting this is **nesting-unsafe**: both a hand-rolled Node bounded
checker and real TLC independently produce the same shortest counterexample —

```
Open(writer) → Open(writer) → Stop → Call(Bash)
```

A `writer` (contract `{Read,Write,Edit}`, **no Bash**) spawns a nested `writer`; the
inner subagent stops; the flat model's `rmSync` clears the WHOLE slot → `active =
none` → the gate returns allow (inherits-all) → the still-running PARENT `writer` is
now allowed `Bash`, which its contract forbids — a **contract escape**. The proposed
depth-aware STACK fix (push on Task-dispatch, pop on SubagentStop, gate on stack top)
is **TLC-certified** ("No error has been found", all interleavings up to the bound).
The value of the checker here was NOT discovering an unknown bug (the code comment
already said "flat-only, NOT nesting-safe" in prose) — it was converting a prose hedge
into an exact failing trace + a certificate that the fix is complete. **Fix this; keep
the `.tla` model as a regression artifact. It is internal correctness, not a product
feature.**

### Round 2c — `typed-spec-refinement-types.md` (R1–R5)

| #   | Idea                                                                              | Non-replicable                                            | Verdict                                                                       | Build-class                | Tag                        |
| --- | --------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------- | -------------------------- |
| R1  | **Encodable refinements** (enum / glob path / `Bash(git:*)` / non-empty)          | Yes for the keystroke                                     | Cheapest — tighten existing fields' types                                     | TS-type (PROTOTYPED)       | HELPER (author-time floor) |
| R2  | **Refinement → runtime guard** (parse-don't-validate; brand on predicate pass)    | Yes — a live value, ungameable                            | **BUILD-ONE pick — completes the typed-handoff payload half**                 | runtime-guard (PROTOTYPED) | **MOAT** (runtime)         |
| R3  | **Full session types: branching `⊕` + bounded recursion `μ`**                     | Yes (relational)                                          | Second pick — purest type win; shallow-only (TS2589 wall)                     | TS-type (PROTOTYPED)       | **MOAT**                   |
| R4  | Dependent `result()` shape (Π/Σ)                                                  | Partly (the discriminated union recovers the common case) | The union is enough; don't reach for dependent types                          | TS-type (the union slice)  | HELPER                     |
| R5  | **Relational/arithmetic refinement IN THE TYPE** (`len(a)==len(b)`, `score∈0..1`) | n/a (wrong altitude)                                      | **CRISP NO — same TS2589 peano wall as F9, re-confirmed; → R2 runtime guard** | aspirational → runtime     | **KILLED** (type form)     |

Key insight of this round (the transferable result): the type-vs-runtime line is set
by **ARITY**, not the PL feature — a predicate over a literal SHAPE → a TS type; the
SAME predicate over an arbitrary VALUE → a runtime guard; a predicate over the protocol
STRUCTURE → a shallow type with a recursive-walk ceiling.

### Round 2d — `covering-arrays-for-harness.md` (1–7)

| #   | Idea                                                                    | Layer               | Non-replicable | Verdict                                                   | Tag                 |
| --- | ----------------------------------------------------------------------- | ------------------- | -------------- | --------------------------------------------------------- | ------------------- |
| 1   | **Eval interaction-testing** (2-way CA over skills×model×flags)         | eval (real model)   | **Yes**        | **The strongest pick — ~N²/2 vs 2^N, ties the eval moat** | **MOAT**            |
| 2   | **Prune-then-sample** (typed-purity constraints = PICT exclusions)      | eval (composition)  | **Yes**        | **High — "the way you do #1"; rungs 1+3 compose**         | **MOAT** (rides #1) |
| 3   | Trigger-rate interaction (CA over skill × NCD-near competitor × model)  | eval (trigger-rate) | **Yes**        | Med-High — the roadmap's roster×model matrix, sampled     | HELPER → MOAT       |
| 4   | Context-rot curve sampling (CA over roster-size × model × prompt-class) | eval (study)        | Partly         | Med — a real study, only partly pairwise-shaped           | HELPER              |
| 5   | Adapter/dialect conformance matrix                                      | deterministic test  | Weakly         | Low — 2 adapters, free cells; enumerate, don't sample     | **NO**              |
| 6   | Lint rule-config interactions                                           | lint                | **No**         | **Low (crisp NO) — free per cell; "run them all" wins**   | **NO**              |
| 7   | Spec-config validation matrix                                           | lint/compile        | No             | Low — ordinary fixture selection                          | **NO**              |

### The KILLED list and the DON'Ts (so we don't relitigate)

- **F9 — graded token budget in the type.** TS2589 blow-up past ~2k (PROVEN, `Tuple<5000>`). A cost/token budget is a RUNTIME eval metric (`maxCostUsd`), never a type. **Dead.**
- **R5 — arithmetic/relational refinement in the type.** The same peano wall as F9, re-confirmed. A numeric bound is one line of R2 runtime predicate. **Dead (type form).**
- **M5 — skill combinators (retry/fallback/race) as runtime control flow.** The harness has no primitive to retry/race a skill, so they compile to PROSE a markdown generator emits identically. (The data-handoff half of Kleisli composition — `pipe` — is real and SHIPPED; only the control-flow half is dead.) **Dead.**
- **M6 — Reader monad for context.** Internal plumbing, no user-facing guarantee, no state-space shrink. **Dead.**
- **V4 — `vigiles verify --model` per-user model generation.** Ships a JVM + TLA+ toolchain + counterexample-debugging to an audience that won't use it, for an invariant F2 already gets at `tsc`. **DON'T.**
- **V5 — Alloy structural model of the plugin graph.** `scan` + `danglingRefs` + `validateRailway` already find unreachable/cyclic/dangling configs deterministically and free. **DON'T.**
- **V6 — proof-gated evolution.** Rule semantics are NL prose; "implies" has no formal meaning. Already the crisp NO in `formal-proofs-for-agents.md` §5.3. PhD-shaped. **DON'T.**
- **#1a-6 higher-order specs / #1a-7 many-formats.** DRY-only (markdown-replicable via a generator) / KILLED (compose with Ruler/rulesync, don't absorb per-tool formats).

---

## 5. The adoption tension (OPEN — for the founder to resolve)

This is captured, not resolved — the founder will decide where the balance sits.

> **"Strong enforcement is very hard to balance with ease of adoption — probably
> needs escape hatches / opt-outs / opt-ins throughout the spec surface."**

### (a) The likely answer: GRADUATED OPT-IN

Enforcement is adopted at your pace, never all-or-nothing. This does not weaken the
moat — it **strengthens** it: a graduated, opt-in enforcement ladder is exactly how
TypeScript's `strict` flags work, and it's why TypeScript won. Each rung adds a
guarantee without requiring the next; a team turns on the trifecta type, then the
effect-row, then the capability-diff gate, as they're ready. The moat is the
_existence_ of the rungs (no markdown tool has any), not a forced march to the top.
This also aligns with the measurement-authority pivot's framing of the spec: "the
zero-friction, progressive on-ramp to testability — start free-form, add typed
contracts rung by rung, each one converting an expensive model-judge into a cheap
deterministic assert."

### (b) The escape hatches vigiles ALREADY has (grounded in the code/positioning)

The enforcement is _already_ escapable today, by design — these are the existing
opt-outs the moat features should mirror:

- **The Level 0/1/2 adoption ladder.** Inline `<!-- vigiles:enforce ... -->` comments
  (Level 0) → a `vigiles:` YAML frontmatter block (Level 1) → a typed `.spec.ts`
  (Level 2). You opt into typing at all only at Level 2; the lower rungs verify
  references with zero new files. (`docs/markdown-mode.md`.)
- **The OPEN core builders vs the OPT-IN typed builder.** The harness-agnostic
  `agent()`/`skill()` on `vigiles/spec` carry no extra type constraint; the typed
  `vigiles/claude-code` builder is the opt-in that adds the contract checks.
  Selection is by IMPORT (select-by-import, per `CLAUDE.md`) — you choose the enforced
  variant by importing it, not by a global flag.
- **`purity: "dangerously-unrestricted"`** — the purity-floor escape hatch, named
  LOUD at the declaration site (the `AuthoredPurity` escape word), so the bypass is
  auditable, never silent.
- **`vigiles:ignore` / `vigiles:ignore-test`** — the per-reference and per-surface
  opt-outs (an ignored test surface is reported as _exempt_, so the skip is visible).
- **Per-rule lint severity** — every rule is `warn` / `error` / `off` in
  `.vigilesrc.json`; nothing is forced to `error`.
- **The string-based `delegate()`/`railway()` path stays.** Typed composition is
  ADDITIVE — the existing string-name delegate resolution (a compile-time stale-ref
  check) continues to work; the typed handoff is a generic-carrying overload you opt
  into.
- **`guidance()` vs `enforce()`** — a rule can be prose-only (`guidance()`, no
  deterministic gate) or delegated-and-verified (`enforce()`); you choose the
  enforcement strength per rule.
- **The planned trifecta sign-off** — `allowTrifecta: "<reason>"` (typed) /
  `vigiles:allow-trifecta` (markdown): the trifecta type's own escape hatch is a
  REQUIRED, recorded acknowledgement, not a silent override.

### (c) The OPEN questions for the founder

Where else should the moat features carry an opt-out?

- A per-pipeline opt-out of the cross-step capability check (some pipelines
  legitimately assemble a trifecta — a triage bot that reads logs, fetches an issue,
  posts a summary)?
- A `--strict-pipeline` flag (the TypeScript-`strict` analogue for the computed
  pipeline type)?
- A typed sign-off for an INTENTIONAL effect-widening in a PR (so the capability-diff
  gate (#2) blocks an _unacknowledged_ blast-radius increase but passes a signed one)?

**The principle to hold (proposed, for the founder to confirm):** every enforcement
has a LOUD, AUDITABLE escape hatch NAMED at the declaration site — never a silent
bypass. The escape is part of the record (like `allowTrifecta`'s required reason
string), so a reviewer sees both the widening AND the sign-off.

---

## 6. Proposed build order (the founder picks)

1. **DONE — typed purity (`249aead`) + typed composition (this session).** The first
   two layers of the pipeline type; Moat #1's first two shapes.
2. **Cross-step effect + capability accumulation (the engine extension).** Fold the
   effect ROW (M1) and the trifecta legs (F1) over the WHOLE pipeline, not one
   contract — the novel **assembled-trifecta** + the pipeline-total effect row. This
   is the engine that the headline product feature is built on.
3. **Capability-diff at PR (#2, the headline product feature).** Built on (2): diff
   the computed effect + capability layers between the PR's spec and the base. The
   most novel, most viral-adjacent product capability.
4. **Covering-array eval (#3) + R2 payload guards.** The affordable interaction-
   testing tier (prune-then-sample on the subscription) and the runtime payload
   contract that completes the typed handoff.
5. **Separately, land the V1 nesting bug fix** (the depth-aware active-agent stack,
   TLC-certified) + keep the `.tla` model as a regression artifact. This is an
   internal correctness must-fix, independent of the moat builds.

**Recommendation:** build (2) NEXT, because it is the ENGINE that unlocks (3) — the
capability-diff at PR is the headline product, and it cannot exist until the effect +
capability layers accumulate across steps. (1) is done; (2)→(3) is the path to the
differentiator; (4) is the affordable measurement tier that the measurement-authority
pivot wants; (5) is orthogonal correctness.

> **Update (2026-06-21, post round-3 + the codegen dig + founder steer).** Three
> refinements to the above:
>
> - **Safety ≠ moat (founder).** The trifecta-_prevention_ / cross-step accumulation is
>   an ENABLER, not the headline — the moat is the **capability-DIFF (#2)** and
>   whole-program type-checking, not the safety check. Reframe (2) as "compute the
>   surface so you can DIFF it," not "prevent the trifecta."
> - **Whole-harness codegen is the engine at REPO scale** (`whole-harness-codegen.md`,
>   VALIDATED + scales). A generated `harness.gen.ts` registry makes #1 cross-file and
>   gives the **repo-scale capability lattice** the #2 diff needs. This is arguably a
>   stronger next lever than the per-pipeline accumulation — it makes the WHOLE harness
>   one `tsc`-checked program. Sequence it alongside/ahead of (2).
> - **Guardrail to land cheaply (fp-theory T1):** "the composition surface stays
>   selective-applicative; **never add a monadic `bind` combinator**" — the one move
>   that forfeits the compile-time blast-radius guarantee the moat rests on. A doc line +
>   a `CLAUDE.md` rule; the shipped `pipe`/`andThen` is already on the right side.
>
> Net: the moat is **capability-diff (#2) over a whole-harness-typed program**; the
> engine is **codegen registry + cross-step accumulation**; safety is a byproduct; the
> guardrail protects all of it.

---

## Competitive reality check (2026-06-21, market-corrected) — capabilities live in adjacent markets; vigiles's own market is wide open

A skeptical same-day competitive sweep (web-verified) tested whether each headline
moat is actually unclaimed. Verdict: **mostly not.** Record this so the optimistic
sections above are read with the deflation, not as gospel.

> **MARKET CORRECTION (added 2026-06-21, later).** The table below is factually right
> — those tools DO ship those capabilities — but the "TAKEN / commoditizing" verdicts
> were a **MARKET-CONFLATION**: nearly every tool listed serves a DIFFERENT market and
> does not touch the agentic-coding harness vigiles verifies. **Read the corrected
> synthesis below the table, not the per-row "TAKEN" labels.** Grounded by reading the
> tools' own docs: **Mastra** ("the modern TypeScript framework for AI-powered
> applications and agents") and **promptfoo** ("evaluating and red-teaming LLM apps")
> are **APP-BUILDING** tools — you write code to ship an LLM product; **zero** contact
> with CLAUDE.md/skills/hooks. **riftmap** = infra deps (closed SaaS). **AgentAuditKit /
> PolicyLayer / MCP scanners** = third-party MCP-**server** security. The ACTUAL
> in-market competitors are **claudelint** (114 rules) + **cclint** ×2 + **`claude
plugin validate`** — and all three are confirmed (their own docs) to be **pure static
> surface linters**: NO cross-referencing of declared linter rules vs the real
> ESLint/Ruff config, NO typed/compiled specs, NO compile-time checking, NO
> capability-diff, NO test/eval. So in-market, vigiles's cross-ref + typed + test/eval +
> capability-diff layers are **unoccupied** — the capabilities are proven in ADJACENT
> markets but absent in vigiles's own. Full market-segmented matrix + in-market feature
> comparison: `landscape-mid-2026.md` § "Market-segmented competitive matrix".

| Moat / candidate                                                                      | What competitors already ship                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#2 capability-diff at PR (the "founder's favorite, most novel")**                   | **riftmap** — static analysis of config/manifests → **PR-time blast-radius DIFF** (read-only token, "who consumes this, what changed"), exactly the moat-#2 mechanism but for infra deps. **AgentAuditKit** — true CI version-diff with named rug-pull codes (`AAK-RUGPULL-001/002/003`: tool defs changed/added/removed). **PolicyLayer / SkillGate(`SG010`) / agent-audit(`AGENT-054`) / AgentsID / Pillar** — capability classification (Read/Write/Execute/Destructive/Financial) + drift baselines. The whole "agent blast radius" category is crowded (Sophos, GitHub, VentureBeat) + an NSA May-2026 hash-pin-and-diff advisory. | **TAKEN (generically).** Narrow unoccupied sliver: a diff of a **first-party agent harness's own effect surface read off a TYPED SPEC** ("did this PR widen what MY agent can do") — all incumbents are security-framed at **third-party MCP servers** (rug-pulls), not first-party harness config. But it's one short hop for AgentAuditKit/PolicyLayer, needs the spec substrate, and the classification primitive isn't novel. |
| **#5 type-safe pipelining (typed cross-agent handoffs)**                              | **Mastra** (TS-first) types tool I/O + workflow steps via Zod (runtime validation + compile-time inference). Code-first frameworks already type workflow steps.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | **MOSTLY TAKEN.** vigiles edge narrows to **instruction-file-defined** agents + **whole-harness cross-file** type-check — unoccupied, but only matters to people defining harnesses as specs (~nobody yet = the adoption problem).                                                                                                                                                                                                |
| **Deterministic judge-free contract oracle** (the spec-value-model "contract oracle") | **promptfoo** — `is-json`, JSON-schema, `is-valid-openai-tools-call`, javascript assertions: deterministic structured-output checks, no LLM judge, done by the harness not the model.                                                                                                                                                                                                                                                                                                                                                                                                                                                   | **TAKEN.** vigiles edge = the contract is **auto-derived from the spec** (`assertAgentOk` from `result()`) vs hand-written schema — a convenience, not a capability.                                                                                                                                                                                                                                                              |
| **The control-flow thesis itself**                                                    | Brian Suh, _"Agents Need Control Flow"_ (2026) — independent manifesto for "deterministic scaffolds, LLM as a component." No implementation, but the IDEA is now named and spreading.                                                                                                                                                                                                                                                                                                                                                                                                                                                   | **Thesis no longer differentiating.** Validation of the frame, not a moat. (Recorded in `landscape-mid-2026.md`.)                                                                                                                                                                                                                                                                                                                 |

**Synthesis (corrected for market).** The typed-compile capabilities exist and are
proven — but in **ADJACENT markets** (app-building: Mastra/promptfoo; infra: riftmap;
MCP-server security: AgentAuditKit/PolicyLayer), NOT in vigiles's market. **In vigiles's
actual market — verifying an agentic-coding harness — every competitor is a pure static
surface linter** (claudelint/cclint/`claude plugin validate`), and NONE do
cross-referencing, typed specs, test/eval, or capability-diff. So:

- vigiles is **NOT differentiated on surface linting** (claudelint's 114 rules likely
  out-cover it on raw structural checks — don't fight there).
- vigiles **uniquely owns, in-market**: **cross-referencing** (rule-exists-AND-enabled
  across 7 catalogs), **typed/compiled specs**, **testing/eval** (does a skill fire, does
  a hook block), and **capability-diff**. No in-market competitor does any of these.
- The most defensible + adoption-friendly wedge is **cross-referencing** — unique
  in-market, the founding feature, and **works on plain markdown (no spec required)**, so
  zero adoption barrier. Lead with this, not the typed moat.

So the earlier "everything's commoditized → no killer feature" read was a market-
conflation artifact. Corrected: the fancy capabilities are unoccupied in-market today;
the real risks are (a) a polished in-market linter (claudelint) ADDING cross-referencing,
or (b) an adjacent player porting in — not present-day direct competition. The durable
positioning is still **substrate + sub-affordable measurement (A1)**, but the
near-term, no-adoption-barrier differentiator is the **cross-referencing engine on plain
markdown**. Consistent with `measurement-authority.md` § Status & gaps,
`spec-value-model.md`, and the matrix in `landscape-mid-2026.md`.

**Sources:** riftmap.dev/blog/ai-doesnt-understand-blast-radius; github.com/marketplace/actions/agentauditkit-mcp-security-scan; policylayer.com/mcp-security; mastra.ai; promptfoo.dev/docs/configuration/expected-outputs/deterministic; bsuh.bearblog.dev/agents-need-control-flow. (Caveats: the competitive subagent fan-out was partly rate-limited; #8 static-purity was not verified; the destructive-actions pain-point report never landed.)

## 7. See also

- `typed-spec-power.md` — round 1a: typed composition (#1, SHIPPED) + typed purity (#2, SHIPPED). The strongest "why a spec, not markdown" base.
- `typed-spec-frontier.md` — round 1b: F1 trifecta-as-type (the novel capability layer), F2 typestate, F3 disjoint-write gate, F4 noninterference-as-hyperproperty; the killed F9 budget type.
- `typed-spec-effects-monads.md` — round 2a: M1 effect-row + M2 handler-discharge (the effect layer); the killed M5/M6.
- `typed-spec-formal-verification.md` — round 2b: V1 the model-checked nesting bug + certified stack fix (must-fix correctness); the DON'T V4–V6.
- `typed-spec-refinement-types.md` — round 2c: R2 payload guard (the payload layer), R3 session types (the order/branch layer), the arity insight; the killed R5.
- `covering-arrays-for-harness.md` — round 2d: eval interaction-testing as prune-then-sample (Moat #3); the crisp lint NO.
- `typed-spec-fp-theory.md` — round 3: the Applicative/Selective/Monad boundary of static analyzability (the shipped `pipe` is already applicative; never add a monadic `bind` — the discipline that protects the moat); the spec-AST-as-abstract-interpreters (the #2 capability-diff engine, prototyped as a v1→v2 diff); effect accumulation ≡ the `proofs.ts` join-semilattice.
- `whole-harness-codegen.md` — the wild idea, VALIDATED + perf-measured: a generated registry importing every spec → `tsc` over the WHOLE harness as one program (cross-file typed composition, dangling-`delegate`/duplicate-name errors, the repo-scale capability lattice that feeds the #2 capability-diff). Scales (TS2589 only at N≈1000 in the naive O(N²) uniqueness encoding; per-edge types O(N), uniqueness in the JS generator).
- `measurement-authority.md` — the offense pivot: measurement is the headline, linting is the free tier that makes it affordable, and the spec is the progressive on-ramp to testability (the frame the adoption ladder serves).
- `spec-value-model.md` — the settled answer to "what does a spec buy vs plain markdown, per capability and surface": the capability axis, the two-oracle model (behavioral vs deterministic contract), the honest leg-grading (shape/flow/purity held; `effect()` sub-region dropped), and the `require-*-spec` split + capability-triggered defaults.
- `CLAUDE.md` — the deterministic-constraints-layer positioning, the Level 0/1/2 adoption ladder, the `enforce()`/`guard()`/`guidance()` rule types, and the rules this synthesis stays consistent with.
- `harness-state-space.md` · `railway-subagents.md` · `side-effect-separation.md` · `effect-boundary-design.md` · `reference-verification-limits.md` · `formal-proofs-for-agents.md` — the upstream theses each round builds on.
