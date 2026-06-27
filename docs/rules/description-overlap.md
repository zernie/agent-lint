# description-overlap

Flag two **model-invocable skills whose descriptions are near-identical**. The
model selects a skill by its description; if two are basically the same, the
selector can't tell them apart and the **wrong one fires** — a precision
collision. This is a **deterministic proxy for a behavioral risk**: it catches a
model-tier-class problem with **no model**, reusing the NCD engine in
`src/core/proofs.ts`. Same detector `vigiles audit` uses
(`findDescriptionOverlaps` in `src/core/description-overlap.ts`); no other plugin
linter has it.

## What it flags

Two skills whose descriptions differ only cosmetically (a copy-paste with a word
changed) → flagged as a pair. Two skills with **parallel but distinct**
descriptions (`create-issue` vs `create-pr`) are **not** flagged.

```
⚠ skills "review-backend" and "review-frontend" have near-identical descriptions
  (91% alike) — the model can't reliably tell them apart, so the wrong one may
  fire. Differentiate their descriptions.
```

## High-precision calibration

The NCD cutoff is **0.2** (`OVERLAP_NCD_CUTOFF`), set against the mid-2026 sweep:
across **4678** within-plugin skill-description pairs, the most-similar
_legitimately-distinct_ pair (`create-issue` / `create-pr`) sits at NCD **0.25**,
and nothing falls below it. So a cutoff under 0.25 fires only on text that's
essentially identical — never on a parallel-but-distinct pair. **User-invoked**
skills (`disable-model-invocation: true`) are excluded — they're picked by an
explicit command, so they can't collide in the selector.

## Configuration

```json
{ "rules": { "description-overlap": "warn" } }
```

### Severity

| Value              | Behavior                                                   |
| ------------------ | ---------------------------------------------------------- |
| `"error"`          | `vigiles lint` exits non-zero (2) on a near-duplicate pair |
| `"warn"` (default) | Prints a warning, exits 0                                  |
| `false`            | Skip the check                                             |

## Scope

Model-invocable skills with a usable description (frontmatter `description`, else
the first body paragraph) — the same trigger surface `scan` reports.

## Why

Skill _triggering_ is normally the model-gated behavioral column (the `audit`
model trigger tier / `measureTriggerRate`), which costs tokens. A near-identical
description is the one precision failure you can catch **deterministically and
for free** — a bridge between the deterministic and behavioral columns.

## See also

- [skill-frontmatter](skill-frontmatter.md) — recommends an explicit, reliable
  trigger surface (the description this rule compares).
