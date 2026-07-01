---
status: active
topic: positioning
---

# Positioning & go-to-market — moat axes, the funnel, and the first move

> Status: strategy synthesis (2026-06-19). The cross-axis moat analysis: a check is
> _ammunition_, not a position — the moat is which CATEGORY vigiles owns and how it's
> distributed. The axes, why they're funnel stages not competitors, the identity, the first
> move, and the one open fork. Companion to `harness-state-space.md` (the thesis + the bets
> these axes deploy) and `instruction-file-linter-landscape.md` (the competitor map).

## The reframe: the moat is the position, not the rule

The deterministic checks (lethal-trifecta, derivability, capability-minimization) are
**ammunition, not a moat.** A lint rule is copyable; what's defensible is the **category you
own** and **how you're distributed**. So the strategy question isn't "which check" — it's
"what is vigiles, and how does it spread." The checks exist to generate the scary leaderboard
numbers and the test signal; the _position_ is the leaderboard + test-framework + identity.

## The axes (what vigiles fundamentally IS)

| Axis                                           | Moat type                         | Defensible?                         | Viral?                             | Effort      | Verdict                                             |
| ---------------------------------------------- | --------------------------------- | ----------------------------------- | ---------------------------------- | ----------- | --------------------------------------------------- |
| **Mother harness** (front-door/orchestrator)   | Aggregation — own the entry point | Med — _thin wrapper without a core_ | Med (one-cmd demo)                 | High        | **Delivery layer, not a standalone moat**           |
| **Harness test framework** ("Jest for agents") | Category ownership + hard tech    | **High — uncontested**              | Med (testing isn't shareable)      | Med (built) | **The moat core**                                   |
| **Leaderboard / benchmark** ("Lighthouse")     | Authority + data network effect   | Med-High (first + comprehensive)    | **High — proven in this niche**    | **Low**     | **The viral wedge**                                 |
| **CI quality gate** (GitHub App)               | Ubiquity / switching cost         | Med-High                            | Med (PR-comment visibility)        | Med         | Distribution rail                                   |
| **Registry / marketplace**                     | Network effect                    | High                                | Med                                | Very high   | Cold-start + Anthropic owns the official one → skip |
| **Security / trust layer**                     | Trust / compliance                | Med                                 | High as a _wedge_, Med as identity | Med         | Wedge, not identity                                 |
| **The standard** (AGENTS.md/AAIF ref impl)     | Standards capture                 | High                                | Low                                | High/slow   | Long game                                           |

## The POV: the axes are funnel stages, not competitors

Picking one axis is the trap. The win sequences the **viral axis to bootstrap distribution**
and the **defensible axis to hold it**:

**1. Viral wedge → the leaderboard + a scary true number.** This niche has a _proven_ viral
playbook: every competitor led with a shocking scanned-the-ecosystem stat — SkillCheck
"83% of 2,568 skills missing descriptions," ctxlint "74% of your AGENTS.md is wasting tokens,"
agnix's HN launch. Out-do them with a headline only vigiles's tech can produce: _"We scanned
the top 200 Claude plugins — N% can exfiltrate your secrets (the lethal trifecta),
deterministically, before they ever run."_ That's a **press story** (the Jan-2026 incident
cluster is the hook), not a devtool tweet. Cheap (scan + the trifecta check), and it makes
vigiles **the authority on harness health.**

**2. The moat it converts into → the test framework.** A leaderboard alone is copyable
(everyone has a scanner). What it _funnels into_ is the defensible core: the authority that
says "your harness is broken" is the tool that **proves it's fixed and tests it** — hooks
fire, skills trigger, across Claude Code _and_ Codex, **on your own Claude subscription**
(competitors bill per token). "Lint found the problem; only vigiles tests the fix." That
stack is hard, uncontested, and sub-affordable — the real moat.

**3. The delivery → mother-harness + agent-install.** This is where "mother harness" honestly
lives: not the moat (a thin wrapper alone), but the **adoption vehicle** — one command sets up
the toolchain (compose agnix/Ruler _by reference_, scaffold, wire tests) and **the agent runs
it unattended.** It's how people adopt _after_ the leaderboard hooks them.

## The identity (one line)

> **Lighthouse + Jest for agent harnesses** — the public scorecard that hooks you (viral),
> the test stack that holds you (moat), installed by your agent in one command (delivery).

## The first move

**Ship the public harness leaderboard with the trifecta headline.** Why it beats everything
as move #1:

- **Cheapest viral act** — `scan` + `scoreReport` exist; the trifecta is one deterministic
  check.
- **Demonstrates the moat tech** (deterministic cross-ref nobody else does) _while_ going
  viral.
- **Establishes authority** that funnels to the test framework.
- **Press-worthy, not just dev-tweet-worthy** — security + a name-brand-incident hook.

## The one open fork (decide before committing)

**Mother-harness-as-primary-identity vs leaderboard-authority-as-primary.**

- _Leaderboard-authority → test-framework_ (my recommendation): viral wedge is cheap and
  press-worthy; the test stack is the hard-to-copy moat; mother-harness is the delivery layer,
  not the identity. Risk: "another scanner/linter" perception until the test framework lands.
- _Mother-harness-as-identity_ (the orchestrator front door): bigger surface, "set up your
  whole harness in one command" is a strong demo, aggregation can be durable IF you win the
  default-install slot. Risk: thin-wrapper / scope-balloon, competes with everyone at once,
  and the moat still has to be a component (the test stack) — so it inverts effort-vs-moat.

Recommendation: **lead leaderboard-authority, hold with the test framework, deliver via the
mother-harness/agent-install flow.** Worth writing both as competing one-pagers before
committing, because it's the real strategic fork. (Update: `zero-config-mother-harness.md`
largely collapses this fork — the mother harness is the _delivery vehicle_ for the verify+test
moat, not a curation identity.)

## See also

- `strategy-verdict.md` — the capstone: the ranked verdict (the spine + the kills) over this
  whole exploration.
- `zero-config-mother-harness.md` — the "create-agentic-app" research: be a persistent verifier
  (not a create-react-app scaffolder), compose the bundle (don't out-curate superpowers).
- `harness-state-space.md` — the thesis + the ranked bets (the ammunition these axes deploy).
- `instruction-file-linter-landscape.md` — the competitor map (why the cross-ref engine +
  testing, not rule count, is the moat) + the named threats (agnix/Codacy/AgentLint/AgentEval).
- `divergent-bets.md` — the leaderboard + cost/ROI-optimizer bets this builds on.
- `roadmap.md` — where the first move + Tier-1 bets land.
