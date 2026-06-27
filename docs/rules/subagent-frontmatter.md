# subagent-frontmatter

Flag a **subagent** (`agents/*.md`) missing a required frontmatter field. Per the
[subagent docs](https://code.claude.com/docs/en/sub-agents), a subagent
**requires** both `name` and `description` (no fallback) — without them Claude
Code won't register it, so the agent is silently undispatchable. Same detector
`vigiles audit` uses (`frontmatterIssues`); one detector, two callers.

## Skills are deliberately NOT checked

A `SKILL.md` requires **no** frontmatter: per the
[skills docs](https://code.claude.com/docs/en/skills) every field is optional —
`name` falls back to the **directory name** and `description` to the **first
paragraph of the body**. So a frontmatter-less skill still loads and can fire;
flagging it would be a false positive. (Whether its fallback description is a
_good_ trigger surface is a behavioral question — measure it with
`scan --trigger`, don't assert it structurally.)

## What it flags

Two kinds of subagent-frontmatter defect, one rule:

| Kind             | Surface       | Example failure                                                 |
| ---------------- | ------------- | --------------------------------------------------------------- |
| Missing required | `agents/*.md` | a subagent that's pure prose (no `---` block) → won't register  |
| Invalid value    | `agents/*.md` | `model: sonet` / `color: yelow` → silently falls back / ignored |

The **invalid-value** half cross-references the `model:` against the alias set
(`inherit`/`sonnet`/`opus`/`haiku`) and `color:` against the color enum, flagging
only a **close typo** (≤2 edits) — a full/dated model id (`claude-sonnet-4-5`) is
an explicit form and left alone, and an unrecognized far-off value is suppressed
(high-precision, no cry-wolf). This matches Anthropic's own `claude plugin
validate` + cclint.

This is the rule that catches the real bug the plugin sweep found: a marketplace
shipping subagents (`changelog-generator`, `content-creator`, …) with **no
frontmatter at all** — they never register.

## Configuration

```json
{ "rules": { "subagent-frontmatter": "warn" } }
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
