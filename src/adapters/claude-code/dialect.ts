/**
 * claudeCodeDialect — the Claude Code adapter's `HarnessDialect` (format axis).
 * The concrete dialect is DEFINED here, in the adapter, symmetric with the other
 * four ports (`claudeCodeLayout`/`Runtime`/`HookProtocol`/`ModelMock`): the core
 * holds only the `HarnessDialect` interface and never a harness's vocabulary. The
 * compiler/validator receive this by injection (`compileAgent(spec, { dialect })`,
 * the CLI/composition root supplies it). A second harness defines its own dialect
 * in its adapter (e.g. `src/adapters/codex/dialect.ts` exporting `codexDialect`).
 */
import type { HarnessDialect } from "../../core/dialect.js";

export const claudeCodeDialect: HarnessDialect = {
  name: "claude-code",
  // The tool contract a subagent may declare — the rails it runs on. Anything
  // else must be an MCP tool, else it's a typo / nonexistent tool.
  builtinAgentTools: [
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
  ],
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
};

export type { HarnessDialect } from "../../core/dialect.js";
