# hook-events

Cross-reference each hook's **event name** against the harness event catalog — a
hook registered under a name the platform doesn't define silently **never fires**,
a dead registration no generic JSON linter catches. Same detector `vigiles scan`
uses (`verifyHookEvents` / `confidentHookEventIssues` in
`src/core/hook-events.ts`); one detector, two callers, no drift.

## What it flags (high-precision)

Only a **close typo** of a real event (edit distance ≤ 2, with a did-you-mean):

```jsonc
"hooks": { "PreToolUSe": [ … ] }   // ✗ never fires. Did you mean "PreToolUse"?
```

A **bare unrecognized** event with no near match is **NOT** flagged. The event
set is not closed in practice — frameworks extend it (TheBushidoCollective/han
ships a custom runtime with `TeammateIdle`, `WorktreeRemove`, … in its own
`hooks.json`), so flagging those would be crying wolf. Only the canonical
object-keyed-by-event shape is checked; a plugin shipping a hooks **array** (a
non-CC custom format whose events live inside each entry) is skipped entirely.

The real Claude Code events: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`,
`Notification`, `Stop`, `SubagentStop`, `PreCompact`, `SessionStart`,
`SessionEnd`.

## Configuration

```json
{ "rules": { "hook-events": "warn" } }
```

### Severity

| Value              | Behavior                                                 |
| ------------------ | -------------------------------------------------------- |
| `"error"`          | `vigiles lint` exits non-zero (2) on a typo'd hook event |
| `"warn"` (default) | Prints a warning, exits 0                                |
| `false`            | Skip the check                                           |

## Scope

Reads the repo's hook configuration (`plugin.json` / `.claude/settings.json` /
`hooks/hooks.json`) via the same loader `scan` uses. A Codex repo's events live
in a different catalog — the check runs against the resolved harness dialect.

## Why

`hooks` is the deterministic-constraints layer of the harness; a hook on a typo'd
event is enforcement that silently does nothing. Catching it at authoring time,
deterministically and for free, is the moat applied to the hook surface.
