/**
 * `vigiles/testing` — Pillar 2 entry point: the **harness-testing** API. Re-exports
 * the three tiers — `runHook` (unit), `runHarnessTest` (deterministic), `runEval`
 * (eval) — plus the runner-agnostic predicates/assertions. Kept deliberately
 * separate from `vigiles/claude-code` so this surface can stay harness-agnostic as
 * more harnesses are added. Granular paths (`vigiles/run-hook`, etc.) still work.
 *
 * It re-exports the composition-root runner modules (which do the Claude-Code
 * default-wiring), never an adapter directly — the `agnostic-surface` eslint
 * boundary forbids importing `src/adapters/*` from here. See
 * `research/adapter-api-design.md`.
 */
export * from "./run-hook.js";
export * from "./harness-test.js";
export * from "./eval.js";
export * from "./harness-assert.js";
// The declarative check vocabulary is now first-class at the front door. Its
// `hookFired` (a `Check<Trace>`) supersedes the legacy boolean predicate of the
// same name — the explicit re-export below wins over the two `export *`s.
export * from "./check.js";
export { hookFired } from "./check.js";
