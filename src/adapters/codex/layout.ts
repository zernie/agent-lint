/**
 * codexLayout — EXPERIMENTAL, internal-only. A prototype `PluginLayout` for
 * Codex: `.codex/` conventions, `config.toml` (TOML) hooks, `AGENTS.md`,
 * `${PLUGIN_ROOT}`. Validates the layout port + the settings-format axis against
 * real Codex shapes. NOT exported / NOT registered.
 *
 * Findings surfaced by writing it (see research/codex-prototype-findings.md):
 * - Codex has no separate JSON *manifest* — `config.toml` carries everything; we
 *   point `manifestPath` at it (its JSON parse simply fails → the loader falls
 *   through to the TOML `settingsPath`). The manifest field is CC-JSON-shaped.
 * - MCP detection (`mcpConfigFile`/`mcpManifestKey`) is JSON-shaped, so it won't
 *   see Codex's `[mcp_servers]` TOML table — a known layout-port gap.
 */
import type { PluginLayout } from "../../core/layout.js";

export const codexLayout: PluginLayout = {
  name: "codex",
  manifestPath: ".codex/config.toml",
  hooksConventionPath: ".codex/hooks.json",
  settingsPath: ".codex/config.toml",
  settingsFormat: "toml",
  instructionFile: "AGENTS.md",
  surfaceDirs: ["skills", "prompts"],
  materializeRoot: ".codex",
  pluginRootToken: "${PLUGIN_ROOT}",
  mcpConfigFile: ".mcp.json",
  mcpManifestKey: "mcp_servers",
  intraRefDirs: ["skills", "prompts", "hooks"],
};
