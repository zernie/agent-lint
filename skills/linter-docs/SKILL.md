---
name: linter-docs
description: Deep linter reference for authoring or debugging a vigiles enforce() rule — plugin tables, AST selectors, type-aware rules, auto-fix, and edge cases for ESLint, Ruff, Pylint, RuboCop, Stylelint, and Clippy. Use when you need the exact rule name or config for a specific linter, not for running a linter. (JVM/Go linters — detekt, ktlint, Checkstyle, golangci-lint — and Cedar have no deep-dive file yet; their reference lives in docs/linter-support.md.)
disable-model-invocation: true
---

Reference material for the linters vigiles cross-references. Open the file for
the linter you're working with when you need exact rule names, AST selectors,
or config details to author an `enforce()` rule (or diagnose why one is reported
missing or disabled).

| Linter    | Reference                                                                              |
| --------- | -------------------------------------------------------------------------------------- |
| ESLint    | [`eslint.md`](eslint.md) — plugin table, AST selectors, type-aware rules, auto-fix     |
| Ruff      | [`ruff.md`](ruff.md) — 800+ reimplemented rules, selection, auto-fix, pyproject config |
| Pylint    | [`pylint.md`](pylint.md) — plugin table, astroid AST, type inference, custom checkers  |
| RuboCop   | [`rubocop.md`](rubocop.md) — gem table, node pattern DSL, auto-correct, custom cops    |
| Stylelint | [`stylelint.md`](stylelint.md) — plugin table, PostCSS AST, custom rules, SCSS         |
| Clippy    | [`clippy.md`](clippy.md) — Rust lint groups and configuration                          |

**JVM/Go linters (detekt, ktlint, Checkstyle, golangci-lint) and Cedar** are
cross-referenced by `enforce()` but have no deep-dive file here yet — their
capabilities, config surfaces, and known limits (e.g. ktlint is format-only,
Checkstyle enabled-state is whitelist-only) are documented in
[`docs/linter-support.md`](../../docs/linter-support.md).

These are read by the `strengthen` and `edit-spec` skills when matching a
guidance rule to a real linter rule. This skill is user-invoked (a reference,
not an action), so it never fires on its own — open the relevant file directly.
