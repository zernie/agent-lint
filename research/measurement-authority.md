# Measurement authority — the offensive reframe (what actually makes agents better)

> Status: strategy pivot (2026-06-19). Supersedes the security-led "spine" in
> `strategy-verdict.md` after a sharp critique: verify/test/security is _hygiene_ (low
> virality, and it reinvents agnix/superpowers/cc-plugin-eval). The reframe: stop being the
> checker that the harness isn't broken; become the **empirical authority on what makes
> agentic coding actually work.** Same eval engine, opposite posture — defense → offense.

> **P0 VALIDATED (2026-06-20).** First worked measurement — caveman (54k★, claims
> ~65% output-token reduction) over 5 real coding tasks, real haiku on the
> subscription (`bench/evals/caveman-claim.eval.mjs`): measured **−5% output**
> (it grew; only 1/5 tasks compressed), **−4% cost**, and — the structural kill —
> output is **~1.1% of session tokens**, so even a true 65% output cut moves the
> bill ~0.7%. Correctness intact (0/5 regressions). "Measured ≪ claimed", stark —
> exactly the result the thesis predicted. Caveat: caveman targets Sonnet/Opus
> (haiku is the cheap v0 pass); the ~1% output-share is model-agnostic. Method:
> [`benchmark-methodology.md`](benchmark-methodology.md).

> **External challenge (read alongside this doc):**
> [`eval-startups-positioning.md`](eval-startups-positioning.md) maps the "why eval
> startups fail" critique onto this pivot. Verdict: the public ecosystem-benchmark
> here is a public eval → Goodhart-gameable → **acquisition flywheel, not a moat**
> (keep it thin); the defensible eval-shaped niche is **attestation/safety**
> (capability-diff, guardrail proof), which the critique independently validates.

## Status & gaps (2026-06-21) — honest read of where the pivot stands

A candid self-assessment after a heavy typed-spec research+build push (see
[`typed-spec-moat.md`](typed-spec-moat.md) for the full record).

**Verdict: the thesis is genuinely cool and defensible; the execution is mostly
_potential_, and the work has leaned maker-cool (the typed-spec moat) over user-pull
(the measurement identity this doc is about).**

**What's genuinely cool (not hype).** The moat thesis is A-tier positioning — _the
harness becomes a compilable, analyzable formal object; vigiles is a
compiler/verifier, everyone else is a linter for prose_ — coherent, true, and it beats
**both** the markdown tools (can't type anything) and the code-based orchestration
frameworks (LangGraph/CrewAI pass untyped dicts at runtime). It is not vaporware:
**shipped + verified this cycle** — typed purity, typed composition (a pipeline won't
compile if handoffs don't line up), and `generate-harness` (`tsc` over the whole
harness). The research is exceptional and honest (a real Applicative/Selective/Monad
boundary _theorem_; a formal-verification bug-find with a TLC-certified fix; crisp
kills).

**What's underwhelming / the risk.** (1) The _novel_ moats are unbuilt — of the three,
only #1 shipped, and #1 (type-checking) is the least novel; **#2 capability-diff** (the
genuinely new "permissions-diff for your agent at PR time") and **#3 covering-array
eval** are roadmap. (2) **The adoption engine got starved** — the measurement identity
THIS doc argues for (the ecosystem benchmark "what works vs hype", the viral artifact)
is still ~v0, not run at scale, not published — while the session poured effort into the
_author-facing_ moat that only pays off at Level-2 spec adoption, for a product with
**~no users**. We optimized the thing that NEEDS adoption over the thing that CREATES
it. (3) Maker's dream vs user's need: users want "does my skill work / what should I
install" more than "my pipeline type-checks."

**Concrete gaps (prioritized).** (1) the at-scale ecosystem benchmark (the adoption
flywheel); (2) #2 capability-diff + its engine (the effect-row M1 + cross-step
accumulation); (3) cross-file typed composition (in flight); (4) the V1 nesting bug
(found + certified-fix-in-hand, not yet fixed — a live correctness hole); (5) adoption
ergonomics (value without authoring typed specs); (6) parked safety (macOS sandbox,
ephemeral env).

**The sequencing call.** The moat is the right long-game/defensibility story — keep it
as the depth people discover. But for a no-users product the near-term priority is
**pull, not depth**: ship the benchmark + the zero-friction `scan`/measure (no typed
spec required) and let the compiler-for-harnesses be what they find after. The one
feature that serves BOTH is **capability-diff (#2)** — a free PR comment, partial on
plain plugins via `scan`, richer on specs — so it's the bridge bet. _We've been
building the castle before the road to it._

**Competitive confirmation (2026-06-21).** A grounded sweep of the actual in-market
competition (the cc/codex-harness linters — see [`landscape-mid-2026.md`](landscape-mid-2026.md)
§ "Market-segmented competitive matrix") sharpens the pivot two ways. (1) **The agnix
signal:** the most-built linter in the space (414 rules, Rust, 7 harnesses, LSP, daily
releases) got **1 Show-HN point** — comprehensive _linting alone does not pull a
community_, which is direct evidence that the **eval/measurement layer is the puller**,
not rule-count. Lead with "the only tool that TESTS your harness," treat linting as the
free floor. (2) **No incumbent, near-zero mindshare across the category** → the bottleneck
is distribution, exactly this section's thesis. Two product-tied distribution levers fall
out (recorded in [`roadmap.md`](roadmap.md) § Explore + [`distribution-strategy.md`](distribution-strategy.md)):
a **tiered README badge** (lint→test→eval, the funnel as a growth loop) and **viral
debunk articles** (the A1 benchmark AS marketing — "caveman is vaporware"). Strategic
posture to hold: open-core + the `vigiles/adapter` kit + the measurement DATA as the moat,
so others can build a business on top and a top AI lab has a reason to acquire the
quality/safety-verification layer of its coding agent.

## The critique that forced this

1. **Hygiene doesn't go viral.** Linters/validators/test tools win by becoming necessary
   infrastructure (Jest never went viral), not by spreading. Security is a one-time PR spike,
   not wide adoption. We were optimizing _defensibility_ and mislabeling it _virality_.
2. **We were reinventing the stack.** Mother-harness installer ≈ superpowers; lint ≈ agnix;
   test ≈ cc-plugin-eval. "Do what they do, but verified" is incremental, not category-making.

## The reframe: defense → offense

The agentic-coding ecosystem is **hype-driven and unmeasured**: caveman has 75k★ for ~4–12%
real savings; "3–5× faster," "90% cheaper," "best skills" — all stars and vibes, **zero
measurement.** The one proven-viral artifact in this space is literally _"I tested 100 Claude
skills, here are the best"_ — done by hand, once, subjectively.

vigiles is the **only tool with the asset to do that rigorously and continuously: a real-model
A/B eval stack that runs on the user's _subscription_, not metered API.** That is the unlock.

| Axis      | Defense (what we had)          | **Offense (the reframe)**                                   |
| --------- | ------------------------------ | ----------------------------------------------------------- |
| Pitch     | "verify your harness is valid" | **"measure & maximize how well your agent works"**          |
| Emotion   | hygiene / fear                 | **capability / winning**                                    |
| Viral act | "your config is broken"        | **"we A/B-tested the top 50 skills — what works vs hype"**  |
| Adoption  | "I should validate" (a chore)  | **"does caveman actually help _my_ repo?" (everyone asks)** |
| Moat      | a check (copyable)             | **the benchmark _data_ + the sub-affordable eval infra**    |
| vs tools  | competes with superpowers      | **ranks superpowers — the layer _above_**                   |

## The two products that fall out (both new)

1. **The ecosystem benchmark — viral + a data moat.** "We measured the top skills/plugins/
   models on real coding tasks: caveman 11% not 90%; superpowers +X% task success; here's the
   cost-vs-quality Pareto frontier." The ecosystem is starving for this; the format is proven
   viral; and the accumulated data (N tools × M tasks × K models, run cheaply on the sub) is a
   moat nobody can replicate without the sub-affordable engine.
2. **The per-repo optimizer — wide adoption.** "vigiles measured _your_ setup — drop caveman,
   add superpowers, switch the selector → +18% task success on your tasks." Every agentic-
   coding user has the "is my setup actually good?" question; nobody answers it empirically.

## Why it isn't reinventing — and why it fits vigiles specifically

- You don't build a better installer or linter; you become the **measurement layer above** the
  whole stack, then auto-apply the winner. It sits over superpowers/agnix/caveman, not beside.
- It makes vigiles's genuinely-unique asset the STAR instead of a buried hygiene feature: the
  real-model A/B eval engine (`runEval` / `measureTriggerRate` / per-arm A/B / model-per-arm),
  plus the already-listed-but-buried bets in `divergent-bets.md` — the **harness cost/ROI
  optimizer** and **CI-for-model-upgrades**. The reframe ELEVATES those from Tier-2 to the
  identity.
- **Sub-affordability is the moat fit:** competitors hit the metered API and can't afford to
  benchmark the ecosystem continuously; vigiles drives the real `claude` CLI on the user's own
  subscription, so it's the one player who _can_.

## The reframed one-liner

**vigiles is the empirical authority on what makes agentic coding actually work — it
benchmarks the ecosystem (viral) and auto-optimizes your harness (adoption), powered by the
only eval stack cheap enough to run it (moat).**

## Where the old work still fits (demoted to support)

The verify/test/security layer doesn't die — it's **demoted from identity to substrate.**
Verification is how a measured config stays honest; the trifecta/security check becomes _one
column_ in the benchmark ("safe AND effective"), not the headline. The mother-harness installer
becomes "apply the empirically-best setup," not "a bundle we curated." Testing-the-harness is
how the optimizer's recommendations are proven. Same machinery, reframed under "make it
better," not "check it's not broken."

The **spec** is reframed too: not a CLAUDE.md authoring format (markdown wins) but the
**zero-friction, progressive on-ramp to testability** — start free-form (vigiles writes the
eval; at first model-judged), then add typed contracts rung by rung, each one converting an
expensive model-judge into a cheap deterministic assert. The spec is how you _onboard_ into the
measurement identity. See `typed-contracts-for-agents.md`.

### The deeper cut: the spec makes the harness a _compilable, analyzable formal object_

The substrate layer is more than a testability on-ramp — it is the one thing that gives vigiles
a category, not just a feature. **Markdown is inert prose; a typed `.spec.ts` is a _program_**,
so the entire PL / formal-methods toolbox applies to the harness — and **none of it can apply to
a markdown file.** The category line: **vigiles is a compiler/verifier for agent harnesses;
everyone else is a linter for prose.** This is the sharper, structural form of the
"deterministic-constraints layer" — a leaked capability, a busted effect floor, a mismatched
hand-off becomes a _type error at edit time_, not a runtime surprise a linter notices after the
fact. Three concrete, markdown-impossible moats fall out:

1. **Unsafe harnesses don't compile** (SHIPPED — typed purity + typed composition). A config
   that leaks, exceeds its declared effect floor, hands off mismatched data, or mutates out of
   order is a `tsc` error. `purity:'pure' + 'Bash'` won't type-check; the keystone is
   **type-safe pipelining** — `pipe(producer, pipeStep(agent, needs({…})))` cross-references at
   compile time that step N's `ok` _supplies_ step N+1's `needs`, so **a multi-agent pipeline
   that won't compile if the hand-offs don't line up** — categorically beyond the
   runtime-untyped orchestration frameworks (LangGraph / CrewAI / Agent SDK), let alone a
   markdown linter.
2. **Semantic capability-diff at PR time** — "this PR widened the agent's blast radius" read off
   the typed effect surface, not grepped from prose.
3. **Affordable interaction-testing** — a covering-array over the typed config space, run on the
   subscription (folds into the measurement engine above).

The graduated nuance is load-bearing and must NOT read as rigid: enforcement is **opt-in, never
all-or-nothing** — the Level 0/1/2 ladder, the open-core `agent()` vs the opt-in typed
`vigiles/claude-code` import, the `purity:'dangerously-unrestricted'` escape hatch — progressive
like TypeScript's `strict`, not a wall. The full record (the three moats, type-safe pipelining,
the markdown-impossibility argument, and the founder endorsement) lives in
`typed-spec-moat.md`.

## Honest risks

- **Benchmark methodology is hard and contestable** — what's a representative task, what counts
  as "better," per-repo variance. Mitigate: publish the method, lead with the _debunks_ (where
  measured ≠ hype) since those are unambiguous and most viral.
- **Real-model evals are slow even on a sub** — but that's the edge, not a blocker: only vigiles
  can afford continuous ecosystem benchmarking; everyone else is metered.
- **Anthropic could do skill evals** — but won't objectively rank _third-party_ tools (conflict)
  and won't do cross-tool ecosystem benchmarking.

## First move (replaces the security leaderboard)

A **"what actually works" benchmark report**: take 10–20 of the most-hyped skills/plugins/
models, A/B them on real tasks with the eval engine, publish the numbers — especially the
hype-debunks. It is the viral artifact, it demonstrates the moat engine, it positions vigiles
above the ecosystem, and it answers the question every user actually has. The per-repo
optimizer (`vigiles optimize`) is the adoption product that follows.

## What becomes of the linting (it gets its true job)

The pivot does **not** kill the deterministic linting — it moves it from "headline identity"
(where it was reinventing agnix) to **the free tier that makes the measurement affordable and
actionable.** That's _more_ load-bearing, not less. Four roles:

1. **The cheap pre-filter that makes the eval tier affordable.** Don't burn a slow real-model
   eval to find a missing hook script or a never-available tool — the linter catches it
   deterministically, free, every commit. Eval budget is spent only on configs that aren't
   _structurally_ broken. The sub-affordability moat **depends** on this: it's the cost-ladder
   (push everything decidable into the free tier so the model tier stays thin).
2. **The diagnostic that EXPLAINS a low score** (the strongest pairing). Measurement finds the
   _symptom_ ("this skill underperforms"); the cross-ref linter finds the deterministic _cause_
   - the fix (description-overlap → trigger collision; never-available tool → silently dropped;
     typo'd hook → never fires). So the optimizer says not "drop caveman" but **"it underperforms
     _because_ its trigger collides with X — here's the one-line fix."** Measurement = the _what_;
     linting = the deterministic _why_.
3. **The resident drift-guard between measurements.** Once the optimizer picks the
   empirically-best config, the linter keeps it from breaking/drifting without re-running
   expensive evals every commit.
4. **It's the substrate the benchmark runs on.** Measuring a plugin requires loading, parsing,
   and cross-referencing it (loader + scan + the cross-ref engine) — the linting infrastructure
   _is_ the foundation the measurement is built on.

**What actually changes:** drop the ambition to "become THE linter / beat agnix on rule count"
(the reinventing trap). Keep the **high-signal, FP-calibrated cross-ref engine** — the checks
that explain measurement and gate cost — not a 425-rule breadth race. The pivot _clarifies_
which linting to invest in. Net frame: **measurement = offense (the headline/moat); linting =
the free tier that makes measurement affordable, explicable, and durable** — exactly vigiles's
"deterministic constraints layer + keep the real-model surface thin."

## See also

- `benchmark-methodology.md` — the **method** behind the measurement (the metric triple —
  bill/target/blast-radius — trials, significance, affordability); the contestable part a
  benchmark lives or dies on, grounded in the P0 caveman measurement.
- `typed-contracts-for-agents.md` — the durable purpose of the spec under this frame: typed
  Result/railway contracts + side-effect boundaries make skills/agents _assertable_ (not
  LLM-judged), which is what makes the measurement cheap and rigorous.
- `typed-spec-moat.md` — the full record of the compiler-vs-linter category: the harness as a
  compilable formal object, the three markdown-impossible moats (unsafe harnesses don't compile;
  capability-diff at PR time; affordable interaction-testing), and type-safe pipelining as the
  keystone — the structural form of the substrate layer above.
- `strategy-verdict.md` — the prior (security-led) verdict this reframes; the spine there is
  now: benchmark/optimize (offense) > verify/test (substrate).
- `divergent-bets.md` — the harness cost/ROI optimizer + CI-for-model-upgrades bets this
  elevates to the identity.
- `positioning-funnel.md` — the axes; "measurement authority" is the new top of funnel.
- `zero-config-mother-harness.md` — the installer, reframed as "apply the empirically-best
  setup."
