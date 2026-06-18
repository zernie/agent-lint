# require-skill-spec

> **⚠️ Deprecated — default OFF.** Skills are legitimately hand-written (the
> Level-0/1 on-ramp), so requiring a `.spec.ts` per `SKILL.md` was the wrong
> constraint — it nagged about hand-authored, vendored, fixture, and bench skills
> alike. Use [`untested-surface`](untested-surface.md) instead: _"every skill /
> agent / hook ships with a test or eval"_ is the coverage rule that matters, and
> it exempts user-invoked skills and supports per-surface opt-outs. This rule's
> implementation is **kept** — set `require-skill-spec` explicitly if you still
> want it (e.g. for skills that carry `file()`/`cmd()` references) — but it is no
> longer enabled by default and `--strict` no longer promotes it.

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
| `false` (default) | Skip this check (deprecated → off)                   |

## What it checks

For every `SKILL.md` file found in the project, vigiles looks for a sibling `.spec.ts` file:

- `skills/strengthen/SKILL.md` → expects `skills/strengthen/SKILL.md.spec.ts`

## Why

Skill files benefit from the same compile-time verification as CLAUDE.md — file references in instructions are checked via `file()`, cross-references via `ref()`. Without a spec, skill instructions can reference deleted files or renamed paths without detection.

It is **off by default** (deprecated) because most skills are hand-written prose where a spec adds little value, and `untested-surface` better captures the constraint that actually matters (a skill should have a test/eval). Opt in explicitly (`"warn"`/`"error"`) only for skills that carry `file()`/`cmd()` references you want compile-checked.
