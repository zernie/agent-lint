---
name: strengthen
description: Upgrade guidance() rules to enforce() by finding existing linter rules that match
disable-model-invocation: true
---

Scan spec files for `guidance()` rules and suggest `enforce()` replacements backed by real linter rules.

## Instructions

### Step 1: Discover What's Installed

Run `npx vigiles generate-types` to get the full list of enabled linter rules in the project. Read `.vigiles/generated.d.ts` to see every rule available across all detected linters.

Also check which linters are present:

- **ESLint** — look for `eslint.config.*` or `.eslintrc.*` in the project root, and `eslint` in `package.json` devDependencies
- **Ruff** — look for `ruff` section in `pyproject.toml` or `ruff.toml`
- **Clippy** — look for `Cargo.toml` with `[lints.clippy]`
- **Pylint** — look for `.pylintrc` or `pylint` section in `pyproject.toml`
- **RuboCop** — look for `.rubocop.yml`
- **Stylelint** — look for `stylelint` in `package.json` or `.stylelintrc.*`

### Step 2: Read the Linter Reference Docs

Based on which linters are present, read the corresponding reference docs:

- ESLint → `../linter-docs/eslint.md`
- Stylelint → `../linter-docs/stylelint.md`
- Ruff → `../linter-docs/ruff.md`
- Pylint → `../linter-docs/pylint.md`
- RuboCop → `../linter-docs/rubocop.md`
- Clippy → `../linter-docs/clippy.md`

These docs contain plugin tables, recommended rules, and decision matrices for mapping patterns to rules.

### Step 3: Find All Guidance Rules

Find all `.spec.ts` files in the project (`**/*.md.spec.ts`). For each file, identify every `guidance()` rule.

### Step 4: Match Each Guidance Rule

For each guidance rule, determine if an existing linter rule can enforce it:

1. **Check the generated types first** — if `.vigiles/generated.d.ts` lists a rule that directly matches, suggest it.
2. **Check the plugin tables** in the linter reference docs — the guidance text may describe a pattern covered by a well-known plugin rule.
3. **Check built-in ESLint rules** — `no-restricted-syntax`, `no-restricted-imports`, and `no-restricted-properties` can enforce many patterns via config alone, no custom rule needed.
4. **If no existing rule fits**, note it as a candidate for `/pr-to-lint-rule` (custom rule authoring) but don't generate one — just flag it.

When matching, think about what the guidance rule is actually asking for, not just keyword matching. For example:

- "Use our custom logger" → `eslint/no-console` (bans the wrong thing, the rule enforces the right thing)
- "Don't import from internal modules" → `eslint/no-restricted-imports` with a `patterns` config, or `import/no-internal-modules`
- "Prefer composition over inheritance" → no linter rule, stays as guidance
- "Every API handler must validate input" → no general linter rule, could be a custom rule → flag for `/pr-to-lint-rule`

### Step 5: Present Suggestions

For each guidance rule that can be strengthened, show:

```typescript
// Before
"rule-id": guidance("Original guidance text"),

// After
"rule-id": enforce("linter/rule-name", "Original guidance text"),
```

If the rule requires linter config changes (e.g., adding options to `no-restricted-imports`), show the config change too.

Group the output:

1. **Direct replacements** — an existing enabled rule matches perfectly
2. **Requires config** — a built-in rule matches but needs options added to the linter config
3. **Requires plugin install** — a known plugin has the rule but isn't installed yet
4. **No match** — stays as guidance, or candidate for `/pr-to-lint-rule`

### Step 6: Apply Changes

Ask the user which suggestions to apply. For approved changes:

1. Edit the spec file — replace `guidance()` with `enforce()`
2. If linter config changes are needed, apply them
3. Run `npm run build && npx vigiles compile` to verify
4. If compilation fails (rule doesn't exist or is disabled), report the error and revert
