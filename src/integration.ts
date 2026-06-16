/**
 * `vigiles/integration` — the **deterministic, assembled-machine** tier.
 *
 * Re-exports everything in [`vigiles/unit`](./unit.ts) and adds the runners that
 * drive the real `claude` CLI against a **scripted mock model** plus structural
 * assembly: `runHarnessTest` / `withHarness` (real hooks fire, outcome
 * reproducible), `scriptModel` (the mock), and `loadPlugin` / `resolveHarness`
 * (the plugin loader). Capability contract: needs the **`claude` binary and
 * bubblewrap**, but **no API key and no network**. A `*.integration.test.ts`
 * imports from here.
 *
 * Real **egress** is a CAPABILITY of this scope (the former `e2e` tier), not a
 * separate tier: `egressRoutes()` probes whether allowlisted egress can route,
 * and `runHook` takes `egress: { allow }` for allowlisted real outbound — gated
 * by a routable sandbox + real network (a test self-skips via `egressRoutes()`).
 * `vigiles/e2e` remains as a thin back-compat alias. See
 * `research/testing-api-design.md` Part 4.
 */
export * from "./unit.js";
export * from "./harness-test.js";
export * from "./mock-model.js";
export type { LoadedPlugin } from "./plugin-loader.js";
export { egressRoutes } from "./run-hook.js";
