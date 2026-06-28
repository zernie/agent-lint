# Markdown mode

> The README has the pitch; this is the full guide to verifying rules in
> **plain markdown** — no TypeScript, no build step.

vigiles meets you in the markdown you already have. You don't need a
TypeScript build step, and you don't need to port your `CLAUDE.md` into a
`.spec.ts` to get verified rules. Declare enforce rules **in the instruction
file itself** and `vigiles lint` verifies them against your real linter config
— existence check, closest-match typo suggestions, disabled-rule detection,
and GitHub Actions annotations, exactly like a typed spec.

## Two on-ramps, one tool

There are **two** ways to author rules, and each adds value without requiring
the other:

| On-ramp            | Where rules live                            | Build step        | When                                             |
| ------------------ | ------------------------------------------- | ----------------- | ------------------------------------------------ |
| **Plain markdown** | `<!-- vigiles:enforce ... -->` in the prose | none              | Try a rule on any `CLAUDE.md`, zero ceremony     |
| **Typed spec**     | `CLAUDE.md.spec.ts` → compiled markdown     | `vigiles compile` | You want compiler-grade guarantees + enforcement |

Plain markdown is the on-ramp; the [typed spec](spec-format.md) is the source
of truth when you want full type checking, programmatic rule composition, and
`generate types`. Your agent writes the spec, and `vigiles eject` hands it back
to plain markdown anytime — so graduating to a spec is never a one-way door.

---

## Inline `enforce` comments

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
handling, scoped plugin names, graduating to a typed spec — see
[docs/inline-mode.md](inline-mode.md).

### What `vigiles lint` catches

- Verifies each rule reference against your real linter config.
- Emits closest-match suggestions on typos:
  `"no-consol"` → `did you mean "eslint/no-console"?`
- Flags rules that exist but are disabled in your linter config.
- Emits `::error` annotations under GitHub Actions.
- Exits with code 2 (hard error) on any failed rule, so CI fails fast.

---

## `require-instructions-spec`

The built-in `require-instructions-spec` rule asks for a `.spec.ts` sibling
for every `CLAUDE.md` / `AGENTS.md`. It is **narrow**: only a `.spec.ts`
satisfies it. Inline `<!-- vigiles:enforce -->` comments and `vigiles:`
frontmatter are still valid plain-markdown on-ramps, but they do **not**
satisfy `require-instructions-spec` — so a markdown-mode user simply keeps
the rule off (it is off by default; turning it on is a workflow-tier opt-in
for teams that want to require a typed spec). No `vigiles-disable
require-instructions-spec` comment needed unless you have enabled the rule.

A file is checked for inline rules **only when it is not managed by a spec** —
i.e. it has no sibling `<file>.spec.ts` and no `vigiles:sha256 … compiled from
…` header. The typed spec is the source of truth; it overwrites the markdown on
the next compile, so don't mix a spec with hand-authored markers in the same
file.

## See also

- [`inline-mode.md`](inline-mode.md) — the full inline-comment reference.
- [`spec-format.md`](spec-format.md) — the typed `.spec.ts` source of truth.
- [`verifying-instruction-files.md`](verifying-instruction-files.md) — the lint guide.

<!-- PARKED FOR LAUNCH — the old "Level 0/1/2" ladder framing + the full YAML
`vigiles:` FRONTMATTER ("Level 1") mode docs. Frontmatter mode is now DISABLED in
lint (2026-06-28): the parser/code is KEPT (src/core/frontmatter.ts,
examples/frontmatter-CLAUDE.md, `vigiles generate schema`) but lint GATES it off
via `FRONTMATTER_MODE_ENABLED = false` in src/cli.ts — a `vigiles:` block is INERT
(not read, not verified, never fails a build). This is the two-on-ramp collapse from
research/pre-release-focus.md taken all the way (un-marketed → disabled), because a
working-but-undocumented mode muddied the spec-first story. NOT deleted: flip the flag
to re-enable. To un-park the DOCS: lift this content back above, re-enable the flag,
and restore the inner `<!~~ … ~~>` markers to real HTML comment markers (they are
written with `~~` here ONLY so a nested comment-close doesn't close this parked
comment). See research/roadmap.md "Launch readiness".

=== Original three-rung ladder ===

There are three commitment levels. Each adds value without requiring the
next, like TypeScript's `any` → typed migration path.

| Level                   | Where rules live                             | Editor feedback                       | Build step        |
| ----------------------- | -------------------------------------------- | ------------------------------------- | ----------------- |
| **0 — inline comments** | `<!~~ vigiles:enforce ... ~~>` in the prose  | none                                  | none              |
| **1 — frontmatter**     | `vigiles:` YAML block at the top of the file | autocomplete + squiggles via YAML LSP | none              |
| **2 — typed spec**      | `CLAUDE.md.spec.ts` compiled to markdown     | full TypeScript type checking         | `vigiles compile` |

Levels 0 and 1 are _markdown mode_ — the subject of this doc. Level 2 is
spec mode; see the main README.

=== Original "Level 1 — YAML frontmatter" section ===

When a handful of inline comments start to clutter the prose, or you want
**editor autocomplete and typo squiggles** without a TypeScript build,
promote your rules into a `vigiles:` block in the file's YAML frontmatter.

Format — rules are a list of `{ rule, why }` entries under `vigiles.enforce`:

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

Editor autocomplete and typo squiggles — generate a JSON Schema from your
project's _actual_ enabled rules:

```bash
npx vigiles generate schema
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
no TypeScript in the project. Re-run `generate schema` when your linter
config changes (or wire it into CI with `--check`).

What `vigiles lint` catches on a file with a `vigiles:` frontmatter block:

- Verify each `rule` reference against your real linter config.
- Emit closest-match suggestions on typos:
  `"no-consol"` → `did you mean "eslint/no-console"?`
- Flag rules that exist but are disabled in your linter config.
- Report malformed YAML frontmatter as an error (with a line number) rather
  than crashing — a broken block never silently drops your rules.
- Emit `::error` annotations under GitHub Actions.
- Exit with code 2 (hard error) on any failed rule, so CI fails fast.

Frontmatter findings appear in `--summary` and `--json` output too, under
`frontmatterErrors` / `frontmatterRules`. A complete, runnable file lives at
examples/frontmatter-CLAUDE.md.

=== Original "Combining levels in one file" ===

A file is checked for inline + frontmatter rules **only when it is not
managed by a spec**. When a file uses both inline comments and frontmatter,
both are verified. A rule that appears in **both** the frontmatter and an
inline comment is verified once, not twice (the inline declaration wins as the
first source), so lint never double-reports it.

=== Original "Choosing a level" ===

- Inline comments when you want to try a single rule with zero ceremony.
- Frontmatter when you have several rules and want editor feedback without a
  TypeScript build — the sweet spot for non-TS projects.
- Typed spec when you want the strongest guarantees: full type checking at
  authoring time, programmatic rule composition, NCD duplicate detection,
  and `generate types` type generation. Scaffold with `npx vigiles init`,
  then copy your rules in.
-->
