# require-instructions-spec

Require a `.spec.ts` source behind every `CLAUDE.md` / `AGENTS.md` — the instruction file must be compiled from a typed spec, not hand-written. The spec is the source of truth; the markdown is a compiled build artifact.

This is a `workflow`-group rule (opinionated — a clean repo can fail it just for not having a spec yet), so it's **off by default** and enabled by `vigiles init --strict`. `vigiles init` auto-adopts every instruction file into a spec, so once you've run setup this rule is **green by construction** — it then only fires on a _new_ hand-added instruction file (a safety net, not a nag).

## Configuration

```json
{
  "rules": {
    "require-instructions-spec": "error"
  }
}
```

| Value              | Behavior                                             |
| ------------------ | ---------------------------------------------------- |
| `"error"`          | `vigiles lint` exits non-zero if any spec is missing |
| `"warn"` (default) | Prints warning, exits 0                              |
| `false`            | Skip this check                                      |

## What it checks

For every `CLAUDE.md` / `AGENTS.md`, vigiles looks for a sibling `.spec.ts`:

- `CLAUDE.md` → expects `CLAUDE.md.spec.ts`
- `AGENTS.md` → expects `AGENTS.md.spec.ts`
- `docs/CLAUDE.md` → expects `docs/CLAUDE.md.spec.ts`

If the markdown already carries a `<!-- vigiles:sha256:... compiled from ... -->` header, it's spec-managed and passes.

**Narrow by design:** only a `.spec.ts` (or the disable marker) satisfies this rule — the name says "spec". Inline `<!-- vigiles:enforce ... -->` comments and a `vigiles:` frontmatter block are valid Level-0/1 on-ramps, but they do **not** satisfy `require-instructions-spec`. If you author in inline/frontmatter mode, keep this rule off (its default).

## Adopt an existing file

You usually don't hit this rule, because `vigiles init` adopts your instruction files for you. To adopt one by hand:

```bash
npx vigiles init --target=CLAUDE.md   # faithfully convert CLAUDE.md → CLAUDE.md.spec.ts
npx vigiles compile                   # reproduce the file (+ integrity header); review the diff
```

Adoption is faithful: every heading becomes a prose section verbatim, no rule is inferred. Run the `/strengthen` skill afterward to upgrade prose to verified `enforce()`/`guard()` rules. `vigiles eject` reverses adoption — it's never a one-way door.

## Disable per file

```markdown
<!-- vigiles-disable require-instructions-spec -->

# CLAUDE.md

...
```

## Exclude paths (vendored / benchmark fixtures)

For files the repo's own lint shouldn't police at all — a vendored third-party `CLAUDE.md`, a benchmark fixture injected verbatim — add a glob to `exclude` in `.vigilesrc.json` instead of editing the file (so it stays byte-faithful). Excluded paths are dropped from `lint` discovery entirely (not just this rule); `node_modules`/`dist`/`.git` are always excluded.

```jsonc
{ "rules": { "require-instructions-spec": "error" }, "exclude": ["bench/**"] }
```

## Why

Hand-written instruction files rot silently. Specs catch stale references at compile time. This rule keeps spec-driven instruction files enforced once you've opted into the `workflow` tier — and since `init` adopts your files into specs up front, opting in doesn't mean a wall of failures.
