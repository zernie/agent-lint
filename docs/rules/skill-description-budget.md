# skill-description-budget

Flag a **model-invocable skill whose `description` is so long the trigger signal
is buried**. The model selects a skill by its description and weighs the opening
most; a bloated description (multiple long sentences, embedded examples,
disambiguation prose) dilutes the signal and hurts both **recall** (does it fire
when it should?) and **precision** (does it stay quiet when it shouldn't?). This
is a **deterministic proxy for a behavioral risk** — it catches a trigger-class
problem with **no model**. Same detector `vigiles audit` uses
(`findDescriptionBudgetIssues` in `src/core/skill-description-budget.ts`); the
deterministic sibling of [description-overlap](description-overlap.md).

## What it flags

A model-invocable skill whose description exceeds the budget (default **500
characters**) → flagged with its length. A normal one-to-three-sentence
description is comfortably under it and is **not** flagged.

```
⚠ skill "daily" has a 634-char description (budget 500) — the selector weighs the
  opening most, so a long description buries the trigger signal and hurts recall +
  precision. Tighten it to a concise what + when.
```

## High-precision calibration

The budget is **generous on purpose** (500 chars ≈ several sentences), so only a
genuinely bloated description fires — this is a `warn`-tier heuristic proxy, and
the ceiling is `warn` (a length threshold can't _prove_ a description triggers
badly, so it must never cry wolf). **User-invoked** skills
(`disable-model-invocation: true`) are excluded — they're picked by an explicit
command, so their description isn't a trigger surface.

## Configuration

```json
{ "rules": { "skill-description-budget": "warn" } }
```

### Severity

| Value              | Behavior                                                  |
| ------------------ | --------------------------------------------------------- |
| `"warn"` (default) | Prints a warning, exits 0                                 |
| `"error"`          | `vigiles lint` exits non-zero (2) on an over-budget skill |
| `false`            | Skip the check                                            |

## Scope

Model-invocable skills with a usable description (frontmatter `description`, else
the first body paragraph) — the same trigger surface `scan` reports.

## Why

Skill _triggering_ is normally the model-gated behavioral column (the `audit`
model trigger tier / `measureTriggerRate`), which costs tokens. A description so
long the model can't weigh it is one trigger failure you can catch
**deterministically and for free** — a bridge between the deterministic and
behavioral columns.

## See also

- [description-overlap](description-overlap.md) — the other deterministic trigger
  proxy: two descriptions so alike the wrong skill fires.
- [skill-frontmatter](skill-frontmatter.md) — recommends an explicit, reliable
  trigger surface (the description this rule measures).
