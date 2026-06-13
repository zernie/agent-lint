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
 */
export * from "./unit.js";
export * from "./adapters/claude-code/harness-test.js";
export * from "./adapters/claude-code/mock-model.js";
export * from "./adapters/claude-code/plugin-loader.js";
