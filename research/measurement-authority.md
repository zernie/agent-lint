# Measurement authority — the offensive reframe (what actually makes agents better)

> Status: strategy pivot (2026-06-19). Supersedes the security-led "spine" in
> `strategy-verdict.md` after a sharp critique: verify/test/security is _hygiene_ (low
> virality, and it reinvents agnix/superpowers/cc-plugin-eval). The reframe: stop being the
> checker that the harness isn't broken; become the **empirical authority on what makes
> agentic coding actually work.** Same eval engine, opposite posture — defense → offense.

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

- `typed-contracts-for-agents.md` — the durable purpose of the spec under this frame: typed
  Result/railway contracts + side-effect boundaries make skills/agents _assertable_ (not
  LLM-judged), which is what makes the measurement cheap and rigorous.
- `strategy-verdict.md` — the prior (security-led) verdict this reframes; the spine there is
  now: benchmark/optimize (offense) > verify/test (substrate).
- `divergent-bets.md` — the harness cost/ROI optimizer + CI-for-model-upgrades bets this
  elevates to the identity.
- `positioning-funnel.md` — the axes; "measurement authority" is the new top of funnel.
- `zero-config-mother-harness.md` — the installer, reframed as "apply the empirically-best
  setup."
