# Symbol verification — design & requirements

> Status: design lock (2026-06-08). Extends the cross-referencing engine from
> file/cmd to **symbols** (constants, functions, methods, classes, modules),
> cross-language. This is the deepening of "verify the map" that the benchmarks
> (`benchmarks-runtime-gates.md`) pointed to: non-gameable, agent-independent,
> catches a failure an agent cannot self-check (a reference the doc claims that
> no longer exists).

## Decision

- **Approach A — file-qualified existence.** A reference names the file and the
  symbol: `symbol("src/config.ts", "parseConfig")` in a spec, or the inline span
  `` `src/config.ts#parseConfig` `` in markdown. The author names the file; we
  verify the file defines the symbol. No per-language resolver, no autoloader
  chasing. (A project-wide index for bare `` `User#full_name` `` — variant B —
  is a possible later superset built on the same extractor; not now.)
- **Engine.** `@ast-grep/napi` + bundled `@ast-grep/lang-*` grammars. Symbol
  existence is a generic tree-sitter traversal: definitions put their identifier
  in a `name` field, so collecting `name`-field nodes (plus assignment `left`
  for bare constants) yields the defined names — one code path across languages.
- **Boundary: existence, NOT resolution.** We check "this file defines this
  name (in this scope)"; we do not prove a bare reference _resolves_ to a
  specific definition through imports / Zeitwerk / tsconfig. Resolution is
  per-language, needs the project built, and is architectural analysis vigiles
  delegates (LSP / Sourcegraph SCIP) — deferred.

## Language coverage

| Ecosystem (our linter) | Language            | Grammar                                             |
| ---------------------- | ------------------- | --------------------------------------------------- |
| ESLint                 | JS / TS / JSX / TSX | `@ast-grep/napi` core                               |
| Stylelint              | CSS                 | core                                                |
| Ruff / Pylint          | Python              | `@ast-grep/lang-python`                             |
| Clippy                 | Rust                | `@ast-grep/lang-rust`                               |
| RuboCop                | Ruby                | `@ast-grep/lang-ruby`                               |
| Cedar                  | Cedar               | none — policy language, own schema resolution (N/A) |

Bundled (per the "bundle everything" choice). Bonus grammars available for
later: Go, Java, C/C++, C#, Bash, YAML, JSON. A language with no bundled grammar
degrades gracefully (skip + note), never crashes.

## Authoring & enforcement — how the AI ends up using it

**Principle: do not force a behavior change. Auto-verify the inline references
the agent already writes**, restricted to unambiguous shapes. Meet the agent
where it writes — this dissolves the probabilistic-compliance problem instead of
fighting it with a gate (gates get gamed — see `benchmarks-runtime-gates.md`).

Auto-verified **inline code spans** (no helper/annotation needed):

| Span shape                                | Verified as                                     |
| ----------------------------------------- | ----------------------------------------------- |
| `` `path/with.ext` ``                     | file exists                                     |
| `` `path.ext#Symbol` `` (`#` / `::`)      | file exists AND defines `Symbol` (variant A)    |
| `` `npm run x` `` and script-runner forms | command / script exists (existing `cmd` engine) |

- **Not auto-verified:** bare ambiguous single-word spans (`` `true` ``,
  `` `null` ``, `` `O(n)` ``, a lone `` `parseConfig` `` with no file). Firing on
  these is the `scan` false-positive trap — we never guess which prose tokens are
  references.
- **Escape hatches:** an explicit `symbol()` / marker for edge cases;
  `<!-- vigiles:ignore -->` (or an inline opt-out) to silence a false positive or
  a metaprogrammed symbol.
- **Optional strict rule** `require-verified-refs` (off by default): flags
  reference-shaped spans that don't resolve, and surfaces the **ignore-ratio** so
  blanket-`ignore` gaming is visible to a reviewer / CI threshold. Honest about
  Goodhart; not sold as a guarantee of author honesty.

## Metaprogramming & dynamic definitions

Static AST misses runtime-defined symbols (Ruby `define_method`, Python
`setattr`, TS declaration merging) and re-exports (`export { x } from "./y"`).

- **Policy:** report a miss as an **error by default, with a comment opt-out**
  (`vigiles:ignore`). Never hard-fail the whole run on parse trouble.
- **Cheap type absorption:** index the declaration/type files already in the repo
  — Sorbet `*.rbi`, TS `*.d.ts` — with the same ast-grep pass, so typed dynamic
  symbols resolve without running any extra tool. Sorbet is **optional** (not used
  everywhere); we index its RBIs when present, never require them.
- **Heavy tier (deferred):** full resolution + complete dynamic coverage via
  `scip-ruby` (Sorbet-based) or language servers — optional, not now.

## Requirements

- **R1 (hard) — Code-block cross-compatibility.** Only **inline code spans** are
  parsed for references. **Fenced code blocks are never touched** and pass
  through untouched, so `rustdoc` doctests, `typescript-docs-verifier`, mdBook,
  and similar code-block tools keep working. (`doc-refs.ts` validating DSL calls
  inside ` ```ts ` blocks stays separate and opt-in.)
- **R2 — Cross-language.** Support the languages we already cover (JS/TS, CSS,
  Python, Rust, Ruby) via bundled grammars; graceful skip+note for the rest.
- **R3 — Author names the file (variant A).** `path#symbol`; no reliance on
  per-language resolvers or autoloaders.
- **R4 — No guessing.** Only explicitly written, reference-shaped spans are
  verified — never infer which prose tokens are references (no `scan`-style
  false positives). Preserves "verify the declared, reliably."
- **R5 — Graceful on dynamic code.** Metaprogrammed / re-exported symbols →
  error with `vigiles:ignore` opt-out; optional `.rbi` / `.d.ts` indexing; never
  crash on a parse failure.
- **R6 — Zero-config default.** Bundled grammars → TS/Python/Ruby/Rust symbol
  refs verify with no setup. Sorbet / SCIP / LSP are optional tiers, never
  required.
- **R7 — Performance.** Per-file extraction is cheap. If a project-wide index
  (variant B) is added later, cache it by file mtime.

## Build order

1. **Per-file ast-grep extractor** (`defined symbols in a file`) — this is
   variant A working, and the kernel of everything.
2. `symbol()` spec builder + inline `` `path#symbol` `` span verification, wired
   into `audit` next to file/cmd.
3. Optional `.rbi` / `.d.ts` indexing; optional `require-verified-refs` strict
   rule with ignore-ratio.
4. (Later, maybe) project-wide index for bare `` `Class#method` `` (variant B).

## See also

- `research/skill-authoring-pains.md` — the drift pain this addresses.
- `research/benchmarks-runtime-gates.md` — why "verify the map" (this) beats
  "police the route" (runtime gates).
