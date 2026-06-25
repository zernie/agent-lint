# require-skill-spec

> **Default OFF — the consistent `require-<surface>-spec` parallel.** This is the
> SKILL.md sibling of [`require-instructions-spec`](require-instructions-spec.md),
> kept for naming/behaviour consistency but **off by default**: skills are
> legitimately hand-written, so requiring a `.spec.ts` per `SKILL.md` isn't the
> right default — it would nag about hand-authored, vendored, fixture, and bench
> skills alike. The coverage that matters is [`untested-skill`](untested-skill.md)
> (with [`untested-subagent`](untested-subagent.md) /
> [`untested-hook`](untested-hook.md)): _"every skill / agent / hook ships with a
> test or eval."_ Set `require-skill-spec` explicitly (`"warn"`/`"error"`) to
> spec-manage every skill — e.g. for skills that carry `file()`/`cmd()` references
> you want compile-checked.

Require a `.spec.ts` source file for every `SKILL.md` found in the project.

## Configuration

```json
{
  "rules": {
    "require-skill-spec": "warn"
  }
}
```

| Value             | Behavior                                             |
| ----------------- | ---------------------------------------------------- |
| `"error"`         | `vigiles lint` exits non-zero if any spec is missing |
| `"warn"`          | Prints warning, exits 0                              |
| `false` (default) | Skip this check (off — opt in to spec-manage skills) |

## What it checks

For every `SKILL.md` file found in the project, vigiles looks for a sibling `.spec.ts` file:

- `skills/strengthen/SKILL.md` → expects `skills/strengthen/SKILL.md.spec.ts`

## Why

Skill files benefit from the same compile-time verification as CLAUDE.md — file references in instructions are checked via `file()`, cross-references via `ref()`. Without a spec, skill instructions can reference deleted files or renamed paths without detection.

It is **off by default** because most skills are hand-written prose where a spec adds little value, and `untested-skill` better captures the constraint that actually matters (a skill should have a test/eval). Opt in explicitly (`"warn"`/`"error"`) only for skills that carry `file()`/`cmd()` references you want compile-checked.
