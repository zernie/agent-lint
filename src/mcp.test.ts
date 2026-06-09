/**
 * Tests for the MCP tool-reference verifier (src/mcp.ts), exercised against a
 * REAL minimal MCP server (examples/harness/fixture-mcp-server.mjs) — it speaks
 * the actual stdio JSON-RPC protocol, so these are deterministic and offline.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { listMcpTools, verifyMcpTool, type McpServerConfig } from "./mcp.js";

// __dirname is dist/ at runtime; the fixture server lives at the repo root.
const server: McpServerConfig = {
  command: process.execPath, // node
  args: [join(__dirname, "../examples/harness/fixture-mcp-server.mjs")],
};

test("listMcpTools: handshakes a real stdio MCP server and lists its tools", async () => {
  const tools = await listMcpTools(server);
  assert.deepEqual(tools.map((t) => t.name).sort(), ["add", "echo"]);
  assert.equal(
    tools.find((t) => t.name === "echo")?.description,
    "Echo back the input.",
  );
});

test("verifyMcpTool: an existing tool resolves", async () => {
  const r = await verifyMcpTool(server, "echo");
  assert.equal(r.exists, true);
  assert.deepEqual(r.suggestions, []);
});

test("verifyMcpTool: a typo'd tool fails with a closest-match suggestion", async () => {
  const r = await verifyMcpTool(server, "ekho");
  assert.equal(r.exists, false);
  assert.ok(
    r.suggestions.includes("echo"),
    `expected "echo" suggested for "ekho", got ${JSON.stringify(r.suggestions)}`,
  );
});

test("verifyMcpTool: reports the available tools for a renamed reference", async () => {
  // The real-world case: a skill cites a tool the server no longer exposes.
  const r = await verifyMcpTool(server, "create_thing");
  assert.equal(r.exists, false);
  assert.deepEqual(r.available.sort(), ["add", "echo"]);
});

test("listMcpTools: throws cleanly when the server command does not exist", async () => {
  await assert.rejects(
    listMcpTools({ command: "definitely-not-a-real-binary-xyz" }, 3000),
  );
});
