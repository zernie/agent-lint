/**
 * Agent Plugins detection suite (vitest, pure): a manifest is claimed ONLY by its
 * `$schema`, never by the generic filename — `plugin.json` and `mcp.json` belong
 * to plenty of other tools, and claiming one of theirs would make the MCP checks
 * read a file that isn't ours. The read is injected, so no filesystem here.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  AGENT_PLUGINS_MANIFEST,
  AGENT_PLUGINS_MCP_CONFIG,
  isAgentPluginsManifest,
  agentPluginsMcpSources,
} from "./agent-plugins.js";

const CONFORMANT = JSON.stringify({
  $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  name: "demo",
});

/** An injected reader over a plain map — the browser engine uses the same shape. */
const readerFor =
  (files: Record<string, string>) =>
  (file: string): string | undefined =>
    files[file];

test("a manifest pinning the agent-plugins schema is recognized", () => {
  assert.equal(isAgentPluginsManifest(CONFORMANT), true);
});

test("a future spec version is still recognized (the host, not the exact version)", () => {
  const next = JSON.stringify({
    $schema: "https://agent-plugins.org/schemas/2.0.0/plugin.schema.json",
    name: "demo",
  });
  assert.equal(isAgentPluginsManifest(next), true);
});

test("someone else's plugin.json is NOT claimed", () => {
  // The filename is generic; only the schema decides. A `plugin.json` with no
  // `$schema`, a non-string one, or another vendor's URL is not ours.
  assert.equal(isAgentPluginsManifest(JSON.stringify({ name: "demo" })), false);
  assert.equal(isAgentPluginsManifest(JSON.stringify({ $schema: 7 })), false);
  assert.equal(
    isAgentPluginsManifest(
      JSON.stringify({ $schema: "https://example.com/other.schema.json" }),
    ),
    false,
  );
});

test("malformed or non-object JSON is not claimed and never throws", () => {
  assert.equal(isAgentPluginsManifest("{ not json"), false);
  assert.equal(isAgentPluginsManifest("null"), false);
  assert.equal(isAgentPluginsManifest("42"), false);
  assert.equal(isAgentPluginsManifest('"a string"'), false);
  assert.equal(isAgentPluginsManifest(""), false);
});

test("the standard's mcp.json is read only when the manifest declares the plugin", () => {
  const sources = agentPluginsMcpSources(
    readerFor({ [AGENT_PLUGINS_MANIFEST]: CONFORMANT }),
  );
  assert.deepEqual(sources, [AGENT_PLUGINS_MCP_CONFIG]);
});

test("no manifest, or a manifest that isn't ours, yields no extra source", () => {
  assert.deepEqual(agentPluginsMcpSources(readerFor({})), []);
  assert.deepEqual(
    agentPluginsMcpSources(
      readerFor({ [AGENT_PLUGINS_MANIFEST]: JSON.stringify({ name: "x" }) }),
    ),
    [],
  );
});
