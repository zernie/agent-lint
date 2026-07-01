---
status: active
topic: positioning
---

# Eval-startups critique → vigiles positioning

External source: Thomas Liao, "Why Eval Startups Fail" (thomasliao.com/eval-startups).
This doc records the critique and what it implies for vigiles's positioning —
specifically the tension between the **measurement-authority / ecosystem-benchmark**
bet (`measurement-authority.md`) and the **conformance / attestation** direction
(`strategic-synthesis-2026-06.md`, `divergent-bets.md`).

## The critique (what the essay argues)

Independent eval startups fail **structurally**, not on execution:

- **Empty TAM.** The buyer must be "builds on model APIs" ∩ "can't run their own
  evals" — a near-empty intersection. Anyone technical enough to want a capability
  eval just runs it; anyone who can't wants a solution, not a metric.
- **Talent attrition.** Eval expertise flows to post-training / apps where the
  upside is hundreds of millions, not a single eval contract.
- **Benchmarks get gamed (Goodhart).** Public benchmarks become the target —
  labs train on test, ship N variants — so a public eval's signal decays over time.
- **No moat.** Once an eval is public it's an optimization target; defensibility
  evaporates.

Two survivors:

1. **Eval _tooling_** (SaaS economics, cf. LM Arena's raise) over eval _services_
   (low-margin ops).
2. **Safety / audit evals** — researchers ideologically committed to safety, plus
   a **regulatory moat** and the client's need for **third-party credibility**.

Advice: don't sell raw evals; sell the tools/data around them.

## Where vigiles dodges the trap (by construction)

1. **Not a model-eval company.** The essay is about evaluating _models_ (AIME,
   capabilities). vigiles evals the **harness** — does _your_ hook/skill/CLAUDE.md
   do its job. No Goodhart problem: you're testing your own assembled harness, so
   _"a test measures reality, there is nothing to game"_ (the core CLAUDE.md line).
   The benchmark-gaming critique does not apply to the harness-test domain.
2. **Tooling, not services** — open-core CLI/library. The side of the line with
   economics.
3. **Eval is already a _feature_, not the lead.** The README opens with Lint/Guard
   (deterministic, free, no model); Eval is instrument #4. That IS the essay's
   recommended posture ("sell the tools around evals") — arrived at independently.
4. **Affordability answers "the only buyer self-evals."** The killer claim is that
   anyone who wants evals just runs them. vigiles's wedge — deterministic tiers
   free, real-model tier on your own Pro/Max subscription (no metered API) — is the
   "make the infra cheaper than building it" move aimed at exactly that self-eval
   crowd.

## The warning (yellow flag on the benchmark bet)

The essay hits the **public plugin/skill benchmark** ("what works vs hype",
`measurement-authority.md`) squarely. A public leaderboard of plugins _is_ a public
eval → Goodhart → gamed → authority erodes the moment it matters. This is hard
external evidence for what that doc already half-says ("the benchmark is the
adoption ENGINE, not the moat; don't out-build the flywheel"):

- Treat the benchmark as **acquisition / marketing**, never as the product thesis
  or the defensibility. Keep it **thin**.
- Do **not** let "measure your skills" become the headline. "Eval" as a category is
  a graveyard in buyers' minds — lead with the silent-failure pain (Lint/Guard).

## The convergence (the essay validates attestation)

The one defensible eval-adjacent niche the essay names — **safety + third-party
audit** (regulatory moat, credibility) — is precisely vigiles's underbuilt
roadmap: **capability-diff** ("this PR widened the agent's blast radius"),
`guardrail-check` ("prove your hook blocks"), conformance / attestation for the
harness (moat #2/#3, `strategic-synthesis-2026-06.md`). That's deterministic,
third-party-verifiable, and safety-framed — the _good_ kind of eval business, not
the benchmark kind. If vigiles wants an eval-shaped moat, the essay says lean
**here**, not into a capability leaderboard.

## Net recommendations

1. **Keep leading with verification (Lint/Guard), not measurement.** Never headline
   "measure your skills."
2. **Demote the benchmark to a marketing artifact** in planning. The
   compiler-for-harnesses + conformance layer is the moat; the leaderboard is the
   flywheel, kept thin.
3. **Weight up attestation / safety** (capability-diff, guardrail proof) relative to
   the benchmark — it is, per this essay, the _only_ eval niche with a real moat.

## Honest caveat

The essay targets **venture-scale standalone eval companies**. vigiles is a
multi-instrument harness tool where eval is one quarter of the surface, so most of
the critique is something vigiles already routes around. The part to actually act
on is the **benchmark-as-moat temptation** vs the **attestation-as-moat reality**.
