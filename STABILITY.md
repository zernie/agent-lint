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
    `agent`, `file`, `cmd`, `ref`, `dir`, `glob`, `result`,
    `delegate`, `railway`). Skill authoring is **not** on this list — see
    `experimental_skill` below.
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

## Experimental — no stability promise

These are kept and worked on, but a launch user never needs them and they may
change or be removed **without** a major bump.

Three markers say this today, and which one you meet depends on where the symbol
lives: `@internal` in the TSDoc (hidden from the published API docs),
`@experimental` in the TSDoc (visible, and enforced to match the name by
`npm run experimental:check`), and the `experimental_` name prefix. They overlap
and there is no rule yet for choosing between them — treat any of the three as
the same promise, which is none.

- **`experimental_skill()`** in `vigiles/spec` / `vigiles/claude-code` — skill
  authoring. Compiles, and its gates are verified, but no real skill corpus has
  been converted and a compiled `SKILL.md` has never been exercised as an
  installed skill. See `docs/skills.md` §Status.
  ⚠️ Its helper vocabulary — `input()` and `step()` — is used **only** by skill
  specs but is exported unmarked and unprefixed, so nothing in the name warns
  you. Treat both as carrying `experimental_skill`'s promise, not this list's
  stable one.
- Typed-composition combinators in `vigiles/spec` — `pipe` / `pipeStep` /
  `needs` / `start` / `andThen` and their helper types (`Supplies`, `Handoff`,
  `KnownAgentName`). Tagged `@internal`, though on `pipe` the tag sits on the
  first overload only, so later overloads still read `@public (undocumented)` in
  the API report.
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
