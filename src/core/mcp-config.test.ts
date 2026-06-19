/**
 * MCP-config detector suite (vitest). A server is reachable via a `command`
 * (stdio) or a `url` (http/sse); neither → it can't start.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import { verifyMcpServers } from "./mcp-config.js";

test("a stdio (command) and an http (url) server both pass", () => {
  assert.deepEqual(
    verifyMcpServers({
      local: { command: "node", args: ["s.js"] },
      remote: { url: "https://example.com/sse", type: "sse" },
    }),
    [],
  );
});

test("a server with neither command nor url is flagged", () => {
  const issues = verifyMcpServers({ broken: { args: ["x"] } });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].server, "broken");
  assert.match(issues[0].message, /can't start/);
});

test("a non-object entry is flagged", () => {
  const issues = verifyMcpServers({ weird: "just-a-string" });
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /not a config object/);
});

test("an empty command/url string doesn't count", () => {
  assert.equal(verifyMcpServers({ s: { command: "" } }).length, 1);
});
