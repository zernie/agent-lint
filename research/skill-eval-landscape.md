---
status: active
topic: eval
---

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

Stages: `lint` (no Claude) · `functional` (assertions, needs Claude) ·
`trigger` (relevant/irrelevant activation) · `regression` (vs versioned
baseline) · `report` (weighted `lint 40 + functional 40 + trigger 20` → A–F).
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
| **Skill security static scan**               | not us — `vigiles lint` verifies _references_, not security                                                                                             | delegate                       |

### Absorb-list

1. **Trigger precision — DONE.** AWS's standout idea: a too-broad skill
   description that hijacks unrelated work is as bad as one that never fires.
   `measureTriggerRate` measured recall only (fires when it should).
   `TriggerRateSpec.irrelevantPrompts` now adds the precision side →
   `report.falsePositiveRate` + `report.precision`, gated by
   `assertTriggerRate({ maxFalsePositive, minPrecision })` (`src/eval.ts`,
   `src/harness-assert.ts`).
2. **Unified skill scorecard (candidate).** A weighted roll-up
   (`lint + outcome + trigger → grade`) over the pieces we already emit. Fits the
   `audit-feedback-loop` skill. Defer until a user wants one number.
3. **Cost-efficiency verdict (candidate).** We already aggregate token usage and
   outcome deltas per arm; a "quality gain per token" classification is a thin
   layer on top of `compareArms` + the usage fields.
4. **Skill security scan — delegate, don't build.** Per the "don't reimplement"
   rule, secrets/injection/over-privileged scanning belongs in a dedicated
   scanner (`gitleaks`, `semgrep`); `enforce()` can reference its rules. vigiles's
   lint stays about _references_.

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

## 3. How labs + practitioners actually eval skills (2026-06-17 survey)

Since the AWS framework crossed the radar, a fuller survey of how the labs and the
community actually eval a SKILL.md shows that **behavioral / A/B / trigger eval of
a single skill is now table stakes** — not a novel capability. The detail matters
for positioning, so it is recorded verbatim.

### Anthropic ships behavioral eval in its own `skill-creator`

Source:
<https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md>.
Paired **with-skill / without-skill** subagents launched simultaneously to
control for drift; real artifacts saved (`with_skill/outputs/` vs
`without_skill/outputs/`); objectively-verifiable **code-graded** assertions
(`agents/grader.md` → `grading.json`); per-run `total_tokens` + `duration_ms` →
`timing.json` aggregated to pass_rate / time / tokens with **mean ± stddev +
delta**; a separate **trigger-tuning loop** (`run_loop`) splitting the eval set
60% train / 40% test, running each query 3× for a reliable trigger rate,
proposing description rewrites, selecting `best_description` by **TEST** score
(anti-overfit); an optional blind A/B "Comparator" agent. Four sub-agents:
Executor, Grader, Comparator, Analyzer.

### Anthropic — "Demystifying evals for AI agents"

Source: <https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents>.
Three grader types (code-based incl. tool-call verification; model-based; human);
**pass@k and pass^k** (verbatim); "grade what the agent produced, not the path it
took"; "Each trial should be isolated by starting from a clean environment."
Anthropic runs an internal **PreToolUse hook logging skill usage**.

### OpenAI — "Testing Agent Skills Systematically with Evals"

Source: <https://developers.openai.com/blog/eval-skills>. Evals = lightweight
end-to-end tests; behavioral checks parsed from the trace (`codex exec --json` →
inspect `command_execution` events + order); layer fast → slow; 10–20 prompts
incl. a negative-control; side-effect verification (`git status --porcelain`,
`npm run build`); Codex runs each task in a **per-task cloud sandbox**.

### Reddit (r/ClaudeAI), verified via user screenshots

- **"SkillBenchmark"** (<https://github.com/TiesPetersen/SkillBenchmark>): runs a
  skill N× with vs without (system-prompt injection), a **blind judge** scores
  both vs a rubric (the judge sees neither the task prompt nor which condition),
  and it reports **confidence intervals for both conditions + a delta with its
  own CI** (signal vs noise). Demo: the **Caveman** token-compression skill, 3
  tasks × 5 runs × 3 judges → all CIs overlap, **NO confirmed quality
  improvement**, and it 2–4× the token cost. Metered API; single-skill;
  eyeball-overlapping-CIs (no significance test). NOTE: vigiles already ships a
  Caveman compression eval at `examples/harness/skill-compression.eval.mjs`.
- **"What I learned writing an eval harness for my own SKILL.md (it caught two
  real bugs)"**: thesis — "A SKILL.md is a contract. Contracts need test
  coverage. Without an eval you don't know what your contract enforces — you know
  what you _think_ you wrote." Two layers: **Layer 1 triggering** — 30 labeled
  prompts (15 should-trigger / 15 near-miss), precision + recall on the
  description; **Layer 2 behavior** — 5–10 must-do / must-not-do scenarios,
  LLM-judged, with **judge calibration** (two judge models both run 2 weeks; if
  they agree >90% drop the more expensive one, else rewrite the rubric). The bug
  that mattered: his enforcement skill could be **talked out of its own gate**
  ("the principle was sitting in SKILL.md; it didn't constrain the behavior"); his
  fix was prose ("operationalize the refusal"). The key practical test he
  advocates: **the adversarial-gate test** — explicitly ask the agent to skip the
  gate; if it complies, the prompt isn't enforcing anything.

### Other practitioners

- **Scott Spence** (<https://scottspence.com>) — a TS harness using
  `@daytonaio/sdk` that spins a fresh Daytona sandbox per hook config, uploads
  skills + hooks + settings, runs prompts via
  `claude -p --output-format stream-json`, parses JSONL for `Skill()` tool_use
  events (a real sandboxed assembled-harness activation test, hand-rolled).
- **The dbt eval** (<https://rmoff.net>) — real `dbt build` in Docker, multiple
  judge models with measurable inter-judge variance.
- **Hamel Husain** (<https://hamel.dev>) — binary pass/fail over Likert,
  calibrate judges against human labels (TPR / TNR).
- **Phil Schmid** (<https://www.philschmid.de/testing-skills>) — 3–5 trials per
  case; success axes Outcome Viability / Directive Compliance / Operational
  Efficiency.

### Gap verdict — behavioral skill eval is table stakes; the intersection is the moat

Behavioral / A/B / trigger eval of a **SINGLE** skill with a real model is now
**table stakes** (Anthropic + OpenAI ship it; hobbyists hand-roll it) — vigiles
must **NOT** position behavioral skill eval as novel. vigiles's defensible wedges
are the **intersection** that nobody else packages:

1. **The whole assembled harness as-shipped** — hooks + settings + multiple
   surfaces firing together, not one isolated skill. Everyone hand-rolls this;
   nobody packages it.
2. **Affordability** — the subscription `claude` CLI + free deterministic tiers,
   vs everyone else's metered API (incl. `skill-creator`, which runs inside a paid
   session).
3. **Statistical rigor** — Welch significance + pass^k. The HN critique of
   Vercel's AGENTS.md-vs-skills eval ("could be noise with that sample size")
   shows the demand.
4. **The deterministic `runHook` tier** the eval-tool category ignores entirely.
5. **The eval→enforce bridge** (below).

### Two conclusions to record prominently

- **The adversarial-gate test is the highest-value behavioral test for an
  enforcement skill** — ask the agent to skip the gate, assert refusal. vigiles
  should add it as a first-class check/eval (the `notTool` / safety shape).
- **The eval→enforce bridge (vigiles-unique).** Eval tools (SkillBenchmark, the
  methodology harness, Anthropic `skill-creator`) only **MEASURE** whether a prose
  gate holds; when the adversarial test shows it caves, **vigiles also supplies
  the deterministic FIX** — the PreToolUse hook / tool-contract rail that can't be
  argued with. **Pillar 2 (test) hands off to Pillar 1 (deterministic
  constraint).** Nobody else connects measurement to enforcement.

## Bottom line

- AWS skill-eval **validates the pillar** and handed us one concrete upgrade
  (trigger precision, now shipped) plus two deferred candidates (scorecard,
  cost-Pareto). The security scan is a delegate, not a build.
- The compression tools are a **use case for `runEval`**, not a roadmap item:
  vigiles measures whether their headline numbers hold and whether they cost you
  behaviour. See [`research/eval-api-landscape.md`](eval-api-landscape.md) and
  [`research/promptfoo-deep-dive.md`](promptfoo-deep-dive.md) for the broader
  eval-field scoring this slots into.
