# frontmatter-schema

Flag a **skill** or **subagent** missing a required frontmatter field. A
`SKILL.md` needs a `name` (Claude Code keys a skill on its frontmatter name — no
name, no load); a subagent (`agents/*.md`) needs `name` **and** `description`. A
missing field is a structurally broken surface: the skill never loads, the agent
never registers. Same detector `vigiles scan` uses (`frontmatterIssues`); one
detector, two callers, no drift.

## What it flags

| Surface             | Required              | Example failure                                              |
| ------------------- | --------------------- | ------------------------------------------------------------ |
| `skills/*/SKILL.md` | `name`                | a file with no `---` block, or `description:` but no `name:` |
| `agents/*.md`       | `name`, `description` | a subagent that's pure prose (no frontmatter)                |

A skill's **description** is reported separately (on the skill line — it's a
trigger property, scored by the leaderboard), so this rule covers the skill
`name` and the agent's full `name`+`description`.

This is the rule that catches the real bug the plugin sweep found: a marketplace
shipping skills (`crisis-debugging-advisor`, `meta-skill-router`) and subagents
(`changelog-generator`, …) with **no frontmatter at all** — they silently never
work. See `research/plugin-structural-findings.md`.

## Configuration

```json
{ "rules": { "frontmatter-schema": "warn" } }
```

### Severity

| Value              | Behavior                                                      |
| ------------------ | ------------------------------------------------------------- |
| `"error"`          | `vigiles lint` exits non-zero (2) on a missing required field |
| `"warn"` (default) | Prints a warning, exits 0                                     |
| `false`            | Skip the check                                                |

## Scope

`skills/*/SKILL.md` + `.claude/skills/*/SKILL.md`, and `agents/*.md` +
`.claude/agents/*.md`. Deterministic, model-free.

## Why

The cheapest, highest-confidence bug a harness can ship: a surface that can't
load because its frontmatter is incomplete. No model needed to know a skill
without a `name` will never register.
