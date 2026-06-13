/**
 * claudeCodeLayout — the Claude Code plugin/repo layout (the `PluginLayout`
 * port's reference implementation). `loadPlugin` defaults to it; a Codex adapter
 * defines a sibling `codexLayout` and passes it to the same loader.
 */
import type { PluginLayout } from "../../core/layout.js";

export const claudeCodeLayout: PluginLayout = {
  name: "claude-code",
  manifestPath: ".claude-plugin/plugin.json",
  hooksConventionPath: "hooks/hooks.json",
  settingsPath: ".claude/settings.json",
  instructionFile: "CLAUDE.md",
  surfaceDirs: ["skills", "agents", "commands"],
  materializeRoot: ".claude",
  pluginRootToken: "${CLAUDE_PLUGIN_ROOT}",
  mcpConfigFile: ".mcp.json",
  mcpManifestKey: "mcpServers",
  intraRefDirs: ["hooks", "skills", "agents", "commands"],
};
