#!/usr/bin/env node
/**
 * A minimal but REAL MCP server over stdio (newline-delimited JSON-RPC 2.0),
 * for deterministic, offline tests of vigiles' MCP tool-reference verification
 * (src/mcp.ts). It speaks the actual protocol — initialize + tools/list — and
 * exposes two tools (`echo`, `add`). No deps, no network.
 */
let buffer = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let nl = buffer.indexOf("\n");
  while (nl >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (line) handle(line);
    nl = buffer.indexOf("\n");
  }
});

function send(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function handle(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "fixture", version: "0.0.0" },
      },
    });
  } else if (msg.method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        tools: [
          { name: "echo", description: "Echo back the input." },
          { name: "add", description: "Add two numbers." },
        ],
      },
    });
  } else if (msg.method === "notifications/initialized") {
    // notification — no response
  } else if (msg.id !== undefined) {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      error: { code: -32601, message: "method not found" },
    });
  }
}
