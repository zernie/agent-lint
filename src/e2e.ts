/**
 * `vigiles/e2e` — DEPRECATED back-compat alias for [`vigiles/integration`](./integration.ts).
 *
 * There is no separate "e2e" tier: real **egress** is a *capability* of the
 * harness/integration scope (`egressRoutes()` + `runHook`'s `egress: { allow }`),
 * not a different kind of test — the old `e2e` barrel added exactly one symbol
 * over `integration`, which is the definition of a non-tier. It now lives on
 * `vigiles/integration`; this entry re-exports it unchanged so existing imports
 * keep working. See `research/testing-api-design.md` Part 4 (two scopes, not
 * four tiers). Prefer `vigiles/integration`.
 *
 * NOT here: **evals** (`runEval` / `measure` / `measureTriggerRate` / `judge`) —
 * those are non-deterministic measurement, a different axis. (They live on
 * `vigiles/testing`; `vigiles/eval` is named here in the original comment and does
 * not exist as an entry point.)
 */
export * from "./integration.js";
