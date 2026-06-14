/**
 * `vigiles/testing` — Pillar 2 entry point: the **harness-testing** API. Re-exports
 * the three tiers — `runHook` (unit), `runHarnessTest` (deterministic), `runEval`
 * (eval) — plus the runner-agnostic predicates/assertions. Kept deliberately
 * separate from `vigiles/claude-code` so this surface can stay harness-agnostic as
 * more harnesses are added. Granular paths (`vigiles/run-hook`, etc.) still work.
 */
export * from "./adapters/claude-code/run-hook.js";
export * from "./adapters/claude-code/harness-test.js";
export * from "./adapters/claude-code/eval.js";
export * from "./harness-assert.js";
