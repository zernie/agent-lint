# Testing matrix — what's covered, and how

Every use case of the harness-testing API, mapped to the tier that tests it and
the file that proves it. Two kinds of coverage:

- **Unit** — deterministic, model-free, runs in `npm test` / `npm run test:vitest`
  / `npm run test:jest` / `npm run test:types`. These are the contract.
- **Integration (CI)** — needs the real `claude` CLI and/or a model, so it can't
  be a unit test. Covered by the canonical examples run in the `harness` CI job
  (deterministic tier, no API key) or by `bench/` + `examples` evals (real model).

## Coverage

| Use case                                                                                                                                                                                                       | Tier                     | Where                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------- |
| Hook unit tier — `runHook` (exit codes / stdin event / env / JSON decision)                                                                                                                                    | unit                     | `src/run-hook.test.ts`                                                      |
| Hook decision logic (`parseHookOutput` / `decideHook`)                                                                                                                                                         | unit                     | `src/run-hook.test.ts`                                                      |
| Subagent PreToolUse tool-contract rail — `agent-hook` (parse contract / allow-deny / hook ⇄ allowlist agree / real built-CLI hook via `runHook`; grounded on the vendored `ui-visual-validator`)               | unit                     | `src/agent-runtime.test.ts`                                                 |
| Plugin loader — inline `plugin.json` hooks                                                                                                                                                                     | unit                     | `src/plugin-loader.test.ts`                                                 |
| Plugin loader — `hooks` string-path                                                                                                                                                                            | unit                     | `src/plugin-loader.test.ts`                                                 |
| Plugin loader — `hooks/hooks.json` convention                                                                                                                                                                  | unit                     | `src/plugin-loader.test.ts`                                                 |
| Plugin loader — repo `.claude/settings.json`                                                                                                                                                                   | unit                     | `src/plugin-loader.test.ts`                                                 |
| Plugin loader — manifest-wins precedence                                                                                                                                                                       | unit                     | `src/plugin-loader.test.ts`                                                 |
| Plugin loader — bare dir (no hooks)                                                                                                                                                                            | unit                     | `src/plugin-loader.test.ts`                                                 |
| Plugin loader — `agents/` + `commands/` materialized + surface warnings                                                                                                                                        | unit                     | `src/plugin-loader.test.ts`                                                 |
| Plugin loader — empty-machine + MCP + dangling-intra-plugin-ref warnings                                                                                                                                       | unit                     | `src/plugin-loader.test.ts`                                                 |
| Plugin loader — in-repo dogfood                                                                                                                                                                                | unit                     | `src/plugin-loader.test.ts`                                                 |
| Vendored **real-plugin** conformance (`loadPlugin` invariants, pinned + offline)                                                                                                                               | unit                     | `src/vendor.test.ts`                                                        |
| `resolveHarness` — merge / passthrough / undefined                                                                                                                                                             | unit                     | `src/plugin-loader.test.ts`                                                 |
| Eval aggregation (mean / std / se / n / pass^k) + report formatting                                                                                                                                            | unit                     | `src/eval.test.ts`                                                          |
| Eval usage capture + aggregation (`parseUsage` / `aggregateUsage`, cost/latency/tokens)                                                                                                                        | unit                     | `src/eval.test.ts`                                                          |
| Eval record/replay cache (`cacheKey` / snapshot+restore / replay skips the model)                                                                                                                              | unit                     | `src/eval-cache.test.ts`, `src/eval.test.ts`                                |
| Eval concurrency + rate-limit retry + `maxCostUsd` abort (`runPool` / `isRateLimited`)                                                                                                                         | unit                     | `src/eval.test.ts`                                                          |
| Trigger-rate orchestration (`measureTriggerRateWith`)                                                                                                                                                          | unit                     | `src/eval.test.ts`                                                          |
| Significance stats (`welchTTest` / `compareArms` / `tPValueTwoSided` / incomplete-beta vs t-table)                                                                                                             | unit                     | `src/stats.test.ts`                                                         |
| Assert/predicate helpers (create/turns/hook-block; tool used/notUsed/count/sequence/with; skillResolved; output/request-contains; hookFired; improvement/improves; reliable; **significant**; **triggerRate**) | unit                     | `src/harness-assert.test.ts`                                                |
| Matchers register + pass under **vitest** (via the `vigiles/vitest` entry)                                                                                                                                     | unit                     | `test/runners/matchers.vitest.mjs`                                          |
| Matchers register + pass under **jest** (via the `vigiles/jest` entry)                                                                                                                                         | unit                     | `test/runners/matchers.jest.cjs`                                            |
| Matcher **types** augment vitest/jest `expect`                                                                                                                                                                 | unit                     | `test/types/smoke.vitest.ts`, `smoke.jest.ts`                               |
| CLI runner (`discoverScripts`/`runScripts`/summary)                                                                                                                                                            | unit                     | `src/run-scripts.test.ts`                                                   |
| Judge verdict parsing (`parseJudgeOutput`)                                                                                                                                                                     | unit                     | `src/judge.test.ts`                                                         |
| `runHarnessTest` end-to-end, incl. `plugin:`                                                                                                                                                                   | integration (CI)         | `examples/harness/policy-gate.harness.mjs`, `plugin-cohesion.harness.mjs`   |
| `withHarness` (auto-cleanup wrapper)                                                                                                                                                                           | integration (CI)         | `examples/harness/plugin-cohesion.harness.mjs`                              |
| `runEval` end-to-end, incl. `plugin` arm                                                                                                                                                                       | integration (real model) | `bench/evals/refs-hook.eval.mjs`, `examples/harness/skill-outcome.eval.mjs` |
| `measureTriggerRate` end-to-end (skill activation via `pluginDir`)                                                                                                                                             | integration (real model) | `examples/harness/skill-trigger-rate.eval.mjs`                              |
| `judge()` model call                                                                                                                                                                                           | integration (real model) | (parsing is unit-tested; the spawn is not)                                  |

## Surface coverage — which plugin surface is reachable at which tier

A Claude Code plugin/repo has several surfaces. They are reachable at different
tiers, because some only do anything under a real model:

| Surface                                                       | Hook unit (`runHook`) | Deterministic (`runHarnessTest`)    | Eval (`runEval`)                     |
| ------------------------------------------------------------- | --------------------- | ----------------------------------- | ------------------------------------ |
| Hooks — SessionStart / Stop / UserPromptSubmit                | ✅ logic              | ✅ fires in machine                 | ✅                                   |
| Hooks — Bash PreToolUse / PostToolUse                         | ✅ logic              | ✅ fires in machine                 | ✅                                   |
| Hooks — Edit/Write PreToolUse / PostToolUse                   | ✅ logic              | ⚠ headless-gated (drive via Bash)   | ✅                                   |
| Hooks — PreCompact / Notification / SessionEnd / SubagentStop | ✅ logic              | — (mock can't trigger)              | partial                              |
| CLAUDE.md / instruction files                                 | —                     | ✅ present in context               | ✅ moves behaviour                   |
| Skills                                                        | —                     | ✅ resolves via `pluginDir`         | ✅ activation (`measureTriggerRate`) |
| Subagents (`agents/`)                                         | ✅ tool-contract rail | ⚠ materialized; rail not live-armed | ✅ (Task)                            |
| Slash commands (`commands/`)                                  | —                     | ⚠ materialized, not invoked         | ✅                                   |
| MCP servers                                                   | —                     | — (not wired; warned)               | bring-your-own                       |

`loadPlugin(...).warnings` surfaces the ⚠ rows for a given plugin, so a "load the
whole plugin" test never silently runs an empty machine (e.g. a subagents-only
plugin like wshobson/agents `tdd-workflows`, which ships 2 agents + 4 commands
and **no** hooks).

The **subagent tool-contract rail** (`agent-hook`) makes the `agents/` Hook-unit
cell `✅`: the generated `PreToolUse` hook that enforces an agent's declared
`tools:` is `runHook`-testable like any other hook, and the declared list and the
enforced rail are compiled from one source (proven by a round-trip test). The
deterministic cell stays ⚠ for an honest reason — Claude Code doesn't surface the
active subagent to hooks, so arming the rail in a live session
(`.vigiles/active-agent.json`) is still unsolved; the logic is proven at the unit
tier, not yet end-to-end in a real dispatch. See `research/subagent-compilation.md`.

## What is intentionally _not_ unit-tested

Only the real-`claude` subprocess is out of the gate: `runHarnessTest`,
`withHarness`, `judge()`'s model call, and `runEval`/`measureTriggerRate`'s
default `spawnAgent` runner spawn the CLI (and, for evals, a real model). A unit
test can't drive that deterministically — but everything _around_ it is pinned.
The eval **orchestration** (`runEvalWith` / `measureTriggerRateWith`) takes an
**injected runner**, so the loop, cache, concurrency, budget, usage aggregation,
and significance run against canned stream-json with no model; the mock model
(`src/mock-model.ts`), the loader, the parsing, and the matchers are unit-tested
too. End-to-end behaviour is exercised by the example suite in CI: the
deterministic examples (`*.harness.mjs`) run with **no API key** (real `claude` +
scripted mock model), so they're CI-affordable; the evals (`*.eval.mjs`) cost
real model calls and run manually / in a keyed job.

## Why are the CLI examples `.mjs` (JavaScript), not TypeScript?

The **API is fully TypeScript** — `src/*.ts`, shipped with `.d.ts`, and its own
suites (`src/*.test.ts`) and the type smokes (`test/types/*.ts`) are TypeScript.
TypeScript is a first-class consumer path: write your harness tests in a `.ts`
file under your runner (node:test / vitest / jest) and the `vigiles/vitest` /
`vigiles/jest` entries give you typed matchers.

The files under `examples/harness/` are `.mjs` on purpose, for one reason: the
zero-dependency CLI fallback. `vigiles test` / `vigiles eval` discover these
files and run each as a plain `node <file>` child process — **no build step, no
TS loader** (`tsx`/`ts-node`), no config. That keeps the fallback dependency-free
and CI-affordable, which is the whole point of that tier (run the deterministic
harness in CI with nothing but Node + the `claude` binary). A `.ts` example would
force a transpile step into the runner and undercut that.

So the split is deliberate:

- **Bare CLI tier** → `.mjs`, runnable by `node` / `vigiles test` with zero deps.
- **Runner tier** → `.ts`, full types via `vigiles/vitest` / `vigiles/jest`.

If you want a typed worked example, the type smokes in
[`test/types/`](../test/types/) show the API used from `.ts` with the matcher
types applied.

## See also

- [`research/harness-testing-coverage-matrix.md`](../research/harness-testing-coverage-matrix.md) — the **whole potential surface** of harness testing (unit / integration / e2e + sandboxing), marking what's shipped vs. what we should build.
- [`docs/harness-testing.md`](harness-testing.md) — the full guide (four layers:
  verify-refs / hook unit / deterministic / eval, runner-agnostic usage, plugin
  loader, variance, judge, CLI fallback).
