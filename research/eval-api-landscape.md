# Eval-API landscape — the field, summarized and compared against vigiles

Research capturing how vigiles' eval API (`src/eval.ts`, `src/harness-assert.ts`,
`src/judge.ts`) stacks up against the LLM/agent eval ecosystem, and the roadmap
that follows. Companion to `research/harness-testing.md` (the three-tier design)
and `docs/harness-testing.md` (the guide).

## Framing: we are not a model/prompt eval framework

The single most important distinction for any comparison: **the unit under test
in a vigiles eval is the _harness_ — hooks, skills, settings — A/B'd as arms,
with agent behaviour as the outcome.** That is a different question from what most
eval tooling answers:

- **Model/prompt quality on a dataset** — promptfoo, OpenAI Evals, lm-eval-harness, HELM.
- **Agent-app trajectory quality** — DeepEval, LangSmith, Inspect, Arize Phoenix.
- **Observability / tracing of production traffic** — Langfuse, W&B Weave, Phoenix.
- **Hosted experiment platforms** — Braintrust, LangSmith.

vigiles overlaps the _agentic_ tools on trajectory assertions, but its A/B-of-the-
harness framing is unique. So we benchmark on the dimensions that decide whether a
_harness-eval_ API is world-class — not on dataset-benchmark features (leaderboards,
HELM-style scenario suites) we deliberately do not want.

## The field, summarized (capability profiles)

Each profile is "what it is + what it's strong/weak at," kept to the axes that
matter for harness evals.

### promptfoo

Config-first (YAML) prompt/provider matrix runner with a CLI and local web view.
Strong: zero-SaaS, CI-friendly, concurrency, result caching, assertion library
(`contains`, `llm-rubric`, `javascript`), red-team add-on. Weak for us: the matrix
is prompts×providers, not _harness arms_; no statistical spread/significance; no
agent-trajectory/tool assertions; reliability is pass-rate, not pass^k.

### DeepEval

pytest-native agentic eval. Strong: a rich metric library (G-Eval, faithfulness,
answer-relevancy, hallucination, tool-correctness, task-completion), conversation
simulation, dataset management, pytest integration. Weak for us: no controlled
A/B-of-the-harness; statistics are pass/threshold, not CI/se; judge-heavy (cost);
Python-only (we are TS/Node, runner-agnostic).

### Braintrust

Hosted experiment + dataset + scorer platform with a TS/Python SDK. Strong:
dataset versioning, experiment diffing, scorer library, dashboards, caching,
trial summaries. Weak for us: SaaS (not zero-dep/self-hostable by default); A/B is
experiment-vs-experiment, not harness-arm-vs-arm; statistics are mostly mean/CI in
the UI, not a programmable significance gate.

### Inspect (UK AISI)

Serious open agentic-eval framework (tasks, solvers, scorers, epochs). Strong:
epochs + reducers (a pass^k-like reliability story), stderr on metrics, tool/agent
support, sandboxing, no SaaS. Closest in _seriousness_ to us. Weak for us: oriented
at benchmarking a model/agent on a dataset, not A/B-ing a harness change; Python;
heavier conceptual surface.

### LangSmith

Hosted tracing + eval for LangChain-and-beyond. Strong: dataset/experiment
management, trajectory eval, online eval, dashboards. Weak for us: SaaS-centric,
ecosystem-coupled, no harness-A/B, statistics in-UI not programmable.

### OpenAI Evals

Registry of dataset-based model evals (templates + custom). Strong: simple
dataset+grader model, model-graded templates. Weak for us: dataset-benchmark
shaped, no agent harness, no A/B, minimal stats.

### Ragas / Langfuse / Weave / Phoenix

RAG-metric library (Ragas) and three observability/tracing platforms with eval
add-ons. Strong: production trace capture, metric libraries, dashboards. Orthogonal
to us: they observe/score traffic; we run controlled harness experiments.

### lm-eval-harness / HELM

Academic benchmark harnesses (multiple-choice/generation tasks, leaderboards).
Out of scope: explicitly the thing vigiles does _not_ do.

## Scorecard

| Dimension                                                 | vigiles                | promptfoo        | DeepEval   | Braintrust | Inspect          |
| --------------------------------------------------------- | ---------------------- | ---------------- | ---------- | ---------- | ---------------- |
| Harness-as-unit-under-test (A/B arms)                     | **✓ native**           | partial (matrix) | ✗          | partial    | partial          |
| pass^k reliability (τ-bench)                              | **✓**                  | ✗                | ✗          | ✗          | partial (epochs) |
| Statistical spread (std/se)                               | **✓**                  | ✗                | ✗          | partial    | ✓ (stderr)       |
| Significance test (CI / p-value)                          | ✗                      | ✗                | ✗          | partial    | partial          |
| Tool / trajectory assertions                              | **✓ strong**           | partial          | ✓          | ✓          | ✓                |
| LLM-judge depth (G-Eval/pairwise/multi-criteria)          | minimal                | ✓                | **✓✓**     | ✓          | ✓                |
| Dataset / scenario primitive                              | ✗                      | ✓✓               | ✓✓         | ✓✓         | ✓✓               |
| Cost / latency / token metrics                            | ✗                      | ✓                | ✓          | ✓          | ✓                |
| Concurrency                                               | ✗ (sequential + sleep) | ✓                | ✓          | ✓          | ✓                |
| Caching / record-replay                                   | ✗ (eval tier)          | ✓                | partial    | ✓          | partial          |
| Persisted reports / regression gating                     | ✗ (console string)     | ✓                | partial    | ✓✓         | ✓                |
| Runner-agnostic lib (node/vitest/jest), zero-dep, no SaaS | **✓✓ unique**          | ✓ (CLI)          | ✓ (pytest) | ✗ (SaaS)   | ✓                |

(Profiles reflect the ecosystem as understood mid-2026; treat specific competitor
features as directional, not contractual. The `vigiles` column is the state **at
analysis time** — the cost/latency, concurrency, caching, and significance-test
gaps below have since been closed; see **Status** for what shipped.)

## What vigiles already does at a world-class level

- **A/B arms with the harness as the variable.** No other tool lets you ask
  "plugin on vs off — did agent behaviour actually move?" as a first-class
  experiment. This is the moat of the testing pillar.
- **pass^k** (`MetricStat.passK`) — "worked on _every_ trial," not "on average."
  Rare outside τ-bench; the reliability question a non-deterministic harness needs.
- **se/std on every metric** + `assertImproves(..., { by: se })` — most OSS eval
  tools report only a pass-rate.
- **Unified `Trace` predicates** (`usedTool` / `toolSequence` / `toolCount` /
  `toolUsedWith` / `hookFired` / `outputContains` / `requestContains`) shared
  verbatim across all three tiers — strong agentic coverage, cleanly factored
  (bare predicate + throwing `assert*` + matcher, never one dual-purpose fn).
- **Injectable `AgentRunner`** (runtime-agnostic) + **zero-dep, self-hostable,
  any test runner**. Braintrust/LangSmith cannot say that.

## Gaps that keep it from world-class

1. **Statistics stop at se.** `se` is reported but the user hand-feeds it into
   `by`. No two-proportion / bootstrap CI, no power analysis ("trials to detect a
   10-pt lift?"), no paired/blocked design — even though arms are the natural home
   for a paired comparison.
2. **No cost/latency/token capture, no concurrency, no caching.** The stream-json
   `result` event already carries `total_cost_usd` / `usage` / `duration_ms`; we
   drop it. Runs are sequential with `sleep`. Every iteration re-calls the model
   even when only `measure()` changed. This is the #1 practical objection
   ("real model → real cost + slow").
3. **No persisted/structured output or regression gating.** `formatEvalReport`
   returns a string. No JSON/JUnit/SARIF, no committed baseline, no "this PR
   regressed arm X beyond noise" gate, no PR comparison comment.
4. **Thin judge, no dataset/scorer primitive.** `judge` is a single call (no
   multi-criteria/G-Eval, pairwise, or calibration). `prompts` exist only inside
   `measureTriggerRate`, so the API has three overlapping shapes (`arms`+`measure`,
   `prompts`+`fired`, `judge`) instead of one.

## Strategic directions (and the chosen sequence)

Four coherent theses of "world-class," each a different bet:

- **A — Statistical rigor.** Significance verdict (two-proportion / bootstrap CI),
  power analysis (`trialsForEffect`), paired/blocked design across scenarios
  (the realistic common-random-numbers analog — the Anthropic API exposes no
  `seed`), `pass@k`/`pass^k` at arbitrary k. The differentiator nobody else has;
  half-built (se, pass^k). New pure `src/stats.ts`.
- **B — Production runner (cost & speed).** Capture cost/latency/tokens from the
  stream; bounded concurrency + 429 backoff; **record/replay cache** keyed on
  `(task, resolved files+settings, model, tools, trialIndex)` — `measure`
  deliberately excluded so re-scoring is free — restoring the post-run filesystem
  so `ctx.file()/ctx.sh()` stay sound on replay; `maxCostUsd` budget cap. The
  enabler: makes evals cheap enough to run on every PR.
- **C — CI regression gating.** JSON/JUnit/SARIF output; committed
  `.vigiles/eval-baseline.json`; a gate that fails on a _significant negative
  delta_ vs baseline (reuses A); GitHub PR comparison comment via `src/action.ts`;
  optional trend history. "jest snapshots for agent behaviour."
- **D — Scenarios & scorers.** A dataset/scenario primitive unifying `runEval` /
  `measureTriggerRate`, plus a reusable scorer library (trajectory-vs-reference,
  multi-criteria/pairwise judge). Parity with DeepEval/promptfoo; biggest refactor.

**Decision (2026-06-10): pursue B → A → C; defer D.** B builds the seed/cache
plumbing A's paired design and C's iteration lean on; C's regression gate _is_ A's
significance machinery pointed at a committed baseline. D is the largest surface
change and is deferred unless DeepEval-parity becomes an explicit goal. First
reviewable unit: **B1 (cost capture) + B2 (record/replay cache)**.

Discipline carried from the rest of the repo: every pure module
(`stats.ts`, cache key/restore, usage parse, JUnit render) is fully unit-tested;
every model-spawning addition stays behind `/* v8 ignore */` + an injectable seam
(like `spawnAgent` / `runEvalWith`), so the 100% statements/lines/functions gate
holds.

## Status

- **B1 — cost/latency/token capture — DONE.** `parseUsage` reads `total_cost_usd`
  / `usage` / `duration_ms` from the result event; `RunContext.usage` exposes them
  to `measure`; `ArmReport.usage` + `EvalReport.totalCostUsd` aggregate them;
  `formatEvalReport` shows `$… · …s/run · …k tok` when present (`src/eval.ts`).
- **B2 — record/replay cache — DONE.** `src/eval-cache.ts` (key excludes
  `measure`; snapshots + restores the post-run filesystem); `cache` / `cacheDir`
  on `EvalSpec`; wired into `runEvalWith` via `runWithCache` / `executeTrial`.
- **B3 — concurrency + rate-limit backoff — DONE.** `runEvalWith` flattens
  arms × trials into a unit list run through `runPool` (bounded `concurrency`,
  default 1); each model call is wrapped in `runWithRetry` (exponential backoff
  while `isRateLimited` matches, `rateLimitRetries` / `retryBackoffMs`).
- **B4 — budget cap — DONE.** `maxCostUsd` stops launching new trials once
  measured cost crosses the cap; in-flight finish, the rest are skipped and
  `EvalReport.aborted` is set.
- **Vendored-plugin conformance — DONE.** `src/vendor.test.ts` runs `loadPlugin`
  over the pinned real plugins and asserts loader/warning invariants — model-free,
  in-gate, the grounding layer (the shape that caught the partial-vendor bug).
- **A1 + A5 — significance — DONE.** `src/stats.ts`: Welch's t-test over the
  per-arm summary stats (mean/se/n) → two-sided p-value + verdict, validated
  against known t-table critical values; `compareArms` computes the noise floor
  instead of the hand-fed `assertImproves({ by })`. Surfaced as `assertSignificant`
  / `significantlyBeats`, and `assertImproves({ significant: true })`.
- **Scoped down from the original Phase A (deliberately):** A2 (power analysis),
  A3 (`pass@k` at arbitrary k), and A4 (paired/blocked design) are **deferred** —
  each is statistically correct but not yet tied to a concrete, observed pain, and
  building rigor ahead of need is the trap to avoid. Pull them back in when a real
  eval demands them (e.g. A4 once an eval is shown to be variance-bound).
- **Empirical cross-check deferred:** with no API key in this environment, A1 is
  validated on known-answer synthetic distributions, not yet against a real
  `bench/` finding. Re-run one real comparison through `compareArms` when a key is
  available, to confirm the verdict matches what we concluded by hand.
- **Next:** Phase C (regression gating) — JSON/JUnit output + a committed baseline
  whose gate is a _significant negative delta_ (reuses `compareArms`).
