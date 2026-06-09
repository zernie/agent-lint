/**
 * Tests for the MCP tool-reference verifier (src/mcp.ts), exercised against a
 * REAL minimal MCP server (examples/harness/fixture-mcp-server.mjs) — it speaks
 * the actual stdio JSON-RPC protocol, so these are deterministic and offline.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { join } from "node:path";

import {
  listMcpTools,
  verifyMcpTool,
  parseMcpRefs,
  verifyMcpRefs,
  type McpServerConfig,
} from "./mcp.js";

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

test("parseMcpRefs: extracts vigiles:mcp marks, skipping fenced blocks", () => {
  const md = [
    "Use `vigiles:mcp fixture#echo` and `vigiles:mcp fixture#add`.",
    "```",
    "`vigiles:mcp fixture#ignored`",
    "```",
  ].join("\n");
  assert.deepEqual(
    parseMcpRefs(md).map((r) => r.tool),
    ["echo", "add"],
  );
});

test("verifyMcpRefs: ok passes, typo errors+suggests, undeclared server flagged", async () => {
  const md =
    "`vigiles:mcp fixture#echo` `vigiles:mcp fixture#ekho` `vigiles:mcp ghost#whatever`";
  const errs = await verifyMcpRefs(md, { fixture: server });
  assert.equal(errs.length, 2); // echo is fine
  const ekho = errs.find((e) => e.tool === "ekho");
  assert.equal(ekho?.reason, "tool-missing");
  assert.ok(ekho?.suggestions.includes("echo"));
  assert.equal(
    errs.find((e) => e.server === "ghost")?.reason,
    "server-undeclared",
  );
});
