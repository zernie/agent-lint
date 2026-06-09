/**
 * Minimal MCP client over stdio — start a server, do the JSON-RPC handshake, and
 * list its tools. This lets vigiles VERIFY a referenced `mcp__server__tool`
 * resolves against the real server (the way `enforce()` resolves a linter rule
 * against its catalog), catching a skill/CLAUDE.md that cites an MCP tool that was
 * renamed or removed — e.g. the GitHub MCP server renaming `create_issue` →
 * `issue_write`, which otherwise fails silently at runtime.
 *
 * MCP stdio transport = newline-delimited JSON-RPC 2.0.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inlineSpans } from "./refs.js";
import { assertNever } from "./hash.js";

export interface McpServerConfig {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Record<string, string>;
  readonly cwd?: string;
}

export interface McpToolInfo {
  readonly name: string;
  readonly description?: string;
}

interface RpcResponse {
  id?: number;
  result?: { tools?: McpToolInfo[] };
  error?: { message?: string };
}

interface Pending {
  resolve: (msg: RpcResponse) => void;
  reject: (err: Error) => void;
}

function dispatch(line: string, pending: Map<number, Pending>): void {
  let msg: RpcResponse;
  try {
    msg = JSON.parse(line) as RpcResponse;
  } catch {
    return;
  }
  if (typeof msg.id !== "number") return;
  const p = pending.get(msg.id);
  if (p) {
    pending.delete(msg.id);
    p.resolve(msg);
  }
}

/**
 * Start an MCP server over stdio, complete the handshake, and return its tools.
 * Kills the server when done. Throws on spawn/timeout/exit/protocol error.
 */
export async function listMcpTools(
  server: McpServerConfig,
  timeoutMs = 10000,
): Promise<McpToolInfo[]> {
  const child = spawn(server.command, [...(server.args ?? [])], {
    env: server.env ? { ...process.env, ...server.env } : process.env,
    cwd: server.cwd,
    stdio: ["pipe", "pipe", "ignore"],
  });
  const { stdin, stdout } = child;
  if (!stdin || !stdout) {
    child.kill("SIGKILL");
    throw new Error("failed to open MCP server stdio");
  }

  const pending = new Map<number, Pending>();
  const failAll = (err: Error): void => {
    for (const [, p] of pending) p.reject(err);
    pending.clear();
  };

  let buffer = "";
  stdout.setEncoding("utf-8");
  stdout.on("data", (chunk: string) => {
    buffer += chunk;
    let nl = buffer.indexOf("\n");
    while (nl >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) dispatch(line, pending);
      nl = buffer.indexOf("\n");
    }
  });
  child.on("error", (e) => {
    failAll(e);
  });
  child.on("close", () => {
    failAll(new Error("MCP server exited before responding"));
  });

  const send = (obj: unknown): void => {
    stdin.write(`${JSON.stringify(obj)}\n`);
  };
  const request = (
    id: number,
    method: string,
    params: unknown,
  ): Promise<RpcResponse> =>
    new Promise<RpcResponse>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      send({ jsonrpc: "2.0", id, method, params });
    });

  const timer = setTimeout(() => {
    failAll(new Error(`MCP server timed out after ${String(timeoutMs)}ms`));
    child.kill("SIGKILL");
  }, timeoutMs);

  try {
    await request(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "vigiles", version: "0" },
    });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    const res = await request(2, "tools/list", {});
    if (res.error) {
      throw new Error(`tools/list failed: ${res.error.message ?? "unknown"}`);
    }
    return (res.result?.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
    }));
  } finally {
    clearTimeout(timer);
    child.kill("SIGKILL");
  }
}

export interface McpRefResult {
  readonly exists: boolean;
  readonly available: string[];
  readonly suggestions: string[];
}

/**
 * Verify `toolName` exists on `server`; on a miss, suggest the closest tool names
 * (edit distance) — "did you mean issue_write?".
 */
export async function verifyMcpTool(
  server: McpServerConfig,
  toolName: string,
  timeoutMs = 10000,
): Promise<McpRefResult> {
  const available = (await listMcpTools(server, timeoutMs)).map((t) => t.name);
  const exists = available.includes(toolName);
  return {
    exists,
    available,
    suggestions: exists ? [] : closest(toolName, available),
  };
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function closest(target: string, candidates: string[], max = 4): string[] {
  return candidates
    .map((c) => ({ c, d: editDistance(target, c) }))
    .filter((x) => x.d <= max)
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map((x) => x.c);
}

// --- MCP tool references in instruction files ------------------------------

// `vigiles:mcp <server>#<tool>` inside an inline code span — the MCP analogue of
// the `vigiles:symbol path#name` mark. Self-contained (server + tool in one
// token) so it binds unambiguously.
const MCP_MARK = /^vigiles:mcp\s+([\w-]+)#([\w.-]+)$/;

export interface McpRef {
  readonly server: string;
  readonly tool: string;
  readonly line: number;
}

export type McpRefReason =
  | "server-undeclared"
  | "server-unreachable"
  | "tool-missing";

export interface McpRefError extends McpRef {
  readonly reason: McpRefReason;
  readonly suggestions: string[];
}

/** Parse `vigiles:mcp server#tool` marks from a markdown file's inline spans. */
export function parseMcpRefs(markdown: string): McpRef[] {
  const refs: McpRef[] = [];
  for (const span of inlineSpans(markdown)) {
    const m = MCP_MARK.exec(span.text);
    if (m) refs.push({ server: m[1], tool: m[2], line: span.line });
  }
  return refs;
}

/** Read `mcpServers` from `.mcp.json` (the stdio-server config map), or `{}`. */
export function loadMcpServers(cwd: string): Record<string, McpServerConfig> {
  const p = join(cwd, ".mcp.json");
  if (!existsSync(p)) return {};
  try {
    const json = JSON.parse(readFileSync(p, "utf-8")) as {
      mcpServers?: Record<string, McpServerConfig>;
    };
    return json.mcpServers ?? {};
  } catch {
    return {};
  }
}

async function verifyOneServer(
  group: McpRef[],
  cfg: McpServerConfig | undefined,
  timeoutMs: number,
): Promise<McpRefError[]> {
  if (!cfg) {
    return group.map((r) => ({
      ...r,
      reason: "server-undeclared" as const,
      suggestions: [],
    }));
  }
  let available: string[];
  try {
    available = (await listMcpTools(cfg, timeoutMs)).map((t) => t.name);
  } catch {
    return group.map((r) => ({
      ...r,
      reason: "server-unreachable" as const,
      suggestions: [],
    }));
  }
  const errs: McpRefError[] = [];
  for (const r of group) {
    if (!available.includes(r.tool)) {
      errs.push({
        ...r,
        reason: "tool-missing",
        suggestions: closest(r.tool, available),
      });
    }
  }
  return errs;
}

/**
 * Verify every `vigiles:mcp server#tool` mark in `markdown` against the live
 * servers in `mcpServers` (each referenced server is started once). A reference
 * to an undeclared server, an unreachable server, or a missing tool is an error.
 */
export async function verifyMcpRefs(
  markdown: string,
  mcpServers: Record<string, McpServerConfig>,
  timeoutMs = 10000,
): Promise<McpRefError[]> {
  const byServer = new Map<string, McpRef[]>();
  for (const r of parseMcpRefs(markdown)) {
    const arr = byServer.get(r.server) ?? [];
    arr.push(r);
    byServer.set(r.server, arr);
  }
  const all: McpRefError[] = [];
  for (const [server, group] of byServer) {
    all.push(...(await verifyOneServer(group, mcpServers[server], timeoutMs)));
  }
  return all;
}

/** Human-readable message for an MCP reference error (with "did you mean"). */
export function mcpRefMessage(e: McpRefError): string {
  switch (e.reason) {
    case "server-undeclared":
      return `MCP server "${e.server}" is not declared in .mcp.json`;
    case "server-unreachable":
      return `MCP server "${e.server}" failed to start`;
    case "tool-missing":
      return `MCP tool "${e.server}#${e.tool}" not found${
        e.suggestions.length > 0
          ? ` — did you mean ${e.suggestions.map((s) => `"${s}"`).join(", ")}?`
          : ""
      }`;
    default:
      return assertNever(e.reason);
  }
}
