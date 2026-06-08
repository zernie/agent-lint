# Symbol verification — design & requirements

> Status: design lock (2026-06-08). Extends the cross-referencing engine from
> file/cmd to **symbols** (constants, functions, methods, classes, modules),
> cross-language. This is the deepening of "verify the map" that the benchmarks
> (`benchmarks-runtime-gates.md`) pointed to: non-gameable, agent-independent,
> catches a failure an agent cannot self-check (a reference the doc claims that
> no longer exists).

## Decision (as built)

The early "approach A" markers (`` `src/config.ts#parseConfig` ``) and a later
sidecar of resolved pins were both dropped after working through reliability:
**any stored artifact — an in-text marker or a sidecar pin — is a third thing
that can drift** from the two real sources of truth (the instruction file's
references and the code's symbols). The shipped design stores nothing.

- **Live join, project-wide index.** `audit` builds a project symbol index from
  the live code and re-extracts the code-shaped inline references from the
  _current_ markdown, resolving each on the spot. A renamed/removed symbol
  surfaces immediately; nothing to keep in sync. (`src/refs.ts`, `src/symbols.ts`.)
- **No file required (the Rails win).** A bare `` `parseConfig` `` /
  `` `User#full_name` `` resolves against the index — the author does not name
  the file. Ambiguity (a name defined in several files) is _reported_, and the
  author disambiguates with a scoped form (`` `User#full_name` ``) — an in-text
  signal that travels with the reference, used only where it is genuinely needed.
- **Engine.** `@ast-grep/napi` + bundled `@ast-grep/lang-*` grammars. Symbol
  extraction is a generic tree-sitter traversal: definitions put their identifier
  in a `name` field, so collecting `name`-field nodes (plus assignment `left`
  for bare constants) yields the defined names — one code path across languages.
- **Boundary: existence, NOT resolution.** We check "a definition with this name
  (in this scope) exists"; we do not prove a bare reference _resolves_ through
  imports / Zeitwerk / tsconfig. Resolution is per-language, needs the project
  built, and is architectural analysis vigiles delegates (LSP / Sourcegraph
  SCIP) — deferred.
- **Inferred ⇒ warning.** A bare backtick is an _inferred_ reference (the author
  did not declare "verify this"), so an unresolved one is a warning (exit 1),
  not a hard error — unlike a declared `vigiles:file` / `vigiles:cmd` ref. The
  `refs-hook` PostToolUse hook runs the same check at write time as pure
  feedback (catches typos with context); it writes nothing.

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

Auto-verified **inline code spans** (no helper/annotation/marker needed — the
plain backtick the agent already writes is the whole input):

| Span shape                                | Resolved against                                |
| ----------------------------------------- | ----------------------------------------------- |
| `` `parseConfig` `` / `` `MAX_RETRIES` `` | the project symbol index (bare, no file)        |
| `` `User#full_name` `` (`#` / `::`)       | the index, narrowed to the enclosing scope      |
| `` `path/with.ext` ``                     | file exists (existing `file` engine)            |
| `` `npm run x` `` and script-runner forms | command / script exists (existing `cmd` engine) |

- **Not checked:** bare lowercase prose words (`` `true` ``, `` `name` ``,
  `` `high` ``). Only _code-shaped_ spans (snake_case / camelCase / SCREAMING /
  PascalCase / scoped) are resolved — never a guess about which prose tokens are
  references (the `scan` false-positive trap).
- **Escape hatch:** `<!-- vigiles:ignore -->` to silence a false positive or a
  metaprogrammed symbol.
- **Severity:** an unresolved code-shaped reference is a **warning** (inferred,
  not declared). The same check runs at write time via the `refs-hook` so typos
  surface with context; it writes nothing.

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
- **R3 — No file required, no stored state.** Bare references resolve against a
  live project index (Rails/Zeitwerk-friendly); the check is a live join of the
  current markdown and current code, so nothing drifts. No per-language
  resolvers or autoloaders; ambiguity is reported, not guessed.
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

## Build status

1. ✅ **Per-file ast-grep extractor + project index** — `src/symbols.ts`
   (`definedSymbols`, `SymbolIndex`, `resolveSymbol`).
2. ✅ **Live ref verification + write-time hook** — `src/refs.ts` (`verifyRefs`),
   wired into `audit` (warning tier) and the `refs` / `refs-hook` commands.
   No sidecar, no markers.
3. ⬜ Optional `.rbi` / `.d.ts` indexing to absorb typed dynamic symbols.
4. ⬜ Optional `symbol()` spec builder (compile-verified, hard guarantee) for
   teams that want spec-mode enforcement.

## See also

- `research/skill-authoring-pains.md` — the drift pain this addresses.
- `research/benchmarks-runtime-gates.md` — why "verify the map" (this) beats
  "police the route" (runtime gates).
