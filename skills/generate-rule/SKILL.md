<!-- vigiles:sha256:a9df2c1748576753 compiled from skills/generate-rule/SKILL.md.spec.ts -->

---

name: generate-rule
description: Add a new enforce(), check(), or guidance() rule to an existing spec file
disable-model-invocation: true
argument-hint: <rule>

---

## Arguments

- `$1` **rule** — natural-language description of what the rule should enforce, e.g. "no console.log in production code"

## Steps

### Step 1

**Find the spec file.** Look for `CLAUDE.md.spec.ts` in the repo root. If it doesn't exist:

- If there's a hand-written `CLAUDE.md`, suggest running the `migrate-to-spec` skill first.
- If there's no `CLAUDE.md` either, suggest `npx vigiles init` to scaffold one.

### Step 2

**Classify the rule** from the description ($1):

- **enforce()** — if a linter rule can back it. Check the project's linter configs (ESLint, Ruff, Clippy, Pylint, RuboCop, Stylelint) for a matching rule; also consider an architectural tool (ast-grep, Dependency Cruiser, Steiger). If uncertain whether a rule exists, **ask the user** rather than guessing.
- **check()** — if it's a filesystem structural convention ("every X needs a Y"). Only for file-pairing; never for code content.
- **guidance()** — if it can't be mechanically enforced (subjective conventions, process rules, migration context).

### Step 3

**Generate the rule.** Create an entry with a kebab-case ID derived from the description. Examples:

    "no-console": enforce("eslint/no-console", "Use structured logger for observability."),

    "controller-tests": check(
      every("src/**/*.controller.ts").has("{name}.controller.test.ts"),
      "Every controller must have a co-located test file.",
    ),

    "research-before-implementing": guidance(
      "Google unfamiliar APIs before implementing.",
    ),

### Step 4

**Add it to the spec.** Read the existing spec file and add the new rule to the `rules` object, preserving alphabetical ordering if the existing rules are alphabetical. Import any new builders needed (e.g. `check` and `every` for the first `check()` rule).

### Step 5

**Compile and verify.** Build and recompile; if compilation fails (e.g. the linter rule doesn't exist), report the error and suggest alternatives. Show the user the updated spec and the compiled `CLAUDE.md` diff.

**Gate** — run the project's build command (retry up to 2×); do not proceed until it passes.

<!-- vigiles:gate role:build retry:2 -->

## Result

This skill is complete when the project's build command passes.

<!-- vigiles:result role:build -->
