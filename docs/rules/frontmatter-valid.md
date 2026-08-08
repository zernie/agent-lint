# frontmatter-valid

Flag a skill/agent whose `---` frontmatter block **exists but isn't valid YAML**
— so its fields may not parse as the author intended. Same detector `vigiles
scan` uses (the `malformed` flag from `src/core/frontmatter-read.ts`, a real
js-yaml parse).

## Honest caveat — why this is `warn`, not `error`

A spec-compliant YAML parser (js-yaml) is **stricter** than some lenient
frontmatter loaders. The most common trip is a **one-line `description:`** that
contains a `: ` colon, a quote, or an embedded `<example>` block:

```yaml
description: Use this agent when: <example>user: "..." assistant: "..."</example>
```

That is invalid YAML (a plain scalar can't contain `: `), so it's flagged — but
depending on the harness's loader it may still load (possibly with a literal
`\n` instead of a newline). Calibration against the mid-2026 sweep: **7% of
frontmatter blocks** were flagged, concentrated in **2 repos** (ananddtyagi,
MadAppGang) and **0 across the other 11 marketplaces** — the signal correlates
with prose stuffed into frontmatter, but vigiles has **not** empirically
confirmed every flagged file fails to load.

So this ships **`warn` by default** (a nudge, exit 0) and `scan` surfaces it as an
**informational `ℹ` note**, not a structural defect (no leaderboard penalty).
**Verify against your harness before setting `"error"`.** The unambiguous cases
(an unclosed `[a, b, c`, a tab indent, a duplicate key) are real breakage worth
fixing regardless.

## What it flags

```yaml
allowed-tools: [read, write          # ✗ unclosed flow array — invalid YAML
description: a value with: a colon    # ⚠ invalid plain scalar (may still load)
```

The file's other fields are still **salvaged** by the reader, so the rest of
`scan`/`lint` keeps working on a malformed file.

**Except the tool contract, which is not salvaged for SCORING.** A salvaged
`allowed-tools:` / `tools:` is a regex guess at a block a strict loader rejects, so
`vigiles audit` treats a malformed unit's contract as **inherits-all** rather than
grading the guess — see
[lethal-trifecta](lethal-trifecta.md#a-contract-that-doesnt-parse-is-not-a-contract).
The live PreToolUse rail still uses the salvage (something to enforce beats
nothing); only the score refuses it. So a broken block can cost a grade even when
the fields "look fine", and fixing the YAML restores both.

## Configuration

```json
{ "rules": { "frontmatter-valid": "warn" } }
```

### Severity

| Value              | Behavior                                                        |
| ------------------ | --------------------------------------------------------------- |
| `"error"`          | `vigiles lint` exits non-zero (2) — only set this once verified |
| `"warn"` (default) | Prints a warning, exits 0                                       |
| `false`            | Skip the check                                                  |

## Scope

`skills/*/SKILL.md` + `agents/*.md` (and `.claude/...`). The block must be at the
file start (after an optional BOM / a leading vigiles integrity comment) — a
`---` horizontal rule in the body is never mistaken for frontmatter.

## See also

- [subagent-frontmatter](subagent-frontmatter.md) — required fields + valid `model`/`color`
  (a _parsed_ frontmatter that's missing/typo'd a field, vs this rule's _unparseable_ block).
