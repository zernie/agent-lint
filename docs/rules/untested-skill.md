# untested-skill

Flag a **skill** (`SKILL.md`) that ships without a test or eval. One of the
per-kind surface-coverage rules alongside
[`untested-agent`](untested-agent.md) and [`untested-hook`](untested-hook.md) —
together they replace the former umbrella `untested-surface` rule, so each kind
gets its own severity (a skill's "does it still fire and behave?" is a different
question from an agent's tool-contract or a hook's block/allow).

A skill with no test is a probabilistic-compliance gap hiding in the
deterministic layer — nothing measures whether it still does what it claims. A
skill does **not** need a `.spec.ts` (hand-written prose is a supported on-ramp);
it needs a way to know it still _works_ — a trigger eval (does the description
fire?), an outcome eval (is the result right?), or a colocated
`*.{harness,eval}.mjs`.

## Configuration

```json
{ "rules": { "untested-skill": "warn" } }
```

With options (ESLint-style tuple):

```json
{ "rules": { "untested-skill": ["error", { "testGlobs": ["**/*.eval.mjs"] }] } }
```

### Severity

| Value              | Behavior                                               |
| ------------------ | ------------------------------------------------------ |
| `"error"`          | `vigiles lint` exits non-zero when a skill is untested |
| `"warn"` (default) | Prints a warning, exits 0 — a nudge, not a gate        |
| `false`            | Skip skill coverage entirely                           |

### Options

| Option      | Type     | Description                                                                    |
| ----------- | -------- | ------------------------------------------------------------------------------ |
| `testGlobs` | string[] | Override which files count as tests (shared with the other `untested-*` rules) |
| `exclude`   | string[] | Extra ignore globs                                                             |

## Scope

Scans `skills/*/SKILL.md` and `.claude/skills/*/SKILL.md` (your plugin's own
skills — not vendored, fixture, or nested copies).

## What counts as "tested"

Two detectors, OR'd — a test placed **anywhere** counts:

1. **Colocation** — a `*.{harness,eval}.mjs` inside the skill dir (`skills/foo/`).
2. **Content-reference** — any discovered test (incl. `*.test.ts`) that names the
   skill by **path** (`skills/foo`) or **namespace** (`vigiles:foo`).

## Exemptions

**Every** skill is held to this — invocation mode does **not** exempt anything. A
command-only skill (`disable-model-invocation: true`) still _does_ something when
invoked, and that behaviour is worth a test (a trigger eval is meaningless for it,
but a behavioural/outcome test isn't). The only opt-out is an explicit
`<!-- vigiles:ignore-test -->` marker in the `SKILL.md`, reported as `exempt` so
the skip is visible, never silent.

## Why

vigiles's second layer is testing the harness as the assembled machine it ships
as. This rule closes the loop for skills: every activatable skill should have
_something_ that measures it. Warning-by-default keeps adoption gradual; flip to
`"error"` to gate CI.
