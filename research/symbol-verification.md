---
status: shipped
topic: spec
---

# Symbol verification — design & requirements

> Status: design lock (2026-06-08). Extends the cross-referencing engine from
> file/cmd to **symbols** (constants, functions, methods, classes, modules),
> cross-language. This is the deepening of "verify the map" that the benchmarks
> (`benchmarks-runtime-gates.md`) pointed to: non-gameable, agent-independent,
> catches a failure an agent cannot self-check (a reference the doc claims that
> no longer exists).

## Decision (as built) — variant A, harness-enforced

A bare reference cannot be verified without resolving it, and resolving it needs
either a project-wide index (which then has its own drift/ambiguity problems) or
per-language autoloaders we don't do. So the author **names the file** inline,
and the harness **forces** them to:

- **The mark is an explicit, self-contained inline directive.** A code reference
  is written `` `vigiles:symbol src/config.ts#parseConfig` `` (literal
  `vigiles:symbol` prefix, then `path.ext`, then `#`/`::`, then the symbol).
  vigiles parses **that one named file** and checks it defines the symbol — no
  project index, no cross-file resolution, no ambiguity (the file disambiguates).
  The literal prefix means zero detection heuristic, and the mark is
  self-contained, so it binds even with several references on one line — unlike a
  detached `<!-- comment -->`, which is ambiguous in a long line.
  (`src/refs.ts`, `src/symbols.ts`.)
- **The hook makes the agent mark.** `refs-hook` (PostToolUse on
  SKILL/CLAUDE/AGENTS.md) blocks (exit 2) any code-shaped inline span that is
  **not** a `vigiles:symbol` mark, telling the agent to write
  `` `vigiles:symbol path.ext#name` `` or opt out with `<!-- vigiles:ignore -->`.
  The agent supplies the file (it knows its own code); vigiles verifies the
  claim. This is the harness enforcing the verifiable form at write time, with
  full context — not a project index guessing.
- **Declared ⇒ error.** Because the mark is deliberately authored (like
  `vigiles:file` / `vigiles:cmd`), a broken file-qualified ref is an **error**
  (exit 2) in `lint`, not a warning. No false positives: only the unambiguous
  `path.ext#symbol` shape is verified.
- **Engine.** `@ast-grep/napi` + bundled `@ast-grep/lang-*` grammars. Symbol
  extraction is a generic tree-sitter traversal: definitions put their identifier
  in a `name` field, so collecting `name`-field nodes (plus assignment `left`
  for bare constants) yields the defined names — one code path across languages.
- **Boundary: existence, NOT resolution.** We check "the named file defines this
  symbol"; we do not chase imports / Zeitwerk / tsconfig (that is per-language,
  needs the project built, and is architectural analysis vigiles delegates —
  LSP / Sourcegraph SCIP, deferred).

### Why not the alternatives (recorded so we don't re-litigate)

- **Bare-symbol project index** (resolve `` `parseConfig` `` across the repo):
  reintroduces ambiguity (name collisions) and the cost/heuristics of a
  whole-repo index; rejected in favour of the author naming the file.
- **Sidecar of resolved pins**: a snapshot that drifts from the markdown (line
  shifts, out-of-band edits) — a new failure mode. The mark lives in the text and
  travels with the reference instead.
- **In-text marker = warning**: an explicitly authored mark is a declaration, so
  a broken one is an error, same as file/cmd.

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

**Principle: the harness forces the verifiable form at write time, then verifies
it.** The agent does not need to learn a new habit on its own — the `refs-hook`
blocks an edit until every code reference is either file-qualified or marked as
prose. The agent supplies the file (it is writing about code it knows); vigiles
proves the claim against that file.

| Span the agent writes                               | Outcome                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| `` `vigiles:symbol src/config.ts#parseConfig` ``    | parse `src/config.ts`, check it defines `parseConfig` (✓ / error) |
| `` `vigiles:symbol app/user.rb#full_name` `` (`::`) | parse `app/user.rb`, check `full_name` (cross-language)           |
| bare `` `parseConfig` `` (code-shaped)              | **hook blocks** → "mark as `vigiles:symbol path#name` or ignore"  |
| `` `name` `` / `` `high` `` (prose)                 | ignored — not code-shaped                                         |
| `` `npm run x` `` / `` `src/x.ts` ``                | command / file engines (unchanged)                                |

- **Not flagged:** bare lowercase prose words. Only _code-shaped_ spans
  (snake_case / camelCase / SCREAMING / PascalCase / scoped) are required to be
  marked — never a guess about prose.
- **Escape hatch:** `<!-- vigiles:ignore -->` on the line (or
  `<!-- vigiles:ignore-file -->`) opts a span/file out.
- **Severity:** a broken file-qualified ref is an **error** (exit 2) in `lint` —
  it is a declaration, like `vigiles:file` / `vigiles:cmd`. The hook enforces the
  mark and verifies it at write time (exit 2 blocks), with context.

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
- **R3 — Author names the file; no stored state, no index.** A reference is an
  explicit `` `vigiles:symbol path.ext#name` `` mark; vigiles parses that one file
  each time. No project-wide index, no autoloaders, no sidecar — nothing to drift.
- **R4 — Harness-enforced, no guessing.** The `refs-hook` forces code-shaped
  spans to be file-qualified or `vigiles:ignore`d; verification only runs on the
  unambiguous `path.ext#symbol` shape (no `scan`-style false positives).
- **R5 — Graceful on dynamic code.** Metaprogrammed / re-exported symbols →
  error with `vigiles:ignore` opt-out; optional `.rbi` / `.d.ts` indexing; never
  crash on a parse failure.
- **R6 — Zero-config default.** Bundled grammars → TS/Python/Ruby/Rust symbol
  refs verify with no setup. Sorbet / SCIP / LSP are optional tiers, never
  required.
- **R7 — Performance.** Per-file extraction is cheap. If a project-wide index
  (variant B) is added later, cache it by file mtime.

## Build status

1. ✅ **Per-file ast-grep extractor** — `src/symbols.ts` (`definedSymbols`,
   `definedSymbolsInFile`, `fileDefinesSymbol`). No project index.
2. ✅ **File-qualified verification + enforcement hook** — `src/refs.ts`
   (`verifySymbolRefs`, `unmarkedCodeRefs`), wired into `lint` (error tier) and
   the `refs` / `refs-hook` commands. `refs-hook` blocks unmarked code refs.
3. ✅ Co-located `.rbi` / `.d.ts` fallback in `fileDefinesSymbol` — absorbs
   typed dynamic / ambient symbols without running Sorbet or the TS compiler.
   (Sorbet `sorbet/rbi/`-dir resolution remains a deferred heavy tier.)
4. ✅ `symbol("file", "name")` spec builder — compile-verified, renders to the
   same `` `file#symbol` `` form markdown mode verifies (`src/spec.ts`,
   `src/compile.ts`).

## See also

- `research/skill-authoring-pains.md` — the drift pain this addresses.
- `research/benchmarks-runtime-gates.md` — why "verify the map" (this) beats
  "police the route" (runtime gates).
- `research/reference-verification-limits.md` — the limits of this approach
  (prose is undecidable; the active mark is gameable; what to delegate vs own).
