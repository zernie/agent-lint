---
status: superseded
topic: positioning
---

# Strategy verdict — which directions are genuinely best

> Status: decision synthesis (2026-06-19). The capstone over a long strategy exploration
> (`positioning-funnel.md`, `harness-state-space.md`, `zero-config-mother-harness.md`,
> `shareable-presets.md`, `instruction-file-linter-landscape.md`, `lightweight-spec-authoring.md`).
> Not a survey — a ranked verdict, with explicit kills. Opinionated on purpose.

> **Superseded (same day) by `measurement-authority.md`.** A later critique landed: verify/
> test/security is _hygiene_ (low virality, and it reinvents agnix/superpowers). The spine
> below flips — the headline becomes **measurement & optimization (offense: "what makes your
> agent better")**, and verify/test/security demotes to substrate. Read this for the
> kills/ammunition, which still hold; read `measurement-authority.md` for the current top of
> funnel.

## The one-sentence verdict

**Be the verify-and-test layer for agent harnesses: go viral with a public security
leaderboard, deliver via a zero-config "safe all-in-one" installer, and hold the moat with
the cross-harness testing stack that runs on the user's own subscription.** Everything else is
ammunition for that spine or a later bet.

## The spine (the only three that matter, as one funnel)

These aren't competing options — they're the stages of one machine. Build them as a unit.

1. **Viral wedge — the public harness leaderboard + the trifecta security headline.** Cheapest
   act (runs on existing `scan`/`scoreReport` + one deterministic check), press-worthy ("N% of
   the top 200 Claude plugins can exfiltrate your secrets, caught before they run"), and it
   establishes vigiles as **the authority on harness health.** It also demonstrates the moat
   tech (deterministic cross-ref nobody else does) _while_ going viral.
2. **Delivery — the zero-config "safe all-in-one" installer.** One command sets up an
   opinionated stack (lint + gating hooks + sandbox + rulesync + a curated skill bundle
   _composed by reference_) **and verifies every ref resolves + writes a passing trigger-rate
   eval + runs the trifecta check on the bundle.** The only all-in-one that proves what it
   installed is wired right, fires, and is safe. Must be a **persistent tool, not a scaffolder**
   (the create-react-app lesson), and **compose, not out-curate** superpowers.
3. **Moat — the cross-harness testing stack.** The one thing that is genuinely uncontested,
   hard to copy, sub-affordable (runs on the user's Claude subscription, not metered API), works
   across Claude Code _and_ Codex, and **grows as agents author more** (a probabilistic author's
   output must be verified behaviorally). The leaderboard says "your harness is broken"; only
   vigiles proves it's fixed.

**Why this is the genuinely best shape:** the viral axis is cheap and proven in this niche; the
moat axis is the only durable one; the delivery axis resolves the mother-harness fork (it's the
on-ramp to the moat, not a curation identity). Each stage feeds the next.

## Ammunition (build because the spine needs it — not as ends)

- **Capability-graph / lethal-trifecta + capability-minimization** — generates the leaderboard's
  scary number; `warn` + `vigiles:allow-trifecta` sign-off.
- **Lint-as-hook + agent-consumable JSON** — agent-native delivery; FP-calibration becomes a
  _safety_ property when an agent acts on every finding.
- **AST-ify markdown extraction** — parity with agnix (already AST-based); the surface agents
  emit. Catch-up, not polish.
- **Make-illegal-states-unrepresentable (schema-as-sum-types)** — the product principle that
  turns each silent-failure bug into a check; the foundation the verify layer queries.

## Later / narrower (real, but not now)

- **Consistency/contradiction check class** (instruction-vs-config/hook/file) — novel + deterministic;
  the next check family after the trifecta.
- **Effect system: declared-vs-observed** — generalizes the egress work; the flagship's principle.
- **Shareable typed presets** — high ceiling, but team/monorepo-tier with a narrow early audience;
  the durable home for the typed spec, not a day-one wedge.
- **Lightweight `doc()`/`dir()` authoring** — fixes "the spec is too heavy," but it's an authoring
  ergonomic, not a moat. Ship it quietly to keep the spec usable.

## Kills / deprioritize (don't relitigate)

- **Templates as the identity** — replicable, off the market's preferred surface; claudelint/cclint
  already do "required sections." Ship `doc()` quietly; never pitch it as the differentiator.
- **The linter-rule-catalog check as the headline** — real but narrow/low-incidence (few files cite
  rule IDs); one member of the cross-ref family, not the story.
- **Cold OSS-PR spam** — 2026 backlash makes unsolicited automated PRs presumptively unwelcome.
  Invited/pull-based only; security disclosure is the one cold exception.
- **Registry/marketplace** — cold-start + Anthropic owns the official one.
- **Security-vendor repositioning** — security is a viral _wedge_, not the identity (don't run a SOC).
- **Curating a 30-skill bundle to rival superpowers (233k★)** — compose by reference, never author/vendor.
- **Pure "totality of hooks"** — undecidable for arbitrary scripts; do matcher-coverage instead.

## The meta-risk, stated plainly

We have generated a great deal of strategy and **shipped nothing this session.** The single
biggest risk now is **focus** (doing all of the above) and **analysis-without-signal**. The
discipline:

- **The spine is the whole plan.** Everything off the spine is ammunition that serves it or gets
  cut. If a feature request doesn't make the leaderboard scarier, the installer safer, or the
  test stack stronger, it waits.
- **Ship the cheapest viral artifact next, to get real signal** — the leaderboard, on the
  existing `scan`. Strategy is now ahead of evidence; the next unit of value is _reality_, not
  another doc. Build the leaderboard, publish one scary-but-true number, watch what happens.

## See also

- `positioning-funnel.md` — the moat-axes analysis behind the spine.
- `zero-config-mother-harness.md` — the delivery axis (persistent verifier, compose not curate).
- `harness-state-space.md` — the thesis + the ranked check bets (the ammunition).
- `instruction-file-linter-landscape.md` — the competitor map that grounds the moat claims.
- `roadmap.md` — where the spine's first moves land in execution order.
