# Stability

> vigiles is **0.x**. This page states exactly what you can depend on today and
> what may still move, so you can adopt the stable parts now without getting
> surprised by a change to the parts that are still evolving.

Honest beats a fake 1.0: pre-1.0 semver keeps the deeper, still-moving surfaces
free to improve while the parts most people actually use stay put.

## What's stable — depend on it

- **The CLI** — the verbs (`init`, `compile`, `lint`, `test`, `eval`,
  `scan`, `generate`), their flags, and their **exit codes**
  (`0` clean / `1` warn / `2` error). This is the narrowest, stablest contract
  and what ~90% of users touch — including the GitHub Action, which wraps it.
- **The authoring + testing library entry points:**
  - `vigiles/spec` — the core builders (`enforce`, `guidance`, `claude`,
    `skill`, `agent`, `file`, `cmd`, `ref`, `dir`, `glob`, `result`,
    `delegate`, `railway`).
  - `vigiles/testing`, `vigiles/unit` — the harness-test + check vocabulary.
  - `vigiles/claude-code`, `vigiles/codex` — the per-harness surfaces.
  - `vigiles/adapter` — the adapter-authoring kit.
- **Compiled output contracts** — the `vigiles:sha256` integrity header and the
  emitted markdown/settings shapes a hook or spec compiles to.

A breaking change to any of the above is signalled with a Conventional-Commit
`!` and reflected in the version.

## What's still evolving — pin if you rely on it

- **The library API is 0.x.** Symbols outside the entry points above (and the
  internal modules under `dist/core/…` reached by deep import) may change in a
  minor release. Import from the published subpaths, not deep paths.
- **`vigiles/hook`** (compiled hooks) is exported and usable but **not yet
  frozen** — it carries a known delivery caveat
  ([#34692](https://github.com/anthropics/claude-code/issues/34692)).

## Experimental — marked `@internal`, no stability promise

These are kept and worked on, but a launch user never needs them and they may
change or be removed **without** a major bump. They're tagged `@internal` in the
source (excluded from the published API docs) so a later change burns nobody:

- Typed-composition combinators in `vigiles/spec` — `pipe` / `pipeStep` /
  `needs` / `start` / `andThen` and their helper types (`Supplies`, `Handoff`,
  `KnownAgentName`).
- `effect()` / effect-region (parked).
- The whole-harness codegen (`generate harness`) and capability lattice.
- Internal-only research/spike modules (`guards`, `hook-spec`, `evolve`) — not
  exported from any entry point.

## How the surface is enforced

The public surface is tracked by **API Extractor**: a committed report per
entry point under [`etc/*.api.md`](etc/), checked in CI (`npm run api:check`),
so an export can't silently appear or change. See
[`docs/cli.md`](docs/cli.md) for the verbs and
[`docs/README.md`](docs/README.md) for the full doc index.
