/**
 * `vigiles/unit` — the **no-capability** harness-testing surface.
 *
 * Importing from here is a contract: this test needs **no `claude`, no model, no
 * bubblewrap, no network** — only a process. It is the cheap base of the pyramid:
 * `runHook` (pipe a synthesized event to a hook and read the block/allow
 * decision), the bare `Trace` predicates, the `assert*` helpers, and the pure
 * parsers. A `*.test.ts` should import **only** from here (enforced by lint).
 *
 * Higher tiers re-export this one — dependencies point downward only
 * (e2e → integration → unit), never up. See `vigiles/integration` and
 * `vigiles/e2e`.
 */
export * from "./harness-assert.js";
// The compiled-hook loader belongs to the no-capability tier: it imports a local
// module and nothing else. Without it the in-process assertions above are
// unreachable from a test that only knows the hook's PATH.
export { loadHook } from "./load-hook.js";
export {
  runHook,
  parseHookOutput,
  decideHook,
  propertyHook,
} from "./run-hook.js";
export type {
  HookInput,
  HookOutput,
  HookRunResult,
  RunHookOptions,
  HookPropertyResult,
} from "./run-hook.js";
// The PRIMITIVE beneath runHook: run any program, get what it did. A hook has a
// DECISION, a script has EFFECTS — two questions, so two result types.
export { runScript } from "./run-script.js";
export type { RunScriptOptions, ScriptRunResult } from "./run-script.js";
// The check vocabulary is part of the base surface (pure, no capability). Its
// `hookFired` check supersedes the legacy boolean predicate of the same name.
export * from "./check.js";
export { hookFired } from "./check.js";
// Guardrail verification — "prove your safety hook actually blocks" (over runHook).
export {
  DISASTER_CATALOG,
  verifyGuardrail,
  unblockedDisasters,
  assertBlocksDisasters,
  formatGuardrailReport,
} from "./guardrail-check.js";
export type {
  DisasterEvent,
  DisasterCategory,
  GuardrailResult,
  VerifyGuardrailOptions,
} from "./guardrail-check.js";
