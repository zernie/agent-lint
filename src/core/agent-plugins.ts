/**
 * Agent Plugins — the vendor-neutral packaging standard (agent-plugins.org),
 * v1.0.0. A plugin declares itself with a root `plugin.json` and puts its
 * components at fixed paths: skills at `skills/<name>/SKILL.md`, MCP servers in
 * a root `mcp.json`.
 *
 * WHY THIS IS NOT AN ADAPTER. The standard is a PACKAGING format, not a harness:
 * it has no tool catalog, no hook events, no runtime — a plugin shipped this way
 * still runs inside Claude Code or Codex. So it COMPLEMENTS a harness rather than
 * replacing one, and a repo commonly carries both manifests side by side (vigiles
 * itself does). Modelling it as a `HarnessAdapter` would mean inventing a fake
 * `HarnessDialect` — exactly the half-wired port the conformance kit refuses.
 *
 * WHAT THIS MODULE IS FOR. The skills half already works for free: the standard's
 * `skills/<name>/SKILL.md` is the layout every adapter already reads. The gap is
 * MCP — the standard puts servers in a root `mcp.json`, which no harness layout
 * names, so `mcp-config` / `mcp-tool-resolves` / `mcp-hook-target-resolves`
 * would silently check nothing on a plugin laid out this way. This module tells
 * the scanner when that file is in play.
 *
 * DETECTION IS BY `$schema`, NOT BY FILENAME. `plugin.json` and `mcp.json` are
 * generic names other tools use too. A plugin is treated as conformant only when
 * its root manifest pins an `agent-plugins.org` schema — then a sibling
 * `mcp.json` is unambiguously the standard's, and is read even if it omits its
 * own `$schema`. Pure (no `node:fs`): the caller injects the read, so the
 * browser engine can back it with a file map.
 */

/** The standard's root manifest filename. */
export const AGENT_PLUGINS_MANIFEST = "plugin.json";

/** The standard's root MCP-server config filename. */
export const AGENT_PLUGINS_MCP_CONFIG = "mcp.json";

/** Canonical schema host — a manifest pinning one of these targets the standard. */
const SCHEMA_PREFIX = "https://agent-plugins.org/schemas/";

/**
 * Does this manifest text declare an Agent Plugins plugin? True only when it
 * parses and its `$schema` points at the standard — a `plugin.json` belonging to
 * something else is not claimed.
 */
export function isAgentPluginsManifest(text: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  if (parsed === null || typeof parsed !== "object") return false;
  const schema = (parsed as { $schema?: unknown }).$schema;
  return typeof schema === "string" && schema.startsWith(SCHEMA_PREFIX);
}

/**
 * The extra MCP config files to read for this root — `[mcp.json]` when the root
 * manifest declares an Agent Plugins plugin, `[]` otherwise. `readText` returns
 * the file's contents, or `undefined` when it does not exist.
 */
export function agentPluginsMcpSources(
  readText: (file: string) => string | undefined,
): readonly string[] {
  const manifest = readText(AGENT_PLUGINS_MANIFEST);
  if (manifest === undefined || !isAgentPluginsManifest(manifest)) return [];
  return [AGENT_PLUGINS_MCP_CONFIG];
}
