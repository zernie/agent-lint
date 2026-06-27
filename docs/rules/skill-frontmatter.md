# skill-frontmatter

**Recommend** (not require) that a `SKILL.md` declares an explicit `name` and
`description` in frontmatter. Per the [skills docs](https://code.claude.com/docs/en/skills)
these are optional — `name` falls back to the **directory name** and
`description` to the **first paragraph of the body** — so a frontmatter-less
skill still loads and fires. But relying on the fallbacks is fragile: the
directory name may be unclear, and the first body paragraph is often a heading or
boilerplate, making a weak, accidental trigger surface. An explicit
`name` + `description` is the reliable, intentional choice.

This is a **best-practice nudge, not a correctness check** — distinct from
[`subagent-frontmatter`](subagent-frontmatter.md), which flags _subagents_ that
genuinely won't register without required frontmatter. Same detector `scan` uses
(`skillMetaIssues`); reported as a soft `ℹ` note in `scan` (never counted as a
structural defect or scored on the leaderboard).

## What it flags

A skill (`skills/*/SKILL.md`) with no explicit frontmatter `name` and/or
`description`. The skill still works — this only suggests making the trigger
surface deliberate.

## Configuration

```json
{ "rules": { "skill-frontmatter": "warn" } }
```

### Severity

| Value              | Behavior                                                          |
| ------------------ | ----------------------------------------------------------------- |
| `"error"`          | `vigiles lint` exits non-zero (2) — enforce it on your own skills |
| `"warn"` (default) | Prints a recommendation, exits 0                                  |
| `false`            | Skip the check                                                    |

**Default is `warn`, deliberately.** The skill loads regardless, so erroring by
default would break a working third-party plugin. Set `"error"` in your own repo
to hold your skills to the explicit-metadata standard.

## Scope

`skills/*/SKILL.md` + `.claude/skills/*/SKILL.md`. Deterministic, model-free.

## Why

The fallback description is what the model selects on — and an accidental one (a
`# Heading` or a boilerplate first line) is exactly how a structurally-fine skill
ends up never firing. Whether a description _actually_ triggers is the behavioral
`audit --measure` question; this rule is the cheap, deterministic upstream nudge to
write a real one in the first place.

## See also

- [`subagent-frontmatter`](subagent-frontmatter.md) — the subagent **requirement**
  (won't register), vs this skill **recommendation** (still loads).
