/**
 * MCP-hook target verification — the cross-referencing moat applied to a
 * `type: "mcp_tool"` HOOK action. Claude Code hooks support five action types
 * (command / http / mcp_tool / prompt / agent); an `mcp_tool` action calls a tool
 * on an already-connected MCP server and REQUIRES a `server` + `tool` field. Two
 * ways it silently never fires:
 *
 *   1. it omits `server` or `tool` — malformed, can't dispatch (unambiguous, like
 *      mcp-config; always flagged);
 *   2. its `server` isn't one the plugin declares — can't resolve (gated on the
 *      plugin shipping a declared `mcpServers` set, exactly like mcp-tool-resolves;
 *      built-in servers such as `ide` are allowlisted).
 *
 * Pure + high-precision. ONE detector reused by scan + the
 * `mcp-hook-target-resolves` lint rule. The dialect is injected (core ⊄ adapter).
 *
 * Scope note: the matcher surface (a `mcp__server__.*` matcher naming an
 * undeclared server) is a DIFFERENT, regex-shaped check left to a future
 * `hook-matcher` rule — this one is the literal `mcp_tool` action target only.
 */
import type { HarnessDialect } from "./dialect.js";

export type McpHookIssueKind = "incomplete" | "undeclared-server";

export interface McpHookIssue {
  readonly server: string | null;
  readonly kind: McpHookIssueKind;
  readonly message: string;
}

/**
 * Collect the action objects from a hooks config. The canonical Claude Code shape
 * is `{ <event>: [ { matcher?, hooks: [ <action>, … ] }, … ] }`; we also tolerate
 * an entry that IS an action (a `type` field directly). Non-object input → none.
 */
function collectHookActions(hooks: unknown): Record<string, unknown>[] {
  const actions: Record<string, unknown>[] = [];
  if (hooks === null || typeof hooks !== "object") return actions;
  for (const groups of Object.values(hooks as Record<string, unknown>)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (group === null || typeof group !== "object") continue;
      const g = group as Record<string, unknown>;
      if (Array.isArray(g.hooks)) {
        for (const a of g.hooks)
          if (a !== null && typeof a === "object")
            actions.push(a as Record<string, unknown>);
      } else if (typeof g.type === "string") {
        actions.push(g);
      }
    }
  }
  return actions;
}

/**
 * Verify every `type: "mcp_tool"` hook action against the plugin's declared MCP
 * servers. Returns an {@link McpHookIssue} for each incomplete action (no
 * `server`/`tool`) and — when the plugin declares a server set — each action
 * whose `server` is neither declared nor a known built-in.
 */
export function verifyMcpHookTargets(
  hooks: unknown,
  declaredServers: readonly string[],
  dialect: HarnessDialect,
): McpHookIssue[] {
  const known = new Set<string>([
    ...declaredServers,
    ...(dialect.knownMcpServers ?? []),
  ]);
  const issues: McpHookIssue[] = [];
  for (const action of collectHookActions(hooks)) {
    if (action.type !== "mcp_tool") continue;
    const server = typeof action.server === "string" ? action.server : "";
    const tool = typeof action.tool === "string" ? action.tool : "";
    if (server === "" || tool === "") {
      issues.push({
        server: server || null,
        kind: "incomplete",
        message: `mcp_tool hook is missing a ${server === "" ? "server" : "tool"} field — it can't dispatch.`,
      });
      continue;
    }
    // Gate: with no declared set the server may be user-global/project (unknowable).
    if (declaredServers.length === 0) continue;
    if (known.has(server)) continue;
    issues.push({
      server,
      kind: "undeclared-server",
      message: `mcp_tool hook targets server "${server}", which the plugin doesn't declare (declared: ${declaredServers.join(", ")}) — the hook can't resolve.`,
    });
  }
  return issues;
}
