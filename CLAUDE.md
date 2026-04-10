# CLAUDE.md

vigiles — compile typed TypeScript specs to AI instruction files (CLAUDE.md, AGENTS.md, SKILL.md). Your project's conventions as TypeScript — type-checked at authoring time, proven at build time, compiled to markdown for agents to read.

## Positioning

vigiles compiles `.spec.ts` files to instruction files (CLAUDE.md, AGENTS.md, or any markdown target). The spec is the source of truth. The markdown is a build artifact. Nobody else does this — other tools lint markdown after the fact. vigiles eliminates the problem at the source.

The linter cross-referencing engine is the core moat: `enforce("@typescript-eslint/no-floating-promises")` verifies the rule exists AND is enabled in your linter config. Same for ESLint, Ruff, Clippy, Pylint, RuboCop, and Stylelint. No other tool resolves rules against 6 linter APIs.

`generate-types` is the second moat: scans all 6 linter APIs, package.json, and project files to emit a `.d.ts` with type unions. The TS compiler then PROVES references are valid at authoring time — typos become type errors, not runtime surprises.

vigiles does NOT do architectural linting. Use [ast-grep](https://ast-grep.github.io/), [Dependency Cruiser](https://github.com/sverweij/dependency-cruiser), [Steiger](https://github.com/feature-sliced/steiger), or [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) for that. vigiles can reference their rules via `enforce()`.

## Key Files

- `src/spec.ts` — Type system and builder functions (`enforce`, `guidance`, `check`, `claude`, `skill`, `file`, `cmd`, `ref`)
- `src/compile.ts` — Compiler: spec → markdown with SHA-256 hash, linter verification, reference validation
- `src/linters.ts` — Linter cross-referencing engine (ESLint, Stylelint, Ruff, Clippy, Pylint, RuboCop)
- `src/generate-types.ts` — Type generator: scans linters/package.json/filesystem → emits `.d.ts`
- `src/cli.ts` — CLI: `compile`, `check`, `init`, `generate-types` commands
- `src/action.ts` — GitHub Action wrapper
- `src/spec.test.ts` — Test suite (node:test)
- `examples/CLAUDE.md.spec.ts` — Example CLAUDE.md spec
- `examples/SKILL.md.spec.ts` — Example SKILL.md spec
- `research/` — Design docs: executable-specs.md, feature-ideas.md, competitive-landscape.md, ai-code-quality.md

## Commands

- `npm run build` — Compile TypeScript to dist/
- `npm test` — Build and run all tests
- `npm run fmt` — Format with prettier
- `npm run fmt:check` — Check formatting
- `npx vigiles compile` — Compile all .spec.ts → .md files
- `npx vigiles check` — Verify compiled file hashes
- `npx vigiles init` — Scaffold a starter spec
- `npx vigiles generate-types` — Emit .vigiles/generated.d.ts from project state

## Architecture

Three rule types in specs:

- `enforce()` — delegated to external tool (linter, ast-grep, dependency-cruiser). vigiles verifies the rule exists and is enabled.
- `check()` — vigiles-owned filesystem assertion (e.g., `every("src/**/*.controller.ts").has("{name}.test.ts")`). Scoped to what no other tool handles.
- `guidance()` — prose only, compiles to `**Guidance only**` in markdown.

Template literal types ensure linter names (`eslint/`, `ruff/`, etc.) are type-safe. Branded types (`VerifiedPath`, `VerifiedCmd`, `VerifiedRef`) distinguish verified references from raw strings.

Compilation: spec.ts → compiler reads spec, validates references (file paths via existsSync, npm scripts via package.json, linter rules via linter APIs), generates markdown with SHA-256 integrity hash.

Core modules: `src/spec.ts` (types + builders), `src/compile.ts` (compiler), `src/linters.ts` (6-linter cross-referencing engine), `src/generate-types.ts` (type generator).

## Principles

### Never skip or disable tests

**Enforced by:** `code-review`
**Why:** All tests must pass. If a test requires a CLI tool (pylint, rubocop, ruff, clippy), install the tool, don't skip the test.

### Zero config by default

**Enforced by:** `code-review`
**Why:** `vigiles compile` should work with just a .spec.ts file. Config exists only for overrides (maxRules, maxTokens, catalogOnly).

### Don't reimplement existing tools

**Enforced by:** `code-review`
**Why:** Architectural linting belongs in ast-grep/Dependency Cruiser/Steiger. Per-file code rules belong in ESLint/Ruff/Clippy. vigiles owns: compilation, linter cross-referencing, type generation, filesystem assertions, and stale reference detection.

### Smooth adoption from zero to fully integrated

**Enforced by:** `code-review`
**Why:** Every adoption surface (CLI, GHA, plugin, skills, types) must work together. `npx vigiles check` should be the first thing a new user runs and it should tell them exactly what to do next. Support both incremental migration (`require-spec: false`) and strict enforcement (`require-spec: true`). Multi-target output (CLAUDE.md, AGENTS.md) from one spec. See `research/adoption-strategy.md` for the full adoption level breakdown.

## Rules

### Run `npm run fmt:check` before committing

**Enforced by:** `code-review`
**Why:** Inline code spans in markdown need surrounding spaces to render correctly.

### Never include session links in commits or PRs

**Guidance only** — cannot be mechanically enforced
**Why:** This is a public repo. Claude Code session URLs are private.
