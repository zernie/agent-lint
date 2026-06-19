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

## Finding 2 — superpowers recall sweep: concrete skills fire, exploratory ones don't

Run via `vigiles scan <superpowers> --trigger` (the behavioral column) across the
six **opening-move** skills it's fair to test from a cold prompt — 10 prompts
each, 1 trial. The state-dependent skills (verification-before-completion,
receiving/requesting-code-review, finishing-a-development-branch,
executing-plans, using-git-worktrees, using-superpowers) were left **unmeasured**
on purpose: their trigger is a mid-session state a cold prompt can't reproduce, so
a low number there would be an artifact, not a bug (see the empty-context section).

| Skill                       | Recall (10) |     |
| --------------------------- | ----------- | --- |
| test-driven-development     | **100%**    | ✓   |
| writing-skills              | **100%**    | ✓   |
| writing-plans               | 40%         | ⚠   |
| brainstorming               | 10%         | ⚠   |
| systematic-debugging        | 10%         | ⚠   |
| dispatching-parallel-agents | 0%          | ⚠   |

**The pattern is the finding.** Skills that wrap a **concrete imperative task**
("write X test-first", "write a skill that…") fire reliably (100%). Skills that
gate **exploratory or orchestration** work — brainstorming, debugging,
fan-out — barely fire from the natural phrasing of their own use case. The
biggest surprise is `systematic-debugging` at 10%: prompts like "the app crashes
intermittently — track it down" overwhelmingly did NOT select it; the model just
started debugging directly. Every one of these is structurally green — the column
is the only thing that sees it.

Caveats stack with Finding 1: n=10/1-trial, **directional** (brainstorming read
10% here vs 20–30% earlier — same noise band); recall is an upper bound on the
real rate (only as good as the prompt set). The value is the rank-ordering and
the 0–10% vs 100% gap, not the second digit.

## Finding 3 — fleytman/haretrail: structurally clean, behavioral risks in the descriptions

A Codex/`AGENTS.md` skill pack (8 skills: task, research, summary, postmortem,
debrief, lessons, doc-write, contribution-log). `vigiles scan` (auto-detected
`codex`): **no structural issues** — every skill has a description, no agents /
hooks / broken refs. 8 untested surfaces (ships no tests — typical).

The structural pass is clean; the **description-level** read surfaces behavioral
risks the trigger column would quantify:

- **Descriptions are in Russian.** Selection is driven by the description, so on
  **English** prompts these may under-fire — a real cross-language trigger risk
  (or fine, if the audience is Russian-speaking; worth measuring, not assuming).
  **Now auto-flagged:** `scan` detects a non-Latin description (deterministic
  Unicode-script check) and prints "cross-language trigger risk" per skill — all 8
  haretrail skills trip it. Cheap/deterministic detection in `scan`; the actual
  under-fire gap is the model-gated `--trigger` measurement.
- **Literal `{data-repo}` placeholder** appears unsubstituted in several
  descriptions — harmless for selection, but a templating smell.
- **Overlapping domains** → precision/collision risk: debrief vs lessons vs
  postmortem all touch retrospective/lessons content; task vs research both create
  task-folders. Which one fires is exactly a precision question.
- **Good practice to keep:** debrief and lessons enumerate concrete trigger
  phrases, and postmortem ships a negative cue ("Не использовать для обычных
  session debriefs") — explicit recall + precision steering.

### Finding 3a — haretrail behavioral probe (native Codex): cross-language risk REFUTED

Run **natively on real `codex exec`** (the first native-Codex eval — see
`research/codex-prototype-findings.md`), via
`codexEvalRunner` → `parseCodexEvalRun` → `codexSkillFired`, with haretrail's
skills installed (bodies stubbed to bound cost, Russian descriptions kept). Three
skills × **Russian vs English** prompts × 3 each:

| skill    | RU recall | EN recall |
| -------- | --------- | --------- |
| research | 3/3       | **3/3**   |
| summary  | 3/3       | **3/3**   |
| debrief  | 3/3       | **2/3**   |

**The cross-language trigger risk does NOT materialize.** The Russian-described
skills fire reliably on **English** prompts — the model handles the
RU-description / EN-prompt case fine. So the deterministic flag ("non-Latin
description → cross-language risk") was a correct RISK flag, and the model-gated
measurement CLEARS it for these skills. The discipline worked exactly as designed:
scan flags the risk deterministically, the eval confirms or refutes. **Do not
recommend "switch to English" — the data says it's unnecessary here.** (The single
`debrief/en` miss also confirms `codexSkillFired` is discriminating, not a blanket
true: it only fires when that skill's `SKILL.md` is actually read.)

What this leaves as haretrail's real (minor) issues: the cosmetic `{data-repo}`
placeholder, the untested surfaces, and an UNMEASURED precision/overlap question
(debrief vs lessons vs postmortem; task vs research) — recall is healthy, precision
across the overlapping cluster wasn't probed here.

### Finding 3b — precision probe BLOCKED by a usage limit, which caught a tooling bug

Attempted the precision/collision probe (does a `debrief` prompt wrongly fire
`lessons`/`postmortem`, etc.) and got **all-miss** — which turned out to be a Codex
**usage limit** ("You've hit your usage limit… try again at 8:37 AM"), not real
misses. So the precision question is still **unmeasured** (retry after the quota
resets).

The dogfood win: this exposed a real robustness bug — `parseCodexEvalRun` left an
errored/rate-limited turn as an empty trace, so `codexSkillFired` read it as a
clean recall-0 **miss**. A rate-limit silently corrupting trigger-rate as false
negatives is exactly the kind of bug that invalidates a whole run. **Fixed:**
`codexRunError(out)` detects the `error` / `turn.failed` event (incl. usage
limits); an errored turn must be skipped/retried, never scored as a miss (the
Codex analog of the Claude path's `isRateLimited` backoff). Increment 3's dispatch
consults it so a quota hit doesn't tank a Codex eval.

**Update (2026-06-19, increment 3 live re-attempt).** Re-ran the same cluster probe
through the SHIPPED public path — `vigiles scan --trigger --harness=codex
--prompts=…` — now that the `{ evalDriver }` dispatch is wired. The quota is still
capped (same "try again at 8:37 AM"), so the recall/precision **numbers** remain
unmeasured. But the run **live-validated increment 3's plumbing against the real
binary**: the CLI dispatched through the Codex `EvalDriver`, spawned real
`codex exec --json`, and `codexRunError` correctly EXCLUDED every errored trial —
the report shows `debrief — recall 0% (0 runs)` and `postmortem — recall 0% (0
runs)` (`n=0`, i.e. excluded, NOT scored as misses), exactly the behaviour 3b's fix
specifies. The diversity gate also fired live (it rejected a too-similar
`irrelevant` pair for `lessons`). So the only thing still gated on quota is
non-errored trials to get actual numbers — a quota wall, not a code gap. The
eval-ready cluster prompt set is saved at
`research/fixtures/haretrail-cluster.json` for the retry.

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

Re-run via the new `fixture` + `concurrency` (two `measureTriggerRate` calls,
install-once, parallel — no `measure()` loop, ~90s total):

| Arm                     | Recall (10 runs) |
| ----------------------- | ---------------- |
| EMPTY cwd               | 0.00             |
| SEEDED repo (`fixture`) | 0.20             |

**Verdict: inconclusive at this N — and that's the real lesson.** The +20pt delta
looks like movement, but empty-context recall itself measured **0.0 / 0.2 / 0.3
across three independent 10-run samples** — the seeded 0.20 sits squarely inside
that noise band (a 0/10 vs 2/10 split is not significant, Fisher p≈0.5). So a
seeded repo does **not** demonstrably move brainstorming's recall — consistent
with the prediction (it's an opening-move skill, keyed off the request, not the
repo). The sharper takeaway is statistical: **at n=10, run-to-run noise (±~30pts)
swamps a candidate 20pt effect.** Resolving an effect that size needs ~100 runs
(see the CI table in the cost discussion) — exactly why the default-`n` question
matters. The `fixture` capability is the right primitive; the way to use it is on
a state-dependent skill (where the effect should be large) with enough trials to
clear the noise floor.

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
   `TriggerRateSpec`.** _Shipped (`fixture` + `concurrency`)._ `measure()`/`runEval`
   already took `fixture`; trigger-rate now does too, so a state-dependent skill
   can be seeded into the condition it claims to fire on — parity with the
   user-injected-context tools. (Prior-turn / conversation history is the
   remaining half, still open.)
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

- [plugin-structural-findings](plugin-structural-findings.md) — the deterministic
  half (structural sweep of real marketplaces): the public disclosures list + the
  scanner false positives the sweep found and fixed.
- [distribution-strategy](distribution-strategy.md) — E1: run scan on popular
  repos and publish findings; this is the behavioral half.
- [divergent-bets](divergent-bets.md) — #9 plugin/skill leaderboard; the
  behavioral columns (trigger-rate/egress) stack on the structural score.
- [skill-authoring-pains](skill-authoring-pains.md) — triggering as the #1 pain.
- [eval-coverage-and-isolation](eval-coverage-and-isolation.md) — where the
  model-gated tier sits in the coverage model.
