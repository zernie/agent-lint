---
name: add-a-linter
description: Add a new linter to vigiles's cross-referencing engine as one cohesive, type-enforced unit — a LinterAdapter in the LINTERS registry, with the conformance test enforcing docs + site parity so no site is forgotten
disable-model-invocation: true
argument-hint: <linter name, e.g. "biome" or "checkov">
---

Add a linter to vigiles's cross-referencing engine (the `enforce("eslint/...")`
moat). This is a **contributor** task, not a third-party extension point: the
`LINTERS` registry is a `Record<BuiltinLinter, LinterAdapter>` — a **closed
set** baked into core — so a linter is added by editing vigiles itself, and the
type system + the conformance test make the parity **un-forgettable**.

The whole reason this skill exists: a linter used to be smeared across ~7
scattered sites (existence check, config checker, CLI-tool map, suggestion
enumerator, generate-types discoverer, docs, site) with **nothing** enforcing
that you touched all of them — miss one and it failed silently. Now `tsc` fails
if the registry entry is missing, and `src/core/linter-contract.test.ts` fails
if the docs table or the marketing site drifts. **Follow the steps; let the
gates catch what you forget.** See `research/linter-adapter-architecture.md`.

## The one invariant

A linter is **one `LinterAdapter`** in **one registry**. Everything else —
existence, config-enabled, suggestions, type-gen, docs, site — is a field or a
method on that adapter, cross-checked by the conformance test. You never again
hunt for "the other place this linter is registered."

## Steps

Work in this order — each step's gate tells you the next is needed.

1. **Name it (the single source).** Add the lowercase name to `BUILTIN_LINTERS`
   in `src/core/spec.ts`. `BuiltinLinter` derives from this array, so the moment
   you save, `tsc` fails on `LINTERS` in `linters.ts` with "property `<name>` is
   missing" — that error **is** your to-do list.

2. **Pick the existence-check kind** (`LinterCapabilities.existenceCheck` in
   `src/core/linter-adapter.ts`) — this decides which helper builds the adapter:
   - `node-api` — the rule set is resolved from an installed npm package
     (eslint, stylelint). Use
     `nodeApiAdapter(name, resolver, configEnabled, discover)`.
   - `cli` — a real command asks the tool whether a rule exists (ruff, clippy,
     pylint, rubocop, detekt, ktlint, checkstyle, golangci-lint). Use
     `cliAdapter(name, cliTool, checkExists, configEnabled, discover, enumerate?)`.
   - `filesystem` — presence in a project file counts, no tool (cedar). Write a
     literal adapter (see cedar in `linters.ts`).
   - `format-only` — only the reference **shape** is validated, no tool exists
     to list rules (ktlint's catalog is unlistable). Still a `cli` adapter, just
     omit the `enumerate` arg; the existence check is the qualified-shape rule.

3. **Implement the discoverer** `discover<Name>Rules(basePath): DiscoveredRules
| null` in `linters.ts` — reads the project's real linter config and returns
   its enabled rules for `generate-types` (fail **open**: return `null`, never
   flag every rule, when you can't enumerate). If it's a `cli` linter, also write
   its `<name>CheckExists` existence probe (throws when the rule is unknown) and,
   for a real config-enabled read, its `<name>ConfigEnabled` checker — plain
   named functions the adapter references directly in the `LINTERS` registry
   (there is no separate map to touch). Parse structured config with a **real
   parser** (js-yaml / @iarna/toml / the shared markdown-it helper), never a
   hand-rolled regex — see the `parse-structured-input-with-a-real-parser` rule;
   detekt's `parseDetektConfig` (js-yaml) is the model.

4. **Register it** in `LINTERS` (`linters.ts`) via the matching helper. `tsc`
   goes green here — the registry is now complete.

5. **Document it** — `docs/linter-support.md`: add a **row** to the
   `## Supported Linters` table AND a `## <Linter>` section (config conventions,
   rule-prefix, any capability caveat like "format-only" or "whitelist-only").
   The conformance test set-matches the table against the registry, so a missing
   row fails CI.

6. **The site updates itself** — the vigiles.sh chip strip (`Wedge.tsx`) DERIVES
   from `BUILTIN_LINTERS`, so a new linter appears automatically; there's no array
   to edit. Optionally add a display label to `LINTER_LABELS` in `Wedge.tsx` if it
   needs special casing (e.g. `ESLint`, `RuboCop`); with no entry it renders under
   its lowercase name. The conformance test guards that the derivation stays in
   place (a revert to a hand-typed list fails CI).

7. **If it's a `cli` linter, make CI actually run it — no silent skips.** The
   real-binary tests are `describe.skipIf(!hasBinary("<tool>"))` in
   `src/core/linters.test.ts`; a binary absent from CI means those tests skip
   silently (a hidden gap — the `no-silent-skips` rule). Install the tool in the
   `test` job of `.github/workflows/ci.yml` (pin a version via a job `env`, cache
   it) AND add it to the `command -v` sanity loop so a missing binary **fails the
   build** instead of skipping. Then write the two complementary tests: a
   real-binary test (`describe.skipIf(!hasBinary)`) and a missing-binary
   honest-error test (`it.skipIf(hasBinary)`) — one always runs, the pair is
   loud either way.

8. **Add the parity test data.** The conformance loop in
   `src/core/linter-contract.test.ts` is generic (it iterates the registry), so
   it covers the new linter automatically — but add a targeted
   config-parse/discover unit test in `linters.test.ts` for the new linter's own
   parser, and a per-linter capability assertion if it has an unusual variance
   (e.g. `format-only`, `alwaysEnabled`).

## The gates that make this safe

Run `npm test` (or at least `npx vitest run src/core/linter-contract.test.ts
src/core/linters.test.ts` + `tsc --noEmit`). You are done only when:

- **`tsc`** is clean — the registry entry exists (completeness).
- **`linter-contract.test.ts`** is green — key === `name`, every capability flag
  matches its method's presence, `existenceCheck === "cli"` ⟺ `cliTool` present,
  and the registry keys set-match `BUILTIN_LINTERS` **and** `docs/linter-support.md`
  **and** the site chip list (docs + site parity).
- The new linter's config-parse unit test passes with **no binary**, and its
  real-binary test runs in CI (installed + sanity-gated), not skipped.
