/**
 * MCP-config verification — a declared MCP server that can't start. Each server
 * entry must say HOW to reach it: a `command` (stdio server) OR a `url` (http/sse
 * server). An entry with neither is malformed — the server silently never comes
 * up, and the tools it was meant to provide are missing. A JSON linter sees valid
 * JSON; only an MCP-shape-aware check knows the entry is unreachable.
 *
 * Pure + FP-safe: the command-or-url requirement is unambiguous (not a catalog we
 * might have wrong). ONE detector reused by scan + the `mcp-config` lint rule.
 */

export interface McpIssue {
  readonly server: string;
  readonly message: string;
}

/**
 * Validate a `mcpServers` map. Returns one issue per entry that declares neither
 * a `command` (stdio) nor a `url` (http/sse) — the two ways to reach a server.
 */
export function verifyMcpServers(servers: Record<string, unknown>): McpIssue[] {
  const issues: McpIssue[] = [];
  for (const [server, raw] of Object.entries(servers)) {
    if (typeof raw !== "object" || raw === null) {
      issues.push({
        server,
        message: `MCP server "${server}" is not a config object.`,
      });
      continue;
    }
    const cfg = raw as Record<string, unknown>;
    const hasCommand =
      typeof cfg.command === "string" && cfg.command.length > 0;
    const hasUrl = typeof cfg.url === "string" && cfg.url.length > 0;
    if (!hasCommand && !hasUrl) {
      issues.push({
        server,
        message: `MCP server "${server}" declares neither a "command" (stdio) nor a "url" (http/sse) — it can't start.`,
      });
    }
  }
  return issues;
}
