# vigiles Adoption Strategy

Goal: **smooth adoption from zero to fully integrated, supporting both incremental migration and strict enforcement.**

---

## Adoption Levels

### Level 0: Discovery

User has a hand-written CLAUDE.md or AGENTS.md. They run:

```bash
npx vigiles check
```

`require-spec` fires: "No spec file found. Migrate with `vigiles init`." This is the first nudge. No install needed — npx works.

### Level 1: Scaffold

User runs:

```bash
npx vigiles init                      # → CLAUDE.md.spec.ts
npx vigiles init --target=AGENTS.md   # → AGENTS.md.spec.ts
```

Gets a commented-out template. Fills in their conventions. Runs `vigiles compile`. First compiled output.

### Level 2: CI Integration

Add to CI pipeline:

```yaml
- run: npx vigiles compile
- run: npx vigiles check
- run: npx vigiles generate-types --check
```

This catches: stale specs (hash mismatch), missing specs (require-spec), disabled linter rules, stale file references, outdated generated types.

### Level 3: Editor Integration

```bash
npx vigiles generate-types
```

Commit `.vigiles/generated.d.ts`. Now `enforce("eslint/no-consolee")` is a red squiggle in the editor. The types narrow `enforce()`, `file()`, `cmd()` via declaration merging.

### Level 4: Agent Integration

Install the Claude Code plugin:

```bash
npx skills add zernie/vigiles
```

PostToolUse hook auto-runs `generate-types` on config changes and `compile` on spec changes. The agent always works with fresh instruction files.

### Level 5: Multi-Target

```typescript
export default claude({
  target: ["CLAUDE.md", "AGENTS.md"],
  rules: { ... },
});
```

One spec, multiple outputs. Use sync tools (rule-porter, rulesync) for non-markdown targets (.cursorrules, Copilot).

---

## Pain Points & Gaps

| Pain Point                                    | Status          | Fix                                     |
| --------------------------------------------- | --------------- | --------------------------------------- |
| `npx vigiles init` only creates CLAUDE.md     | Fixed           | `--target=AGENTS.md` flag               |
| `require-spec` rule not accessible via CLI    | Fixed           | Wired into `vigiles check`              |
| Plugin hook called broken v1 syntax           | Fixed           | Removed, uses post-edit.sh only         |
| GHA doesn't support multi-target              | Open            | Action needs to iterate `targets` array |
| GHA doesn't run `generate-types --check`      | Open            | Add as action input option              |
| `vigiles discover` only finds eslint/ruff/etc | By design       | Linters vigiles scans                   |
| No `vigiles migrate` command                  | Open            | Currently a skill, could be CLI         |
| Skills reference stale v1 syntax              | Partially fixed | enforce-rules-format updated            |

## Codex / AGENTS.md Coverage

AGENTS.md is GitHub's standard for agent instructions. vigiles now supports it as a first-class target:

- `vigiles init --target=AGENTS.md` scaffolds a spec
- `target: "AGENTS.md"` compiles to AGENTS.md with `# AGENTS.md` heading
- `target: ["CLAUDE.md", "AGENTS.md"]` emits both from one spec
- `require-spec` checks AGENTS.md files for specs too

What's NOT supported (and shouldn't be):

- `.cursorrules`, `.copilot` — non-markdown formats, use sync tools
- Codex-specific `.codex/` directory structure — that's IDE config, not instruction files

## Incremental vs. Strict Adoption

**Incremental** (default): `require-spec` errors but doesn't block. Users migrate at their own pace. `vigiles check` in CI reports missing specs without failing the build (set `"require-spec": false` in config).

**Strict**: Enable `require-spec: true` (default). CI fails if any instruction file lacks a spec. Forces immediate migration. Combined with `generate-types --check`, every reference is type-checked.

The user controls the dial via `.vigilesrc.json`:

```json
{ "rules": { "require-spec": false } }
```
