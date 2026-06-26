# The harness checkup ("Lighthouse mode") + the casual-vs-power lane decision

> What this doc is: the decision record for a product question raised from CC-user
> field feedback (2026-06-26) — _most Claude Code users are NOT power users; they
> won't author tests/evals, but they'd happily get free info about their harness._
> Should vigiles ship a zero-config "Lighthouse for your harness" audit, predefined
> evals that need no authoring, and which lane (casual-free / power-test / both)?
> Decision below, then the synthesis, then the external-research appendix.
> Feeds `pre-release-focus.md` (the VERIFY-mass / MEASURE-depth thesis) and
> `measurement-authority.md`.

## The decision

**Both lanes — but ordered as ONE funnel, not two products, with strict layer
separation.** The free zero-config audit is the front door (acquisition); authored
tests/evals are the depth casual users _discover_, never a prerequisite they hit.

```
Layer 0 — FREE, zero-config, no key:  `vigiles scan`
   structural health + 0–100 score + A–F grade + the score-explainer fix list
   + PREDEFINED batteries (no authoring): hook disaster-battery, skill over-fire/collision
        ↓ opt-in (still zero-authoring, runs on the user's own sub)
Layer 1 — predefined model-gated evals: auto-prompted trigger-rate / over-fire
        ↓ opt-in (one command: `vigiles scaffold-test`)
Layer 2 — AUTHORED tests/evals: `test` / `eval` / measureTriggerRate  (power users / companies)
```

This is the Lighthouse / ESLint / Snyk model: everyone runs the free score; the
depth (CI budgets, custom checks, authored tests) is for teams. The mistake to
avoid is leading any casual surface with "write evals for your skills" (niche)
instead of "get a free harness health grade" (mass).

## Why this is mostly PACKAGING, not a new build

vigiles already ships ~80% of the checkup:

- `scan` (`src/scan.ts`) — zero-config, no-key, deterministic report of what a
  repo/plugin ships and what's broken.
- leaderboard (`src/leaderboard.ts`) — 0–100 structural-health score + A–F grade.
- score-explainer (`src/score-explainer.ts`) — the WHY + a fix per issue (this is
  the Lighthouse "Opportunities" analog — what makes a canned check feel custom).
- `guardrail-check.ts` `DISASTER_CATALOG` — the hook **disaster battery** ("does
  your safety hook actually block `git push -f` / `rm -rf` / `curl|sh` / secret
  reads?"). Already a predefined, deterministic, zero-authoring check.
- `description-overlap.ts` — skill over-fire / collision, deterministic, free.
- `measureTriggerRate` — auto-promptable over the user's EXISTING skills (Layer 1,
  no authoring; model-gated, runs on their sub).
- `scaffold-test` — the one-command bridge from a flagged issue to an authored test.

So the work is: (1) surface the battery + over-fire checks as NAMED audit results
in `scan` (not buried in raw output), (2) frame `scan` as "your harness health
report", (3) make the score + the scariest true finding the headline on every
casual surface (README, `init` output, the GH Action PR comment), (4) a badge.

NOT a new verb — per `cohesive-cli-surface`, the checkup IS `scan` (+ flags/output),
not a sibling `doctor`/`checkup` command.

## What converts casual users (from the external research)

- **A concrete, shame-inducing number vs a familiar benchmark in <60s, before any
  commitment.** Lighthouse's 0–100 isn't new info — it's a defensible number to
  show a manager + a shareable artifact + a priority queue. vigiles's grade + the
  "2/7 disasters get through" line is exactly that.
- **The free tier must be the REAL tool in the real workflow, never a teaser.**
  Snyk/SonarCloud/Socket give full diagnostic value free (CI, PR decoration); that
  is what converts to paid depth. A partial result ("upgrade to see the rest")
  destroys trust — the canonical PLG anti-pattern.
- **Specificity beats a score.** Knip converts with no score at all — just a
  precise, actionable list. `npm audit` names the CVE, not "you may have issues."
  The score-explainer naming the exact dangerous command that slipped through is
  the high-signal move.
- **Progressive DEPTH, not progressive pricing** (ESLint recommended→custom, TS
  loose→strict). The casual path must never require config/login before output.
- **The badge is the distribution flywheel** (Codecov coverage %): ambient
  advertising that pulls in the next developer.

## Pitfalls (hard rules)

1. **Don't tease the battery** — the disaster-battery + over-fire checks are fully
   free with full output. No "upgrade to see the rest."
2. **Don't cry wolf** — the structural group stays FP-safe (a clean plugin stays
   green). One false positive on a famous plugin and casual users dismiss the
   score forever. (Ties directly to the launch FP-sweep: `scripts/fp-sweep.sh`.)
3. **Keep power concepts off the casual path** — `scan` output must not mention
   `vigiles/hook`, typed specs, or `.harness.mjs` until the user has engaged Layer
   2. The score + fix list is the interface; the typed machinery is the impl.
4. **Invest in actionability** — "blocks 2/7 of the disaster battery, `git push -f`
   slips through" (high-signal), never "consider adding more rules" (noise).

## How this maps to the launch (it REINFORCES the plan)

- The ecosystem-benchmark (measuring hyped skills at scale) is the PUBLIC version
  of this same bet — free, zero-effort measurement as the wedge. Same idea pointed
  two ways: your-harness checkup vs the-ecosystem leaderboard.
- It sharpens the README's mass on-ramp: lead casual surfaces with "free harness
  health report + the one scary true finding," not the instrument framing.
- Companies are the monetizable depth (they WILL author tests — discipline +
  stakes); casual users are the funnel that feeds them. Not pick-one.

## Open / next (post-decision)

- Decide the exact `scan` UX: where the score + battery land in default output vs a
  `--full`/`--report` flag; the badge URL/markdown.
- Auto-prompt generation for the Layer-1 over-fire check (reuse `measureTriggerRate`
  + a deterministic prompt synthesizer) — the one genuinely new-ish piece.
- Monetization/company angle (CI policy, org views, history/trending) — post-launch.

## Appendix — external research (preserve; sources)

Patterns + named examples the synthesis draws on:

- **Lighthouse** — zero-install, 0–100 per category, ranked "Opportunities" with
  estimated ms saved + the exact element. Score = social currency + manager-facing
  artifact + priority queue.
- **`npm audit`** — ships WITH npm (the audit IS the tool, not a separate install);
  count + severity in one line; names the CVE (specificity = signal).
- **Snyk** — free `snyk test` richer than `npm audit` (license, fix PRs, severity);
  free scan is the growth engine; CI/PR/multi-repo is the enterprise upsell.
- **SonarQube/SonarCloud** — free tier does REAL branch analysis + PR decoration
  (workflow features, not a gimped demo); enterprise = taint analysis, portfolio,
  custom gates (additive, casual path untouched).
- **Socket.dev** — free supply-chain behavior scan; the insight itself ("this
  package added `fs.writeFile` in v2.0.1") is the hook.
- **Knip** — `npx knip`, zero config, no score — just a precise actionable list;
  converts on specificity alone (the score matters less than the "now what").
- **ESLint / TypeScript** — Layer 0 zero-config → Layer 1 recommended preset (where
  most non-power users live permanently; must be FP-safe) → Layer 2 custom/CI. The
  failure mode is collapsing 0 and 2 (config wall before any output).
- **Codecov / Sentry** — free = real signal (coverage/traces); paid = team mgmt,
  SLO, retention. The README badge is the ambient-ad flywheel.
- **PLG data** — bottom-up individual→enterprise is the consistently validated
  dev-tool acquisition model; the winners' free tier is genuine workflow value, not
  a demo; login-wall-before-output loses casual users.

Sources: Google Lighthouse (Chrome for Developers) · Snyk Code free SAST blog ·
NearForm "comparing npm audit with Snyk" · SonarQube free-tier blog · Lighthouse
performance-scoring docs · daily.dev PLG-for-dev-tools · saasmag PLG-2026 ·
Product Marketing Alliance "open source to PLG" · pkgpulse Knip-vs-depcheck ·
webhint axe hint · Extruct "State of PLG 2025".
