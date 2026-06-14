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
    "Bash",
    "Grep",
    "Glob",
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
  hookEvents: [
    "PreToolUse",
    "PostToolUse",
    "PreSession",
    "PostSession",
    "Notification",
  ],
  instructionTargets: ["CLAUDE.md", "AGENTS.md"],
  pluginRootToken: "${CLAUDE_PLUGIN_ROOT}",
};

export type { HarnessDialect } from "../../core/dialect.js";
