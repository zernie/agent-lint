/**
 * `vigiles/hook` — the **closed vocabulary** for authoring a compiled hook.
 *
 * A hook today is opaque shell (`bash guard.sh`): un-analyzable, and the author
 * hand-writes the fragile parts (exit code, JSON field, a `grep` matcher) that
 * cause the #1 verified hook pain — FALSE CONFIDENCE (a guardrail that looks
 * like it blocks but silently doesn't). Invert it: author a **pure typed
 * function** `(event) => Decision` against THIS surface, and `vigiles
 * compile-hook` emits the harness protocol for you. The whole false-confidence
 * class becomes UNREPRESENTABLE — you never write the exit code or the field.
 *
 * Three roles, each with its own output type so a category mistake is a `tsc`
 * error, not a silent no-op:
 *   - `defineHook` / `defineFileGate` — a **gate** returns a `Decision`
 *     (`allow`/`deny`/`ask`); `deny` is the only thing that blocks.
 *   - `defineInject` — an **inject** returns an `Injection` (context text); it
 *     has no `deny`, so "block on a SessionStart hook" won't compile.
 *   - `defineReact` — a **react** (PostToolUse) returns a `Reaction`; its
 *     `run(cmd)` is effect-classified at construction, and it can't block
 *     (the tool already ran).
 *
 * Matching is AST-backed (`command.runs("git push", { force })`), so it catches
 * `cd x && git push -f` that the native `Bash(git:*)` glob misses.
 *
 * ⚠️ Honest scope: compile/verify fix the hook's AUTHORING + LOGIC. They do NOT
 * change DELIVERY — Claude Code's own subagent-bypass (#34692) means a
 * PreToolUse hook (compiled or hand-written) does not fire for a subagent's
 * tool calls. A gate is a strong default, never an unbypassable wall. See
 * `docs/compiled-hooks.md`.
 */
export {
  // gate vocabulary
  defineHook,
  defineFileGate,
  tool,
  tools,
  allow,
  deny,
  ask,
  commandView,
  pathView,
  // inject vocabulary
  defineInject,
  inject,
  // react vocabulary
  defineReact,
  run,
  notice,
  nothing,
  // runtime + decode (used by the `vigiles run-hook-program` runtime and tests)
  decideProgram,
  decideFileGate,
  runInject,
  runReact,
  decisionExitCode,
  dispatchKind,
  hookRouting,
  // compile + integrity
  compileHookProgram,
  checkHookImports,
  stampHook,
  verifyHookStamp,
  HookCompileError,
} from "./core/hook-program.js";

export type {
  Decision,
  CommandView,
  PathView,
  BashToolEvent,
  FileToolEvent,
  SessionEvent,
  HookProgram,
  FileGateHook,
  InjectHook,
  ReactHook,
  AnyHook,
  DispatchKind,
  Injection,
  Reaction,
  RunReaction,
  CompiledHookProgram,
  CompileHookOptions,
} from "./core/hook-program.js";
