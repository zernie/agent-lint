# hook-matcher

Cross-reference each hook's **matcher string** against the harness tool catalog
and MCP server declarations. A matcher that doesn't exactly name an available
tool (or a valid MCP reference) silently **never fires** — the hook runs
zero times with no error, and the gate it was meant to provide is simply absent.

Same detector `vigiles audit` uses (`hookMatcherIssues` in
`src/core/hook-matcher.ts`); one detector, two callers, no drift.

## What it flags (three kinds)

### tool-typo — close casing / spelling error

A bare token that is a **close typo** (edit distance ≤ 2) of a real built-in
tool name. The harness's exact-string matcher means `bash` never matches a
`Bash` tool call:

```jsonc
"hooks": {
  "PreToolUse": [{ "matcher": "bash", "hooks": [{ "type": "command", "command": "…" }] }]
}
```

→ `bash` doesn't match any built-in. Did you mean `"Bash"`?

Reuses the same `closestTool` helper as `subagent-tool-contract` (≤ 2
edit-distance, one algorithm, no drift).

### mcp-form — MCP-ish token with the wrong shape

A token that **looks like** an MCP tool reference (starts with `mcp`, possibly
followed by underscores or hyphens) but is **not** the required
`mcp__<server>__<tool>` double-underscore form:

```jsonc
{ "matcher": "mcp_memory_search" }   // single underscores → never matches
{ "matcher": "mcp-memory-search" }   // hyphens → never matches
```

When the server/tool segments can be recovered, the corrected
`mcp__<server>__.*` form is suggested.

### mcp-undeclared — correct form, server not in declared set

A correctly-formed `mcp__<server>__<tool>` token whose server is **not** in the
plugin's declared MCP servers — the hook can never fire because the server isn't
available:

```jsonc
{ "matcher": "mcp__ghost__search" } // server "ghost" not declared
```

This mirrors the `mcp-tool-resolves` guard applied to the hook surface.

## FP-safety (high-precision — won't cry wolf)

| Guard                      | What it skips                                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wildcards / regex**      | `*`, `.*`, `**`, tokens ending with `.*` or `*` are patterns, not tool names — skipped entirely.                                                                      |
| **Alternation**            | `Edit\|Write`, `(Read\|Bash)` — combined matchers are skipped.                                                                                                        |
| **Far unknowns**           | A bare token with no close built-in match (edit distance > 2) is **not** flagged — it is likely a plugin/MCP tool name vigiles doesn't know about.                    |
| **No declared MCP set**    | If the plugin declares no MCP servers, `mcp-undeclared` is **never** raised — the server may exist at the user/project level (the same guard as `mcp-tool-resolves`). |
| **Built-in MCP servers**   | `mcp__ide__…` and other servers in `dialect.knownMcpServers` are allowlisted even when not declared (Claude Code's `ide` server is available everywhere).             |
| **Plugin-namespaced form** | `mcp__plugin_<name>_<server>__…` is skipped — the join is ambiguous.                                                                                                  |

De-duplicates repeated matchers (same string across multiple entries → one
finding).

## Configuration

```json
{ "rules": { "hook-matcher": "warn" } }
```

### Severity

| Value              | Behavior                                                |
| ------------------ | ------------------------------------------------------- |
| `"error"`          | `vigiles lint` exits non-zero (2) on a bad hook matcher |
| `"warn"` (default) | Prints a warning, exits 0                               |
| `false`            | Skip the check                                          |

## Scope

Reads each hook entry's `matcher` field from `.claude/settings.json` and the
plugin manifest (`.claude-plugin/plugin.json` / `hooks/hooks.json`). Runs
against the resolved harness dialect — a Codex repo's tool catalog and MCP
server list are injected via the Codex adapter.

## Why

A hook that never matches is enforcement that silently does nothing — exactly
the "false confidence" failure class vigiles exists to eliminate
(`research/hook-pain-points.md`). Catching a casing typo or a wrong MCP form
deterministically, at authoring time and for free, closes a gap no generic JSON
linter reaches (a linter can check syntax; only vigiles cross-references the
actual tool catalog and declared server list).

## See also

- [hook-events](hook-events.md) — a hook on a typo'd event name (silently never fires).
- [hook-block-ineffective](hook-block-ineffective.md) — a hook that appears to block but silently doesn't.
- [hook-script-exists](hook-script-exists.md) — a hook whose referenced script is missing.
- [mcp-tool-resolves](mcp-tool-resolves.md) — the same MCP-server guard applied to a subagent's tool contract.
- [docs/compiled-hooks.md](../compiled-hooks.md) — make the whole class of matcher bugs unrepresentable.
