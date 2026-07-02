---
status: active
topic: eval
---

# promptfoo deep dive — what it is now, how it overlaps vigiles, what to do

> A focused companion to `research/eval-api-landscape.md`. That doc scored the
> whole eval field at a paragraph each; this one zooms in on **promptfoo
> specifically** because it is (a) the most-adopted OSS eval tool, (b) explicitly
> "used by OpenAI and Anthropic" per its own tagline, and (c) the one competitor
> that has, since our landscape pass, moved **into agentic/Claude-Code territory**
> — which makes the old "it's just a prompt×provider matrix" framing stale.
> Findings are from promptfoo's mid-2026 docs (links at the bottom).

## What promptfoo is in 2026

Config-first (declarative YAML), zero-SaaS, CLI + local web view, CI-friendly. It
started as a prompt/provider comparison matrix and has grown four pillars:

1. **Evaluation** — run prompts/agents over a dataset of test cases, score with
   assertions, compare providers side by side in a web table.
2. **Red teaming** — auto-generate adversarial test cases across 50+ categories
   (prompt injection, jailbreak, PII leakage, OWASP LLM Top 10). This is now a
   first-class pillar, not an add-on.
3. **Guardrails / code scanning** — production-facing safety checks.
4. **Agent skills** — a Claude Code / Codex marketplace plugin that teaches
   _agents_ to author promptfoo configs (more on this below — it's a distribution
   move, not a harness-test feature).

Surface area that matters for a comparison:

- **Providers**: 60+ (OpenAI, Anthropic, Google, Mistral, Azure, Groq, Cohere,
  local Ollama, plus custom JS/Python/exec providers).
- **Assertions** — two families, each scored 0–1, combined as a **weighted
  average** with an optional `threshold` per test:
  - _Deterministic_: `equals`, `contains`, `regex`, JSON/HTML/SQL/XML schema,
    text-similarity (ROUGE-N / BLEU / METEOR / Levenshtein), `latency`, `cost`,
    `perplexity`, function-call validation, and custom `javascript` / `python` /
    `ruby`.
  - _Model-graded_: `similar`, `llm-rubric` (defaults to grading with gpt-5),
    `g-eval`, Pi Scorer, and RAG checks (context-faithfulness, answer-relevance).
  - **Named metrics** group assertions under labels for the dashboard; **derived
    metrics** compute composites post-run.
- **Variance / CI**: `evaluateOptions.repeat` (re-run each case N times),
  `maxConcurrency` (default 4), `delay`, `timeoutMs`. Output to
  CSV/JSON/JSONL/YAML/HTML/XML/**JUnit**; `--filter-failing` re-runs only the
  failures from a prior run.
- **Extensibility**: custom providers (`ProviderFunction` → `ProviderResponse`,
  or a `file://` script), three transform stages (`transformResponse`,
  `options.transform`, `contextTransform`), and four lifecycle **extension hooks**
  (`beforeAll` / `beforeEach` / `afterEach` / `afterAll`) for stateful setup like
  multi-turn sessions.

## The update that matters: promptfoo now evaluates agents

This is the part our landscape doc undersold. promptfoo's agent story is now
tiered, and it directly targets coding agents:

- **Tier 0 — baseline** plain LLM calls. Used as a control "to prove that
  file/tool access actually contributes to results."
- **Tier 1 — SDK providers**: `anthropic:claude-agent-sdk`, `openai:codex-sdk`,
  `opencode:sdk`. These run the agent inside the SDK with file reads, command
  execution, and **tool traces** exposed, plus permission control
  (`append_allowed_tools`, `disallowed_tools`, `permission_mode: acceptEdits`,
  `working_dir`).
- **Tier 2 — app-server**: `openai:codex-app-server`, a local JSON-RPC process
  enabling protocol-level assertions (approvals, events, plugins).

And it added the assertions that go with agents:

- **Trajectory assertions** — e.g. `trajectory:step-count` with a command
  `pattern: 'pytest*'` and `min: 1` (assert the agent actually ran the tests).
- **`cost` / `latency`** thresholds per run.
- **Custom JS over the trace** — reach into
  `context.providerResponse.metadata...serverRequests`, find a
  `commandExecution`, assert on it.
- **Provider-vs-provider comparison** of the same task (codex-sdk vs
  claude-agent-sdk), revealing "how the same model behaves differently at each
  tier."

Read that last bullet carefully: **Tier 0 vs Tier 1 is conceptually an A/B of
"tools off vs tools on."** promptfoo is now adjacent to the exact question
vigiles' eval pillar was built to own. The overlap is real and growing, so the
positioning has to be sharper than "they do prompts, we do harnesses."

## How it relates to vigiles' evals — the one axis that still separates us

| Axis                             | promptfoo                                                                                 | vigiles eval                                                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Unit under test**              | a **provider/model** (arms = providers, or Tier 0/1/2)                                    | the **harness** (arms = a hook / CLAUDE.md rule / skill **on vs off**)                                                                                                                     |
| **How the agent is configured**  | from promptfoo YAML — `append_allowed_tools`, `permission_mode`, `working_dir` on the SDK | from the **real shipped artifacts** — `plugin.json`, `hooks.json`, `.claude/settings.json`, `CLAUDE.md`, skills, resolved via `src/plugin-loader.ts` with `${CLAUDE_PLUGIN_ROOT}` expanded |
| **Cheaper tiers**                | none — every run is a real-model call                                                     | `runHook` (event JSON → block/allow, **no model**) and `runHarnessTest` (real `claude` + real hooks vs a **scripted mock model**, deterministic, key-free)                                 |
| **Statistics**                   | pass-rate; `repeat` captures variance but no se/significance                              | mean ± **se/std**, **pass^k** (τ-bench), **Welch's t-test** significance (`src/stats.ts`)                                                                                                  |
| **Reliability metric**           | pass-rate                                                                                 | **pass^k** ("worked on _every_ trial")                                                                                                                                                     |
| **Dataset / scenario primitive** | ✓✓ first-class                                                                            | ✗ (deferred Phase D)                                                                                                                                                                       |
| **Red team**                     | ✓✓ a whole pillar                                                                         | ✗ (out of scope)                                                                                                                                                                           |
| **Assertion library**            | ✓✓ deep (ROUGE/BLEU/G-Eval/RAG/schema)                                                    | minimal (Trace predicates + thin judge)                                                                                                                                                    |
| **UI / dashboards / web share**  | ✓                                                                                         | ✗ (console string)                                                                                                                                                                         |
| **Adoption / distribution**      | ✓✓ huge                                                                                   | ~0                                                                                                                                                                                         |

The defensible core, stated precisely:

1. **Harness-arm A/B, loaded as it ships.** promptfoo's `claude-agent-sdk`
   provider configures the SDK _from promptfoo's own YAML_. It does **not** load a
   real `plugin.json` / `hooks.json` / `settings.json` / `CLAUDE.md` as a unit and
   A/B it. So promptfoo can ask "claude-sonnet vs gpt-5-codex on this task" and
   "tools on vs off" — but it **cannot** ask _"does my PostToolUse hook, wired
   exactly as it ships, change what the agent does?"_ That is the plug-in-loader
   question, and it's still ours alone.
2. **Two cheaper tiers promptfoo has no analog for.** promptfoo is real-model
   only. `runHook` tests a hook's block/allow logic in milliseconds with no
   `claude` and no model (and reaches _every_ event — Edit/Write, PreCompact,
   SessionEnd, SubagentStop); `runHarnessTest` proves a hook is _wired in_ and
   fires, deterministically, with **no API key and no cost**. For governance hooks
   — the dominant real-world hook population — that's the whole game, and it's free.
3. **Statistical rigor.** promptfoo still documents **no** significance test, no
   se, no pass@k/pass^k. Our `src/stats.ts` (Welch over per-arm mean/se/n →
   p-value + verdict) and `MetricStat.passK` are exactly the things its pass-rate
   can't express. This is what makes a _regression gate_ trustworthy (Phase C):
   "fail the PR only on a **significant** negative delta" is impossible on a bare
   pass-rate.

What promptfoo does better, and we should not chase head-to-head: dataset/scenario
management, the red-team pillar, the breadth of the assertion library, the web UI,
the 60+ provider matrix, and — most importantly — **adoption**.

## The Agent-Skills move (worth copying)

promptfoo ships a Claude Code / Codex marketplace plugin of four skills
(`promptfoo-evals`, `promptfoo-provider-setup`, `promptfoo-redteam-setup`,
`promptfoo-redteam-run`) whose only job is to make an agent **author promptfoo
configs correctly** ("agents can write promptfoo configs, but get the details
wrong"). It's pure distribution: meet users inside the agent they already use,
and have the agent generate your config. vigiles has the same shape of problem
(authoring `.spec.ts` / `*.harness.mjs` / `*.eval.mjs` correctly) and already
dogfoods skills — so this is a cheap, on-brand copy.

## What we should do

Ranked. The theme: **the overlap is now big enough that "compete on the eval
framework" is the wrong frame — interop + sharpen the moat + distribute.**

### 1. Interop, don't reimplement (highest leverage)

Ship a **vigiles ⇄ promptfoo bridge** instead of building our deferred Phase D
(datasets/scorers) from scratch:

- **A vigiles _custom provider_ for promptfoo** — a `file://vigiles-provider.js`
  that takes a harness _arm_ (a plugin path or settings), resolves it through
  `plugin-loader`, drives the real `claude` CLI, and returns the trajectory +
  tool calls + cost as a promptfoo `ProviderResponse`. This drops vigiles' unique
  capability (assembled-harness, loaded-as-it-ships) **into** promptfoo's mature
  surface: you instantly get their dataset/scenario primitive, assertion library,
  red-team, web UI, and JUnit/CI output — none of which we want to rebuild. A user
  writes `providers: [vigiles:plugin=./my-plugin, vigiles:plugin=off]` and A/Bs
  the harness inside promptfoo.
- **Conversely, a promptfoo run as an `AgentRunner`** — our `runEval` already
  takes an injectable `AgentRunner` (`src/eval.ts`). Wrapping a promptfoo invocation
  as one lets vigiles users reuse promptfoo assertions/providers under our
  statistics + pass^k.

This converts a competitor into a distribution channel and a feature surface, and
it's a small, well-bounded build because both sides already have the seams
(`ProviderFunction` on theirs, `AgentRunner` on ours).

### 2. Lead with the two things promptfoo structurally lacks

- **The cheaper tiers.** Market `runHook` + `runHarnessTest` hard: "test your
  hooks with **no API key, no cost, in CI, deterministically**." promptfoo
  _cannot_ do this — it's real-model only. For the governance/policy hooks that
  dominate real plugins, this is the 90% case and it's free.
- **Statistics → regression gating.** Finish Phase C (the doc's stated next step)
  on top of `src/stats.ts`: JSON/JUnit output + a committed
  `.vigiles/eval-baseline.json` + a gate that fails on a _significant_ negative
  delta. "jest snapshots for agent behaviour, with a real noise floor" is a claim
  promptfoo's pass-rate can't make.

### 3. Distribution: ship a vigiles Agent Skill (copy their move)

A Claude Code marketplace plugin that teaches an agent to author vigiles specs and
harness tests correctly. Cheap, on-brand (we dogfood skills already), and aimed
straight at the funnel problem.

### 4. Housekeeping: correct the now-stale scorecard

`research/eval-api-landscape.md` marks promptfoo "partial" on tool/trajectory
assertions and treats red team as an add-on. Both are now understated — promptfoo
has first-class `trajectory:*` assertions, `cost`/`latency` assertions, and SDK
tool traces. The honest scorecard delta that remains in our favor is **narrower
than the doc implies**: it's harness-arm-A/B + the two sub-model tiers +
significance/pass^k, _not_ "they have no agent/tool support." Keep the comparison
truthful or it stops being persuasive. (Updated inline in that doc.)

## vigiles check ↔ promptfoo assertion

How the vigiles tool-call checks map onto their nearest promptfoo concept — and
where promptfoo's completion-grading model can't cheaply express the gap:

| vigiles check               | nearest promptfoo concept                          | gap                                                                                                                                                                                                                                                            |
| --------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toolWith(name, args)`      | `is-valid-function-call` / a `trajectory:*` assert | rough parity — assert a tool was called with these args (≈ DeepEval `ToolCorrectnessMetric`).                                                                                                                                                                  |
| `notTool(name, args?)`      | _none_                                             | the negative/safety assertion of a **decision NOT to act** — promptfoo grades what the agent DID, not what it correctly refrained from doing.                                                                                                                  |
| `interceptTools` (eval arm) | _none_                                             | intercept-and-prevent a tool in the **real shipped harness** (PreToolUse exit-2 deny): the call is intercepted, NOT executed, yet its args still land in the trace. promptfoo reconstructs an agent from YAML/SDK and can't intercept inside the real harness. |

The bottom two rows are the durable edge: `notTool` and `interceptTools` assert
the agent's _restraint_ — the thing a completion-grading eval structurally cannot
see, because there is no output to grade when the right behaviour is _not_ acting.

## Update (2026-06-17): promptfoo acquired by OpenAI; DeepEval v4

- **promptfoo was acquired by OpenAI (~$86M, March 2026).** This raises a
  **vendor-neutrality** concern for grading non-OpenAI models, and it sharpens
  vigiles's **multi-harness, vendor-neutral, subscription-not-metered**
  positioning: an eval tool now owned by one model vendor is a weaker neutral
  arbiter for "does my Claude / Codex harness behave?" than an independent,
  harness-agnostic tool. Any framing elsewhere in this repo that calls promptfoo
  "independent" is now **stale** and should be corrected.
- **DeepEval v4 added a full agentic eval harness** — task-completion,
  tool-correctness, and step-efficiency metrics — closing more of the
  trajectory-assertion gap. The "only promptfoo went agentic" framing no longer
  holds; the durable separators (harness-arm A/B loaded as it ships + the
  no-model/no-key cheaper tiers + significance/pass^k + the subscription cost
  model) are unchanged.

## See also

- `research/eval-api-landscape.md` — the whole eval field scored against our API,
  and the B→A→C roadmap (this doc is the promptfoo-specific zoom-in + the stale-
  claim correction).
- `research/harness-testing.md` — the three-tier design promptfoo has no analog for.
- `src/eval.ts` — `runEval` + the injectable `AgentRunner` seam move #1 plugs into.
  </content>
  </invoke>
