/**
 * `vigiles/hook` — the **closed vocabulary** for authoring a compiled hook.
 *
 * A hook today is opaque shell (`bash guard.sh`): un-analyzable, and the author
 * hand-writes the fragile parts (exit code, JSON field, a `grep` matcher) that
 * cause the #1 verified hook pain — FALSE CONFIDENCE (a guardrail that looks
 * like it blocks but silently doesn't). Invert it: author a **pure typed
 * function** `(event) => Decision` against THIS surface, and `vigiles
 * compile` emits the harness protocol for you. The whole false-confidence
 * class becomes UNREPRESENTABLE — you never write the exit code or the field.
 *
 * The roles, each with its own output type so a category mistake is a `tsc`
 * error, not a silent no-op:
 *   - `defineHook` / `defineFileGate` — a **gate** returns a `Decision`
 *     (`allow`/`deny`/`ask`); `deny` is the only thing that blocks.
 *   - `definePromptGate` — a **prompt gate** (UserPromptSubmit) sees the prompt
 *     TEXT and may `deny` to block it (a security filter).
 *   - `defineStopGate` — a **stop gate** (Stop/SubagentStop) may `deny` to keep
 *     the agent going (gate-until-tests-pass).
 *   - `defineInject` — an **inject** returns an `Injection` (context text); it
 *     has no `deny`, so "block on a SessionStart hook" won't compile.
 *   - `defineReact` — a **react** (PostToolUse) returns a `Reaction`; it sees the
 *     tool RESPONSE, its `run(cmd)` is effect-classified at construction, and it
 *     can't block (the tool already ran).
 *
 * Every gate takes a `mode`: `enforce` (default, blocks) or `observe` (the
 * shadow/rollout mode — records what it WOULD block, never blocks). `observe` is
 * harness-neutral (it just exits 0 + writes a local record).
 *
 * Matching is AST-backed (`command.runs("git push", { force })`), so it catches
 * `cd x && git push -f` that the native `Bash(git:*)` glob misses.
 *
 * A gate may also decide on EXTERNAL STATE by declaring `needs` (e.g.
 * `needs: ["git.branch"]`): the trusted runtime gathers those read-only facts and
 * hands them in as `e.ctx` — the hook still does zero I/O, and reading an
 * undeclared fact is a `tsc` error. See `research/hook-context-providers.md`.
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
  definePromptGate,
  defineStopGate,
  tool,
  tools,
  allow,
  deny,
  ask,
  commandView,
  pathView,
  gateAction,
  hookMode,
  // inject vocabulary
  defineInject,
  inject,
  // react vocabulary
  defineReact,
  run,
  notice,
  nothing,
  responseView,
  // runtime + decode (used by the `vigiles hook-runtime run-program` runtime and tests)
  decideProgram,
  decideFileGate,
  decidePromptGate,
  decideStopGate,
  runInject,
  runReact,
  runHookProgram,
  decisionExitCode,
  dispatchKind,
  hookRouting,
  hookNeeds,
  // compile + integrity
  compileHookProgram,
  checkHookImports,
  stampHook,
  verifyHookStamp,
  HookCompileError,
} from "./core/hook-program.js";

export type {
  Decision,
  HookMode,
  GateAction,
  CommandView,
  PathView,
  ResponseView,
  BashToolEvent,
  FileToolEvent,
  PromptEvent,
  StopEvent,
  ReactEvent,
  SessionEvent,
  HookProgram,
  FileGateHook,
  PromptGateHook,
  StopGateHook,
  InjectHook,
  ReactHook,
  AnyHook,
  DispatchKind,
  Injection,
  Reaction,
  RunReaction,
  CompiledHookProgram,
  CompileHookOptions,
  RawHookEvent,
  HookProgramOutcome,
} from "./core/hook-program.js";

export type {
  ProviderName,
  ProviderResults,
  HookCtx,
} from "./core/hook-providers.js";
