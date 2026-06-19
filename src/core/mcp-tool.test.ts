/**
 * MCP-tool resolution detector suite (vitest) — the MCP half of the tool moat.
 * Grounded in the mid-2026 sweep: the three high-precision guards each map to a
 * real plugin shape (no-declaration → ananddtyagi, built-in `ide`, the
 * plugin-namespaced `mcp__plugin_…` form → han's playwright-mcp).
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import { verifyMcpToolServers, mcpToolServer } from "./mcp-tool.js";
import { claudeCodeDialect } from "../adapters/claude-code/dialect.js";

test("a declared server resolves cleanly", () => {
  assert.deepEqual(
    verifyMcpToolServers(
      ["Read", "mcp__github__search_issues"],
      ["github"],
      claudeCodeDialect,
    ),
    [],
  );
});

test("an undeclared server is flagged when the plugin declares a set", () => {
  const issues = verifyMcpToolServers(
    ["mcp__github__x", "mcp__linear__create_issue"],
    ["github"],
    claudeCodeDialect,
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].server, "linear");
  assert.equal(issues[0].tool, "mcp__linear__create_issue");
  assert.match(issues[0].message, /can't resolve/);
});

test("GUARD 1: no declared servers → nothing flagged (global/project servers)", () => {
  // ananddtyagi's agents reference mcp__ide__* with no .mcp.json — flagging would
  // cry wolf, since the server resolves at the user/project level.
  assert.deepEqual(
    verifyMcpToolServers(["mcp__linear__x"], [], claudeCodeDialect),
    [],
  );
});

test("GUARD 2: a built-in server (ide) is allowlisted even when undeclared", () => {
  assert.deepEqual(
    verifyMcpToolServers(
      ["mcp__ide__getDiagnostics", "mcp__ide__executeCode"],
      ["github"],
      claudeCodeDialect,
    ),
    [],
  );
});

test("GUARD 3: the plugin-namespaced mcp__plugin_…__ form is skipped", () => {
  // han's playwright-mcp: mcp__plugin_playwright-mcp_playwright__browser_click —
  // the plugin's own server under an ambiguous join, not interpreted.
  assert.deepEqual(
    verifyMcpToolServers(
      ["mcp__plugin_playwright-mcp_playwright__browser_click"],
      ["playwright"],
      claudeCodeDialect,
    ),
    [],
  );
});

test("a Tool(restriction) suffix is stripped before resolving the server", () => {
  const issues = verifyMcpToolServers(
    ["mcp__linear__x(read)"],
    ["github"],
    claudeCodeDialect,
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].server, "linear");
});

test("a repeated undeclared tool is reported once", () => {
  const issues = verifyMcpToolServers(
    ["mcp__linear__x", "mcp__linear__x"],
    ["github"],
    claudeCodeDialect,
  );
  assert.equal(issues.length, 1);
});

test("mcpToolServer extracts the server and skips non-MCP / plugin forms", () => {
  assert.equal(mcpToolServer("mcp__github__x", claudeCodeDialect), "github");
  assert.equal(mcpToolServer("Read", claudeCodeDialect), null);
  assert.equal(
    mcpToolServer("mcp__plugin_foo_bar__do", claudeCodeDialect),
    null,
  );
});
