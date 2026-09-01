# Contributing to vigiles

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Prerequisites

- **Node.js** 20+
- **npm** 10+
- For full test coverage, you'll also need these linter CLIs on your PATH:
  - `ruff` and `pylint` (Python)
  - `rubocop` (Ruby)
  - `cargo` with `clippy` (Rust)

## Setup

```bash
git clone https://github.com/zernie/vigiles.git
cd vigiles
npm install
npm run build
```

## Project structure

```
src/
  types.ts          Type definitions (interfaces, type aliases)
  validate.ts       Core validation engine (parsing, config, linter checks)
  action.ts         GitHub Action wrapper (reads env vars, calls validatePaths)
  cli.ts            CLI entry point (arg parsing, output formatting)
  validate.test.ts  Test suite (node:test)
src/schemas/        DEPRECATED mdschema YAML presets (parked; require-structure rule never built — see src/schemas/DEPRECATED.md)
skills/             Shipped consumer skills (test-harness, adopt-spec, strengthen, edit-spec, debug-my-harness, linter-docs)
.claude/skills/     This repo's OWN harness — contributor-only, NOT shipped (auto-loads in-repo): generate-logo, pr-to-lint-rule, enforce-rules-format, audit-feedback-loop, audience-check, code-quality + vendored deep-research, review-docs
dist/               Compiled JavaScript output (git-ignored)
```

## Development workflow

### Build

```bash
npm run build        # Compile TypeScript → dist/
```

### Test

```bash
npm test             # Build + run all tests
```

Tests run under **vitest** (`npm test` = build + `vitest run`), with assertions from
`node:assert/strict`. Unit tests live beside their source as `src/**/*.test.ts`.
Optional `vitest` / `jest` matcher adapters ship for CONSUMERS (`vigiles/vitest`,
`vigiles/jest`); they are not what this repo's own suite uses.

### Format

```bash
npm run fmt          # Auto-format with Prettier
npm run fmt:check    # Check formatting (CI uses this)
```

### Type check

```bash
npx tsc --noEmit     # Type-check without emitting
```

### Run locally

```bash
node dist/cli.js audit .     # The zero-config report (build first)
node dist/cli.js lint .      # The deterministic gate CI runs
node dist/cli.js --help      # Every verb and its flags
```

There is no bare `npx vigiles <file>` form — the CLI dispatches on a VERB, and an
unknown one exits 2.

## TypeScript conventions

This project uses **TypeScript strict mode** with these compiler options enabled:

- `strict: true` (includes `strictNullChecks`, `noImplicitAny`, etc.)
- `noUncheckedIndexedAccess: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`

### Guidelines

- **Explicit types** on all exported function signatures (parameters and return types).
- **No `any`** — use `unknown` and narrow with type guards when the type is truly unknown.
- Import types with `import type { ... }` when only used in type positions.
- Use `.js` extensions in import paths (required by Node16 module resolution).
- Respect the hexagonal boundary: `src/core/` is the harness-agnostic domain,
  `src/adapters/<harness>/` holds per-harness facts, and core must never import an
  adapter (enforced by `eslint-plugin-boundaries`, not by convention).

## Adding a new validation rule

Every step below names a file that exists; the previous version of this section
pointed at `src/types.ts`, `src/validate.ts` and a `validate()` function, none of
which have existed for a long time (reported in #176).

A rule is a PURE DETECTOR plus registrations. The detector has ONE home and is
reused by both `lint` (the gate) and `audit` (the report), so the two can never
disagree — see the `one-detector-no-drift` rule in `CLAUDE.md`.

1. Write the detector in `src/core/<name>.ts` — pure, IO injected, no `node:fs`
   import, no Claude Code literals (the core is harness-agnostic; read tool and
   event catalogs from the injected dialect). Unit-test it beside itself.
2. Add the rule name to `RulesConfig` in `src/core/types.ts`.
3. Add its default severity to the rule GROUPS in `src/setup-plan.ts`
   (`STRUCTURAL_RULES` / `WORKFLOW_RULES` / `NUDGE_RULES`) — severity tracks
   CONFIDENCE, not importance.
4. Declare it in `src/core/rule-meta.ts` with its decidability bucket, surface and
   detector. `Record<RuleName, RuleMeta>` makes a missing entry a `tsc` error, and
   `src/core/rule-meta.test.ts` binds the registry to `docs/rules/*.md` as an exact
   set match.
5. Call the same detector from `src/scan.ts` and wire the severity in `src/cli.ts`.
6. Write `docs/rules/<name>.md` and add its row to the matrix in
   `docs/verifying-instruction-files.md`.

For a rule that can be wired at `error`, a FALSE POSITIVE is worse than a miss: a
miss costs a detection, a false positive costs the build — and a rule that fails
correct code gets switched off rather than fixed. Err toward silence.

## Adding a new linter

A linter is ONE `LinterAdapter` in the `LINTERS` registry (`src/core/linters.ts`) —
a `Record<BuiltinLinter, LinterAdapter>`, so a missing linter is a `tsc` error and
`src/core/linter-contract.test.ts` catches any docs/site drift. The full
step-by-step lives in the `add-a-linter` contributor skill
(`.claude/skills/add-a-linter/SKILL.md`); in short:

1. Add the lowercase name to `BUILTIN_LINTERS` in `src/core/spec.ts`.
2. Register it in `LINTERS` via `nodeApiAdapter` (Node-API linter) or `cliAdapter`
   (CLI linter), writing its `checkExists` / `configEnabled` / rule-enumerator
   functions inline; `cedar` is a filesystem literal.
3. Add a `docs/linter-support.md` row + section, and (for a CLI linter) install it
   in the CI `test` job so its gated tests run.
4. Add tests covering both existing and nonexistent rules.

## Pull requests

- Keep PRs focused — one feature or fix per PR.
- All tests must pass (`npm test`).
- Code must compile without errors (`npx tsc --noEmit`).
- Code must be formatted (`npm run fmt:check`).
- Update `CLAUDE.md` if you change exported APIs or add new rules.
- Write descriptive commit messages explaining _why_, not just _what_.

## Architecture decisions

- **Hexagonal core**: the domain (`src/core/`) knows nothing about how an agent runs;
  every harness-specific fact sits behind one of five injectable ports. Adding a
  harness is writing one adapter object, not editing the core.
- **Zero config by default**: vigiles works out of the box. Config exists only for overrides.
- **Two rule packs**: `"recommended"` (permissive defaults) and `"strict"` (tighter constraints).
- **Linter auto-detection**: No need to declare which linters you use — vigiles discovers them.
- **Agent auto-discovery**: Detects AI coding tools by their config directories and validates their instruction files exist.
