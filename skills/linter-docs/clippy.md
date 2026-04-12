# Clippy — Reference

Shared linter reference for vigiles skills. Used by `strengthen` (find existing rules) and `pr-to-lint-rule` (write custom lints).

## Check Existing Lints First

Before writing a custom lint, search these lint groups — the pattern may already be covered:

| Lint group    | Scope                                               | Key lints to know                                                                                                                                            |
| ------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `correctness` | Code that is outright wrong or will panic           | `uninit_assumed_init`, `wrong_self_convention`, `nonsensical_open_options`, `mistyped_literal_suffixes`, `transmuting_null`, `undropped_manually_drops`      |
| `suspicious`  | Code that is very likely a bug                      | `suspicious_else_formatting`, `suspicious_unary_op_formatting`, `suspicious_op_assign_impl`, `blanket_clippy_restriction_lints`, `almost_complete_range`     |
| `style`       | Idiomatic Rust style violations                     | `needless_return`, `redundant_closure`, `match_bool`, `single_match`, `collapsible_if`, `len_zero`, `manual_map`, `if_let_mutex`                             |
| `complexity`  | Code that can be simplified                         | `unnecessary_cast`, `needless_borrow`, `redundant_clone`, `type_complexity`, `manual_strip`, `option_map_unit_fn`, `useless_conversion`                      |
| `perf`        | Code that can be made faster                        | `large_enum_variant`, `box_collection`, `redundant_allocation`, `manual_memcpy`, `iter_nth`, `unnecessary_to_owned`, `needless_collect`                      |
| `pedantic`    | Stricter lints, off by default                      | `unwrap_used`, `expect_used`, `cast_possible_truncation`, `cast_sign_loss`, `missing_errors_doc`, `missing_panics_doc`, `doc_markdown`, `must_use_candidate` |
| `restriction` | Lints for specific project policies, off by default | `print_stdout`, `print_stderr`, `dbg_macro`, `unimplemented`, `todo`, `unwrap_used`, `expect_used`, `mem_forget`, `shadow_reuse`, `float_arithmetic`         |
| `nursery`     | Experimental lints, may have false positives        | `missing_const_for_fn`, `cognitive_complexity`, `use_self`, `option_if_let_else`, `redundant_pub_crate`, `significant_drop_tightening`                       |
| `cargo`       | Cargo manifest issues                               | `multiple_crate_versions`, `wildcard_dependencies`, `negative_feature_names`, `redundant_feature_names`                                                      |

**Tip:** Run `cargo clippy --warn clippy::pedantic` on your codebase to see what pedantic catches before manually hunting for rules. The full lint list is at <https://rust-lang.github.io/rust-clippy/stable/>.

## Lint Configuration

### Cargo.toml `[lints.clippy]` section (recommended)

The modern way to configure Clippy project-wide. Checked into version control, applies to every `cargo clippy` invocation:

```toml
# Cargo.toml
[lints.clippy]
# Enable entire groups
pedantic = "warn"
nursery = "warn"

# Override individual lints
unwrap_used = "deny"
expect_used = "warn"
cast_possible_truncation = "allow"

# Restriction lints — opt-in individually
print_stdout = "warn"
dbg_macro = "deny"
```

This replaces the older `#![warn(clippy::pedantic)]` crate-level attribute approach. vigiles reads `Cargo.toml` for `enforce()` verification.

### Inline attributes

Use `#[allow]`, `#[warn]`, and `#[deny]` for per-item overrides:

```rust
// Suppress a lint on a single function
#[allow(clippy::too_many_arguments)]
fn create_widget(a: u32, b: u32, c: u32, d: u32, e: u32, f: u32, g: u32) { /* ... */ }

// Escalate a lint to a hard error for a module
#[deny(clippy::unwrap_used)]
mod payment_processing {
    // Any .unwrap() in this module fails compilation
}

// Warn on a lint for a specific impl block
#[warn(clippy::cast_possible_truncation)]
impl Converter {
    fn to_u32(&self, val: u64) -> u32 { val as u32 }
}
```

Attribute precedence (highest to lowest): `#[forbid]` > `#[deny]` > `#[warn]` > `#[allow]`. `#[forbid]` cannot be overridden by inner attributes — use it for security-critical lints.

### `clippy.toml` / `.clippy.toml`

Project-level configuration for lint thresholds and behavior:

```toml
# clippy.toml
too-many-arguments-threshold = 10
type-complexity-threshold = 500
cognitive-complexity-threshold = 30
single-char-binding-names-threshold = 4
msrv = "1.70.0"

# Disallow certain types
disallowed-types = [
    { path = "std::collections::HashMap", reason = "Use indexmap::IndexMap for deterministic iteration" },
]

# Disallow certain methods
disallowed-methods = [
    { path = "std::env::var", reason = "Use config::get() for environment access" },
]

# Disallow certain macros
disallowed-macros = [
    { path = "std::println", reason = "Use tracing::info! instead" },
]
```

`disallowed-types`, `disallowed-methods`, and `disallowed-macros` are particularly powerful — they let you ban specific APIs project-wide with custom error messages, no custom lint needed.

## Custom Lints

### dylint — custom Clippy-style lints

[dylint](https://github.com/trailofbits/dylint) loads lint libraries as dynamic libraries, giving you the same compiler internals that Clippy uses:

```rust
// my_lint/src/lib.rs
use clippy_utils::diagnostics::span_lint_and_help;
use rustc_lint::{LateContext, LateLintPass, LintArray, LintPass};
use rustc_session::{declare_lint, declare_lint_pass};

declare_lint! {
    /// Disallow direct database calls outside the `db` module.
    pub NO_DIRECT_DB_CALL,
    Warn,
    "direct database calls should go through the db module"
}

declare_lint_pass!(NoDirectDbCall => [NO_DIRECT_DB_CALL]);

impl<'tcx> LateLintPass<'tcx> for NoDirectDbCall {
    fn check_expr(&mut self, cx: &LateContext<'tcx>, expr: &'tcx rustc_hir::Expr<'_>) {
        if is_direct_db_call(cx, expr) {
            span_lint_and_help(
                cx,
                NO_DIRECT_DB_CALL,
                expr.span,
                "direct database calls are not allowed here",
                None,
                "use the repository pattern — import from `crate::db` instead",
            );
        }
    }
}
```

**When to use dylint vs existing Clippy lints:**

| Situation                                 | Use                                         |
| ----------------------------------------- | ------------------------------------------- |
| Ban a specific function/type/macro        | `clippy.toml` `disallowed-*` — zero code    |
| Enforce naming or style convention        | Existing Clippy pedantic/style lints        |
| Detect a pattern needing type information | dylint — access to rustc type checker       |
| Enforce architectural boundaries          | dylint or `cargo-deny` for dependency rules |
| One-off "don't use X" in a single crate   | `#[deny(clippy::...)]` attribute            |

**dylint tradeoffs:**

- Tied to a specific Rust nightly version (compiler internals are unstable)
- Requires maintaining a separate crate with `rustc_private` dependencies
- `clippy_utils` provides helper functions but its API changes between releases
- Build times increase since the lint library compiles against `rustc` internals

For vigiles, reference dylint lints via: `enforce("clippy/no_direct_db_call", "Use the repository pattern.")` — the lint name maps to the `declare_lint!` identifier (snake_case).

## Edge Cases and Gotchas

### False positives from macros

Clippy lints operate on the expanded AST. Macros can trigger false positives because the expanded code looks different from what the author wrote:

```rust
// This macro expansion may trigger `clippy::redundant_clone`
// even though the clone is structurally necessary in the macro output
my_derive_macro! {
    struct Foo { bar: String }
}
```

Workarounds:

- `#[allow(clippy::...)]` on the macro invocation site
- Add `#[automatically_derived]` in proc-macro output — Clippy skips many lints for derived code
- File an issue upstream if the false positive is in a common macro pattern

### Nightly-only lints

Some Clippy lints require nightly Rust because they depend on unstable compiler features. The `nursery` group is the most common source. If you enable `nursery` lints in CI:

- Pin a specific nightly version: `rust-toolchain.toml` with `channel = "nightly-2025-01-15"`
- Expect breakage on nightly updates — nursery lints can be renamed, removed, or change behavior
- Never `#[deny]` nursery lints — use `#[warn]` so they don't block builds when behavior changes

### `allow` vs `warn` on groups

Enabling a group and then allowing individual lints works top-down:

```toml
# Cargo.toml
[lints.clippy]
pedantic = "warn"           # Enable all pedantic lints
module_name_repetitions = "allow"   # But suppress this one
```

The reverse does NOT work — you cannot `allow` a group and then `warn` an individual lint from it. The group-level `allow` takes precedence. Always enable groups first, then suppress specific lints.

### Interaction with `#[must_use]`

Clippy's `must_use_candidate` lint (pedantic) suggests adding `#[must_use]` to functions that return values. This interacts with other lints:

- Once `#[must_use]` is added, callers who ignore the return value get `unused_must_use` (a rustc warning, not Clippy)
- `let _ = foo()` silences `unused_must_use` but triggers `let_underscore_must_use` (Clippy restriction)
- `drop(foo())` silences both but may trigger `drop_non_drop` if the type doesn't implement `Drop`

Recommendation: Enable `must_use_candidate` globally, but only `#[deny(unused_must_use)]` in modules where ignoring results is dangerous (I/O, error handling).

### Unsafe code linting

Clippy provides several lints for `unsafe` code, but they have limitations:

- `undocumented_unsafe_blocks` (restriction) — requires a `// SAFETY:` comment above every `unsafe` block. Enable this project-wide.
- `unsafe_derive_deserialize` (pedantic) — warns when `Deserialize` is derived on types with unsafe invariants
- `multiple_unsafe_ops_per_block` (restriction) — each `unsafe` block should contain exactly one unsafe operation for precise `// SAFETY:` documentation

These lints do NOT verify that safety invariants are actually upheld — they only enforce documentation conventions. Use `cargo miri test` and `#[cfg(miri)]` for runtime verification of unsafe code.

### MSRV-aware lints

Clippy respects the `msrv` field in `clippy.toml`. Some lints suggest replacements that require newer Rust versions. If you set `msrv = "1.65.0"`, Clippy won't suggest `let-else` (stabilized in 1.65) but will suppress suggestions for features from 1.66+. Always set this to match your `rust-version` in `Cargo.toml`.

## Mapping PR Feedback to Lint Strategy

| PR comment pattern                          | Best approach                                                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| "Don't use `.unwrap()`"                     | `enforce("clippy/unwrap_used", "Use expect() with context or propagate with ?.")` — pedantic, enable project-wide |
| "Don't call this function"                  | `clippy.toml` `disallowed-methods` — zero custom code, includes custom error message                              |
| "Don't use this type"                       | `clippy.toml` `disallowed-types` — same approach, works for `HashMap`, `Mutex`, etc.                              |
| "Don't use `println!`"                      | `enforce("clippy/print_stdout", "Use tracing macros.")` — restriction lint, opt-in                                |
| "Add error context"                         | Not Clippy — use `#[deny(clippy::unwrap_used)]` + guidance for `anyhow`/`thiserror` patterns                      |
| "This clone is unnecessary"                 | `enforce("clippy/redundant_clone", "Remove the unnecessary clone.")` — already in complexity group                |
| "Use `Self` in impl blocks"                 | `enforce("clippy/use_self", "Use Self instead of repeating the type name.")` — nursery lint                       |
| "Document safety invariants"                | `enforce("clippy/undocumented_unsafe_blocks", "Add a // SAFETY: comment.")` — restriction lint                    |
| "Too many function parameters"              | `enforce("clippy/too_many_arguments", "Refactor into a config struct.")` — already in complexity group            |
| "Wildcard deps in Cargo.toml"               | `enforce("clippy/wildcard_dependencies", "Pin dependency versions.")` — cargo group                               |
| "Every public fn needs error docs"          | `enforce("clippy/missing_errors_doc", "Document the errors this function can return.")` — pedantic                |
| "Avoid `as` casts"                          | `enforce("clippy/cast_possible_truncation", "Use try_from() or explicit checked conversion.")` — pedantic         |
| "Don't leave `todo!()` in code"             | `enforce("clippy/todo", "Replace todo!() with an implementation or file an issue.")` — restriction lint           |
| "Use the builder pattern"                   | Not Clippy — use vigiles `guidance()` for architectural patterns                                                  |
| "Enforce import boundaries between modules" | Not Clippy — use `cargo-deny` for crate-level boundaries or dylint for module-level enforcement                   |
