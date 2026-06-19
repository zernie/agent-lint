# mcp-hook-target-resolves

Cross-reference a `type: "mcp_tool"` **hook action** against the plugin's declared
MCP servers. Claude Code hooks support five action types (command / http /
mcp_tool / prompt / agent); an `mcp_tool` action calls a tool on an
already-connected MCP server and **requires** a `server` + `tool` field. This rule
flags two ways it silently never dispatches. Same detector `vigiles scan` uses
(`verifyMcpHookTargets` in `src/core/mcp-hook.ts`).

It extends the tool moat to the **hook** surface — sibling of
[`mcp-tool-resolves`](mcp-tool-resolves.md) (a subagent's `mcp__server__tool`) and
[`mcp-config`](mcp-config.md) (a server that can't start).

## What it flags

```jsonc
"hooks": {
  "PreToolUse": [{ "matcher": "Bash", "hooks": [
    { "type": "mcp_tool", "server": "github", "tool": "search" },  // ✓ declared
    { "type": "mcp_tool", "server": "linear", "tool": "create" },  // ✗ undeclared server
    { "type": "mcp_tool", "server": "github" }                      // ✗ incomplete (no tool)
  ]}]
}
```

1. **Incomplete** — an `mcp_tool` action missing `server` or `tool`. Unambiguous
   (it can't dispatch), so always flagged, like `mcp-config`.
2. **Undeclared server** — the `server` isn't in the plugin's `mcpServers`.
   High-precision: only flagged when the plugin **ships** a declared set (else the
   server may be user-global/project, unknowable), and harness built-ins (`ide`)
   are allowlisted — exactly the `mcp-tool-resolves` calibration.

A `command`/`http`/`prompt`/`agent` action is ignored. The **matcher** surface (a
`mcp__server__.*` matcher naming an undeclared server) is a separate regex-shaped
concern left to a future `hook-matcher` rule.

## Configuration

```json
{ "rules": { "mcp-hook-target-resolves": "warn" } }
```

### Severity

| Value              | Behavior                                                      |
| ------------------ | ------------------------------------------------------------- |
| `"error"`          | `vigiles lint` exits non-zero (2) on an offending hook action |
| `"warn"` (default) | Prints a warning, exits 0                                     |
| `false`            | Skip the check                                                |

## Scope

Hook actions in `.claude/settings.json` and the plugin manifest
(`.claude-plugin/plugin.json`); declared servers read from `.mcp.json` + the
manifest `mcpServers`.

## Why

An `mcp_tool` hook is deterministic machinery that depends on an MCP server being
present; one pointed at a server the plugin never declares (or missing its target
fields) is a silent no-op — the author believes the automation runs when it can't.

## See also

- [mcp-tool-resolves](mcp-tool-resolves.md) — the same cross-reference for a
  subagent's `tools:`.
- [mcp-config](mcp-config.md) — a declared MCP server that can't _start_.
