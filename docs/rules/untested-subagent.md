# untested-subagent

Flag a **subagent** (`agents/*.md`) that ships without a test or eval. One of the
per-kind surface-coverage rules alongside [`untested-skill`](untested-skill.md)
and [`untested-hook`](untested-hook.md).

An agent's contract is different from a skill's: it's dispatched by name (via the
`Task` tool) and carries a **tool contract** (`tools:` frontmatter). The test that
matters is "does it honor its contract and produce the right result?" — e.g. a
`runHarnessTest`/eval that asserts the agent stayed within its allowed tools
(`notTool`) or a `subagent(...)` nested-trace check. An agent with no test is an
unmeasured surface in the deterministic layer.

## Configuration

```json
{ "rules": { "untested-subagent": "warn" } }
```

### Severity

| Value              | Behavior                                                |
| ------------------ | ------------------------------------------------------- |
| `"error"`          | `vigiles lint` exits non-zero when an agent is untested |
| `"warn"` (default) | Prints a warning, exits 0 — a nudge, not a gate         |
| `false`            | Skip agent coverage entirely                            |

Options (`testGlobs`, `exclude`) are shared with the other `untested-*` rules —
see [`untested-skill`](untested-skill.md#options).

## Scope

Scans `agents/*.md` and `.claude/agents/*.md`.

## What counts as "tested"

One detector: **colocation** — `agents/bar.harness.mjs` next to `agents/bar.md`.
A test elsewhere that merely NAMES the agent does not count (that tier was
removed 2026-08-11). See
[`untested-skill`](untested-skill.md#what-counts-as-tested) for the shared
mechanics.

## Exemptions

Every agent is held to this; the only opt-out is an explicit
`<!-- vigiles:ignore-test -->` marker in the agent file, reported as `exempt`.

## Why

Same as the skill rule: the second layer tests the assembled harness. A subagent
is a high-risk surface (it acts with tools), so leaving it unmeasured is exactly
the gap this family closes. Warning-by-default; flip to `"error"` to gate CI.
