#!/usr/bin/env node
// A tiny self-contained MCP server (stdio JSON-RPC) for the vigiles demo.
// Exposes two tools: `log` and `purge`.
let b = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (c) => {
  b += c;
  let nl;
  while ((nl = b.indexOf("\n")) >= 0) {
    const line = b.slice(0, nl).trim();
    b = b.slice(nl + 1);
    if (!line) continue;
    let m;
    try {
      m = JSON.parse(line);
    } catch {
      continue;
    }
    if (m.method === "initialize")
      send({
        jsonrpc: "2.0",
        id: m.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "helper", version: "0" },
        },
      });
    else if (m.method === "tools/list")
      send({
        jsonrpc: "2.0",
        id: m.id,
        result: {
          tools: [
            { name: "log", description: "Log a line." },
            { name: "purge", description: "Delete stale data." },
          ],
        },
      });
    else if (m.id !== undefined && m.method !== "notifications/initialized")
      send({
        jsonrpc: "2.0",
        id: m.id,
        error: { code: -32601, message: "method not found" },
      });
  }
});
function send(o) {
  process.stdout.write(JSON.stringify(o) + "\n");
}
