# Agent-skill eval landscape: AWS `sample-agent-skill-eval` (and the token-compression cluster)

Two things crossed the radar mid-June 2026 that touch the **second pillar**
(testing the harness): AWS's `sample-agent-skill-eval` — a framework that is
almost a mirror of our eval tier, specialized to skills — and a cluster of
context/token-compression tools that we should NOT build but ARE the perfect
use case for `runEval`. This note scores both against what we ship.

## 1. AWS `aws-samples/sample-agent-skill-eval`

A framework to grade an Agent Skill (against the agentskills.io standard) as
**safe, effective, reliable, cost-efficient**. Source:
<https://github.com/aws-samples/sample-agent-skill-eval>.

### What it does (its four dimensions)

| Dimension           | How it measures                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| **Safety**          | Static scan (no agent): secrets, injection surfaces, unsafe installs, over-privileged permissions |
| **Quality**         | With-skill vs without-skill comparison — does the skill actually help                             |
| **Reliability**     | Trigger precision: relevant **+ irrelevant** query testing                                        |
| **Cost efficiency** | Pareto classification — do quality gains justify the token cost                                   |

Stages: `audit` (no Claude) · `functional` (assertions, needs Claude) ·
`trigger` (relevant/irrelevant activation) · `regression` (vs versioned
baseline) · `report` (weighted `audit 40 + functional 40 + trigger 20` → A–F).
Config via `.skilleval.yaml`.

### Scored against our eval pillar

The overlap is near 1:1 — which is **validation**, not a threat: an AWS-published
framework converging on the same design is the strongest signal yet that "test
the harness" is a real category.

| AWS skill-eval                               | vigiles today                                                                                                                                           | Verdict                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Quality: with/without comparison             | `runEval` A/B arms (`examples/harness/skill-outcome.eval.mjs`) **+ Welch significance, mean±se, cost/latency/token, record/replay cache, `maxCostUsd`** | we lead                        |
| Reliability: trigger testing                 | `measureTriggerRate`                                                                                                                                    | parity (was a gap — see below) |
| Regression vs versioned baseline             | `assertNoRegression` + `eval-baseline.ts` (Welch current-vs-baseline, JUnit)                                                                            | parity/we lead                 |
| Config file                                  | `.vigilesrc.json`                                                                                                                                       | parity                         |
| **Trigger _precision_ (irrelevant queries)** | _was recall only_                                                                                                                                       | **absorbed ↓**                 |
| **Unified A–F scorecard (weighted)**         | pieces exist, no single grade                                                                                                                           | absorb candidate               |
| **Cost-efficiency Pareto verdict**           | we measure tokens + outcome A/B; no classification                                                                                                      | absorb candidate               |
| **Skill security static scan**               | not us — `vigiles audit` verifies _references_, not security                                                                                            | delegate                       |

### Absorb-list

1. **Trigger precision — DONE.** AWS's standout idea: a too-broad skill
   description that hijacks unrelated work is as bad as one that never fires.
   `measureTriggerRate` measured recall only (fires when it should).
   `TriggerRateSpec.irrelevantPrompts` now adds the precision side →
   `report.falsePositiveRate` + `report.precision`, gated by
   `assertTriggerRate({ maxFalsePositive, minPrecision })` (`src/eval.ts`,
   `src/harness-assert.ts`).
2. **Unified skill scorecard (candidate).** A weighted roll-up
   (`audit + outcome + trigger → grade`) over the pieces we already emit. Fits the
   `audit-feedback-loop` skill. Defer until a user wants one number.
3. **Cost-efficiency verdict (candidate).** We already aggregate token usage and
   outcome deltas per arm; a "quality gain per token" classification is a thin
   layer on top of `compareArms` + the usage fields.
4. **Skill security scan — delegate, don't build.** Per the "don't reimplement"
   rule, secrets/injection/over-privileged scanning belongs in a dedicated
   scanner (`gitleaks`, `semgrep`); `enforce()` can reference its rules. vigiles's
   audit stays about _references_.

## 2. The token/context-compression cluster — not ours to build, ours to _verify_

RTK (CLI-output compressor), Caveman Mode (telegraphic-output skill), Claw
Compactor (AST-aware file/transcript compression), Context Mode MCP
(SQLite-summary tool outputs), pinchtab (lighter Playwright), CodeGraph
(pre-indexed code MCP). All attack **token/context cost** — explicitly **not**
vigiles's mission (deterministic constraints + harness testing).

But every one ships a **quantitative claim** ("60–90%", "65–75%", "98%",
"half the context"). `runEval` already aggregates token usage + cost across A/B
arms with significance testing — so vigiles is the **instrument that checks the
claim and the blast radius**:

> A/B arm (optimization on/off) → token delta (did it actually save?) +
> `measureTriggerRate` (does a compressed skill still _fire_?) +
> `assertNoRegression` on the outcome (did compression _break_ anything?).

This is the on-brand framing: not "compress my context" but "**prove your
compression saved tokens without regressing behaviour**." Worked demo:
`examples/harness/skill-compression.eval.mjs` (a Caveman-style telegraphic
rewrite, two arms over one task, measuring `outputTokens` AND a `correct` fact
that must survive — the token win is reported, and a guardrail fails if it cost
correctness). CodeGraph / Context Mode / pinchtab are MCP/tooling we _load into
the harness_ (the plugin loader flags MCP surfaces), not competitors.

## Bottom line

- AWS skill-eval **validates the pillar** and handed us one concrete upgrade
  (trigger precision, now shipped) plus two deferred candidates (scorecard,
  cost-Pareto). The security scan is a delegate, not a build.
- The compression tools are a **use case for `runEval`**, not a roadmap item:
  vigiles measures whether their headline numbers hold and whether they cost you
  behaviour. See [`research/eval-api-landscape.md`](eval-api-landscape.md) and
  [`research/promptfoo-deep-dive.md`](promptfoo-deep-dive.md) for the broader
  eval-field scoring this slots into.
