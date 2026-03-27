# /pr-to-lint-rule

Convert a recurring PR review comment into an automated lint rule.

## Arguments

`<description>` — A natural language description of the pattern to enforce. Examples:
- "we keep telling people not to import directly from antd, use our design system barrel file instead"
- "people forget to use our custom logger instead of console.log"
- "test files should always import from the test-utils barrel, not directly from @testing-library/react"
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

### Step 2: Generate the Lint Rule

Based on the detected language, generate the appropriate rule type:

#### For JavaScript/TypeScript (ESLint)

Generate:
1. **Rule file** (`eslint-rules/<rule-name>.js` or `.ts`) — an ESLint rule using the AST visitor pattern
2. **Test file** (`eslint-rules/<rule-name>.test.js` or `.ts`) — using RuleTester with valid/invalid cases
3. **Registration** — show how to add the rule to `eslint.config.js` (flat config)

Use the ESLint `RuleModule` format with:
- `meta` (type, docs, messages, schema)
- `create(context)` returning AST visitor methods

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

### Step 3: Generate the CLAUDE.md Block

Generate a CLAUDE.md annotation block to append:

```markdown
### <Rule title — imperative, concise>
**Enforced by:** `<linter>/<rule-name>`
**Why:** <One sentence explaining the architectural reason>
```

### Step 4: Present the Output

Show the user:
1. All generated files with full contents
2. Step-by-step integration instructions
3. The CLAUDE.md block to add
4. How to verify it works (run the linter, expect it to catch a violation)

Ask the user if they want you to write the files and update CLAUDE.md.
