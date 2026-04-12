# Ruff — Reference

Shared linter reference for vigiles skills. Used by `strengthen` (find existing rules) and `pr-to-lint-rule` (write custom rules).

## Check Existing Rules First

Ruff reimplements 800+ rules from flake8, pylint, isort, pyupgrade, and others. Before writing a custom rule, check if Ruff already covers it:

| Prefix    | Source                    | Key rules                                                                                                                                     |
| --------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `E` / `W` | pycodestyle               | `E501` (line-too-long), `W291` (trailing-whitespace), `E711` (none-comparison)                                                                |
| `F`       | pyflakes                  | `F401` (unused-import), `F841` (unused-variable), `F811` (redefined-unused-name)                                                              |
| `I`       | isort                     | `I001` (unsorted-imports), `I002` (missing-required-import)                                                                                   |
| `N`       | pep8-naming               | `N801` (invalid-class-name), `N802` (invalid-function-name), `N806` (non-lowercase-variable)                                                  |
| `UP`      | pyupgrade                 | `UP006` (non-pep585-annotation), `UP007` (non-pep604-annotation), `UP035` (deprecated-import)                                                 |
| `S`       | flake8-bandit             | `S101` (assert), `S105` (hardcoded-password-string), `S301` (suspicious-pickle-usage)                                                         |
| `B`       | flake8-bugbear            | `B006` (mutable-argument-default), `B007` (unused-loop-control-variable), `B905` (zip-without-explicit-strict)                                |
| `A`       | flake8-builtins           | `A001` (builtin-variable-shadowing), `A002` (builtin-argument-shadowing)                                                                      |
| `C4`      | flake8-comprehensions     | `C400` (unnecessary-generator-list), `C401` (unnecessary-generator-set), `C408` (unnecessary-collection-call)                                 |
| `T20`     | flake8-print              | `T201` (print), `T203` (pprint)                                                                                                               |
| `SIM`     | flake8-simplify           | `SIM102` (collapsible-if), `SIM108` (if-else-block-instead-of-if-exp), `SIM110` (reimplemented-builtin)                                       |
| `PL`      | pylint                    | `PLC0414` (useless-import-alias), `PLE1205` (logging-too-many-args), `PLR0913` (too-many-arguments), `PLW0602` (global-variable-not-assigned) |
| `PTH`     | flake8-use-pathlib        | `PTH100` (os-path-abspath), `PTH118` (os-path-join), `PTH123` (builtin-open)                                                                  |
| `RUF`     | ruff-specific             | `RUF001` (ambiguous-unicode-character), `RUF005` (collection-literal-concatenation), `RUF013` (implicit-optional)                             |
| `D`       | pydocstyle                | `D100` (undocumented-public-module), `D103` (undocumented-public-function), `D400` (first-line-should-end-with-period)                        |
| `ANN`     | flake8-annotations        | `ANN001` (missing-type-function-argument), `ANN201` (missing-return-type-public-function)                                                     |
| `ARG`     | flake8-unused-arguments   | `ARG001` (unused-function-argument), `ARG002` (unused-method-argument)                                                                        |
| `ERA`     | eradicate                 | `ERA001` (commented-out-code)                                                                                                                 |
| `TCH`     | flake8-type-checking      | `TCH001` (typing-only-first-party-import), `TCH002` (typing-only-third-party-import)                                                          |
| `FBT`     | flake8-boolean-trap       | `FBT001` (boolean-typed-positional-argument), `FBT002` (boolean-default-value-positional-argument)                                            |
| `ICN`     | flake8-import-conventions | `ICN001` (unconventional-import-alias) — e.g., `import numpy as np`                                                                           |
| `PIE`     | flake8-pie                | `PIE790` (unnecessary-placeholder), `PIE804` (no-unnecessary-dict-kwargs)                                                                     |
| `RSE`     | flake8-raise              | `RSE102` (unnecessary-paren-on-raise-exception)                                                                                               |
| `RET`     | flake8-return             | `RET501` (unnecessary-return-none), `RET504` (unnecessary-assign)                                                                             |
| `TID`     | flake8-tidy-imports       | `TID252` (relative-imports) — ban relative imports                                                                                            |
| `PERF`    | perflint                  | `PERF101` (unnecessary-list-cast), `PERF401` (manual-list-comprehension)                                                                      |
| `FURB`    | refurb                    | `FURB105` (print-empty-string), `FURB118` (reimplemented-operator)                                                                            |

**Tip:** Run `ruff rule <CODE>` to see the full description of any rule. Run `ruff linter` to see all available rule groups.

## Rule Selection

Configure in `pyproject.toml`:

```toml
[tool.ruff.lint]
select = [
  "E", "W",    # pycodestyle
  "F",         # pyflakes
  "I",         # isort
  "B",         # flake8-bugbear
  "S",         # flake8-bandit
  "UP",        # pyupgrade
  "SIM",       # flake8-simplify
  "T20",       # flake8-print
  "RUF",       # ruff-specific
]
ignore = [
  "E501",      # line-too-long (handled by formatter)
]

[tool.ruff.lint.per-file-ignores]
"tests/**" = ["S101"]  # allow assert in tests
"__init__.py" = ["F401"]  # allow unused imports in __init__
```

Or in `ruff.toml` (same syntax without `[tool.ruff]` prefix):

```toml
[lint]
select = ["E", "F", "I", "B"]
```

### Selecting individual rules vs groups

- `"F"` enables all pyflakes rules
- `"F401"` enables only `F401`
- `"ALL"` enables everything (noisy — use `ignore` to subtract)
- Use `extend-select` to add rules without overriding the default set

## Custom Rules

**Ruff does not support user-defined rules.** If no existing rule covers your pattern:

1. **Configure existing rules** — many rules accept options (e.g., `flake8-import-conventions` lets you set allowed aliases)
2. **Use `ruff.lint.flake8-import-conventions.aliases`** — for import alias enforcement
3. **Use `ruff.lint.flake8-tidy-imports.banned-api`** — for banning specific imports/modules
4. **Use ast-grep** — for arbitrary AST pattern matching, reference via `enforce()` with an ast-grep rule
5. **Write a Pylint checker** — if you need the full power of a custom rule with AST analysis, use Pylint (Ruff can coexist with Pylint in CI)

```toml
# Ban specific APIs without a custom rule
[tool.ruff.lint.flake8-tidy-imports.banned-api]
"os.system".msg = "Use subprocess.run instead."
"typing.Dict".msg = "Use dict instead (PEP 585)."
```

## Auto-Fix

Ruff provides auto-fix for many rules:

```bash
ruff check --fix              # apply safe fixes only
ruff check --fix --unsafe-fixes  # include unsafe fixes
ruff check --fix-only         # only fix, don't report remaining violations
```

**Safe vs unsafe fixes:**

- **Safe** — guaranteed to not change semantics (e.g., removing unused imports)
- **Unsafe** — may change semantics (e.g., `UP007` rewriting `Optional[X]` to `X | None` can break runtime type checking)

Check fixability per rule with `ruff rule <CODE>` — it shows whether the rule has a fix and if it's safe.

### vigiles enforce() reference

```typescript
enforce("ruff/F401", "Remove unused imports.");
enforce("ruff/T201", "Use logging module instead of print.");
enforce("ruff/S101", "Don't use assert in production code.");
```

vigiles checks `ruff rule <CODE>` and verifies the rule exists, then parses `ruff check --show-settings` to confirm it's enabled.

## Edge Cases and Gotchas

### Ruff vs Pylint (PL prefix)

Ruff reimplements many Pylint rules with the `PL` prefix. The mapping is not 1:1 — some Pylint rules have no Ruff equivalent, and Ruff's implementations may differ in edge cases.

| Ruff code | Pylint equivalent                      | Notes         |
| --------- | -------------------------------------- | ------------- |
| `PLR0913` | `R0913` (too-many-arguments)           | Same behavior |
| `PLC0414` | `C0414` (useless-import-alias)         | Same behavior |
| `PLW0602` | `W0602` (global-variable-not-assigned) | Same behavior |
| `PLE1205` | `E1205` (logging-too-many-args)        | Same behavior |

If the project uses both Ruff and Pylint, disable Pylint rules that Ruff already covers to avoid duplicate reports.

### Preview rules

Some rules are behind `--preview` flag. These are not stable and may change between versions. Don't use `enforce()` on preview rules unless you pin the Ruff version.

```toml
[tool.ruff]
preview = true  # enables preview rules
```

### Formatter vs linter conflicts

Ruff has both a linter (`ruff check`) and a formatter (`ruff format`). Some linter rules conflict with the formatter:

- `E501` (line-too-long) — the formatter handles line length; disable in the linter
- `W291`/`W292`/`W293` — whitespace rules handled by formatter
- `COM812` (missing-trailing-comma) — conflicts with formatter in some cases

The Ruff docs recommend: `ignore = ["E501", "W291", "W292", "W293"]` when using `ruff format`.

### Monorepo config inheritance

Ruff resolves config by walking up from the file being linted. In a monorepo:

- Each package can have its own `pyproject.toml` with `[tool.ruff]`
- A root config applies to all packages unless overridden
- Use `extend` to inherit from a shared config: `extend = "../../pyproject.toml"`

vigiles discovers Ruff config at `basePath` only. In a monorepo, run vigiles from each package root.

## Mapping PR Feedback to Rule Strategy

| PR comment pattern            | Best approach                                                      |
| ----------------------------- | ------------------------------------------------------------------ |
| "Remove unused imports"       | `ruff/F401` — already exists                                       |
| "Don't use print()"           | `ruff/T201` — already exists                                       |
| "Sort your imports"           | `ruff/I001` — already exists                                       |
| "Use pathlib not os.path"     | `ruff/PTH*` — enable the PTH group                                 |
| "Don't use assert in prod"    | `ruff/S101` — already exists, ignore in tests via per-file-ignores |
| "Remove commented-out code"   | `ruff/ERA001` — already exists                                     |
| "Add type annotations"        | `ruff/ANN*` — enable the ANN group                                 |
| "Use comprehensions"          | `ruff/C4*` — enable the C4 group                                   |
| "Don't shadow builtins"       | `ruff/A001` / `A002` — already exists                              |
| "Simplify this if"            | `ruff/SIM102` / `SIM108` — already exists                          |
| "Don't use mutable defaults"  | `ruff/B006` — already exists                                       |
| "Ban specific import"         | `flake8-tidy-imports.banned-api` config — no custom rule needed    |
| "Naming convention violated"  | `ruff/N*` — enable the N group                                     |
| "Don't use os.system"         | `flake8-tidy-imports.banned-api` config                            |
| "Complex pattern not in Ruff" | Write a Pylint checker or use ast-grep                             |
