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

**One detector: colocation, and the test must be NAMED after the surface.**
Placement says where a file sits; only the name says what it is about.

```
skills/foo/SKILL.md
skills/foo/foo.eval.mjs          <- covers it (free of config, like `foo_test.go`)
skills/foo/foo.harness.mjs       <- also covers it
skills/foo/bar-ablation.eval.mjs <- does NOT: it is a test about `bar`
skills/foo/tests/foo.eval.mjs    <- does NOT: a subdirectory is not beside it
```

One rule for all three kinds — an agent or a hook takes the same
**name-prefixed sibling**: `agents/bar.harness.mjs`, `hooks/pre-edit.harness.mjs`.

Why a subdirectory does not count: colocation is worth having for exactly one
property — `ls` answers _"is this tested?"_ without running anything. Permit
`skills/foo/tests/` and it takes `find` instead, and two permitted shapes become
a choice at write time and a lookup at read time. A bundled script's own unit
test (`skills/foo/scripts/thing.test.mjs`) is a good test **of that script** and
not a test of the skill, which is the distinction the rule turns on.

**Which of the two names to use** — they are not synonyms, unlike `.test.` and
`.spec.` elsewhere in the JS world:

| file | costs | answers |
|---|---|---|
| `foo.harness.mjs` | nothing, runs on every push | does this gate still catch what it claims? |
| `foo.eval.mjs` | real model calls, run on a schedule | does this skill fire at all? |

A surface with only a harness is reported as never having had its firing
measured, which is a different gap with a different price — not a smaller one.

### Why the name has to match (changed 2026-08-11)

A skill used to be covered by ANY file under its directory, while agents and
hooks already required the name. Found by dogfooding: a repo's
`.claude/skills/paper-pipeline/` held six `*.eval.mjs`, exactly one about that
skill — the rest measured OTHER skills and sat there because the directory had
been the pipeline's home before tests moved next to their subjects. One was
literally `grade-paper-writing-ablation.eval.mjs`. The orchestrator scored as
covered and had no test of its own.

That is the same substitution the removed `mention` tier made — a name near a
test taken for a test.

### Why only one (changed 2026-08-11)

There used to be three — a `vigiles:covers` **declaration**, **colocation**, and a
**content-reference** that credited any test whose code named the surface. They
were never three strengths of evidence; they were three naming conventions, all
answering _"does this surface's name appear near a test?"_ and none answering
_"did anything run against it?"_.

Measured on vigiles's own repository before the change, the content-reference
tier supplied **9 of 10** covered surfaces, and at least three of those were
false — including two shipped hooks credited by the coverage detector's **own**
test suite, which names them as fixtures. A declaration fared no better in
practice: its first real use declared a conformance _lint_ over 21 skills as
coverage _of_ those 21 skills, moving a repo from 31 untested to 16 while nothing
new was tested.

Colocation is kept because it cannot drift by construction. The test lives with
the surface, so deleting the skill deletes its test, renaming moves both, and
`ls` answers "is this tested?" without running anything.

**The cost, stated plainly:** a good test that lives somewhere else now counts
for nothing until you move it next to its surface. That is the intended
pressure — a per-surface test belongs with its surface.

> ⚠️ **What colocation still does not prove.** It says the file **exists**, not
> that it **ran**: an empty `foo.eval.mjs` counts. The report says so on every
> run. Closing that is a condition to add to this rule (a run reporting more than
> zero checks), not a fourth kind of evidence.

## Counting an external test suite (promptfoo, a home-grown eval loop)

If you already test your skills through a **separate loop** — a
`promptfooconfig.yaml`, a home-grown `evals.json` benchmark, a Python harness —
point `testGlobs` at those files **and place them beside the skill they cover**:

```json
{
  "rules": {
    "untested-skill": [
      "warn",
      {
        "testGlobs": [
          "**/*.{harness,eval}.mjs",
          "skills/*/promptfooconfig.yaml"
        ]
      }
    ]
  }
}
```

A file in `testGlobs` counts only where it sits. One central config naming every
skill covers none of them — that is the content-reference rule that was removed.

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
