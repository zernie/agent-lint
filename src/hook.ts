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
 *   - `experimental_defineHook` / `experimental_defineFileGate` — a **gate** returns a `Decision`
 *     (`allow`/`deny`/`ask`); `deny` is the only thing that blocks.
 *   - `experimental_definePromptGate` — a **prompt gate** (UserPromptSubmit) sees the prompt
 *     TEXT and may `deny` to block it (a security filter).
 *   - `experimental_defineStopGate` — a **stop gate** (Stop/SubagentStop) may `deny` to keep
 *     the agent going (gate-until-tests-pass).
 *   - `experimental_defineInject` — an **inject** returns an `Injection` (context text); it
 *     has no `deny`, so "block on a SessionStart hook" won't compile.
 *   - `experimental_defineReact` — a **react** (PostToolUse) returns a `Reaction`; it sees the
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
 * undeclared fact is a `tsc` error. Built-ins:
 * `git.branch`/`git.isDirty`/`git.root`/`cwd`/`os.platform`/`env.isCI`. For a
 * one-off off-catalog fact, the lightweight opt-out is an
 * inline `provide(name, cmd)` (read-only) or `dangerously(name, cmd)` (the loud
 * escape) right in `needs`. See `research/hook-context-providers.md`.
 *
 * ⚠️ Honest scope: compile/verify fix the hook's AUTHORING + LOGIC. They do NOT
 * change DELIVERY — Claude Code's own subagent-bypass (#34692) means a
 * PreToolUse hook (compiled or hand-written) does not fire for a subagent's
 * tool calls. A gate is a strong default, never an unbypassable wall. See
 * `docs/compiled-hooks.md`.
 */
export {
  // ── the six ENTRY POINTS carry the experimental marking ─────────────────────
  // Same shape as `experimental_skill`, and for the same stated reason: every
  // other name in this file — `allow`, `deny`, `tool`, `pathView`, `state`,
  // `record` — is reachable ONLY from inside a `define*` call, so prefixing the
  // entry points makes the marking structural for the whole vocabulary. A
  // per-name prefix could not guarantee that; a chokepoint can.
  //
  // 🔴 DO NOT alias the prefix away at the import. This block used to advise
  // exactly that — "so the word crosses the package boundary exactly once" — and
  // the advice defeated the mechanism it was attached to. Measured 2026-08-21:
  // with the alias in place the marker survived at 0 of 5 call sites in the only
  // user-facing example, because a reader 200 lines down sees `defineHook(...)`
  // and cannot tell it is provisional. A prefix that is stripped on import is a
  // subpath with extra steps; if the guarantee is only boundary-deep, the honest
  // shape is a quarantined subpath, not a name nobody sees. We chose the name,
  // and then deleted the subpath (`vigiles/experimental`, gone 2026-08-21) so
  // there is only the one mechanism left to keep honest.
  // so the name has to be there. The declarations carry it too — there is one
  // spelling of each symbol now, and `local/experimental-name` no longer needs
  // to reason about re-export aliasing to know what crosses the boundary.
  experimental_defineHook,
  experimental_defineFileGate,
  experimental_definePromptGate,
  experimental_defineStopGate,
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
  experimental_defineInject,
  inject,
  // react vocabulary
  experimental_defineReact,
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
  injectionOf,
  outcomeWrites,
  matchesTool,
  invalidToolPatterns,
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

export {
  provide,
  dangerously,
  defineProvider,
  provider,
} from "./core/hook-providers.js";

// Runtime-owned named state: `state(k)` in `needs` reads a fact, `record(k)` in a
// return value declares one. The whole design note lives in `core/hook-state.ts`.
export {
  state,
  record,
  stateFact,
  isValidStateKey,
  isStateNeed,
  isStateWrite,
  admissibleWrites,
  durationSeconds,
  HookStateError,
} from "./core/hook-state.js";

export type {
  StateFact,
  StateEntry,
  StateNeed,
  StateWrite,
  Duration,
} from "./core/hook-state.js";

export type {
  ProviderName,
  ProviderResults,
  HookCtx,
  NeedSpec,
  InlineProvider,
  RegisteredProvider,
  RegisteredRef,
  ProviderRegistry,
} from "./core/hook-providers.js";

// Operation-normalized leaf extraction — the robust matching primitive a
// hardened guard is built on (see examples/harness/safe-bash-guard-v2.mjs).
export { leafCommandsNormalized } from "./core/bash-effects.js";
export type { NormalizedLeaf, LeafRedirect } from "./core/bash-effects.js";
