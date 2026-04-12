---
name: pr-to-lint-rule
description: Convert a recurring PR review comment into an automated lint rule with tests and spec entry
disable-model-invocation: true
argument-hint: <description of recurring PR feedback>
---

Convert a recurring PR review comment into an automated lint rule.

## Arguments

$ARGUMENTS — A natural language description of the pattern to enforce. Examples:

- "we keep telling people not to import directly from antd, use our design system barrel file instead"
- "people forget to use our custom logger instead of console.log"
- "don't use unwrap() in production code, use expect() or proper error handling"
- "API route handlers must use the withAuth wrapper"

## Instructions

You are generating an automated lint rule from a recurring code review pattern. Follow these steps:

### Step 1: Detect the Project Language and Toolchain

Look at the repository to determine:

- **Primary language** (JS/TS, Python, Rust, Go, Ruby, etc.)
- **Linter in use** (ESLint, Ruff, Clippy, golangci-lint, RuboCop, etc.)
- **Testing framework** (Vitest, Jest, pytest, cargo test, etc.)
- **Existing custom rules** (to match conventions)

**If the language or linter cannot be confidently detected** (e.g. polyglot repo, no linter config, or multiple candidates), **ask the user** which language and linter to target before generating anything.

### Step 2: Generate the Lint Rule

Based on the detected (or user-specified) language, generate the appropriate rule type:

**Read the linter-specific reference doc before generating.** Each doc covers existing plugins to check first, rule/lint anatomy, AST patterns, auto-fix safety, testing, and edge cases.

| Language              | Linter    | Reference doc                 |
| --------------------- | --------- | ----------------------------- |
| JavaScript/TypeScript | ESLint    | `../linter-docs/eslint.md`    |
| Python                | Ruff      | `../linter-docs/ruff.md`      |
| Python                | Pylint    | `../linter-docs/pylint.md`    |
| Ruby                  | RuboCop   | `../linter-docs/rubocop.md`   |
| Rust                  | Clippy    | `../linter-docs/clippy.md`    |
| CSS                   | Stylelint | `../linter-docs/stylelint.md` |

For all linters, follow this order:

1. **Check existing plugins/rules first** — see the plugin table in the linter doc
2. **Try built-in config options** — most linters have `no-restricted-*` or equivalent rules that handle one-off patterns without custom code
3. **Only write a custom rule** when you need AST analysis, auto-fix, or configurable options beyond what exists

If a custom rule is needed, the reference doc provides: rule anatomy, AST node cheat sheet, auto-fix/suggest patterns, testing examples, and registration instructions.

#### For Go (go/analysis)

No linter doc yet. Generate an analyzer using `golang.org/x/tools/go/analysis` with `analysistest` tests.

#### For other languages

Generate the most idiomatic linting approach with test cases and integration instructions.

### Step 3: Add to Instruction File

**If the project uses v2 specs** (has `CLAUDE.md.spec.ts`):

Add an `enforce()` rule to the spec file:

```typescript
"<rule-id>": enforce("<linter>/<rule-name>", "<why>"),
```

Then run `npx vigiles compile` to regenerate CLAUDE.md.

**If the project uses v1** (hand-written CLAUDE.md):

Append an annotation block:

```markdown
### <Rule title — imperative, concise>

**Enforced by:** `<linter>/<rule-name>`
**Why:** <One sentence explaining the architectural reason>
```

### Step 4: Present the Output

Show the user:

1. All generated files with full contents
2. Step-by-step integration instructions
3. The spec rule or CLAUDE.md block to add
4. How to verify it works (run the linter, expect it to catch a violation)

Ask the user if they want you to write the files and update the spec/CLAUDE.md.
