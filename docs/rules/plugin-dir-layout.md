# plugin-dir-layout

Flag **functional surface directories** (`skills/`, `agents/`, `commands/`,
`hooks/`) that are **nested inside the manifest directory** (e.g. `.claude-plugin/`)
instead of at the plugin root. Surfaces placed there are **completely invisible to
the harness** — the harness resolves them relative to the plugin root, not the
manifest directory. Only `plugin.json` belongs inside `.claude-plugin/`. Same
detector `vigiles audit` uses (`pluginDirLayoutIssues` in
`src/core/plugin-dir-layout.ts`).

## What it flags

A surface directory found nested inside the manifest dir:

```
✗ my-plugin: "skills/" is inside ".claude-plugin/" where the harness can't see it
  — only plugin.json belongs there; move "skills/" to the plugin root.
```

Example bad layout — skills are invisible:

```
my-plugin/
├── .claude-plugin/
│   ├── plugin.json          ✓ correct
│   └── skills/              ✗ harness can't see this
│       └── review/
│           └── SKILL.md
```

Correct layout — skills at the plugin root:

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json          ✓
└── skills/                  ✓ harness finds this
    └── review/
        └── SKILL.md
```

## Why

The harness resolves surface directories (`skills/`, `agents/`, `commands/`,
`hooks/`) relative to the **plugin root** — the directory where the agent is
launched — not relative to the manifest directory. A `skills/` directory nested
inside `.claude-plugin/` will never be loaded: the agent gets no skills, hooks
never wire up, and there is **no error or warning from the harness** to explain
why. This is the #1 plugin-author mistake in the OSS ecosystem (pain #E1): the
directory structure looks reasonable, every file exists on disk, and yet nothing
works.

`vigiles audit` catches this with a pure filesystem check — no model, no key,
offline — before a user ever runs the plugin.

## Configuration

```json
{ "rules": { "plugin-dir-layout": "warn" } }
```

### Severity

| Value              | Behavior                                                           |
| ------------------ | ------------------------------------------------------------------ |
| `"error"`          | `vigiles lint` exits non-zero (2) on a misplaced surface directory |
| `"warn"` (default) | Prints a warning, exits 0                                          |
| `false`            | Skip the check                                                     |

Default is **`warn`**. Raise to `"error"` to make a misplaced surface directory a
hard CI failure — it is always a bug, so `"error"` is the recommended setting once
you've confirmed there are no pre-existing violations.

## Scope

Applies wherever a manifest directory exists alongside a plugin root — Claude Code
(`.claude-plugin/plugin.json`) and any other harness that separates its manifest
from the plugin root. The surface directory names checked are injected from the
active harness's layout, so the rule is harness-agnostic and will work correctly
for Codex and future adapters.

## Fix

Move the misplaced directories from inside the manifest directory to the plugin
root:

```bash
# Example: move skills/ out of .claude-plugin/ to the root
mv .claude-plugin/skills ./skills
```

Then recompile (`npx vigiles compile`) and rerun `npx vigiles audit` to confirm the
rule no longer fires.

## See also

- [hook-script-exists](hook-script-exists.md) — flag a hook whose script file is
  missing on disk (a related class of invisible-surface bug).
- [skill-frontmatter](skill-frontmatter.md) — recommend explicit name + description
  for a reliable skill trigger surface.
- [untested-skill](untested-skill.md) — require a test or eval beside every
  SKILL.md.
