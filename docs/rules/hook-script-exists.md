# hook-script-exists

Flag a **hook command that references a script file which doesn't exist** on disk.
A `PreToolUse`/`SessionStart`/… hook pointing at `${CLAUDE_PLUGIN_ROOT}/hooks/x.sh`
when that file isn't there silently never runs — the protection or automation the
author wired up simply doesn't happen, with no error. Same detector `vigiles scan`
uses (the hook resolver in `src/scan.ts`); one detector, two callers.

This matches Anthropic's own `claude plugin validate` — adopting it makes vigiles
a superset of the official validator on the hook surface.

## What it flags

```jsonc
"hooks": {
  "PreToolUse": [{
    "matcher": "Bash",
    "hooks": [{ "type": "command", "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/guard.sh" }]
  }]
}
```

→ flagged if `hooks/guard.sh` doesn't exist at the plugin root.

## FP-safety

The shared resolver already excludes the cases that aren't real misses:

- **Unresolved `$VAR`** paths (`$CLAUDE_PROJECT_DIR/...`, a runtime var) → reported
  as "unresolved", never "missing" (can't be checked, so not flagged).
- **Existence-guarded one-liners** (`[ ! -f x ] || x`, `test -f x && x`) → treated
  as optional, not a hard reference.
- **Inline commands** with no script file (`echo …`, `npx …`) → counted as inline,
  not path-checked.

A relative hook path (`./hooks/x.sh`) resolves against the **plugin root**, not the
scanner's cwd.

## Configuration

```json
{ "rules": { "hook-script-exists": "warn" } }
```

### Severity

| Value              | Behavior                                                   |
| ------------------ | ---------------------------------------------------------- |
| `"error"`          | `vigiles lint` exits non-zero (2) on a missing hook script |
| `"warn"` (default) | Prints a warning, exits 0                                  |
| `false`            | Skip the check                                             |

## Scope

Hook commands in `.claude/settings.json` and the plugin manifest
(`.claude-plugin/plugin.json`), across braced/unbraced `${CLAUDE_PLUGIN_ROOT}`.

## Why

A hook is deterministic harness machinery; a hook whose script is missing is a
silent no-op — the worst kind of failure, because the author believes the guard is
in place. Catching it before it ships closes a real gap (the sweep found broken
hook refs in the wild).

## See also

- [untested-hook](untested-hook.md) — a hook script that ships without a test/eval
  (a different concern: the script exists but is unverified).
