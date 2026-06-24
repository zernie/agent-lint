# mcp-config

Flag a declared **MCP server** that can't start. Every server entry must say how
to reach it — a `command` (a stdio server) **or** a `url` (an http/sse server).
An entry with neither is malformed: the server silently never comes up and the
tools it was meant to provide are missing. Same detector `vigiles scan` uses
(`verifyMcpServers` in `src/core/mcp-config.ts`); one detector, two callers.

## What it flags

```jsonc
"mcpServers": {
  "good":   { "command": "node", "args": ["server.js"] }, // ✓ stdio
  "remote": { "url": "https://example.com/sse" },          // ✓ http/sse
  "broken": { "args": ["x"] }                              // ✗ no command/url — can't start
}
```

FP-safe: the command-or-url requirement is unambiguous (not a catalog that could
be incomplete), so every offending entry is a real defect.

## Configuration

```json
{ "rules": { "mcp-config": "warn" } }
```

### Severity

| Value              | Behavior                                                   |
| ------------------ | ---------------------------------------------------------- |
| `"error"`          | `vigiles lint` exits non-zero (2) on an unstartable server |
| `"warn"` (default) | Prints a warning, exits 0                                  |
| `false`            | Skip the check                                             |

## Scope

Reads `mcpServers` from `.mcp.json` and the plugin manifest
(`.claude-plugin/plugin.json`). Codex's TOML `[mcp_servers]` is not yet parsed (a
documented gap — the JSON Claude Code shape is the common case).

## Why

An MCP server is how a plugin extends the agent's tools; a misconfigured one is a
silent capability gap. Catching an unstartable server deterministically, before
it ships, is the same verification applied to the MCP surface.
