/**
 * `vigiles/e2e` — the **deterministic** end-to-end tier (real sandbox + real
 * network, but a definite pass/fail).
 *
 * Re-exports everything in [`vigiles/integration`](./integration.ts) and adds the
 * real-egress capability: `egressRoutes()` (probe whether allowlisted egress can
 * actually route) and — by re-export — `runHook` used with `egress: { allow }`
 * (allowlisted real outbound). Capability contract: needs a **routable rootless
 * sandbox + real network**, and each test self-skips via `egressRoutes()` where
 * that's unavailable. Still a **verification** tier — you assert pass/fail.
 *
 * NOT here: **evals** (`runEval` / `measureTriggerRate` / `judge`). Those are a
 * different axis — **non-deterministic measurement** (real model, mean ± se), run
 * via `vigiles eval` on `*.eval.mjs`. Import them from
 * [`vigiles/eval`](./eval.ts) + [`vigiles/judge`](./judge.ts), not from here.
 */
export * from "./integration.js";
// The real-egress capability probe (the egress-using runHook is already re-exported
// via the integration→unit chain).
export { egressRoutes } from "./run-hook.js";
