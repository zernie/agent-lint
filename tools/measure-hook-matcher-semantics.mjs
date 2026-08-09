#!/usr/bin/env node
/**
 * MEASURE how the harness actually matches a hook `matcher` — the ground truth
 * behind `src/core/hook-matcher.ts` (and behind issue #131, where the detector
 * had judged a matcher by its literal SHAPE and inverted its verdict on both
 * contested MCP forms).
 *
 * Nothing here is argued. Each row runs the real `claude` CLI against the
 * scripted mock model (no API key, no cost), with ONE PostToolUse hook whose
 * matcher is under test and whose only job is to append a marker to a file.
 * The marker is the oracle: present ⇒ the hook fired.
 *
 * Two suites:
 *   builtin — matchers against a `Write` call (is a matcher a literal or a regex,
 *             and is the regex anchored?)
 *   mcp     — matchers against a REAL MCP server connected under a name given by
 *             --server (default `some_server`, an underscore inside the server
 *             segment like Anthropic's own `Google_Calendar` connector). Pass a
 *             uuid-shaped name to measure the hyphenated form of the same server.
 *
 * Run (from the repo root, after `npm run build`):
 *   node tools/measure-hook-matcher-semantics.mjs
 *   node tools/measure-hook-matcher-semantics.mjs --suite=mcp
 *   node tools/measure-hook-matcher-semantics.mjs --suite=mcp --server=4f54037d-0499-426a-8573-6130f3da1ef8
 *
 * Measured 2026-08-09 on claude 2.1.226 (the table lives in the detector header
 * and docs/rules/hook-matcher.md):
 *   `Write` fires · `Writ`/`rit` do NOT · `rit.` and `W(rit)e` DO
 *     ⇒ no metacharacter = string EQUALITY; metacharacters = an UNANCHORED regex.
 *   `mcp__.*` and `mcp__.*__.*` fire on both server namings.
 *   `mcp__[^_]+__[^_]+` does NOT fire on `mcp__some_server__…`  (but does on the uuid).
 *   `mcp__\w+__\w+`     does NOT fire on `mcp__<uuid>__…`       (but does on some_server).
 */
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { runHarnessTest, scriptModel, claudeAvailable } =
  await import("../dist/harness-test.js").then((m) => m.default ?? m);

const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ??
  fallback;

const suite = arg("suite", "builtin");
const server = arg("server", "some_server");

const BUILTIN_MATCHERS = ["Write", "Writ", "rit", "rit.", "W(rit)e", "rit|zzz"];
const MCP_MATCHERS = [
  `mcp__${server}__list_events`,
  "mcp__.*",
  "mcp__.*__.*",
  "mcp__[^_]+__[^_]+",
  "mcp__\\w+__\\w+",
  "NoSuchToolAtAll",
];

/** A minimal REAL MCP server over stdio that also answers `tools/call`. */
const MCP_SERVER_SOURCE = `
let buf = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (c) => {
  buf += c;
  let nl = buf.indexOf("\\n");
  while (nl >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line) handle(line);
    nl = buf.indexOf("\\n");
  }
});
const send = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
function handle(line) {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.method === "initialize")
    send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "0.0.0" } } });
  else if (m.method === "tools/list")
    send({ jsonrpc: "2.0", id: m.id, result: { tools: [{ name: "list_events", description: "List events.", inputSchema: { type: "object", properties: {} } }] } });
  else if (m.method === "tools/call")
    send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: "one event" }] } });
  else if (m.method !== "notifications/initialized" && m.id !== undefined)
    send({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "method not found" } });
}
`;

const hookOn = (matcher) => ({
  PostToolUse: [
    {
      matcher,
      hooks: [{ type: "command", command: "echo FIRED >> {cwd}/hook.log" }],
    },
  ],
});

async function probeBuiltin(matcher) {
  const r = await runHarnessTest({
    settings: { hooks: hookOn(matcher) },
    model: scriptModel([
      { tool: "Write", input: { file_path: "hello.txt", content: "banana" } },
      { text: "done" },
    ]),
    timeoutMs: 120000,
  });
  try {
    return {
      matcher,
      tool: "Write",
      ran: r.file("hello.txt") === "banana",
      fired: /FIRED/.test(r.file("hook.log") ?? ""),
    };
  } finally {
    await r.cleanup?.();
  }
}

async function probeMcp(matcher, serverPath) {
  const tool = `mcp__${server}__list_events`;
  const r = await runHarnessTest({
    files: {
      ".mcp.json": JSON.stringify({
        mcpServers: { [server]: { command: "node", args: [serverPath] } },
      }),
    },
    settings: { enableAllProjectMcpServers: true, hooks: hookOn(matcher) },
    allowedTools: ["Read", "Write", "Bash", tool],
    transcript: true,
    model: scriptModel([{ tool, input: {} }, { text: "done" }]),
    timeoutMs: 120000,
  });
  try {
    return {
      matcher,
      tool,
      ran: (r.toolCalls ?? []).some((c) => c.name === tool),
      fired: /FIRED/.test(r.file("hook.log") ?? ""),
    };
  } finally {
    await r.cleanup?.();
  }
}

if (!claudeAvailable()) {
  console.error("claude CLI not on PATH — this measurement needs it (no key).");
  process.exit(77);
}

const dir = mkdtempSync(join(tmpdir(), "vigiles-matcher-"));
const serverPath = join(dir, "mcp-server.mjs");
writeFileSync(serverPath, MCP_SERVER_SOURCE);

const rows = [];
try {
  for (const m of suite === "mcp" ? MCP_MATCHERS : BUILTIN_MATCHERS) {
    const row =
      suite === "mcp" ? await probeMcp(m, serverPath) : await probeBuiltin(m);
    rows.push(row);
    console.log(JSON.stringify(row));
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n--- ${suite} suite (server: ${server}) ---`);
console.table(rows);
