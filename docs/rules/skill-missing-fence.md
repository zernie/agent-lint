# skill-missing-fence

Flag a **SKILL.md** that begins with **frontmatter-looking keys** (`name:`,
`description:`, `allowed-tools:`, etc.) but is **missing the opening `---` fence**.
When the fence is absent, the harness loads the entire file as plain body text —
no name, no description, no tool list — so the skill is **invisible and never
fires**. This is a very common real-world authoring mistake. Same detector
`vigiles audit` uses (`skillMissingFence` in
`src/core/skill-missing-fence.ts`).

## What it flags

A SKILL.md whose **first meaningful line** matches a known frontmatter key at
column 0 but is not preceded by a `---` fence:

```
✗ my-skill: frontmatter key "name" on line 1 is missing the opening ---
  fence — the key loads as body text and the skill has no name, description,
  or trigger. Wrap the metadata block in --- … ---.
```

A "known frontmatter key" is any member of the explicit whitelist:

| Key                        | Purpose                                         |
| -------------------------- | ----------------------------------------------- |
| `name`                     | Skill name shown to the model                   |
| `description`              | Description used for model-invocation selection |
| `allowed-tools` / `tools`  | Tool allow-list for the skill                   |
| `model`                    | Model override                                  |
| `color`                    | Display colour                                  |
| `disable-model-invocation` | Opt out of model-invocable trigger              |
| `argument-hint`            | Argument hint for user-invocable skills         |
| `version`                  | Skill schema version                            |
| `license`                  | Licence declaration                             |
| `metadata`                 | Arbitrary metadata block                        |

## High-precision (FP-safe)

By the same don't-cry-wolf discipline as `skill-resource-resolves` and
`subagent-tool-contract`, the detector flags **only** what is unambiguous:

- It inspects only the **first non-blank, non-comment line**. A known key buried
  in the body is never flagged.
- A line that is not in the explicit whitelist above is **silently skipped** —
  `Usage: run the thing`, `Note: something`, `Author: Jane Doe` are all prose
  and produce no finding.
- A first line starting with `#`, `>`, `-`, `*`, `` ` ``, `<`, or a digit
  followed by `.` is **immediately** classified as markdown structure and
  skipped.
- A leading UTF-8 BOM and any number of blank lines are stripped before the
  check.
- A leading **vigiles integrity comment** (`<!-- vigiles:… -->`) is skipped so
  that a compiled skill with the comment on line 1 and `name:` on line 2 is
  still caught.

The detector prefers **missing a real finding over a false positive** — a noisy
fence check would teach users to ignore it.

## Configuration

```json
{ "rules": { "skill-missing-fence": "warn" } }
```

### Severity

| Value              | Behaviour                                            |
| ------------------ | ---------------------------------------------------- |
| `"error"`          | `vigiles lint` exits non-zero (2) on a missing fence |
| `"warn"` (default) | Prints a warning, exits 0 (don't-cry-wolf rollout)   |
| `false`            | Skip the check                                       |

Default is **`warn`** during rollout; raise to `"error"` to gate CI once you are
confident the check is clean on your skill set.

## Scope

Skills (`skills/*/SKILL.md`) — every harness has skills, so this rule is **not**
capability-gated. The check is a pure string analysis: no filesystem access, no
model, no key required.

## Why

The YAML frontmatter block in a SKILL.md depends on the opening `---` fence to
be parsed by the harness. Without it, the harness sees the entire file as a
freeform markdown body:

- The **model-selector** has nothing to match — the skill is invisible.
- The **tool allow-list** is never applied — the skill either gets no tools or
  inherits all of them.
- The **trigger description** is absent — the skill can never fire
  model-invocably.

The mistake is easy to make when copy-pasting a snippet or when an editor
auto-strips leading `---` lines. vigiles catches it before the skill is ever
deployed.

## Fix

Wrap the metadata block in a YAML fence:

```yaml
---
name: My Skill
description: Does things efficiently.
allowed-tools:
  - Read
  - Bash
---
## Instructions

Do the thing.
```

## See also

- [skill-frontmatter](skill-frontmatter.md) — recommends explicit `name` +
  `description` so a skill has a reliable trigger surface.
- [skill-resource-resolves](skill-resource-resolves.md) — checks that bundled
  files referenced in the SKILL.md body exist on disk.
- [subagent-frontmatter](subagent-frontmatter.md) — the equivalent check for
  subagent (agent) frontmatter fields.
