/**
 * codexDialect — EXPERIMENTAL, internal-only. A prototype `HarnessDialect` for
 * OpenAI Codex, built from the mid-2026 research (research/harness-landscape.md)
 * to validate that the format axis actually generalizes beyond Claude Code. NOT
 * exported from `vigiles/*` and NOT registered in the adapter registry — it
 * exists to be run through the conformance kit + real Codex-shaped fixtures.
 */
import type { HarnessDialect } from "../../core/dialect.js";

export const codexDialect: HarnessDialect = {
  name: "codex",
  // Codex model-facing tools (shell/exec, file edits, plan, web), + MCP tools.
  builtinAgentTools: ["shell", "apply_patch", "update_plan", "web_search"],
  // No documented "never available to a subagent" set yet — left empty.
  neverAvailableTools: [],
  mcpToolPattern: /^mcp__[a-z0-9_-]+__[a-z0-9_-]+$/i,
  // Codex hooks (near-1:1 with Claude Code) + its extras.
  hookEvents: [
    "SessionStart",
    "SubagentStart",
    "SubagentStop",
    "PreToolUse",
    "PostToolUse",
    "PermissionRequest",
    "PreCompact",
    "PostCompact",
    "UserPromptSubmit",
    "Stop",
  ],
  instructionTargets: ["AGENTS.md"],
  pluginRootToken: "${PLUGIN_ROOT}",
};
