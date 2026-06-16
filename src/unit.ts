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
// The check vocabulary is part of the base surface (pure, no capability). Its
// `hookFired` check supersedes the legacy boolean predicate of the same name.
export * from "./check.js";
export { hookFired } from "./check.js";
