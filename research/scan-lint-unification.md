# Unifying `scan` and `lint` — one rule engine, two frontends

`vigiles scan` and `vigiles lint` are today two parallel implementations with
overlapping concerns and an inconsistent surface. This is the design to make them
**two views over one rule engine** (the ESLint model), without losing what makes
each distinct. Companion to `docs/rules/` (the rule catalog) and
`src/scan.ts` / `src/leaderboard.ts`.

## The problem

|                                          | `lint`                          | `scan`                                |
| ---------------------------------------- | ------------------------------- | ------------------------------------- |
| Question                                 | "are the marked claims TRUE?"   | "what does this ship, what's broken?" |
| Needs a spec / marks                     | yes                             | no                                    |
| Driven by                                | `.vigilesrc.json` rules         | hard-coded defaults                   |
| Output                                   | pass / warn / error + exit code | inventory + 0–100 leaderboard score   |
| Findings are documented (`docs/rules/`)? | yes                             | **no**                                |
| Findings are configurable / CI-gatable?  | yes                             | **no**                                |

The overlap is real and already half-built: `untested-surface` and `orphan-docs`
are **rules that both surfaces use**. But scan's other structural findings —
a skill with no description, an agent with no tool contract, a missing hook
script — are hard-coded in `scan.ts`/`leaderboard.ts`, **not** rules: they aren't
documented, can't be configured, and can't gate CI. So "every shipped skill has a
description" is a check vigiles can _report_ but not _enforce_. That's the gap.

### Why not the other direction ("scan = lint without config")

Rejected. Lint's core is **reference verification, which requires marks**. A bare
repo with no spec has no `enforce()`/`file()`/`cmd()` to verify — "lint without
config" would have nothing to check. scan's entire value is working **mark-free**.
You cannot derive scan by stripping config from lint, because the marks you'd
strip are exactly what scan does without.

## The decision: one rule vocabulary, two frontends

Promote scan's hard-coded structural findings to **first-class rules** — named,
documented (`docs/rules/<name>.md`, per the Doc Per Rule guidance), and
configurable in `.vigilesrc.json`. Then:

- **`lint`** runs the configured rule set (reference **+** structural) and gates
  CI by severity / exit code — as it does today, just with more rules available.
- **`scan`** runs the **structural subset** with zero-config defaults, renders the
  **inventory report**, and computes the **leaderboard score from rule
  violations** instead of a separate hard-coded tally.

They share rule **definitions**; they diverge only in _presentation_ (gate vs
inventory + score), _subset_ (all rules vs structural-only), and _config vs
defaults_. This is exactly how ESLint separates rules from formatters.

### The structural rules to extract

Each maps a current scan finding + leaderboard penalty to a rule:

| New rule                    | Current finding                                 | Default severity | Leaderboard weight |
| --------------------------- | ----------------------------------------------- | ---------------- | ------------------ |
| `hook-script-missing`       | `ScanHook.status === "missing"`                 | error            | −15                |
| `hook-script-unresolved`    | `status === "unresolved"` (`${...PLUGIN_ROOT}`) | warn             | (n/a today)        |
| `skill-missing-description` | skill with no usable description                | warn             | −10                |
| `agent-no-tool-contract`    | agent with no `tools:` line (inherits all)      | warn             | −5                 |
| `untested-surface`          | **already a rule** — reuse as-is                | warn             | −3                 |
| `orphan-docs`               | **already a rule** — reuse as-is                | warn             | (n/a)              |

(`commands`, `mcp` presence, and per-skill/agent listings stay **inventory**, not
rules — see below.)

### Leaderboard score becomes derived, not parallel

`scoreReport` today re-derives penalties from `ScanReport` fields with weights
(`W_MISSING_HOOK=15`, `W_NO_DESCRIPTION=10`, `W_NO_CONTRACT=5`, `W_UNTESTED=3`).
After unification the score is `100 − Σ(violations × weight)` over the **structural
rule results**, so the weight lives next to the rule, not in a second table.
Grades (`A≥90 … F<60`) are unchanged. The score stays deterministic and keeps
ignoring the loader's free-text warnings (the defensibility property).

## What stays a report, not a rule

scan is more than checks — it's an **inventory**: "here are your 4 skills and
their descriptions, 2 agents and their tool contracts, this MCP server, these
commands." That listing is not pass/fail and stays a rendered report. So:

> **scan = inventory report + structural-rule results + derived score.**

Only the pass/fail findings become rules. The inventory is scan-only presentation.

## Migration — incremental and non-breaking

The half-shared rules (`untested-surface`, `orphan-docs`) already prove the shape,
so this is finishing a started pattern, one rule at a time:

1. Introduce a small **structural-rule** module the way `test-coverage.ts` /
   `orphans.ts` already work — a pure detector + a `RulesConfig` severity + a
   `docs/rules/` doc — for each finding in the table.
2. Rewire `scoreReport` to consume those rule results (weights move onto the
   rules); keep the exact current weights so scores don't move.
3. Make `lint` include the structural rules (default severities chosen so a
   pre-existing repo doesn't suddenly fail CI — start `warn`, allow opt-in
   `error`).
4. scan keeps its inventory rendering; it now reads rule results for the
   pass/fail half instead of computing them inline.

Backwards compatibility: scan's output and score are unchanged at default
config; lint gains rules but at non-breaking default severities. New config keys
are additive. A `feat`, not a breaking change.

## Open questions

- **Scope of `lint` by default.** Should `lint` run structural rules on a repo
  that ships a plugin but has no spec? (Leaning yes, at `warn` — it's the one path
  that makes scan's findings CI-gatable.)
- **Per-rule `docs/rules/` debt.** Each promoted rule needs a doc; that's the
  bulk of the work, not the code.
- **Harness-awareness.** Structural rules read plugin layout, so unlike reference
  rules they _are_ harness-specific — they should resolve the harness the way
  `scan` already does (auto-detect + `--harness`), consistent with
  `research/multi-harness-compile.md`.

## Status

Design only — not started. This is a separate initiative from the multi-harness
compile work; it deserves its own PR once specced.
