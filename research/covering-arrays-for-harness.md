# Covering arrays for the harness — pairwise sampling driven by the typed spec

> Status: research + prototype (2026-06-21). Question from the founder's
> [prune-the-timeline](https://zernie.com/blog/prune-the-timeline/) article: the
> piece lays out a **cost-ordered hierarchy** for taming a combinatorial state
> space — (1) discriminated unions / make-illegal-states-unrepresentable, (2) DB
> constraints, (3) **covering arrays / pairwise**, (4) model checking. vigiles
> already owns rung 1 for the harness (typed purity makes `pure`+`Bash`
> unrepresentable — see `typed-spec-power.md` #2). This doc asks: does rung 3
> transfer? A `.spec.ts` declares the harness PARAMETER SPACE in enumerable,
> constrained form — exactly a covering-array generator's input, and **markdown
> cannot be fed to one**. Where is that genuinely valuable, non-replicable, and
> buildable?
>
> **Builds on, does not duplicate:** `typed-spec-power.md` (#2 typed purity — the
> rung-1 prune this composes with), `typed-spec-frontier.md` (the
> compile-time-vs-runtime split; F1/F2 typed contracts), `divergent-bets.md` #11
> (measure model × harness), and the roadmap's eval items "Per-model trigger-rate
>
> - context-rot curve" and "Near-neighbor trigger-rate tier". Prototype (grounds
>   every row-count claim): `research/prototypes/covering-arrays/`.

## TL;DR

- **The strongest pick is eval interaction-testing** — a 2-way covering array over
  the harness config dimensions (skills on/off, model, flags) catches the
  INTERACTION bugs (a skill that mis-fires only when another is installed; a config
  that breaks only on model X) at **~N²/2 real-model runs instead of 2ᴺ**. The
  prototype measures **3072 → 18 rows (99.4% fewer)** for a 10-skill × 3-model
  space, **192 → 13 rows (93.2%)** for a realistic constrained space. This is what
  makes interaction-testing affordable on the subscription — it ties the eval moat,
  not the lint layer.
- **It is non-replicable for the same reason the typed-spec wins are:** markdown
  can't be fed to a covering-array generator. The spec's enumerable fields ARE the
  parameter model; the spec's typed constraints (a `pure` agent can't have Bash)
  ARE the PICT-style constraints that prune the invalid region before sampling.
  **Types prune; the array samples** — the article's rungs 1 and 3 compose.
- **The crispest NO:** lint/scan gets almost nothing. Lint is per-surface,
  deterministic, and free — there is no real-model-run cost to amortize, so "2ᴺ is
  fine, just run them all" wins. Covering arrays only pay off when each cell is
  EXPENSIVE (a real-model eval). Don't bolt pairwise onto the free deterministic
  tiers.

---

## Part 1 — The covering-array landscape (algorithms + constraint handling)

A **covering array** CA(N; t, k, v) is N rows over k parameters (here ≤ v values
each) such that **every combination of any t parameters appears at least once**.
For t=2 ("pairwise"), every value-PAIR of every parameter-PAIR is present. The
payoff is the [NIST](https://csrc.nist.gov/projects/automated-combinatorial-testing-for-software)
empirical finding the article quotes: **"testing every pair of settings catches
70–97% of bugs"** (single factors + pairs cumulatively), because most field faults
are triggered by 1–2 interacting conditions, not 6 at once. The row count grows
~**(v²·log k)** — logarithmic in the number of parameters — which is why 2ᴺ
collapses to ~N²/2.

### Algorithms

| Algorithm                      | Family                                           | Strength               | Constraints                                   | Notes                                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------ | ---------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **IPOG** (Lei et al.)          | greedy, deterministic, in-parameter-order growth | t-way (any t)          | yes (via forbidden-tuple check during growth) | The engine inside **NIST ACTS**. Horizontal growth (extend rows with the value covering the most new tuples) + vertical growth (add rows for leftovers). What the prototype implements. Deterministic → reproducible CI. |
| **AETG** (Cohen et al.)        | greedy, **randomized** one-row-at-a-time         | t-way                  | yes                                           | Builds each row by locally-greedy value selection; often slightly smaller than IPOG but non-deterministic (needs a seed).                                                                                                |
| **PICT** (Microsoft)           | greedy, AETG-lineage                             | t-way (`/o:N`)         | **first-class** — `IF [a]="x" THEN [b]<>"y"`  | The reference **constraint** experience; a CLI, battle-tested, models exclusions and sub-models. The article's named tool.                                                                                               |
| **allpairspy** (Python)        | greedy generator + filter                        | 2-way (pairs)          | yes (a `filter_func` predicate)               | The simplest embeddable form: pass a predicate that rejects illegal partial rows. Closest in shape to what a vigiles eval runner needs.                                                                                  |
| **SAT/CP-based** (e.g. via Z3) | reduce CA construction to constraints            | t-way, **optimal-ish** | native (constraints ARE clauses)              | Smallest arrays, handles hairy constraints, but slower to generate; overkill for ≤ ~15 harness dims. The bridge to rung 4.                                                                                               |
| **covertable / prune-states**  | greedy, JS/TS                                    | 2-way                  | predicate                                     | `prune-states` is **the founder's own** TS library — already the in-ecosystem tool; a vigiles integration would call it, not reinvent it.                                                                                |

### Constraint handling is the load-bearing feature

Naive pairwise over a space with forbidden combinations either (a) emits illegal
rows (wasted/invalid eval runs) or (b) leaves "uncoverable" pairs that can't appear
in any legal row, which a dumb checker reports as a coverage hole forever. The fix
(PICT, allpairspy, and the prototype): **a constraint is a predicate over a (partial)
assignment; prune any partial row a constraint already rejects, and only REQUIRE
pairs that some legal complete row can contain.** This is exactly the
prune-then-sample synthesis below — and it's why the spec's typed constraints are
the input that makes pairwise WORK here, not just an optimization.

---

## Part 2 — The ranked table of ALL vigiles applications

Filter on each row: **non-replicable** (could markdown + a generic CI matrix do it?
— pairwise needs an enumerable, constrained parameter model, which markdown lacks),
**value** (does each cell COST enough that 2ᴺ is actually infeasible?), **reuses
what**, **effort**.

| #     | Idea                                                                               | Layer                   | What it buys                                                                                                                                                                                                  | Non-replicable? why                                                                                                                                  | Reuses                                                                                                | Value        | Effort         |
| ----- | ---------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------ | -------------- |
| **1** | **Eval interaction-testing** — 2-way CA over (skills on/off × model × flags)       | **eval (real model)**   | Catches **interaction** bugs (skill mis-fires only with another installed; config breaks only on model X) at **~N²/2 runs vs 2ᴺ**. Makes interaction-testing affordable on the sub.                           | **Yes** — needs the enumerable+constrained param model only the spec carries; each cell is an expensive real-model run, so the saving is REAL money. | `runEval`/`measureArms` (each CA row = one arm), `eval-cache`, `installSet`, the `EvalArm.model` axis | **High**     | Med            |
| **2** | **Prune-then-sample** — typed purity constraints feed the CA as PICT exclusions    | **eval (composition)**  | The CA samples ONLY the valid region; impossible configs (`pure`+Bash, B-without-A) never burn a run. Rungs 1+3 of the article compose.                                                                       | **Yes** — the constraints ARE the typed `purity`/dependency fields; a markdown roster has no machine-checkable exclusions to forward.                | `effects.ts` purity floor, `spec.ts` declared deps, the generator's predicate hook                    | **High**     | Low (rides #1) |
| **3** | **Trigger-rate interaction** — 2-way CA over (skill × NCD-near competitor × model) | **eval (trigger-rate)** | Measures **precision-collision / roster-rot** interactions cheaply: does skill A under-fire only when near-neighbor B is present, on model X? The roadmap's "near-neighbor tier" × "per-model" item, sampled. | **Yes** — same param-model dependence; directly the roadmap's roster×model×prompt matrix made affordable.                                            | `measureTriggerRate`, `findSimilarRules`/`ncd`, near-neighbor tier, `EvalArm.model`                   | **Med-High** | Med            |
| **4** | **Context-rot curve sampling** — CA over (roster-size × model × prompt-class)      | **eval (study)**        | The "how many skills before they stop firing, on model X" study at a fraction of the full grid.                                                                                                               | Partly — roster-SIZE is a scalar sweep, less obviously pairwise; CA helps the model×prompt-class cross.                                              | `measureTriggerRate`, divergent-bets #11                                                              | Med          | Med            |
| **5** | **Adapter/dialect conformance matrix** — CA over (harness × surface × capability)  | **deterministic test**  | A covering set of (adapter, surface, capability) tuples for the conformance kit instead of all combos.                                                                                                        | Weakly — the conformance kit already enumerates ports; combos are small (2 adapters) and cells are FREE.                                             | `adapter-conformance.ts`                                                                              | Low          | Low            |
| **6** | **Lint rule-config interactions** — CA over (rule severities × spec shapes)        | **lint**                | A covering set of `.vigilesrc.json` rule-severity combos to verify the engine.                                                                                                                                | **No** — lint is deterministic + free per cell; "just run all combos" wins, and the detectors are one-shot pure functions.                           | —                                                                                                     | **Low (NO)** | —              |
| **7** | **Spec-config validation matrix** — CA over (target × sections × rule-kinds)       | **lint/compile**        | A covering set of spec shapes to test the compiler.                                                                                                                                                           | No — this is ordinary unit-test fixture selection; cells are free, combos small.                                                                     | `compile.test.ts`                                                                                     | Low          | —              |

**Cutoff:** rows 1–3 are the keepers (and 2 is really "the way you do 1"). 4 is a
real study but only partly pairwise-shaped. 5–7 are honest NOs — see Part 5.

---

## Part 3 — Deep dive on the top 2

### #1 — Eval interaction-testing at ~N²/2 cost (the headline; ties the eval moat)

**The problem it solves.** A harness with N config dimensions has 2ᴺ assembled
configurations. The bugs that matter at the harness level are rarely about ONE
setting — they're INTERACTIONS:

- a skill whose description collides with another's **only when both are installed**
  (precision collision / roster-rot — the very failure `description-overlap` and the
  near-neighbor tier exist to catch, but measured across the real roster);
- a hook or skill that behaves correctly on Sonnet but **mis-selects on Haiku**
  (the `minModel` floor exists because Haiku under-selects — a model interaction);
- a flag that's safe alone but breaks a skill's trigger **only in combination**.

You cannot run 2ᴺ real-model evals. You CAN run a 2-way covering array: every PAIR
of settings (every skill×skill, skill×model, skill×flag pair) appears in at least
one sampled config, so any 2-way interaction bug surfaces in at least one run — at
**N²/2-ish rows**. The NIST 70–97% claim is the warranty: most interaction faults
are ≤2-way, so pairwise catches the large majority for a tiny fraction of the cost.

**Why it's non-replicable.** The input is an enumerable parameter model WITH
constraints. A markdown roster is an unordered prose list — there is nothing to feed
a generator, and no machine-checkable exclusions to honor. The `.spec.ts` already
carries every dimension as a typed field (which skills, `model`, `purity`, tool
sets, flags) — it **is** the parameter model. This is the same non-replicability the
typed-spec wins rest on (`typed-spec-power.md`), now applied to test SELECTION.

**Why it's affordable — and only here.** A covering array pays off iff each cell is
expensive. A real-model eval IS expensive (tokens + latency, even on the sub). So
the saving (the prototype's 93–99% fewer rows) is real money/time. On the free
deterministic tiers each cell is ~free, so the same array buys nothing — which is
the dividing line in Part 5.

**Reuse.** Each CA row is one `EvalArm` (or one `measureArms` arm). The generator
emits rows; the existing eval machinery runs them, caches them (`eval-cache`), and
aggregates mean ± se. `EvalArm.model` already makes model a per-arm axis, so model
slots straight into the parameter space. Significance/regression gating
(`stats.ts`/`eval-baseline.ts`) reads the resulting arms unchanged.

**Honest limit.** Pairwise catches ≤2-way faults. A bug that needs THREE skills
installed at once to fire slips through a 2-way array. Mitigation: raise to t=3
(`--o:3` in PICT terms) for a roster you suspect has higher-order coupling — at a
higher (but still « 2ᴺ) row count. The prototype is t=2; the IPOG engine generalizes
to any t. Be honest in the buyer pitch: "pairwise = the 70–97% band; t=3 if you need
the tail."

### #2 — Prune-then-sample (the article's rungs 1+3, composed) — PROTOTYPED

The article's whole thesis is that the rungs **stack**: delete illegal states
cheaply (rung 1), then sample what survives (rung 3). vigiles already has rung 1 for
the harness — typed purity makes `pure`+`Bash` a **compile error**
(`typed-spec-power.md` #2; `effects.ts` `purityViolations`). So the covering array
never needs to sample the impossible region: the spec's constraints become PICT-style
exclusions the generator honors.

The prototype encodes three such constraints as code predicates — the SAME shape the
spec's typed fields already enforce:

- **C1** `purity = pure ⇒ bash = off` — the typed-purity invariant, now an eval
  exclusion. A `pure`+Bash config is never sampled (it can't exist).
- **C2** `skillA = off ⇒ skillB = off` — a declared roster dependency (B needs A).
- **C3** `model = haiku ⇒ flagX = off` — a flag that requires the stronger model.

**Measured effect** (Case B′ in `run.mjs`): the constraints shrink the valid space
from **192 → 90** configs _before_ sampling, and the covering array drops from 16
rows (unconstrained) to **13 rows** — while every emitted row provably respects all
three constraints (asserted) and every REACHABLE pair is still covered (constraint-
killed pairs are correctly NOT required). That last point is the subtle one a naive
matrix gets wrong: a dumb "all pairs" checker would forever report `pure`+`bash=on`
as an uncovered hole; the constraint-aware generator knows that pair is unreachable
and doesn't demand it.

**Why this is the composition the article describes.** Types make invalid states
**unrepresentable** (rung 1, edit-time, free); the covering array **samples** the
representable-and-valid remainder (rung 3, eval-time). Neither subsumes the other —
without rung 1 the array wastes runs on impossible configs; without rung 3 you still
face 2ᴺ valid configs. vigiles is one of the few places both halves exist in one
artifact, because the spec is both the type-checked declaration AND the eval input.

---

## Part 4 — The single strongest pick

**Eval interaction-testing (#1), implemented as prune-then-sample (#2).** It is the
only application where all three filters fire at once:

1. **Non-replicable** — requires the enumerable, constrained parameter model that
   only the typed spec carries; markdown can't be fed to a generator.
2. **Genuinely valuable** — each cell is an expensive real-model run, so the
   ~N²/2-vs-2ᴺ saving is real money, and it catches the interaction class
   (roster-rot, per-model mis-selection) that single-skill evals structurally miss.
3. **Buildable on what exists** — each CA row is an `EvalArm`; reuses `runEval`/
   `measureArms`/`eval-cache`/`installSet`/`EvalArm.model`/`stats.ts` with a thin
   generator in front. The founder's own `prune-states` is a ready engine.

It also ties the **eval moat** specifically (not lint): interaction-testing the
ASSEMBLED harness across its config space, affordably on the subscription, is
something a per-token completion-grader (promptfoo et al.) can't reach — and now it's
~50–100× cheaper than the brute-force grid.

**Shape of a build (sketch, not committed):** a `coveringArms(spaceSpec, { strength })`
helper that reads a declared parameter space + the spec's purity/dependency
constraints, emits `EvalArm[]` (one per CA row), and hands them to `measureArms`.
Gate it behind the same significance machinery so an interaction regression is read
for noise, not asserted blindly.

---

## Part 5 — Where it is NOT worth it (the honest NOs)

- **Lint / scan (the crispest NO).** Pairwise only pays when a cell is EXPENSIVE.
  Lint cells are deterministic, free, and one-shot — "just run all combos" beats any
  sampling, and the rule-config space is small anyway. Bolting a covering array onto
  the free tiers adds machinery and coverage RISK (pairwise can miss a 3-way bug) for
  no cost saving. Lint stays exhaustive; covering arrays stay in the eval tier. This
  is the same line `One Detector No Drift` draws: deterministic detection ≠ the
  model-gated tier.
- **Spec-compiler fixtures.** Choosing test inputs for `compile.ts` is ordinary
  fixture selection; the combos are tiny and cells are free. Pairwise is overkill.
- **The adapter conformance matrix.** Two adapters today; the combo count is trivial
  and each conformance check is free/deterministic. Enumerate, don't sample.
- **When interactions are >2-way.** If a harness genuinely has 3-way coupling
  (a bug that needs three specific skills co-installed), a 2-way array will miss it.
  Be honest: pairwise is the 70–97% band, not a proof. Raise t or fall back to the
  whole-`installSet` tier for the suspected cluster. (This is rung-3's ceiling; rung
  4 / model-checking is the article's answer for ordering/concurrency faults — out of
  scope for config sampling, noted as the upgrade path.)
- **When the roster is tiny.** ≤3 binary dims = 8 configs = run them all. The
  generator's own Case A shows the saving is only 50% at 3 booleans; it's the LARGE
  rosters (Case C: 99.4%) where this earns its keep. Don't reach for it below ~5–6
  dimensions.

---

## Prototype & evidence

`research/prototypes/covering-arrays/` — `node run.mjs` exits 0; all assertions pass.

- `covering-array.mjs` — a real **IPOG-style** (horizontal + vertical growth) t=2
  covering-array generator with **PICT-style constraint pruning** (predicate over
  partial assignments), no deps. `allValidPairs`/`uncoveredPairs` compute the
  reachable-pair ground truth so coverage is asserted, not assumed.
- `run.mjs` — models a vigiles harness parameter space, prints the row-count saving,
  and asserts (a) every reachable pair is covered, (b) no emitted row violates a
  constraint, (c) the constraints actually pruned the space.

**Measured row-count savings (the evidence the saving is real):**

| Case   | Space                               | Full factorial | Valid (post-prune) | CA rows | Saving    | Pairs covered |
| ------ | ----------------------------------- | -------------- | ------------------ | ------- | --------- | ------------- |
| A      | 3 booleans (article's example)      | 8              | 8                  | **4**   | 50.0%     | 12/12         |
| B      | 7-dim harness space, no constraints | 192            | 192                | **16**  | 91.7%     | 96/96         |
| **B′** | same + typed-purity constraints     | 192            | **90**             | **13**  | **93.2%** | 93/93         |
| **C**  | 10 skills × 3 models                | 3072           | 3072               | **18**  | **99.4%** | 240/240       |

The prune-then-sample case (B′) is the headline: typed constraints shrink the valid
space 192→90 BEFORE sampling, and the array lands at 13 rows with full reachable-pair
coverage and zero constraint violations — the article's rung 1 and rung 3 composing
in one run.

## See also

- `typed-spec-power.md` (#2 typed purity — the rung-1 prune this composes with)
- `typed-spec-frontier.md` (the compile-time-vs-runtime split; typed contracts)
- `divergent-bets.md` #11 (measure model × harness — the study #3/#4 feed)
- `research/roadmap.md` — eval items "Per-model trigger-rate + context-rot curve",
  "Near-neighbor trigger-rate tier" (the matrix this would sample). _(linked, not
  edited — the parent owns the roadmap.)_
