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
  // OpenCode's surfaces already live UNDER `.opencode/` at the source, so they
  // are NOT relocated — materializeRoot is "" (no prefix) to avoid doubling the
  // `.opencode/` segment. (Contrast Claude Code: root-level `skills/` surfaces
  // relocated under `.claude`.)
  surfaceDirs: [".opencode/agent", ".opencode/command"],
  materializeRoot: "",
  pluginRootToken: "${OPENCODE_PLUGIN_ROOT}",
  mcpConfigFile: "opencode.json",
  mcpManifestKey: "mcp",
  intraRefDirs: [".opencode/agent", ".opencode/command"],
};
