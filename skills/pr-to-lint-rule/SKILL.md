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

#### For JavaScript/TypeScript (ESLint)

**Read `../linter-docs/eslint.md` before generating.** It covers plugin lookup, AST selectors, type-aware rules, auto-fix safety, and common gotchas.

Before writing a custom rule:

1. **Check existing plugins** — see the plugin table in `../linter-docs/eslint.md`. Most "don't import X", "don't call Y()", and naming patterns are already covered by `no-restricted-imports`, `no-restricted-syntax`, or `@typescript-eslint/naming-convention`.
2. **Try `no-restricted-syntax`** with an AST selector — this handles ~80% of one-off patterns with zero custom code.
3. **Only write a custom rule** when you need type information, multi-node analysis, auto-fix, or configurable options.

If a custom rule is needed, generate:

1. **Rule file** (`eslint-rules/<rule-name>.js` or `.ts`) — an ESLint rule using the AST visitor pattern
2. **Test file** (`eslint-rules/<rule-name>.test.js` or `.ts`) — using `RuleTester` with valid/invalid cases (include TypeScript edge cases if the project uses TS)
3. **Registration** — add to `eslint.config.js` via a local plugin object (flat config)

Use the ESLint `RuleModule` format with:

- `meta` (type, docs, messages, schema) — set `type` correctly: `"problem"` for bugs, `"suggestion"` for conventions
- `create(context)` returning AST visitor methods
- Prescriptive error messages: always tell the developer **what to do**, not just what's wrong
- Auto-fix via `fix` only if the change is semantics-preserving; use `suggest` otherwise

#### For Python (Ruff custom rules or flake8 plugin)

Generate:

1. A Ruff rule definition if the project uses Ruff, OR a flake8 plugin if using flake8
2. Test cases
3. Configuration to add to `pyproject.toml` or `setup.cfg`

#### For Rust (Clippy)

Generate:

1. A `clippy.toml` configuration if the pattern can be caught by existing Clippy lints
2. Or a custom lint using `dylint` if it requires AST analysis
3. Test cases

#### For Go (go/analysis)

Generate:

1. An analyzer using `golang.org/x/tools/go/analysis`
2. Test cases using `analysistest`
3. Integration instructions

#### For other languages

Generate:

1. The most idiomatic linting approach for that language
2. Test cases
3. Integration instructions

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
