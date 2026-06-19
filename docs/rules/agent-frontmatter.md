# agent-frontmatter

Flag a **subagent** (`agents/*.md`) missing a required frontmatter field. Per the
[subagent docs](https://code.claude.com/docs/en/sub-agents), a subagent
**requires** both `name` and `description` (no fallback) — without them Claude
Code won't register it, so the agent is silently undispatchable. Same detector
`vigiles scan` uses (`frontmatterIssues`); one detector, two callers.

## Skills are deliberately NOT checked

A `SKILL.md` requires **no** frontmatter: per the
[skills docs](https://code.claude.com/docs/en/skills) every field is optional —
`name` falls back to the **directory name** and `description` to the **first
paragraph of the body**. So a frontmatter-less skill still loads and can fire;
flagging it would be a false positive. (Whether its fallback description is a
_good_ trigger surface is a behavioral question — measure it with
`scan --trigger`, don't assert it structurally.)

## What it flags

| Surface       | Required              | Example failure                               |
| ------------- | --------------------- | --------------------------------------------- |
| `agents/*.md` | `name`, `description` | a subagent that's pure prose (no `---` block) |

This is the rule that catches the real bug the plugin sweep found: a marketplace
shipping subagents (`changelog-generator`, `content-creator`, …) with **no
frontmatter at all** — they never register. See
`research/plugin-structural-findings.md`.

## Configuration

```json
{ "rules": { "agent-frontmatter": "warn" } }
```

### Severity

| Value              | Behavior                                                      |
| ------------------ | ------------------------------------------------------------- |
| `"error"`          | `vigiles lint` exits non-zero (2) on a missing required field |
| `"warn"` (default) | Prints a warning, exits 0                                     |
| `false`            | Skip the check                                                |

## Scope

`agents/*.md` + `.claude/agents/*.md`. Deterministic, model-free.

## Why

A subagent without its required frontmatter is the cheapest, highest-confidence
bug a harness can ship: it silently never registers, so the capability the author
intended simply isn't there. No model needed to know it won't load.
