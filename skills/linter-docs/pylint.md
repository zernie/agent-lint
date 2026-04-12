# Pylint — Reference

Shared linter reference for vigiles skills. Used by `strengthen` (find existing rules) and `pr-to-lint-rule` (write custom checkers).

## Check Existing Plugins First

Before writing a custom checker, search these plugins — the pattern may already be covered:

| Plugin                          | Scope                                       | Key messages to know                                                                                                                                |
| ------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pylint` (core)                 | Convention, Refactor, Warning, Error, Fatal | `C0114` (missing-module-docstring), `R0902` (too-many-instance-attributes), `W0612` (unused-variable), `E1101` (no-member), `W0611` (unused-import) |
| `pylint-django`                 | Django conventions                          | `E5110` (no-member on Django models), `W5101` (fixme in templates), `C5105` (string-used-as-django-setting)                                         |
| `pylint-celery`                 | Celery task patterns                        | Detects common Celery anti-patterns (task retry without max_retries, etc.)                                                                          |
| `pylint-pydantic`               | Pydantic model checking                     | Suppresses false positives from Pydantic's metaclass magic                                                                                          |
| `pylint-pytest`                 | pytest conventions                          | `W6301` (useless-pytest-mark-decorator), `W6302` (unnecessary-pytest-mark-parametrize)                                                              |
| `pylint-flask`                  | Flask patterns                              | Suppresses false positives for Flask's app context, request globals                                                                                 |
| `pylint-sqlalchemy`             | SQLAlchemy ORM                              | Suppresses false `no-member` on SQLAlchemy models                                                                                                   |
| `pylint-protobuf`               | Protobuf message checking                   | Type-checks protobuf field access, catches typos in field names                                                                                     |
| `pylint-import-modules`         | Import style enforcement                    | `C6201` (import-modules-only) — enforce `import module` over `from module import name`                                                              |
| `pylint-secure-coding-standard` | Security patterns                           | Detects insecure patterns: `eval`, `exec`, hardcoded passwords, insecure hash algorithms                                                            |

**Tip:** Many patterns can be handled by Pylint's built-in `bad-names`, `good-names`, `bad-functions`, or the `--disable`/`--enable` system without a custom checker.

**Also consider Ruff.** If the project uses Ruff, it reimplements many Pylint rules (prefixed `PL`) at much higher speed. Check Ruff's rule catalog before writing a Pylint-specific checker.

## Checker Anatomy

Every Pylint checker inherits from `BaseChecker`:

```python
"""Checker for direct database queries outside the repository layer."""

from astroid import nodes
from pylint.checkers import BaseChecker
from pylint.interfaces import HIGH


class NoDirectDbQueryChecker(BaseChecker):
    name = "no-direct-db-query"

    msgs = {
        "C9001": (
            "Use %sRepository instead of %s.%s",
            "no-direct-db-query",
            "Direct model queries should go through the repository layer.",
        ),
    }

    # Optional: add configuration options
    options = (
        (
            "allowed-models",
            {
                "default": (),
                "type": "csv",
                "metavar": "<models>",
                "help": "Models that are allowed to be queried directly.",
            },
        ),
    )

    def visit_call(self, node: nodes.Call) -> None:
        if not isinstance(node.func, nodes.Attribute):
            return
        if not isinstance(node.func.expr, nodes.Name):
            return

        model = node.func.expr.name
        method = node.func.attrname

        if method in ("objects", "filter", "get", "all", "count", "values"):
            if model not in self.linter.config.allowed_models:
                self.add_message(
                    "no-direct-db-query",
                    node=node,
                    args=(model, model, method),
                    confidence=HIGH,
                )


def register(linter):
    linter.register_checker(NoDirectDbQueryChecker(linter))
```

### Key concepts

| Concept       | Purpose             | Notes                                                      |
| ------------- | ------------------- | ---------------------------------------------------------- |
| `name`        | Checker identifier  | Must be unique across all checkers                         |
| `msgs`        | Message dictionary  | Key format: `{C,R,W,E,F}{4 digits}` — category + unique ID |
| `options`     | Configuration       | Exposed via `pylintrc` or command line                     |
| `visit_*`     | AST visitor methods | Called for each matching node type                         |
| `leave_*`     | Post-visit methods  | Called when leaving a node (post-order)                    |
| `add_message` | Report a violation  | Pass message ID, node, args for formatting                 |
| `register`    | Plugin entry point  | Module-level function that registers the checker           |

### Message categories

| Prefix | Category   | When to use                                |
| ------ | ---------- | ------------------------------------------ |
| `C`    | Convention | Style/naming conventions                   |
| `R`    | Refactor   | Code that works but should be restructured |
| `W`    | Warning    | Probable bugs or risky patterns            |
| `E`    | Error      | Definite bugs or broken code               |
| `F`    | Fatal      | Pylint can't process the file              |

Choose a unique 4-digit code starting from `9001` to avoid collisions with core Pylint. Check existing codes with `pylint --list-msgs`.

## AST Nodes — Cheat Sheet (astroid)

Pylint uses `astroid` for AST parsing, which adds type inference on top of Python's `ast` module:

| You want to detect         | Node type / visitor                                 | Notes                                         |
| -------------------------- | --------------------------------------------------- | --------------------------------------------- |
| Function call `foo()`      | `visit_call` + check `node.func`                    | `node.func` is a `Name` or `Attribute`        |
| Method call `obj.method()` | `visit_call` + `isinstance(node.func, Attribute)`   | `node.func.attrname` = method name            |
| Import `import X`          | `visit_import`                                      | `node.names` = list of `(name, alias)` tuples |
| Import `from X import Y`   | `visit_importfrom`                                  | `node.modname` = module, `node.names` = names |
| Class definition           | `visit_classdef`                                    | `node.name`, `node.bases`, `node.body`        |
| Function definition        | `visit_functiondef`                                 | `node.name`, `node.args`, `node.body`         |
| Assignment `x = ...`       | `visit_assign`                                      | `node.targets`, `node.value`                  |
| String literal             | `visit_const` + check `isinstance(node.value, str)` |                                               |
| Decorator `@foo`           | `visit_decorators`                                  | Or check `node.decorators` on function/class  |
| `raise` statement          | `visit_raise`                                       | `node.exc` = exception expression             |
| `with` statement           | `visit_with`                                        | `node.items` = context manager list           |
| `try`/`except`             | `visit_tryexcept`                                   | `node.handlers` = list of except clauses      |

### astroid type inference

astroid can infer types, which is more powerful than plain AST:

```python
def visit_call(self, node: nodes.Call) -> None:
    # Infer what the function resolves to
    try:
        for inferred in node.func.infer():
            if isinstance(inferred, nodes.FunctionDef):
                # We know the actual function being called
                if inferred.name == "dangerous_function":
                    self.add_message("no-dangerous-call", node=node)
    except astroid.InferenceError:
        pass  # Can't determine — skip
```

**Caution:** `infer()` can raise `InferenceError` and can return `Uninferable`. Always handle both.

## Testing Checkers

```python
"""Tests for no_direct_db_query checker."""

import astroid
import pylint.testutils

from my_checkers.no_direct_db_query import NoDirectDbQueryChecker


class TestNoDirectDbQueryChecker(pylint.testutils.UnittestLinter):
    CHECKER_CLASS = NoDirectDbQueryChecker

    def test_direct_query_flagged(self):
        node = astroid.extract_node("""
            User.objects.filter(active=True)  #@
        """)
        with self.assertAddsMessages(
            pylint.testutils.MessageTest(
                msg_id="no-direct-db-query",
                node=node,
                args=("User", "User", "objects"),
            ),
        ):
            self.checker.visit_call(node)

    def test_repository_call_allowed(self):
        node = astroid.extract_node("""
            UserRepository.active_users()  #@
        """)
        with self.assertNoMessages():
            self.checker.visit_call(node)
```

**Testing best practices:**

1. **Use `astroid.extract_node` with `#@` marker.** The marker indicates which node to extract from the code.
2. **Test with `assertAddsMessages` and `assertNoMessages`.** These are the canonical assertion methods.
3. **Test configuration options.** If your checker has options, test each combination.
4. **Test inference edge cases.** Code with dynamic attributes, metaclasses, or `__getattr__` may cause `InferenceError`.
5. **Run with `pytest` not `unittest`.** Pylint's test utils work with both, but pytest gives better output.

## Registration

### As a Pylint plugin

Add to `pyproject.toml`:

```toml
[tool.pylint.main]
load-plugins = ["my_checkers.no_direct_db_query"]
```

Or `.pylintrc`:

```ini
[MAIN]
load-plugins=my_checkers.no_direct_db_query
```

The module must be importable from `PYTHONPATH`. For a local checker, put it in the project and ensure the path is set.

### vigiles enforce() reference

```typescript
enforce(
  "pylint/no-direct-db-query",
  "Use repository pattern for all DB queries.",
);
```

vigiles checks `pylint --help-msg=no-direct-db-query` and verifies the message exists and is enabled.

## Edge Cases and Gotchas

### Symbolic names vs message codes

Pylint messages have both a code (`C0114`) and a symbolic name (`missing-module-docstring`). Both work in vigiles:

```typescript
enforce("pylint/C0114", "All modules need docstrings.");
enforce("pylint/missing-module-docstring", "All modules need docstrings.");
```

Prefer symbolic names — they're readable and stable across Pylint versions.

### astroid inference limitations

astroid can't infer:

- Dynamically constructed classes (`type("Foo", (Base,), {...})`)
- Heavy metaprogramming (`__init_subclass__`, custom metaclasses)
- C extensions (some methods on `numpy`, `pandas` are opaque)
- Runtime-only attributes (`setattr`, `__dict__` manipulation)

If your convention targets heavily dynamic code, expect false negatives. Add a comment explaining the limitation in the checker.

### Plugin vs Ruff

For simple pattern bans, Ruff's built-in rules or `flake8-*` plugins reimplemented in Ruff are 10-100x faster. Use a Pylint custom checker only when you need:

- Type inference (astroid's `infer()`)
- Cross-function or cross-module analysis
- Configuration options exposed in `pylintrc`
- Integration with Django/Flask/SQLAlchemy brain plugins

### Message ID collisions

Core Pylint uses codes `C0001`-`C8999`, `W0001`-`W8999`, etc. Custom checkers should use `9000+` to avoid collisions. Check with:

```bash
pylint --list-msgs | grep "C90\|W90\|E90"
```

### Performance

- Pylint is slow on large codebases. Custom checkers add overhead per-file.
- Avoid `infer()` in hot paths — each call can trigger recursive type resolution.
- Use `visit_module` + early return to skip files that can't contain violations (e.g., skip test files for production-only rules).
- Consider `--jobs=N` for parallel execution, but note that custom checkers must be pickle-safe for multiprocessing.

### Monorepo considerations

- Pylint resolves `pylintrc` / `pyproject.toml` from `cwd`, not from the file being linted. In a monorepo, run Pylint per-package.
- vigiles checks `pylint --help-msg=<name>` from the project `basePath`. If packages have different plugins loaded, run from each package root.
- Custom checkers must be on `PYTHONPATH`. In a monorepo, use relative `load-plugins` paths or install checkers as a development package.

## Mapping PR Feedback to Checker Strategy

| PR comment pattern                    | Best approach                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| "Don't import X directly"             | `pylint/no-name-in-module` or custom checker with `visit_importfrom`                           |
| "Don't call X()"                      | `pylint/bad-functions` config or custom checker with `visit_call`                              |
| "Missing docstring"                   | `pylint/missing-function-docstring` (C0116) — already exists                                   |
| "Function too long"                   | `pylint/too-many-statements` (R0915) — configure threshold                                     |
| "Too many arguments"                  | `pylint/too-many-arguments` (R0913) — configure `max-args`                                     |
| "Use logging instead of print"        | Ruff `T201` or custom checker banning `print()`                                                |
| "Don't use global state"              | Custom checker detecting `global` keyword or module-level mutation                             |
| "Always type-hint public methods"     | `pylint/missing-function-docstring` doesn't cover this — use `mypy --strict` or custom checker |
| "Don't catch bare Exception"          | `pylint/broad-exception-caught` (W0718) — already exists                                       |
| "Don't use mutable default arguments" | `pylint/dangerous-default-value` (W0102) — already exists                                      |
