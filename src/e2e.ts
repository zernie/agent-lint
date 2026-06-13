/**
 * `vigiles/e2e` — the **real-model / real-egress** tier (the top of the pyramid).
 *
 * Re-exports everything in [`vigiles/integration`](./integration.ts) and adds the
 * runners that need a real model or real network: `runEval` / `measureTriggerRate`
 * (drive the real model across arms × trials, aggregate mean ± se / pass^k), the
 * `judge` LLM grader, and — by re-export — `runHook` used with `egress: { allow }`
 * (allowlisted real outbound). Capability contract: needs **a model / API auth
 * and/or real network**, and (for egress) a routable sandbox. A `*.e2e.test.ts`
 * imports from here.
 */
// Note: egress: { allow } is an option on `runHook` (re-exported here via the
// integration→unit chain) — a test that uses it is e2e, and importing runHook
// from this path declares that.
export * from "./integration.js";
export * from "./eval.js";
export * from "./judge.js";
// The real-egress capability probe + the egress-using runHook live at this tier.
export { egressRoutes } from "./run-hook.js";
