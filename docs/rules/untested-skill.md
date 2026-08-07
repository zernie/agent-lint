# untested-skill

Flag a **skill** (`SKILL.md`) that ships without a test or eval. One of the
per-kind surface-coverage rules alongside
[`untested-subagent`](untested-subagent.md) and [`untested-hook`](untested-hook.md) —
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

Three detectors, OR'd — a test placed **anywhere** counts — and the audit report
prints **which one** decided each surface, because the three are not equally
strong:

1. **Declaration** — a `vigiles:covers <surface>` marker in the test file. The
   strongest evidence: it cannot happen by accident, and it is the only detector a
   harness that builds its paths at **runtime** can reach.

   ```js
   // vigiles:covers skills/foo, skills/bar
   for (const name of ["foo", "bar"]) assertSkill(join(root, "skills", name));
   ```

2. **Colocation** — a `*.{harness,eval}.mjs` inside the skill dir (`skills/foo/`).
3. **Content-reference** — any discovered test (incl. `*.test.ts`) whose **code**
   names the skill by **path** (`skills/foo`) or **namespace** (`vigiles:foo`).
   The weakest: it only says the name appears.

> **Comments do not count.** A skill path written in a comment is prose _about_ a
> test, not a test — and counting it made the coverage number gameable by one
> line. If a test really does cover a surface its code never names, say so with
> `vigiles:covers`.

## Counting an external test suite (promptfoo, a home-grown eval loop)

If you already test your skills through a **separate loop** — a
`promptfooconfig.yaml`, a home-grown `evals.json` benchmark, a Python harness —
point `testGlobs` at those files so they count toward coverage instead of every
surface reading as "untested":

```json
{
  "rules": {
    "untested-skill": [
      "warn",
      {
        "testGlobs": [
          "**/*.{harness,eval}.mjs",
          "promptfooconfig.yaml",
          "evals/**/*.json"
        ]
      }
    ]
  }
}
```

A discovered file counts as covering a skill when it **names that skill by its
path or namespace token** (`skills/foo` or `vigiles:foo`) outside a comment — the
same content-reference rule above — or when it **declares** the skill with
`vigiles:covers`.

> **Heads-up:** an external config that references a skill **only** by prose
> prompt text (never its path/namespace) won't match, even when added to
> `testGlobs`. Declare it instead:
>
> ```yaml
> # vigiles:covers skills/foo
> ```
>
> Comment syntax is fine for the marker — the marker is read before comments are
> stripped. What does _not_ work is hoping a bare mention in a comment is noticed.

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
