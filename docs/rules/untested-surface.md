# untested-surface

Flag harness _surfaces_ — skills, subagents, and hooks — that ship without a test or eval. The third gap detector alongside `integrity` (hand-edits) and orphan-docs (unreferenced docs): a surface with no test is a probabilistic-compliance gap hiding in the deterministic layer — nothing measures whether it still does what it claims.

## Configuration

```json
{
  "rules": {
    "untested-surface": "warn"
  }
}
```

With options (ESLint-style tuple):

```json
{
  "rules": {
    "untested-surface": [
      "warn",
      { "hooks": false, "includeUserInvokedSkills": true }
    ]
  }
}
```

### Severity

| Value              | Behavior                                                  |
| ------------------ | --------------------------------------------------------- |
| `"error"`          | `vigiles audit` exits non-zero when a surface is untested |
| `"warn"` (default) | Prints a warning, exits 0 — a nudge, not a gate           |
| `false`            | Skip the check                                            |

### Options

| Option                     | Type     | Default | Description                                                       |
| -------------------------- | -------- | ------- | ----------------------------------------------------------------- |
| `skills`                   | boolean  | `true`  | Scan `skills/*/SKILL.md` and `.claude/skills/*/SKILL.md`          |
| `agents`                   | boolean  | `true`  | Scan `agents/*.md` and `.claude/agents/*.md`                      |
| `hooks`                    | boolean  | `true`  | Scan hook scripts referenced from `plugin.json` / `settings.json` |
| `includeUserInvokedSkills` | boolean  | `false` | Also require a test for `disable-model-invocation` skills         |
| `testGlobs`                | string[] | —       | Override which files count as tests                               |
| `exclude`                  | string[] | —       | Extra ignore globs                                                |

## What counts as "tested"

Two detectors, OR'd — so a test placed **anywhere** counts, not just colocated:

1. **Colocation** (the zero-config convention the warning suggests): a `*.{harness,eval}.mjs` next to the surface.
   - skill `skills/foo/SKILL.md` → any test under `skills/foo/`
   - agent `agents/bar.md` → `agents/bar.harness.mjs`
   - hook `hooks/pre-edit.sh` → `hooks/pre-edit.harness.mjs`
2. **Content-reference** (incl. `*.test.ts`): any discovered test that names the surface by **path** (`skills/foo`, `hooks/pre-edit.sh`) or **namespace** (`vigiles:foo`). Bare names are not matched (too fuzzy).

## Exemptions

- **User-invoked skills.** A skill with `disable-model-invocation: true` is a slash command the model can't auto-trigger, so a trigger eval is meaningless for it — exempt by default. Set `includeUserInvokedSkills: true` to demand an outcome test instead.
- **Per-surface opt-out.** Add a `<!-- vigiles:ignore-test -->` marker to a surface file to exempt it explicitly.
- **Inline hooks.** Hooks defined as a shell one-liner (no script file) have nowhere to colocate; only file-backed hook scripts are scanned.

## Example output

```
Untested surfaces:

  ⚠ 2 surface(s) with no test or eval:
      skill skills/triage/SKILL.md — add e.g. skills/triage/triage.eval.mjs
      hook hooks/post-edit.sh — add e.g. hooks/post-edit.harness.mjs
```

## Why

vigiles's second pillar is testing the harness as the assembled machine it ships as. This rule closes the loop: every activatable surface should have _something_ that measures it — a trigger eval (does the skill fire?), an outcome eval (does it produce the right result?), or a `runHook` unit test (does the hook block/allow correctly?). Warning-by-default keeps adoption gradual: it nudges without breaking CI until you opt into `"error"`.
