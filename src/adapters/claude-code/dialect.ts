/**
 * claudeCodeDialect — the Claude Code adapter's `HarnessDialect` (format axis).
 * The concrete dialect is DEFINED here, in the adapter, symmetric with the other
 * four ports (`claudeCodeLayout`/`Runtime`/`HookProtocol`/`ModelMock`): the core
 * holds only the `HarnessDialect` interface and never a harness's vocabulary. The
 * rule-enforcer/validator receive this by injection (`compileAgent(spec, { dialect })`,
 * the CLI/composition root supplies it). A second harness defines its own dialect
 * in its adapter (e.g. `src/adapters/codex/dialect.ts` exporting `codexDialect`).
 */
import type { HarnessDialect } from "../../core/dialect.js";

/**
 * The Claude Code built-in subagent tool catalog as a `const` tuple, so a typed
 * authoring surface can derive a LITERAL union (`ClaudeCodeBuiltinTool`) from it.
 * `claudeCodeDialect.builtinAgentTools` references this same array — one source
 * of truth for the runtime catalog AND the compile-time tool vocabulary.
 */
export const claudeCodeBuiltinAgentTools = [
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "Bash",
  "BashOutput",
  "KillBash",
  "Grep",
  "Glob",
  "LS",
  "WebSearch",
  "WebFetch",
  "NotebookEdit",
  "TodoWrite",
  "Task",
  "Skill",
] as const;

/**
 * The Claude Code side-effecting tools as a `const` tuple (the complement of
 * read-only within `builtinAgentTools`). `claudeCodeDialect.sideEffectingTools`
 * references this; the typed vocabulary derives the read-only / bounded splits.
 */
export const claudeCodeSideEffectingTools = [
  "Bash",
  "BashOutput",
  "KillBash",
  "Edit",
  "MultiEdit",
  "Write",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
  "Skill",
  "Task",
  "TodoWrite",
] as const;

export const claudeCodeDialect: HarnessDialect = {
  name: "claude-code",
  // The tool contract a subagent may declare — the rails it runs on. Anything
  // else must be an MCP tool, else it's a typo / nonexistent tool.
  builtinAgentTools: claudeCodeBuiltinAgentTools,
  // Tools the platform never exposes to a subagent, whatever the list says — so
  // a subagent listing one is a guaranteed-dead reference only a compiler catches.
  neverAvailableTools: [
    "Agent",
    "AskUserQuestion",
    "EnterPlanMode",
    "ExitPlanMode",
    "ScheduleWakeup",
    "WaitForMcpServers",
  ],
  mcpToolPattern: /^mcp__[a-z0-9_-]+__[a-z0-9_-]+$/i,
  // Claude Code's own built-in MCP server: the IDE integration provides
  // `mcp__ide__getDiagnostics` / `mcp__ide__executeCode` at runtime without any
  // plugin declaring it, so a contract that lists those must NOT be flagged as
  // referencing an undeclared server (the mcp-tool-resolves allowlist).
  knownMcpServers: ["ide"],
  // The real Claude Code hook events. (Was wrong: PreSession/PostSession don't
  // exist; SessionStart/SessionEnd/Stop/SubagentStop/UserPromptSubmit/PreCompact
  // were missing — verified against the events real plugins register.)
  hookEvents: [
    "PreToolUse",
    "PostToolUse",
    "UserPromptSubmit",
    "Notification",
    "Stop",
    "SubagentStop",
    "PreCompact",
    "SessionStart",
    "SessionEnd",
  ],
  // Events where a block decision is silently ignored ENTIRELY — no veto AND no
  // model feedback (exit 2 there writes stderr only to the user). These are the
  // ONLY events hook-block-ineffective flags as wrong-event. PostToolUse is NOT
  // here: its exit 2 feeds stderr back to the model (a legitimate nudge/feedback
  // channel), so flagging it would cry wolf (e.g. vigiles's own refs-nudge.sh).
  noEffectHookEvents: [
    "SessionStart",
    "SessionEnd",
    "Notification",
    "PreCompact",
  ],
  // PreToolUse is the one event whose deny needs the structured
  // `hookSpecificOutput.permissionDecision:"deny"`; the legacy top-level
  // `decision` field is ignored there.
  permissionDecisionHookEvents: ["PreToolUse"],
  // Claude Code natively reads CLAUDE.md only — it does NOT auto-load AGENTS.md
  // (anthropics/claude-code#34235 is open; AGENTS.md works solely via an
  // `@AGENTS.md` import inside CLAUDE.md or a symlink). AGENTS.md is the
  // cross-tool standard (Codex's native target), not a CC dialect fact; vigiles's
  // tool-agnostic recognition of it lives in validate.ts's INSTRUCTION_FILES.
  instructionTargets: ["CLAUDE.md"],
  pluginRootToken: "${CLAUDE_PLUGIN_ROOT}",
  // Claude Code reads the full SKILL.md frontmatter set (description,
  // disable-model-invocation, argument-hint, …).
  skillFrontmatter: "claude-code",
  // Tools that produce side effects in Claude Code. The complement — the
  // read-only tools — are: Read, Grep, Glob, LS, ToolSearch (and LSP/Agent
  // which are not in the subagent catalog). Bash is side-effecting because
  // `cat` and `rm -rf` are the same tool at the tool-name level — the
  // sandbox is the only closure for subprocess effects.
  sideEffectingTools: claudeCodeSideEffectingTools,
};

// ---------------------------------------------------------------------------
// Typed tool vocabulary — the compile-time half of the purity contract.
//
// Derives literal unions from the `const` catalogs above so the
// `vigiles/claude-code` typed `agent`/`skill` can reject an invalid
// `purity`×`tools` combination at the spec's own `tsc`. Mirrors the runtime
// ladder in `core/effects.ts`: `pure` = read-only built-ins; `bounded` =
// read-only ∪ decidable side-effecting ∪ `Bash`.
// ---------------------------------------------------------------------------

/** Every Claude Code built-in subagent tool (literal union). */
export type ClaudeCodeBuiltinTool =
  (typeof claudeCodeBuiltinAgentTools)[number];

/** The side-effecting subset (literal union). */
export type ClaudeCodeSideEffectingTool =
  (typeof claudeCodeSideEffectingTools)[number];

/**
 * Read-only built-in tools — the complement of the side-effecting set within
 * the built-in catalog. The tools a `pure` CC unit may declare.
 */
export type ClaudeCodeReadOnlyTool = Exclude<
  ClaudeCodeBuiltinTool,
  ClaudeCodeSideEffectingTool
>;

/**
 * Tools a `bounded` CC unit may declare: read-only ∪ the decidable
 * side-effecting tools (Write/Edit/MultiEdit/NotebookEdit) ∪ `Bash` (its
 * command is decided at RUNTIME by the gate). Bars MCP / unknown / wildcard —
 * those are simply not in the built-in union, so listing one is a `tsc` error.
 *
 * NOTE: `BashOutput`/`KillBash` are read-only-ish helpers tied to a running
 * Bash; `Bash` is the admitting tool, so they're included via the read-only
 * exclusion path only if read-only — here they stay side-effecting, hence the
 * explicit add of the bounded-decidable set plus `Bash`.
 */
export type ClaudeCodeBoundedTool =
  | ClaudeCodeReadOnlyTool
  | "Write"
  | "Edit"
  | "MultiEdit"
  | "NotebookEdit"
  | "Bash";

export type { HarnessDialect } from "../../core/dialect.js";
