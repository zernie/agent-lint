# Behavioral findings — trigger-rate probes of popular plugins

> Status: live findings log (2026-06-18). The behavioral half of the
> "find bugs in popular OSS plugins" adoption bet
> ([distribution-strategy](distribution-strategy.md) E1,
> [divergent-bets](divergent-bets.md) #9). The deterministic scan/leaderboard
> ([scan.ts](../src/scan.ts), [leaderboard.ts](../src/leaderboard.ts)) is the
> free, no-model column; this doc records what the **model-gated** column
> (`measureTriggerRate`) finds that the structural column structurally cannot.

## The gap this fills

The deterministic scan answers _"is this skill structurally sound?"_ — does it
have a name, a description ≥ 20 chars, a tool contract. It rates a skill `✓` the
moment a non-empty description exists. It **cannot** answer the question that
actually decides a skill's worth: _does that description make the model FIRE the
skill on its own use case?_ That is a property of the real selector and needs a
real model. `measureTriggerRate` measures exactly it — recall (fires on relevant
prompts) and, with `irrelevantPrompts`, precision (stays quiet on unrelated work).

This is the "sharper bug" the structural scan misses: a skill can be a perfect
green on the leaderboard and still never fire.

## Method

- **Runner:** `measureTriggerRate` (`src/eval.ts`) drives the real `claude` CLI
  on the Sonnet selector (the realistic default), authenticated by the session's
  own subscription — no metered API.
- **Target:** the real, full `obra/superpowers` plugin (14 skills) installed
  natively via `pluginDir`, so the skill competes against its real peers.
- **Cheap by construction:** `stubSkillBodies: true` — firing is a property of
  the frontmatter, decided _before_ the body loads, so each run stops at
  selection instead of executing the procedure.
- **Sample:** 10 varied prompts per side, 1 trial each. Small — read the numbers
  as **directional**, not tight estimates (see Caveats).

## Finding 1 — `superpowers:brainstorming` under-triggers (recall ≈ 20–30%)

The skill's description is maximally assertive:

> "You MUST use this before any creative work — creating features, building
> components, adding functionality, or modifying behavior."

The hypothesis going in was the opposite — that a description this broad would
**over**-fire and hijack trivial tasks. The data refuted that and surfaced a
worse bug:

| Side                               | Result                                                  |
| ---------------------------------- | ------------------------------------------------------- |
| Recall (open-ended design prompts) | **3/10 and 2/10** across two independent runs (≈20–30%) |
| Precision (mechanical edits)       | **100%** (0/10 false positives)                         |

On 10 genuinely open-ended, under-specified design prompts — _"I want to add some
kind of notification feature but I'm not sure what it should do"_, _"What should a
dashboard even include? Let's explore"_ — the brainstorming skill fired only 2–3
times. A follow-up diagnostic capturing _which_ skill won showed it is **not
losing to a competitor**: on 8/10 prompts **no skill fired at all** — the model
just answered directly.

**Diagnosis.** The imperative tone ("You MUST") does not translate into
selection. The model under-selects the skill on exactly the prompts it was
written for. The precision is excellent and the structural scan is green — only
the behavioral layer catches that the description _reads_ strong but _fires_
weak. This is the #1 documented skill-authoring pain
([skill-authoring-pains](skill-authoring-pains.md)) measured on a real,
popular plugin.

**Actionable fix for the author:** trigger-rate is a tunable surface — replace
the "MUST"-imperative framing with concrete situational cues ("when the user
describes a feature vaguely / says 'not sure what' / asks to explore options")
and re-measure. That tuning loop is what `measureTriggerRate` exists to close.

## Not run here — observed egress

The other behavioral column, observed-egress (`src/egress.ts` / `src/sandbox.ts`),
needs `bubblewrap` + `slirp4netns`, which were absent in this environment (`nft`
alone is present). It degrades honestly to "unavailable" rather than a fake pass.
Re-run where the rootless-network stack is installed (CI's `e2e` job).

## Caveats — read before quoting a number

- **n = 10, 1 trial.** The 20% vs 30% spread between two runs is sampling noise
  on a 0/1 outcome; the _direction_ (most clearly-brainstorming prompts don't
  fire) is the reliable signal, not the exact rate. Tighten with more trials and
  `assertTriggerRate` before publishing a hard figure.
- **Model-dependent.** Recall is measured on Sonnet; a different selector shifts
  it. The model is part of the measurement (it lives in the spec, not an env).
- **Prompt-set-dependent.** Recall is an _upper_ bound on real recall and the
  false-positive rate a _lower_ bound — both only as good as the prompt sets.

## Reproduce

```bash
git clone --depth 1 https://github.com/obra/superpowers /tmp/superpowers
npm run build
# point a measureTriggerRate eval at /tmp/superpowers with the prompt sets above
npx vigiles eval your-probe.eval.mjs
```

The probe is a ~40-line `measureTriggerRate` call (`pluginDir`,
`stubSkillBodies`, `prompts`, `irrelevantPrompts`, `fired: t =>
skillResolved(t, "superpowers:brainstorming")`); the canonical shape is
[`examples/harness/skill-trigger-rate.eval.mjs`](../examples/harness/skill-trigger-rate.eval.mjs).

## See also

- [distribution-strategy](distribution-strategy.md) — E1: run scan on popular
  repos and publish findings; this is the behavioral half.
- [divergent-bets](divergent-bets.md) — #9 plugin/skill leaderboard; the
  behavioral columns (trigger-rate/egress) stack on the structural score.
- [skill-authoring-pains](skill-authoring-pains.md) — triggering as the #1 pain.
- [eval-coverage-and-isolation](eval-coverage-and-isolation.md) — where the
  model-gated tier sits in the coverage model.
