# mcp-tool-resolves

Cross-reference an `mcp__server__tool` in a subagent's `tools:` contract against
the plugin's **declared MCP servers**. If the plugin declares its own servers
(`.mcp.json` / manifest `mcpServers`) and a contract names a server that isn't
among them, the tool can't resolve — a dead contract entry.

This is the **MCP half of the tool cross-reference**:
[`subagent-tool-contract`](subagent-tool-contract.md) verifies a subagent's _built-in_
tools but passes any `mcp__*` token through unchecked; this rule verifies the MCP
half. Same detector `vigiles scan` uses (`verifyMcpToolServers` in
`src/core/mcp-tool.ts`) — one detector, two callers.

## What it flags

Given a plugin that declares `github` in `.mcp.json`:

```yaml
# agents/reviewer.md
tools: Read, mcp__github__search, mcp__linear__create, mcp__ide__getDiagnostics
```

- `mcp__github__search` — server **declared** → ✓
- `mcp__ide__getDiagnostics` — a harness **built-in** server (allowlisted) → ✓
- `mcp__linear__create` — server **not declared** → ✗ can't resolve

## High-precision calibration

Auditing third-party plugins means flagging only high-confidence dead references.
Three guards, each grounded in a real plugin from the mid-2026 sweep:

1. **Gate on a declared set.** Only flags when the plugin _ships_ a `mcpServers`
   declaration. A plugin that declares no servers reaches user-global /
   project-level ones (the normal pattern — ananddtyagi's agents reference
   `mcp__ide__*` with no `.mcp.json`), so flagging there would cry wolf.
2. **Allowlist built-ins.** A harness-provided server
   (`HarnessDialect.knownMcpServers`, e.g. Claude Code's `ide`) is available
   without a declaration and is never flagged.
3. **Skip the plugin-namespaced form.** Claude Code rewrites a plugin's own MCP
   tool to `mcp__plugin_<plugin>_<server>__<tool>` (observed on han's
   playwright-mcp). Those segments join ambiguously and the ref is by
   construction the plugin's own server, so the form is left uninterpreted.

## Configuration

```json
{ "rules": { "mcp-tool-resolves": "warn" } }
```

### Severity

| Value              | Behavior                                                      |
| ------------------ | ------------------------------------------------------------- |
| `"error"`          | `vigiles lint` exits non-zero (2) on an unresolvable MCP tool |
| `"warn"` (default) | Prints a warning, exits 0                                     |
| `false`            | Skip the check                                                |

## Scope

Subagent contracts (`agents/*.md` `tools:`). Reads declared servers from
`.mcp.json` and the plugin manifest (`.claude-plugin/plugin.json`). Codex's TOML
`[mcp_servers]` is not yet parsed (a documented gap — the JSON Claude Code shape
is the common case).

A skill's `allowed-tools` is a different namespace and is deliberately not
checked here, mirroring `subagent-tool-contract`.

## Why

An `mcp__*` tool is how a subagent reaches an MCP server's capability. A contract
naming a server the plugin forgot to declare (or typo'd) is a silent capability
gap — the tool simply isn't there at runtime. Catching it deterministically,
before it ships, completes the cross-referencing across the whole tool
surface.

## See also

- [subagent-tool-contract](subagent-tool-contract.md) — the built-in half of the check.
- [mcp-config](mcp-config.md) — a declared MCP server that can't _start_.
