# subagent-tool-contract

Cross-reference every **subagent's `tools:` rail** (`agents/*.md`) against the
harness tool catalog — the "valid is not true" cross-reference applied to a tool contract.
A subagent may only run a built-in tool or an MCP tool; anything else is a typo
or a tool the platform will never hand it, so the declared rail is silently wrong.

This is the same detector `vigiles audit` and `compileAgent` use
(`verifyToolContract` / `confidentToolIssues` in `src/core/tool-contract.ts`) —
one detector, three callers, no drift.

## What it flags (high-precision by design)

Only the two **high-confidence** cases, so it never cries wolf when auditing a
third-party plugin whose catalog vigiles can't fully know:

| Case                     | Example                                     | Why it's confident                                                                              |
| ------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **never-available** tool | `tools: Read, AskUserQuestion`              | `AskUserQuestion`/`Agent`/`ExitPlanMode`/… are a curated denylist — never exposed to a subagent |
| **close typo**           | `tools: Read, Edt` → _did you mean `Edit`?_ | edit distance ≤ 2 from a real built-in                                                          |

A **bare unrecognized** tool with no close match (e.g. a plugin-/MCP-provided
`TaskCreate`, `TeamCreate`, or a newer platform tool) is **NOT** flagged — it's
more likely a tool vigiles doesn't know than a defect. (Sweeping real plugins
found a 280★ plugin using `TaskCreate/TaskGet/…` consistently; flagging those
would be a false-positive flood.)

An inline array form (`tools: [Read, "Bash", Edit]`) and a `Tool(restriction)`
suffix (`Bash(git:*)`) are parsed/normalized before checking.

## Configuration

```json
{ "rules": { "subagent-tool-contract": "warn" } }
```

### Severity

| Value              | Behavior                                                       |
| ------------------ | -------------------------------------------------------------- |
| `"error"`          | `vigiles lint` exits non-zero (2) when a contract has an issue |
| `"warn"` (default) | Prints a warning, exits 0 — a nudge, not a gate                |
| `false`            | Skip the check entirely                                        |

## Scope

Scans `agents/*.md` and `.claude/agents/*.md`. An agent with **no** `tools:` line
inherits every tool — that's the separate inherits-all footgun (surfaced by
`scan`), not this rule. Codex repos have no subagent contracts, so this is a
no-op there.

## Why

`tools:` is documentation until something enforces it. A typo'd or never-available
tool means the agent silently runs without the rail its author intended — the kind
of dead reference vigiles exists to catch at authoring time, deterministically and
for free. The strict variant lives in `compileAgent`: when you author your own
spec, **every** unrecognized tool is an error (you control it); when auditing a
shipped plugin, only the high-confidence subset is flagged.
