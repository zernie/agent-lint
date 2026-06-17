# Eval-API landscape — the field, summarized and compared against vigiles

Research capturing how vigiles' eval API (`src/eval.ts`, `src/harness-assert.ts`,
`src/judge.ts`) stacks up against the LLM/agent eval ecosystem, and the roadmap
that follows. Companion to `research/harness-testing.md` (the three-tier design)
and `docs/harness-testing.md` (the guide). The conceptual model behind the two
verbs — feature = deterministic TEST + behavioral EVAL, the two gating knobs,
cost-matched mechanism, and the ranked gap roadmap — lives in
[`docs/eval-architecture.md`](../docs/eval-architecture.md).

## Decision (2026-06-15): keep the harness tiers, don't rebuild the eval stack

A harness eval is **not** a model/prompt eval, and that distinction decides the
build-vs-defer question:

- **Fidelity is the moat.** The unit under test is the harness loaded as it
  **ships** — the real Claude Code system prompt, the real `CLAUDE.md`, real
  `hooks.json`/`settings.json`/`plugin.json`. Those dominate behaviour (the
  Claude Code system prompt alone steers skill selection more than a description
  does). A generic eval runner (promptfoo, DeepEval, Inspect, Braintrust)
  configures an agent **from YAML/SDK** — a _reconstruction_, not the harness —
  so it structurally **cannot** host a harness eval. promptfoo's own gap, per
  `promptfoo-deep-dive.md`, is exactly "the matrix is prompts×providers, not
  harness arms loaded as they ship." So vigiles owns this; it does not compete on
  generic eval infra.
- **Keep the real-model surface THIN.** Most harness questions need no real model
  at all — `runHook` (no model) and `runHarnessTest` (real `claude` + scripted
  mock model, full environment fidelity, key-free) answer "does the hook fire /
  block / inject" deterministically. Only two questions are irreducibly
  real-model: _does a description FIRE_ (trigger-rate) and _does behaviour MOVE_
  (A/B delta). Confine real-model machinery to that slice; don't spread it.
- **`stubSkillBodies`** is the concrete application: trigger-rate is a property of
  the **frontmatter** (the model selects a skill before its body loads), so the
  body is stubbed to a no-op — the run stops at selection instead of executing an
  expensive procedure. Cheaper, faster, side-effect-free, same measurement.
- **Don't chase eval-infra features.** Cost budgets, model matrices, dataset
  managers, dashboards — that's promptfoo's lane. For depth, bridge
  (`AgentRunner` → promptfoo `ProviderFunction`), don't rebuild. The model
  _itself_ is part of the harness, so the one on-moat eval refinement worth
  making is **model fidelity** — measure on the model your users actually run
  (Sonnet for most Claude Code users), not an invisible Haiku default. The NCD
  prompt-diversity gate stays (deterministic, dogfoods `proofs.ts`);
  turn-caps/cost-budgets are off-moat.

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

Config-first (YAML) runner with a CLI and local web view. Strong: zero-SaaS,
CI-friendly, concurrency, result caching, a deep assertion library
(`contains`, `llm-rubric`, `g-eval`, ROUGE/BLEU, schema, `javascript`/`python`),
a first-class **red-team** pillar, and — the part that dates the rest of this
section — **agentic support**: tiered SDK providers (`anthropic:claude-agent-sdk`,
`openai:codex-sdk`, a Tier-0 baseline LLM control), **`trajectory:*` assertions**
(e.g. `trajectory:step-count` over a command pattern), and `cost`/`latency`
assertions. Weak for us — and this is now the _only_ gap, narrower than the rest of
this doc implies: the matrix is prompts×**providers**, not _harness arms loaded as
they ship_ (it configures the SDK from YAML, not a real `plugin.json`/`hooks.json`/
`settings.json`/`CLAUDE.md`); it has no sub-model tiers (no `runHook`/mock-model
analog — every run is a real-model call); and reliability is pass-rate with no
se/significance/pass^k. See `research/promptfoo-deep-dive.md` for the full zoom-in.

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

> The `vigiles` column reflects **shipped state as of 2026-06-17** (the
> significance, cost/latency, concurrency, caching, and regression-gating gaps
> the original analysis flagged have all since shipped — see **Status**).
> Competitor cells reflect the ecosystem as understood mid-2026; treat them as
> directional, not contractual.

| Dimension                                                 | vigiles            | promptfoo          | DeepEval   | Braintrust | Inspect          |
| --------------------------------------------------------- | ------------------ | ------------------ | ---------- | ---------- | ---------------- |
| Harness-as-unit-under-test (A/B arms, loaded as it ships) | **✓ native**       | partial (matrix)   | ✗          | partial    | partial          |
| No-model / no-key cheaper tiers (`runHook`, mock-model)   | **✓✓ unique**      | ✗                  | ✗          | ✗          | ✗                |
| Intercept-and-prevent a tool in the real harness (safety) | **✓ unique**       | ✗                  | ✗          | ✗          | ✗                |
| Tool / trajectory assertions (incl. arg matchers)         | **✓ strong**       | ✓ (`trajectory:*`) | ✓          | ✓          | ✓                |
| pass^k reliability (τ-bench)                              | **✓**              | ✗                  | ✗          | ✗          | partial (epochs) |
| Statistical spread (std/se)                               | **✓**              | ✗                  | ✗          | partial    | ✓ (stderr)       |
| Significance test (Welch p-value)                         | **✓ shipped**      | ✗                  | ✗          | partial    | partial          |
| Regression gate vs committed baseline                     | **✓ shipped**      | ✗                  | partial    | ✓✓         | ✓                |
| Cost / latency / token capture                            | **✓ shipped**      | ✓                  | ✓          | ✓          | ✓                |
| Concurrency + rate-limit backoff                          | **✓ shipped**      | ✓                  | ✓          | ✓          | ✓                |
| Record / replay cache (+ filesystem restore)              | **✓ shipped**      | ✓                  | partial    | ✓          | partial          |
| LLM-judge depth (G-Eval/pairwise/multi-criteria)          | minimal            | ✓                  | **✓✓**     | ✓          | ✓                |
| Dataset / scenario primitive                              | ✗                  | ✓✓                 | ✓✓         | ✓✓         | ✓✓               |
| Red team                                                  | ✗                  | ✓✓                 | partial    | ✗          | partial          |
| UI / dashboards / web share                               | ✗ (console string) | ✓                  | partial    | ✓✓         | ✓                |
| Runner-agnostic lib (node/vitest/jest), zero-dep, no SaaS | **✓✓ unique**      | ✓ (CLI)            | ✓ (pytest) | ✗ (SaaS)   | ✓                |

The three **bolded-unique** rows are the defensible core, and they sharpened in
2026-06: (1) the **no-model/no-key cheaper tiers** (`runHook` + the mock-model
`runHarnessTest`) — promptfoo et al. are real-model-only by construction; (2)
**harness-arm A/B loaded as it ships** (the `plugin-loader` question a YAML-config
runner structurally cannot host); and (3) the new **tool-call spy** — `toolWith` /
`notTool` over the trace _plus_ `fakeTools`, which intercepts a tool in the real
PreToolUse hook layer so a real-model run that decides to `git push` / hit a paid
API is observed-but-prevented. promptfoo's `trajectory:*` can _assert_ on a trace,
but it can't _intercept-and-prevent_ inside the real shipped harness. The eval tier
runs on your **subscription** in a Claude Code session (vigiles drives the `claude`
CLI), not a metered GitHub Actions job — the affordable path competitors lack.
Honest deltas the other way are unchanged: dataset/scenario, red-team, judge
depth, and UI remain theirs, and we bridge (or skip) rather than chase them.

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
- **E — promptfoo interop (distribution, not a feature race). [PUNTED — see
  amendment below].** The adoption bet:
  do what they can't (harness-arm A/B loaded as it ships + the no-model/no-key
  cheaper tiers + significance/pass^k) but ship _inside_ their ecosystem so we ride
  their reach. Two thin bridges over seams both sides already expose:
  - **vigiles-as-a-promptfoo-provider** — a `file://vigiles-provider.js`
    (`ProviderFunction → ProviderResponse`) that takes a harness _arm_ (a plugin
    path / settings), resolves it via `src/plugin-loader.ts`, drives the real
    `claude` CLI, and returns the trajectory + tool calls + cost. A user then A/Bs
    the harness (`vigiles:plugin=./x` vs `off`) **inside** promptfoo and gets their
    dataset/scenario primitive, assertion library, red-team, web UI, and JUnit/CI
    output for free — i.e. it borrows most of D instead of building it.
  - **promptfoo-as-an-`AgentRunner`** — wrap a promptfoo invocation as the
    injectable `AgentRunner` (`src/eval.ts`) so a vigiles eval can reuse their
    providers/assertions under _our_ statistics + pass^k.
  - **a vigiles Agent Skill** — copy promptfoo's own move (a Claude Code
    marketplace plugin that teaches an agent to author the configs); aimed at the
    funnel in `research/distribution-strategy.md`.
    See `research/promptfoo-deep-dive.md` for the full case.

**Decision (2026-06-10): pursue B → A → C; defer D.** B builds the seed/cache
plumbing A's paired design and C's iteration lean on; C's regression gate _is_ A's
significance machinery pointed at a committed baseline. D is the largest surface
change and is deferred unless DeepEval-parity becomes an explicit goal. First
reviewable unit: **B1 (cost capture) + B2 (record/replay cache)**.

**Amendment (2026-06-11): E was scoped, then PUNTED; refocus on cost + sandbox.**
E (promptfoo interop) was added as a distribution track on the reasoning that the
binding constraint is adoption, not capability. On reflection it's punted: the
eval-runner space is promptfoo's, and trying to ride or match it (interop bridges,
or the dataset/red-team parity of D) is the wrong fight. The durable edge is that
promptfoo is **real-model only → expensive**, while our cheaper tiers need no model
and no key, and we can sandbox untrusted harnesses safely. So the active sequence
is **C now**, then invest in **cost (cheap tiers) + sandboxing** as the moat. Both
D and E stay deferred (D unless DeepEval/promptfoo parity becomes an explicit goal;
E unless real inbound demand appears). See Status for the full rationale.

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
- **Phase C — regression gating — core DONE (2026-06-11).** `src/eval-baseline.ts`:
  record a run's `EvalReport`s to a committed baseline (`toBaselineFile` /
  `writeBaseline`), then `diffReports` flags any arm×metric that moved
  _significantly in the bad direction_ vs. baseline — reusing `welchTTest` (current
  vs. baseline), so a bare pass-rate's noise can't trip it; `lowerIsBetter` flips
  cost/latency. JSON (`parseBaselineFile`/`readBaseline`) + JUnit (`diffToJUnit`)
  output; the throwing gate is `assertNoRegression` in `harness-assert.ts`. Pure
  core fully unit-tested (`src/eval-baseline.test.ts`) at the 100% include gate.
  **Deferred follow-ups:** SARIF output, the GitHub PR comparison comment via
  `src/action.ts`, and trend history — none yet tied to a concrete need.
- **Trigger precision — DONE (2026-06-12).** Prompted by AWS
  `sample-agent-skill-eval` (the agent-skill mirror of this pillar — scored in
  [`research/skill-eval-landscape.md`](skill-eval-landscape.md)).
  `measureTriggerRate` measured recall only; `TriggerRateSpec.irrelevantPrompts`
  adds the precision side → `report.falsePositiveRate` + `report.precision`,
  gated by `assertTriggerRate({ maxFalsePositive, minPrecision })` so a too-broad
  description that hijacks unrelated work fails, not just a too-narrow one. The
  same note logs the token-compression cluster (RTK/Caveman/…) as a **use case for
  `runEval`** (verify the headline % + the behavioural blast radius), not a
  roadmap item — demoed in `examples/harness/skill-compression.eval.mjs`.
- **Phase E (promptfoo interop) — PUNTED (2026-06-11).** Decision: do _not_ chase
  eval-framework parity or build the interop bridges. The eval-runner space is
  promptfoo's (broad adoption, mature assertion/dataset/red-team surface), and our
  edge there isn't features — it's **cost and safety**. promptfoo is real-model
  only, so it's _structurally_ expensive (corroborated by a user report that running
  it is costly); our differentiators are the **no-model / no-key cheaper tiers**
  (`runHook`, `runHarnessTest`) + caching, and **sandboxing**. So the strategy is
  not "ship inside promptfoo" but "be the cheap, safe, deterministic way to test a
  harness." Keep the deep-dive (`research/promptfoo-deep-dive.md`) as analysis;
  revisit E only if inbound demand for it appears.
- **Where the moat actually is (the refocus):**
  1. **Cost** — lead with the cheap tiers. The recurring objection to evals is
     "real model → real cost + slow"; our answer is that most harness questions
     (does the hook block? is it wired in?) need **no model and no API key** at
     all. That is a structural advantage promptfoo cannot cheaply copy.
  2. **Sandboxing** — be excellent at running _untrusted_ harnesses safely. The
     deterministic tier already confines under bubblewrap (`src/sandbox.ts`,
     safe-by-default); the open work is extending that boundary to the **unit tier**
     (`runHook` runs hooks with full `env`, no sandbox) and the **eval tier**, and
     beyond Linux (`sandbox-exec` / docker). Tracked as `feature-ideas.md` #13.
