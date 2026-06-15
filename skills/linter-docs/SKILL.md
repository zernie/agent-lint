---
name: linter-docs
description: Deep linter reference for authoring or debugging a vigiles enforce() rule — plugin tables, AST selectors, type-aware rules, auto-fix, and edge cases for ESLint, Ruff, Pylint, RuboCop, and Stylelint. Use when you need the exact rule name or config for a specific linter, not for running a linter.
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

These are read by the `strengthen` and `edit-spec` skills when matching a
guidance rule to a real linter rule. This skill is user-invoked (a reference,
not an action), so it never fires on its own — open the relevant file directly.
