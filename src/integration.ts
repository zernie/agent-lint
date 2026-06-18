/**
 * `vigiles/integration` — the **deterministic, assembled-machine** tier.
 *
 * Re-exports everything in [`vigiles/unit`](./unit.ts) and adds the
 * harness-agnostic runners for the assembled machine: `runHarnessTest` /
 * `runHarness` (real hooks fire, outcome reproducible) plus the generic trace
 * parsers and the sandbox policy. Capability contract: needs the **`claude`
 * binary and bubblewrap**, but **no API key and no network**. A
 * `*.integration.test.ts` imports from here.
 *
 * The Claude-Code **transport** — the scripted mock (`scriptModel`) and the
 * plugin loader (`loadPlugin` / `resolveHarness`) — is harness-specific, so it is
 * NOT re-exported here (this surface stays agnostic, enforced by the
 * `agnostic-surface ⊄ adapter` boundary lint). Import it from
 * [`vigiles/claude-code`](./claude-code.ts):
 * `import { scriptModel, loadPlugin } from "vigiles/claude-code"`.
 *
 * Real **egress** is a CAPABILITY of this scope (the former `e2e` tier), not a
 * separate tier: `egressRoutes()` probes whether allowlisted egress can route,
 * and `runHook` takes `egress: { allow }` for allowlisted real outbound — gated
 * by a routable sandbox + real network (a test self-skips via `egressRoutes()`).
 * `vigiles/e2e` remains as a thin back-compat alias. See
 * `research/testing-api-design.md` Part 4.
 */
export * from "./unit.js";
// The harness-test tier — AGNOSTIC SURFACE ONLY (CC transport lives in
// vigiles/claude-code; see the module doc above).
export {
  runHarnessTest,
  runHarness,
  parseToolCalls,
  parseSubagents,
  parseResultEvent,
  parseOutput,
  parseHooks,
  decideSandbox,
  specTrusted,
  sandboxAvailable,
} from "./harness-test.js";
export type {
  HarnessTestSpec,
  Trace,
  SubagentTrace,
  HarnessTestResult,
  RunHarnessTestOptions,
  ModelTurn,
  ModelRequest,
  ToolCall,
  HookFire,
  HarnessTestDriver,
  SandboxMode,
} from "./harness-test.js";
export { egressRoutes } from "./run-hook.js";
