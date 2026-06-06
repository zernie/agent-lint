<p align="center">
  <img src="logo.png" width="140" alt="vigiles logo" />
</p>

<h1 align="center">vigiles</h1>

<p align="center">
  <em>Quis custodiet ipsos custodes?</em> — Who watches the watchmen?
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/vigiles"><img src="https://img.shields.io/npm/v/vigiles?color=orange" alt="npm version" /></a>
  <a href="https://github.com/zernie/vigiles/actions"><img src="https://img.shields.io/github/actions/workflow/status/zernie/vigiles/ci.yml?branch=main" alt="CI" /></a>
  <a href="https://github.com/zernie/vigiles/blob/main/LICENSE"><img src="https://img.shields.io/github/license/zernie/vigiles" alt="License" /></a>
</p>

---

Your CLAUDE.md lies to your agent. Here's the fix.

Hand-written CLAUDE.md files rot silently. Here's what a typical one looks like:

```markdown
## Code Style

Never use `any` — the `@typescript-eslint/no-explicit-any` rule
catches this. Always use `unknown` and narrow with type guards.
See `src/utils/type-helpers.ts` for project utilities.

## Testing

Run `npm run typecheck` before submitting. Every service in
src/services/ should have a corresponding test file.
```

Reads fine. Four things are wrong:

1. `@typescript-eslint/no-explicit-any` — disabled to unblock a deadline, never re-enabled
2. `src/utils/type-helpers.ts` — renamed to `src/utils/narrowing.ts` last quarter
3. `npm run typecheck` — script removed from package.json
4. Service/test pairing — no automated check, just a hope

The agent reads this, trusts it, and writes code based on stale claims nobody verified. vigiles **verifies the references in your instruction files** — that each linter rule exists and is enabled, that every file path and script is real — and meets you at whatever commitment level you want.

Three levels. Each is independently useful; adopt as far up as you like.

### Level 0 — inline comments (30 seconds, no new files)

Add a comment to your existing CLAUDE.md and audit it:

```md
<!-- vigiles:enforce eslint/no-console "Route output through logger.ts" -->
```

```bash
npx vigiles audit CLAUDE.md
```

Each rule is checked against your real linter config — typos get closest-match suggestions, disabled rules are flagged. Zero install commitment, zero new files.

### Level 1 — YAML frontmatter (editor autocomplete, still no TypeScript)

Promote your rules into a `vigiles:` block at the top of the file:

```yaml
---
# yaml-language-server: $schema=./.vigiles/schema.json
vigiles:
  enforce:
    - rule: "@typescript-eslint/no-explicit-any"
      why: "Use unknown and narrow with type guards."
    - rule: eslint/no-console
      why: "Route output through logger.ts"
---
```

`npx vigiles generate-schema` emits a JSON Schema from your project's _actual_ enabled rules, so your editor's built-in YAML language server (VS Code, JetBrains, neovim) autocompletes rule names and red-squiggles typos — at edit time, with no TypeScript in the project. `vigiles audit` enforces the same rules in CI. [Markdown mode →](docs/markdown-mode.md)

### Level 2 — typed spec (compiler-grade guarantees)

When you want the strongest guarantees, compile a typed spec. Every linter rule reference is verified against your real config, every file path against the filesystem, every npm script against package.json. Stale references become compile errors — caught at edit time, not when the agent silently ignores you.

```typescript
// CLAUDE.md.spec.ts
import { claude, enforce, guidance } from "vigiles/spec";

export default claude({
  commands: {
    "npm run build": "Compile TypeScript to dist/",
    "npm test": "Build and run all tests",
    // ✗ "npm run typecheck" → compile error: script not in package.json
  },

  keyFiles: {
    "src/utils/narrowing.ts": "Type guard utilities",
    // ✗ "src/utils/type-helpers.ts" → compile error: file not found
  },

  rules: {
    "no-explicit-any": enforce(
      "@typescript-eslint/no-explicit-any",
      "Use unknown and narrow with type guards.",
    ),
    // ✗ if rule is disabled in config → compile error

    "research-first": guidance("Google unfamiliar APIs first."),
  },
});
```

```bash
$ npx vigiles compile

✓ CLAUDE.md.spec.ts → CLAUDE.md
  2 rules (1 linter-verified, 1 guidance)
  ~180 tokens
```

At this level the spec is the source of truth and CLAUDE.md is a build artifact. The agent edits the spec — hooks auto-compile, types catch typos in the editor, CI catches drift.

Companion repo for [Feedback Loop Is All You Need](https://zernie.com/blog/feedback-loop-is-all-you-need).

## What Changes With vigiles

### Claude Code

|                                     | Without vigiles              | With vigiles                                                   |
| ----------------------------------- | ---------------------------- | -------------------------------------------------------------- |
| **Instructions**                    | Hand-written CLAUDE.md       | Compiled from `.spec.ts` (build artifact)                      |
| **Linter rule references**          | Trust-based (nobody checks)  | Verified at compile time against real config                   |
| **File paths**                      | Rot silently when renamed    | `file()` references checked against filesystem                 |
| **Commands**                        | Stale scripts go unnoticed   | `cmd()` references checked against package.json                |
| **Direct edits to CLAUDE.md**       | Anyone can, nobody knows     | PreToolUse hook blocks edits, redirects to spec                |
| **Spec edits**                      | N/A                          | PostToolUse hook auto-compiles to markdown                     |
| **Linter config changes**           | CLAUDE.md drifts out of sync | PostToolUse hook auto-regenerates types                        |
| **guidance → enforce upgrades**     | Manual guesswork             | `/strengthen` reads per-linter docs, suggests upgrades         |
| **New lint rules from PR feedback** | Copy-paste from review       | `/pr-to-lint-rule` generates rule + tests + spec entry         |
| **CI**                              | Nothing to verify            | `vigiles audit` catches hand-edits, disabled rules, stale refs |

<details>
<summary><b>Codex</b> (same compile-time checks, no hooks)</summary>

|                               | Without vigiles                  | With vigiles                                            |
| ----------------------------- | -------------------------------- | ------------------------------------------------------- |
| **Instructions**              | Hand-written AGENTS.md           | Compiled from `.spec.ts`                                |
| **Linter rule references**    | Trust-based                      | Verified at compile time                                |
| **File paths / commands**     | Rot silently                     | Checked at compile time                                 |
| **Direct edits to AGENTS.md** | Undetected                       | CI catches hash mismatch                                |
| **Hooks / auto-compile**      | Not available (no plugin system) | Not available — run `vigiles compile` manually or in CI |
| **CI**                        | Nothing to verify                | Same `vigiles audit` pipeline as Claude                 |

</details>

Everything vigiles compiles and audits is **deterministic** — same input, same output, no LLM in the loop. The non-deterministic parts (authoring specs, suggesting upgrades, writing custom rules) are agent skills that run outside the compilation pipeline. [Determinism breakdown and flow diagram →](docs/comparison.md)

## Quick Start

The fastest path is markdown mode — add a marker to your existing CLAUDE.md and audit it, no install or new files (see [Level 0 / Level 1](#level-0--inline-comments-30-seconds-no-new-files) above and [docs/markdown-mode.md](docs/markdown-mode.md)). When you want compiler-grade guarantees, scaffold a typed spec:

```bash
npx vigiles init
```

The wizard auto-detects your project, creates a spec, scans your linters, compiles to markdown, adds a CI step, and installs Claude Code hooks. After install: the agent edits the spec (hooks block direct CLAUDE.md edits), the spec auto-compiles on save, and `vigiles audit` catches drift in CI.

Start with `guidance()` rules (zero config). When you're ready, run `/strengthen` to find rules that can be upgraded to compile-verified `enforce()`. Already have a hand-written CLAUDE.md? The wizard detects it and offers migration.

| Flag                 | Effect                                                |
| -------------------- | ----------------------------------------------------- |
| `--strict`           | Sets require-spec and require-skill-spec to `"error"` |
| `--target=AGENTS.md` | Creates AGENTS.md spec instead of CLAUDE.md           |
| `--no-gha`           | Skip adding CI step to GHA workflow                   |

Works the same for humans and agents — fully non-interactive. [Agent setup guide →](docs/agent-setup.md) | [Agent workflows →](docs/agent-workflows.md)

## Three Rule Types

**`enforce()`** — delegated to a linter. vigiles verifies the rule exists in the catalog AND is enabled in your project config. A disabled rule is a compile error.

<!-- vigiles:ignore -->

```typescript
"no-any":    enforce("@typescript-eslint/no-explicit-any", "Use unknown and narrow."),
"no-print":  enforce("ruff/T201", "Use logging module."),
"no-unwrap": enforce("clippy/unwrap_used", "Use expect() with context."),
```

Supports ESLint, Stylelint, Ruff, Clippy, Pylint, RuboCop, and Cedar policies. [Full linter support details →](docs/linter-support.md)

**`guidance()`** — prose advice. No mechanical enforcement, but not untracked: guidance rules participate in the monotonicity proof system. Once a rule exists, it can be strengthened ( `guidance` → `enforce` ) but never weakened or removed without an explicit allowlist. This prevents silent erosion of conventions over time.

```typescript
"research-first": guidance("Google unfamiliar APIs first."),
```

**`guard()`** — reactive: runs a command when watched files change. One declaration emits hooks for every supported system (Claude Code PostToolUse, husky pre-commit, etc.). Eliminates copy-pasting the same trigger across `.claude/settings.json`, `.husky/`, and CI configs.

```typescript
"recompile-specs": guard(
  { watch: "*.spec.ts", run: "npx vigiles compile" },
  "Recompile instruction files when any spec changes.",
),
"regen-types": guard(
  { watch: ["eslint.config.*", "package.json"], run: "npx vigiles generate-types" },
  "Regenerate types when linter config or deps change.",
),
```

Same monotonicity guarantees as `enforce()` — guards can't be silently removed.

## Verified References

`file()`, `cmd()`, and `ref()` catch stale references at compile time:

```typescript
import { claude, file, cmd, ref, instructions } from "vigiles/spec";

export default claude({
  sections: {
    architecture: instructions`
      Core engine in ${file("src/compile.ts")}.
      Run ${cmd("npm test")} to verify.
      See ${ref("skills/strengthen/SKILL.md")} for the strengthen skill.
    `,
    // If any path is stale → compile error
  },
  // ...
});
```

Skill specs use the same helpers for verified references inside instructions. [Full spec format →](docs/spec-format.md)

## Type-Safe Rule References

`vigiles generate-types` scans your linter configs and emits `.vigiles/generated.d.ts`. With this file, `enforce("eslint/no-consolee")` is a red squiggle in your editor — a typo caught at authoring time, not a runtime surprise. Without it, everything falls back to broad types and still works.

```bash
$ npx vigiles generate-types
  eslint: 64 enabled rules  |  ruff: 12  |  npm scripts: 5  |  project files: 42
✓ Generated .vigiles/generated.d.ts
```

Commit the file to git. CI can verify it's fresh: `npx vigiles generate-types --check`. [How it works →](docs/linter-support.md#generate-types)

For markdown frontmatter (Level 1), `vigiles generate-schema` gives the same authoring-time feedback without TypeScript: it emits a JSON Schema from your enabled rules, and your editor's YAML language server autocompletes rule names and squiggles typos. CI freshness check: `npx vigiles generate-schema --check`.

## CLI

```bash
npx vigiles init [--target=X.md]    # Scaffold a spec (runs full setup wizard by default)
npx vigiles compile [files...]      # Compile .spec.ts → .md
npx vigiles audit [files...]        # Verify hashes + inline/frontmatter/spec rules + coverage
npx vigiles generate-types          # Emit .d.ts from project state (for spec mode)
npx vigiles generate-types --check  # Verify .d.ts is up to date
npx vigiles generate-schema         # Emit JSON Schema for vigiles: frontmatter (Level 1)
npx vigiles generate-schema --check # Verify schema.json is up to date
```

## GitHub Action

```yaml
- uses: zernie/vigiles@main # runs `audit` by default
- uses: zernie/vigiles@main
  with:
    command: compile # compile specs in CI
```

To verify generated types are fresh in CI:

```yaml
- run: npx vigiles generate-types --check
```

## Claude Code Plugin

**Install the plugin.** Without it, you're responsible for manually running `compile` and `generate-types`. With it, the agent works with fresh instruction files automatically.

```bash
npx skills add zernie/vigiles
```

The plugin provides two hooks:

- **PreToolUse** (Edit/Write) — blocks direct edits to compiled `.md` files and redirects the agent to the `.spec.ts` source
- **PostToolUse** (Edit/Write) — auto-runs `generate-types` on linter config changes, `compile` on `.spec.ts` changes

## Validation

`vigiles audit` validates instruction files with four rules:

| Rule                                                     | Default  | What it checks                                                               |
| -------------------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| [`require-spec`](docs/rules/require-spec.md)             | `"warn"` | Every CLAUDE.md/AGENTS.md has a spec, inline rule, or `vigiles:` frontmatter |
| [`require-skill-spec`](docs/rules/require-skill-spec.md) | `"warn"` | Every SKILL.md has a `.spec.ts`                                              |
| [`integrity`](docs/rules/integrity.md)                   | `"warn"` | Compiled markdown wasn't hand-edited (SHA-256 check)                         |
| [`coverage`](docs/rules/coverage.md)                     | `false`  | Spec covers enough of the project surface                                    |

Configure in `.vigilesrc.json`:

```json
{
  "rules": {
    "require-spec": "error",
    "integrity": "error",
    "coverage": ["warn", { "scripts": 50, "linterRules": 5 }]
  }
}
```

Disable per-file with `<!-- vigiles-disable require-spec -->` at the top of the markdown.

## Skills

Install with [Vercel Skills](https://github.com/vercel-labs/skills): `npx skills add zernie/vigiles`

| Skill                  | What it does                                                            |
| ---------------------- | ----------------------------------------------------------------------- |
| `strengthen`           | Upgrade `guidance()` → `enforce()` using linter-specific reference docs |
| `edit-spec`            | Edit a spec file — guided workflow with compile step                    |
| `migrate-to-spec`      | Convert a hand-written CLAUDE.md to a typed `.spec.ts`                  |
| `generate-rule`        | Add a new `enforce()` / `guidance()` rule to a spec                     |
| `pr-to-lint-rule`      | Turn a recurring PR review comment into a lint rule + spec entry        |
| `enforce-rules-format` | Validate all rules have enforcement classification                      |
| `audit-feedback-loop`  | Score your repo's feedback loop maturity                                |

## Maturity Levels

From [Feedback Loop Is All You Need](https://zernie.com/blog/feedback-loop-is-all-you-need):

| Level | Name                 | What it means                                                       |
| ----- | -------------------- | ------------------------------------------------------------------- |
| 0     | Vibes                | No CI, no linters, no CLAUDE.md                                     |
| 1     | Guardrails           | CI + standard linters, no custom rules                              |
| 2     | Architecture as Code | Custom lint rules + enforced CLAUDE.md                              |
| 3     | The Organism         | CI + custom rules + visual tests + observability + scheduled agents |

## Output Targets

Specs compile to `CLAUDE.md` by default. Set `target: "AGENTS.md"` or `target: ["CLAUDE.md", "AGENTS.md"]` for multiple outputs from one spec. For non-markdown formats (`.cursorrules`, Copilot), use [rule-porter](https://github.com/nichochar/rule-porter) or [rulesync](https://github.com/dyoshikawa/rulesync) to convert. [Spec format →](docs/spec-format.md)

## Related Tools

vigiles doesn't try to do everything. It owns one thing: compile-time verification of typed specs against real linter configs, filesystems, and package.json. Everything else, compose:

- **Architectural linting** — [ast-grep](https://ast-grep.github.io/), [Dependency Cruiser](https://github.com/sverweij/dependency-cruiser), [Steiger](https://github.com/feature-sliced/steiger). Reference their rules via `enforce()`.
- **File sync** across agents — [Ruler](https://github.com/intellectronica/ruler), [rulesync](https://github.com/dyoshikawa/rulesync), [block/ai-rules](https://github.com/block/ai-rules). vigiles compiles the source; sync tools distribute.
- **Markdown linting** — [markdownlint](https://github.com/DavidAnson/markdownlint). vigiles generates markdown; structure is correct by construction.
- **Code-block linting in docs** — [eslint-plugin-markdown](https://github.com/eslint/eslint-plugin-markdown) for syntax, [twoslash](https://shikijs.github.io/twoslash/) for TS type-checking.
- **Prose quality** — [Vale](https://vale.sh). Different concern.
- **Runtime LLM rule checking** (e.g. ai-rulez `"AI-Powered Rule Enforcement"`) — opposite paradigm. Those tools send your code to a model on every check, costing tokens and giving non-reproducible verdicts. vigiles compiles once and checks deterministically forever after with `eslint`, `ruff`, `tsc`, Cedar evaluation — tools as deterministic as their inputs.

## License

[MIT](LICENSE)
