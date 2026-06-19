/**
 * MCP-tool resolution — the cross-referencing moat ("valid is not true") applied
 * to an MCP tool reference's SERVER. A contract that lists `mcp__linear__search`
 * names a server `linear`; if the plugin declares its own MCP servers (a
 * `.mcp.json` / manifest `mcpServers` block) and `linear` isn't among them, the
 * tool can't resolve — a dead contract entry. This completes the tool moat:
 * `agent-tool-contract` (tool-contract.ts) verifies BUILT-IN tools but passes
 * ANY `mcp__*` token unchecked; this verifies the MCP half.
 *
 * Calibrated HIGH-PRECISION — three guards, each learned from a real plugin in
 * the mid-2026 sweep (research/plugin-structural-findings.md):
 *
 * 1. GATE on a declared set. Only flag when the plugin SHIPS a `mcpServers`
 *    declaration (a non-empty `declaredServers`). A plugin that declares no
 *    servers reaches user-global / project-level ones (the normal pattern —
 *    ananddtyagi's agents reference `mcp__ide__*` with no `.mcp.json`), so
 *    flagging there would cry wolf. No declared set → return nothing.
 * 2. ALLOWLIST built-ins. A harness-provided server (`dialect.knownMcpServers`,
 *    e.g. Claude Code's `ide`) is available without a declaration — never flag it.
 * 3. SKIP the plugin-namespaced form. Claude Code rewrites a plugin's own MCP
 *    tool to `mcp__plugin_<plugin>_<server>__<tool>` (observed on han's
 *    playwright-mcp: `mcp__plugin_playwright-mcp_playwright__…`). The plugin /
 *    server segments are joined with single underscores and are ambiguous to
 *    split, and the ref is by construction the plugin's OWN server — so we don't
 *    interpret it (parsing it would be a false-positive factory).
 *
 * Pure + ONE detector reused by `scan` + the `mcp-tool-resolves` lint rule
 * (one-detector-no-drift). The dialect is injected (core ⊄ adapter).
 */
import type { HarnessDialect } from "./dialect.js";

export interface McpToolIssue {
  readonly tool: string;
  readonly server: string;
  readonly message: string;
}

/**
 * The server segment of a direct `mcp__<server>__<tool>` reference, or null when
 * the token isn't a direct MCP tool we resolve: a non-MCP tool, or the
 * plugin-namespaced `mcp__plugin_…__…` form (guard 3 — deliberately skipped).
 * A `Tool(restriction)` suffix is stripped first.
 */
export function mcpToolServer(
  raw: string,
  dialect: HarnessDialect,
): string | null {
  const tool = raw.split("(")[0].trim();
  if (!dialect.mcpToolPattern.test(tool)) return null;
  // Non-greedy first segment after `mcp__`, up to the next `__`.
  const m = /^mcp__(.+?)__/.exec(tool);
  if (!m) return null;
  const server = m[1];
  // Guard 3: the plugin-namespaced form references the plugin's OWN server under
  // an ambiguous single-underscore join — don't try to split it, don't flag it.
  if (server.startsWith("plugin_")) return null;
  return server;
}

/**
 * Verify the MCP tool references in a contract against the plugin's declared MCP
 * servers. Returns one {@link McpToolIssue} per direct `mcp__<server>__<tool>`
 * whose server is neither declared nor a known built-in. Returns `[]` when no
 * servers are declared (guard 1 — we can't know the resolvable set).
 */
export function verifyMcpToolServers(
  tools: readonly string[],
  declaredServers: readonly string[],
  dialect: HarnessDialect,
): McpToolIssue[] {
  // Guard 1: no declared set → the plugin relies on global/project servers; we
  // can't tell a dead reference from a legitimate global one. Flag nothing.
  if (declaredServers.length === 0) return [];
  const known = new Set<string>([
    ...declaredServers,
    ...(dialect.knownMcpServers ?? []),
  ]);
  const issues: McpToolIssue[] = [];
  const seen = new Set<string>();
  for (const raw of tools) {
    const server = mcpToolServer(raw, dialect);
    if (server === null) continue; // not a direct MCP tool / plugin-namespaced
    if (known.has(server)) continue;
    const tool = raw.split("(")[0].trim();
    if (seen.has(tool)) continue; // de-dupe a repeated entry
    seen.add(tool);
    issues.push({
      tool,
      server,
      message: `MCP tool "${tool}" references server "${server}", which the plugin doesn't declare (declared: ${declaredServers.join(", ")}) — the tool can't resolve.`,
    });
  }
  return issues;
}
