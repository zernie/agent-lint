/**
 * The pure, node-free half of the live MCP contract-tool check: the error shape
 * and its human-readable formatter, split out of `core/mcp.ts` (which statically
 * imports `node:child_process` + `./refs.js` for the SPAWN path) so a consumer
 * that only needs the message — the deterministic audit report — doesn't drag the
 * live-verification machinery into its bundle. `mcp.ts` re-exports both, so its
 * existing consumers are unchanged; `verifyMcpContractTools` (the spawn) stays
 * there. Node-free by construction (a local `assertNever`, no `node:` import).
 */

function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${String(x)}`);
}

export type McpContractToolReason = "server-unreachable" | "tool-missing";

export interface McpContractToolError {
  /** The full `mcp__server__tool` reference (restriction suffix stripped). */
  readonly tool: string;
  readonly server: string;
  /** The tool segment (what's looked up on the server). */
  readonly toolName: string;
  readonly reason: McpContractToolReason;
  readonly suggestions: string[];
}

/** Human-readable message for a contract-tool error (with "did you mean"). */
export function mcpContractToolMessage(e: McpContractToolError): string {
  switch (e.reason) {
    case "server-unreachable":
      return `MCP tool "${e.tool}" — server "${e.server}" failed to start`;
    case "tool-missing":
      return `MCP tool "${e.tool}" not found on server "${e.server}"${
        e.suggestions.length > 0
          ? ` — did you mean ${e.suggestions.map((s) => `"${s}"`).join(", ")}?`
          : ""
      }`;
    default:
      return assertNever(e.reason);
  }
}
