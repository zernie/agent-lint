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

## Is "empty context" a valid condition?

Each trigger run gets a **fresh empty cwd, no prior conversation turns, no fixture
files** — just the system prompt + the 14 skill descriptions + one user prompt
(confirmed: `TriggerRateSpec` has no `fixture`/history field; the runner mkdtemps
an empty dir). Two things to know about that.

**It's the field standard, not a shortcut.** AWS's `sample-agent-skill-eval` —
the reference vigiles modeled trigger-rate on
([skill-eval-landscape](skill-eval-landscape.md)) — tests activation with single
relevant/irrelevant queries in a fresh context. A cold single prompt is what
**isolates the description→activation mapping**: context is a confound, and empty
context controls it, so the number reflects the _description's_ trigger quality
(the thing an author tunes), not leftover state.

**It's faithful for opening-move skills, biased-low for state-dependent ones.**

| Skill's real trigger                                                        | Empty-context test        | Why                                                       |
| --------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------- |
| Start-of-task (describe a feature, ask to debug)                            | **Faithful**              | the opening prompt _is_ the real condition                |
| Mid-session state (about to claim done; a review arrived; repo in conflict) | **Biased low — artifact** | a cold prompt in an empty repo can't reproduce that state |

`brainstorming` is an opening-move skill by its own text ("before any creative
work"), so its 20–30% recall is a real signal, not an empty-context artifact. A
"before you claim complete" skill, by contrast, would show ~0% from a cold prompt
— which is why that probe was deliberately skipped.

### Sensitivity check — does a non-empty context move the number?

Same 10 brainstorming prompts, two arms — empty cwd vs a seeded Node project
(`package.json` + `src/` + README), 2 trials/prompt (40 runs, ≈$0.75
API-equiv / $0 on the sub):

> _Deferred — the 40-run probe ran serially (each `measure()` call re-stubs +
> installs the plugin) and overran the wall-clock budget here. The cheap fix is
> bounded concurrency; expectation is still little movement, since brainstorming
> keys off the request, not the repo. The probe lives at
> `examples/harness/` shape; re-run with `concurrency` to get the delta._

### Landscape — how others handle context

| Tool                      | Default                          | Context handling                                                                                                                                                           |
| ------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS skill-eval            | single relevant/irrelevant query | none — pure query activation (same as vigiles trigger-rate)                                                                                                                |
| promptfoo                 | single prompt + assertions       | context is **user-injected** (`vars`/scenarios); multi-turn via `beforeEach`/`afterEach` hooks — opt-in, never auto-seeded ([promptfoo-deep-dive](promptfoo-deep-dive.md)) |
| DeepEval                  | single test case                 | `ConversationalTestCase` + user-supplied RAG context                                                                                                                       |
| Inspect / SWE-bench-class | seeded sandbox + real repo       | the only class that seeds filesystem state — because the _task_ is stateful, not to test activation                                                                        |

The pattern across the field: **nobody auto-reconstructs a skill's mid-session
trigger state.** Query tools push context onto the user; sandbox harnesses seed a
repo only when the task demands it. Empty context is the norm; "make it non-empty"
means "the user supplies it."

## Idea — auto-apply known context for state-dependent skills

A roadmap idea this probe surfaced. The empty-context weakness (state-dependent
skills under-measured) is shared by the whole query-based field, AWS included. The
field's only fix is _manual_ context injection. vigiles could go further and make
the accurate number the DEFAULT:

1. **Enabling primitive — add `fixture` / a prior-turn field to
   `TriggerRateSpec`.** `measure()`/`runEval` already take `fixture`; trigger-rate
   doesn't (this probe had to drop to `measure()` to seed a repo). This alone
   reaches parity with the user-injected-context tools.
2. **The differentiator — auto-derive the context from the skill's declared
   trigger.** A description already encodes its trigger _state_: "when about to
   claim work complete", "after a code review arrives", "starting feature work
   needing isolation". Match those against a small **curated preset library of
   known contexts** — a seeded repo, a "work just finished" prior turn, a "review
   received" message, an "in a dirty git tree" fixture — and apply the matching
   preset automatically before measuring. The skill is then tested _in the state
   it claims to trigger on_, so the recall number is honest instead of an artifact
   of the cold start.

Why it's defensible (and where the line is): this is preset SELECTION on explicit
cues, **not** NLP that synthesizes a scenario from prose — that stays the
undecidable-prose trap vigiles refuses
([reference-verification-limits](reference-verification-limits.md)). Curated,
opt-in, matched on declared trigger phrases; a skill with no recognized cue falls
back to the cold-prompt default (honest about what it can't seed). Net position:
query-based like AWS **+** state-seeding like Inspect **+** automatic from the
skill's own contract — which none of the three do at the activation layer.

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
