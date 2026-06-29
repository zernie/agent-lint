# hook-block-ineffective

Flag a **hook that appears to block or deny but silently doesn't** — the #1
verified hook pain in the wild (see `research/hook-pain-points.md`). The author
wires up a guard, the guard "runs" without error, but nothing is ever prevented.

Two distinct failure shapes are detected:

## What it flags

### wrong-event — blocking mechanism on a non-blocking event

A hook registered on `PostToolUse`, `SessionStart`, `Notification`, or
`SessionEnd` that contains a blocking mechanism (`exit 2`, `"decision":"block"`,
`"permissionDecision":"deny"`). Those events fire **after** the action has
already happened — the harness ignores any attempt to veto them:

```jsonc
"hooks": {
  "PostToolUse": [{
    "hooks": [{ "type": "command", "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/guard.sh" }]
  }]
}
```

with `guard.sh` containing:

```sh
#!/bin/sh
# Tries to block — but PostToolUse already ran. This exit 2 is a
# "blocking error" in logs, not an actual veto.
exit 2
```

→ flagged as `wrong-event`: `PostToolUse` hooks cannot veto.

Move the gate to a **blocking event** (`PreToolUse`, `UserPromptSubmit`, `Stop`,
or `SubagentStop`) so the deny fires before the action.

### wrong-field — correct event, legacy JSON field

A hook on a permission-gated event (`PreToolUse`) that emits the **legacy**
top-level `"decision":"block"` field instead of the required structured form.
Claude Code ignores the legacy field on permission events; the hook appears to
block but nothing is denied:

```sh
#!/bin/sh
# On PreToolUse the harness only reads permissionDecision — this
# top-level "decision" field is silently discarded.
echo '{"decision":"block"}'
```

→ flagged as `wrong-field`. The correct output is:

```sh
echo '{"hookSpecificOutput":{"permissionDecision":"deny"}}'
```

## FP-safety

The detector is **conservative by design** — default severity is `warn`, never
`error` out of the box:

- **`exit 2`** is matched with a shell-context regex that requires a separator
  before `exit` and a word boundary after `2` — so `exit 200` and
  `--exit-code 2` as an argument are NOT matched.
- **JSON patterns** (`"decision":"block"`, `"permissionDecision":"deny"`) are
  matched as literal substrings — no partial JSON walking.
- An **unknown event** (not in the dialect's blocking or non-blocking catalog)
  is **never flagged** — only events the injected sets positively classify are
  acted on.
- The **harness event sets are injected** from the dialect (never hard-coded):
  a Codex adapter injects its own sets, so the detector is harness-neutral
  (same `core ⊄ adapter` pattern as `verifyHookEvents` and `verifyToolContract`).

Same detector used by `vigiles audit` (`scan`) and the `hook-block-ineffective`
lint rule — one detector, two callers, no drift.

## Configuration

```json
{ "rules": { "hook-block-ineffective": "warn" } }
```

### Severity

| Value              | Behavior                                                      |
| ------------------ | ------------------------------------------------------------- |
| `"error"`          | `vigiles lint` exits non-zero (2) on a false-confidence block |
| `"warn"` (default) | Prints a warning, exits 0                                     |
| `false`            | Skip the check                                                |

## Scope

Hook commands in `.claude/settings.json`, `.claude-plugin/plugin.json`, and
`hooks/hooks.json`. Both script-file hooks (content read from disk) and inline
commands (content read from the `command` field directly) are inspected.

## The durable fix

Patching the field or the event assignment removes the immediate finding. But
the **root cause** is that hand-written shell hooks require the author to
correctly choose the exit code, the JSON field, and the event — each a
footgun the compiled-hooks design makes **unrepresentable**:

- You never write the exit code or the field (the compiler emits them from a
  closed vocabulary).
- The role (`defineHook` / `definePromptGate` / `defineStopGate`) constrains
  which events can carry a block decision — a category mistake is a `tsc` error.

Rewriting the hook as a **compiled hook** (`vigiles/hook`) is the durable
solution. See [docs/compiled-hooks.md](../compiled-hooks.md).

## See also

- [hook-script-exists](hook-script-exists.md) — a hook whose script file doesn't exist on disk.
- [hook-events](hook-events.md) — a hook registered under a typo'd event name (silently never fires).
- [hook-matcher](hook-matcher.md) — a hook matcher that silently never matches.
- [docs/compiled-hooks.md](../compiled-hooks.md) — make this class of bug unrepresentable.
