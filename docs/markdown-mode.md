# Markdown mode

vigiles meets you in the markdown you already have. You don't need a
TypeScript build step, and you don't need to port your `CLAUDE.md` into a
`.spec.ts` to get verified rules. Markdown mode is the on-ramp: declare
enforce rules **in the instruction file itself** and `vigiles lint`
verifies them against your real linter config — existence check,
closest-match typo suggestions, disabled-rule detection, and GitHub Actions
annotations, exactly like spec mode.

There are three commitment levels. Each adds value without requiring the
next, like TypeScript's `any` → typed migration path.

| Level                   | Where rules live                             | Editor feedback                       | Build step        |
| ----------------------- | -------------------------------------------- | ------------------------------------- | ----------------- |
| **0 — inline comments** | `<!-- vigiles:enforce ... -->` in the prose  | none                                  | none              |
| **1 — frontmatter**     | `vigiles:` YAML block at the top of the file | autocomplete + squiggles via YAML LSP | none              |
| **2 — typed spec**      | `CLAUDE.md.spec.ts` compiled to markdown     | full TypeScript type checking         | `vigiles compile` |

Levels 0 and 1 are _markdown mode_ — the subject of this doc. Level 2 is
spec mode; see the main README.

---

## Level 0 — inline comments

The minimum-commitment path: add a single HTML comment per rule, anywhere
in your existing markdown.

```md
<!-- vigiles:enforce eslint/no-console "Route output through logger.ts" -->
```

Only `enforce` is supported inline — the prose around the comment _is_ the
guidance, so a `guidance` comment would be a tautology. The reference uses
the same `<linter>/<rule>` format as everywhere else in vigiles.

This is the vigiles equivalent of `// eslint-disable-next-line`: maximum
incrementalism, zero new files. For the full reference — fenced-block
handling, scoped plugin names, graduating to spec mode — see
[docs/inline-mode.md](inline-mode.md).

---

## Level 1 — YAML frontmatter

When a handful of inline comments start to clutter the prose, or you want
**editor autocomplete and typo squiggles** without a TypeScript build,
promote your rules into a `vigiles:` block in the file's YAML frontmatter.

### Format

Rules are a list of `{ rule, why }` entries under `vigiles.enforce`:

```yaml
---
vigiles:
  enforce:
    - rule: "@typescript-eslint/no-explicit-any"
      why: "Use unknown and narrow"
    - rule: eslint/no-console
      why: "Route output through logger.ts"
    - rule: ruff/F401
      why: "No unused imports"
---
```

- `rule` — a `<linter>/<rule>` reference. All seven catalogs (ESLint,
  Stylelint, Ruff, Clippy, Pylint, RuboCop, Cedar), scoped plugin names,
  and the vigiles-internal namespace (`vigiles/orphan-docs`) work here, same
  as spec mode. Scoped ESLint plugin rules may be written bare
  (`@typescript-eslint/no-explicit-any`) or prefixed
  (`eslint/@typescript-eslint/no-explicit-any`).
- `why` — free text shown to the agent as context. Unlike the inline
  `"..."` string, frontmatter `why` can be any YAML scalar, including
  multi-line block scalars.

Both `rule` and `why` are required. Like inline mode, only `enforce` is
supported — the file body is the guidance.

### Editor autocomplete and typo squiggles

The reason to move from Level 0 to Level 1 is tooling. Generate a JSON
Schema from your project's _actual_ enabled rules:

```bash
npx vigiles generate-schema
```

This writes `.vigiles/schema.json` with the `rule` field populated as an
enum of every enabled rule across your detected linters. Point your editor's
built-in YAML language server at it with a modeline as the first line of the
frontmatter:

```yaml
---
# yaml-language-server: $schema=./.vigiles/schema.json
vigiles:
  enforce:
    - rule: eslint/no-consolee # red squiggle: not in the enum
      why: "..."
---
```

Now VS Code, JetBrains, and neovim — all of which ship a YAML LSP — give you
autocomplete on rule names and a red squiggle on typos, at edit time, with
no TypeScript in the project. Re-run `generate-schema` when your linter
config changes (or wire it into CI with `--check`, alongside
`generate-types --check`).

### What `vigiles lint` catches

Running `vigiles lint CLAUDE.md` on a file with a `vigiles:` frontmatter
block will:

- Verify each `rule` reference against your real linter config.
- Emit closest-match suggestions on typos:
  `"no-consol"` → `did you mean "eslint/no-console"?`
- Flag rules that exist but are disabled in your linter config.
- Report malformed YAML frontmatter as an error (with a line number) rather
  than crashing — a broken block never silently drops your rules.
- Emit `::error` annotations under GitHub Actions.
- Exit with code 2 (hard error) on any failed rule, so CI fails fast.

Frontmatter findings appear in `--summary` and `--json` output too, under
`frontmatterErrors` / `frontmatterRules`.

A complete, runnable file lives at
[`examples/frontmatter-CLAUDE.md`](../examples/frontmatter-CLAUDE.md).

---

## Combining levels in one file

A file is checked for inline + frontmatter rules **only when it is not
managed by a spec** — i.e. it has no sibling `<file>.spec.ts` and no
`vigiles:sha256 … compiled from …` header. Spec mode is the source of
truth; it overwrites the markdown on the next compile, so don't mix spec
mode with hand-authored markers in the same file.

When a file uses both Level 0 and Level 1, both are verified. A rule that
appears in **both** the frontmatter and an inline comment is verified once,
not twice (the inline declaration wins as the first source), so lint never
double-reports it.

## `require-spec`

The built-in `require-spec` rule asks for a spec sibling for every
`CLAUDE.md` / `AGENTS.md`. Markdown mode satisfies it: any file with at
least one parseable inline `<!-- vigiles:enforce -->` comment **or** one
valid `vigiles.enforce` frontmatter rule is treated as spec-equivalent. No
`vigiles-disable require-spec` comment needed.

## Choosing a level

- **Level 0** when you want to try a single rule with zero ceremony.
- **Level 1** when you have several rules and want editor feedback without a
  TypeScript build — the sweet spot for non-TS projects.
- **Level 2** when you want the strongest guarantees: full type checking at
  authoring time, programmatic rule composition, NCD duplicate detection,
  and the `generate-types` moat. Scaffold with
  `npx vigiles init --target=CLAUDE.md`, then copy your rules in.
