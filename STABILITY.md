# Stability

> vigiles is at **v12** — but read that as _"still moving fast,"_ not
> _"battle-hardened."_ `semantic-release` cuts a **new major on every breaking
> API change**, and there have been a lot of them. The number is an artifact of
> how it ships, not a claim of maturity. This page says what I try hardest not
> to break, and what's still in motion.

The steadiest contract is the **CLI** — the commands you run, their flags, and
their exit codes. Most of the churn is in the library API underneath it.

## What's stable — depend on it

- **The CLI** — the verbs (`init`, `compile`, `lint`, `test`, `eval`,
  `scan`, `generate`), their flags, and their **exit codes**
  (`0` clean / `1` warn / `2` error). This is the narrowest, steadiest contract
  and the surface almost everyone touches — including the GitHub Action, which wraps it.
- **The authoring + testing library entry points:**
  - `vigiles/linting` — the compiler + reference verification
    (`compileClaude`, `compileSkill`, …).
  - `vigiles/spec` — the core builders (`enforce`, `guidance`, `claude`,
    `skill`, `agent`, `file`, `cmd`, `ref`, `dir`, `glob`, `result`,
    `delegate`, `railway`).
  - `vigiles` (the package root) — the free harness-test + check vocabulary.
  - `vigiles/eval` — the model-calling measurement API; every runtime export
    carries a `paid_` prefix (`paid_runEval`, `paid_measure`, `paid_measureArms`,
    `paid_measureTriggerRate`, `paid_judge`, `paid_judged`,
    `paid_claudeEvalDriver`). Types are not prefixed.
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
- **`vigiles/experimental`** — a quarantined subpath for draft surfaces, signalled
  by the `experimental_` name prefix on runtime exports. Currently the R3
  disposable-service tier (real side-effect testing: `experimental_startServices`,
  `ServiceSpec`, `ContainerRuntime`, …). Import it only if you accept it may change
  or vanish without a major bump.

## How the surface is enforced

The public surface is tracked by **API Extractor**: a committed report per
entry point under [`api-surface/*.api.md`](api-surface/), checked in CI (`npm run api:check`),
so an export can't silently appear or change. See
[`docs/cli.md`](docs/cli.md) for the verbs and
[`docs/README.md`](docs/README.md) for the full doc index.
