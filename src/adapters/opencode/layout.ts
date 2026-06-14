/**
 * opencodeLayout — EXPERIMENTAL, internal-only. A prototype `PluginLayout` for
 * OpenCode: `opencode.json` manifest/settings, `AGENTS.md`, `.opencode/`
 * surfaces, `${OPENCODE_PLUGIN_ROOT}`. Validates the layout port against real
 * OpenCode shapes. NOT exported / NOT registered.
 */
import type { PluginLayout } from "../../core/layout.js";

export const opencodeLayout: PluginLayout = {
  name: "opencode",
  manifestPath: "opencode.json",
  // Vestigial: OpenCode hooks are JS plugin modules under `.opencode/plugin`, not
  // shell-hook settings, so the shell-hook settings round-trip does NOT apply here
  // (the adapter declares shellHooks:false; assertAdapterLoadsHooks is skipped).
  hooksConventionPath: ".opencode/plugin",
  settingsPath: "opencode.json",
  settingsFormat: "json",
  instructionFile: "AGENTS.md",
  surfaceDirs: [".opencode/agent", ".opencode/command"],
  materializeRoot: ".opencode",
  pluginRootToken: "${OPENCODE_PLUGIN_ROOT}",
  mcpConfigFile: "opencode.json",
  mcpManifestKey: "mcp",
  intraRefDirs: [".opencode/agent", ".opencode/command"],
};
