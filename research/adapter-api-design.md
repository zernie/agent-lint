# Adapter/plugin API design — entry points, selection, boundary, conformance

> Survey of how widely-used TS/JS libraries structure a **harness-agnostic core +
> per-target adapters**, run to ground the vigiles pillar-2 API relayout. The
> trigger: the "agnostic" entries (`vigiles/testing`, `vigiles/unit`,
> `vigiles/integration`, `vigiles/e2e`) are today just `export *` from
> `src/adapters/claude-code/*`, and the agnostic runners physically live **inside**
> the Claude Code adapter — so "agnostic" is a name, not a fact. This doc is the
> evidence base for fixing that. Companion to
> [`code-adapter-architecture.md`](code-adapter-architecture.md) (the port design)
> and [`harness-landscape.md`](harness-landscape.md) (the Codex facts).

## Verdict: composition root owns the runners; select by import; enforce the barrel

Five findings converge, and none contradicts vigiles's existing "select by import,
CLI auto-detects" stance — they make it concrete and tell us where the current
layout is actively wrong:

1. **Single package with subpath exports is the right packaging** — vigiles's
   adapters are thin and share core's release cadence, so the **unplugin** model
   (one package, per-target entries) fits, not the **AI SDK / Testing Library**
   separate-package model (which you pick only for independent versioning, heavy
   optional deps, or a single-shared-core-instance guarantee). Keep `vigiles/codex`
   beside `vigiles/claude-code` in one package.
2. **The agnostic runner must NOT live in `src/adapters/claude-code/`.** Move
   `runHook`/`runHarnessTest`/`runEval` (the adapter-dispatching logic) to the
   composition root (`src/`); the CC driver/mock/sandbox stay in the adapter.
   `vigiles/testing` then re-exports the **neutral** modules, not a specific
   adapter. This is a **non-breaking** move (see #5).
3. **Select by import in the library, by string only in the CLI** — exactly
   **Drizzle**'s split (`drizzle-orm/node-postgres` import vs `drizzle-kit`'s
   `dialect: "postgresql"` string). The hard invariant: **the library import path
   must never resolve a string to a module** — keep the `ADAPTERS` registry /
   `detectAdapter` strictly CLI-side (no bundle to shake there), which is already
   where they live.
4. **Enforce the boundary mechanically AND dogfood it.** vigiles already has the
   `boundaries/dependencies` core⊄adapter rule; add a second rule so an **agnostic
   barrel may not import a specific adapter folder**, and (optionally) dogfood it
   via `enforce()` like the existing one.
5. **The default-adapter param has a tree-shaking cost.** `{ adapter =
claudeCodeAdapter }` is ergonomically right but a default param is **not**
   shaken out — a Codex-only consumer still bundles the CC adapter. The fix is the
   import-named entries (`vigiles/claude-code` vs `vigiles/codex`) + `"sideEffects":
false`, which is the design we already claim; don't lean on the default param
   for bundle-sensitive consumers.

The conformance kit (`assertAdapterConformance`) is already best-in-class — a
runnable kit is _rare_; most ecosystems leave conformance to prose + hand-kept
matrices. Keep it, parameterize it over the registry, and back it with
`satisfies` at each adapter's definition site.

---

## 1. Packaging: subpaths vs separate packages

Two camps, and the deciding axes are concrete — not taste.

- **Separate package per adapter** — Vercel AI SDK (`@ai-sdk/openai`,
  `@ai-sdk/anthropic`, … vs core `ai`); Testing Library (`@testing-library/dom`
  core vs `@testing-library/react`). Pick when an adapter needs **independent
  versioning/release cadence**, carries **heavy or optional deps**, or you need a
  **single shared core instance** across adapters. Costs: the AI SDK's versioned
  provider spec (`LanguageModelV2` in SDK 5 → `V3` in SDK 6) forces **coordinated
  major bumps** ecosystem-wide; an old provider on new core throws "unsupported
  model version." (Testing Library made `@testing-library/dom` a **peer dep** from
  RTL v16 specifically to guarantee one core instance — a problem that **doesn't
  exist** for a single package, where one install is automatic.)
  Sources: ai-sdk.dev/docs/foundations/providers-and-models;
  github.com/vercel/ai/issues/8249;
  github.com/testing-library/react-testing-library/issues/1103.
- **One package, per-target entries** — **unplugin** is the canonical precedent:
  one `createUnplugin(factory)` exposes `.vite`/`.rollup`/`.webpack`/`.esbuild`/…
  adapters _and_ standalone `createVitePlugin`/`createWebpackPlugin`/… from a
  single package; the core stays bundler-agnostic by extending the Rollup hook API
  as the common interface, with `meta.framework` injecting the target identity and
  per-bundler escape-hatch keys. This is vigiles's exact shape (common ports +
  injected adapter + capability descriptor). Source: unplugin.unjs.io/guide.

**For vigiles: stay single-package.** Adapters are thin, share core's cadence, and
want one-install + import-named selection. The `exports` map then gives **free
encapsulation**: any subpath not listed throws `ERR_PACKAGE_PATH_NOT_EXPORTED`, so
`src/core/*` internals stay private without a second package
(nodejs.org/api/packages.html).

### `exports` map rules (Node, falsifiable via `tsc`)

- Conditions match **most-specific → least-specific**; `"default"` must be **last**
  (anything after is unreachable).
- `"types"` must be listed **first** in each block, or TypeScript ignores it.
- Dual CJS/ESM: nest `types`+`default` under each of `require`/`import` with
  extension-matched declarations (`.d.cts`↔`.cjs`, `.d.mts`↔`.mjs`).
- Subpath patterns (`"./features/*.js"`) and explicit blocks (`"./internal/*":
null`) are supported — a default convenience export plus deliberately-blocked
  internals in one map.
  Sources: nodejs.org/api/packages.html; hirok.io/posts/package-json-exports.

## 2. Selection mechanism: import (library) vs string (CLI)

- **Drizzle is the near-exact blueprint:** library = explicit subpath import
  (`import { drizzle } from 'drizzle-orm/node-postgres'`, tree-shakeable, 0 deps);
  CLI (`drizzle-kit`) = config string (`dialect: "postgresql"`). The _why_: at
  runtime a bundler must see exactly one driver; a CLI Node process has **no bundle
  to shake**, so a string is fine. Sources: orm.drizzle.team/docs/get-started,
  /kit-docs/config-reference.
- **A config string is fundamentally un-tree-shakeable when it triggers a
  `require`.** Knex resolves `client: 'pg'` through a map of lazy `require`s;
  bundlers can't tell which string wins at runtime, so they bundle **every**
  dialect (bundle bloat + native `.node` build failures). The fix Knex itself
  documents is to pass the dialect **object via import**. Source:
  github.com/knex/knex/issues/6242.
- **String ≠ un-shakeable _iff_ it's a lookup key, not a resolver.** Passport's
  `passport.authenticate('google')` is a key into strategies you already
  `passport.use(new GoogleStrategy())`-registered — the objects are imported
  explicitly (shakeable); the string only _selects_ among them. So a registry is
  safe **only** when it indexes statically-imported objects, and that's acceptable
  for a CLI (which bundles all adapters anyway), fatal for a library path.
- **Config-as-code tools chose import for a _different_ reason — type-safety, not
  size.** ESLint flat config takes imported plugin **objects** not string names
  ("instead of specifying the name of a plugin, you import the plugin directly");
  Vite/Rollup import-and-call into the `plugins:` array. MUI passes the adapter as
  a **value into a prop** (`dateAdapter={AdapterDayjs}`, imported from its own
  subpath "for better tree-shaking"). Two motivations (size vs explicitness)
  converge on the same answer. Sources: eslint.org/docs/latest/use/configure/plugins;
  vite.dev/guide/using-plugins; mui.com/x/react-date-pickers/quickstart.
- **Don't expose the import as a deep internal path** — Knex's
  `require('knex/lib/dialects/...')` workaround is undocumented and fragile. Ship
  each adapter as a **first-class named subpath** (`vigiles/claude-code`,
  `vigiles/codex` already do this right). ESLint's `eslint/use-at-your-own-risk` is
  the model for gating an _unstable_ port behind a clearly-named separate entry.

**For vigiles:** the import-in-API / string-in-CLI split is well-precedented and
already the stated design. Action item: make sure the agnostic library entries
expose runners that take an **injected adapter object**, and keep `detectAdapter`/
`ADAPTERS` out of any library import path.

## 3. Boundary enforcement (keep core/agnostic ⊄ adapter)

- The hexagonal dependency rule ("domain depends on nothing; adapters depend on
  domain via ports; they meet only at the composition root") is exactly vigiles's
  `src/core` / `src/adapters/<h>` / `src/` layout — but it only holds if
  **enforced**; without a lint check, "core imports adapter" silently returns next
  PR. Sources: chanhle.dev/.../hexagonal; xebia.com/.../dependency-cruiser.
- **vigiles already dogfoods this:** `eslint.config.mjs` classifies `verify-core`
  / `cc-harness` / `codex-harness` via `boundaries/elements` and forbids
  `verify-core → *-harness` with `boundaries/dependencies` (error), and needs
  `settings["import/resolver"].typescript` so NodeNext `.js` specifiers resolving
  to `.ts` get classified. (Note: `boundaries/element-types`, `entry-point`,
  `external` are deprecated in favor of `boundaries/dependencies` — use the new
  rule.) Source: `/home/user/vigiles/eslint.config.mjs`; jsboundaries.dev/docs/rules/dependencies.
- **The new rule we need — "an agnostic barrel must not import a specific
  adapter":** a barrel `export * from "./adapters/claude-code/..."` is just an
  import edge, so classify the agnostic entries as their own element type (e.g.
  `agnostic-surface`: `src/testing.ts`, `unit.ts`, `integration.ts`, `e2e.ts`) and
  `disallow` it importing `{ type: ["cc-harness", "codex-harness", ...] }`. The
  whole point of the relayout is to make those barrels re-export the **neutral**
  composition-root modules instead, and this rule keeps it that way.
  - Equivalent in **dependency-cruiser** (regex, runs `depcruise --validate` in
    CI): `{ from: { path: "^src/(testing|unit|integration|e2e)\\.ts$" }, to: {
path: "^src/adapters/" }, severity: "error" }`. dependency-cruiser's capture
    groups (`$1`) are the canonical "no adapter imports another adapter" tool too.
  - Lighter built-ins exist (`import/no-restricted-paths` zones,
    `no-restricted-imports` patterns) but **don't resolve tsconfig aliases / NodeNext
    `.js`→`.ts` reliably** — vigiles needs the TS-resolver-aware plugins.
    Sources: jsboundaries.dev; github.com/sverweij/dependency-cruiser rules-tutorial;
    import-js/eslint-plugin-import no-restricted-paths (+ alias gap #1872).

## 4. Conformance kit: keep it, parameterize it, back it with `satisfies`

- **A runnable adapter conformance kit is genuinely rare.** AI SDK, OpenTelemetry,
  and Testing Library all ship **mocks/reference impls for _users_** (`ai/test`
  `MockLanguageModelV3`; OTel `InMemorySpanExporter`) and leave **adapter
  conformance to prose specs + hand-maintained matrices** (OTel's RFC2119 spec +
  `spec-compliance-matrix.md`) and per-adapter tests. vigiles's
  `assertAdapterConformance` + the executable `AdapterCapabilities` matrix are the
  _stronger_ form — the executable version of OTel's hand-kept checklist. This is a
  differentiator; lead with it. Sources: ai-sdk.dev/docs/ai-sdk-core/testing;
  OTel exporter.md + spec-compliance-matrix.md.
- **The academic backing is the xUnit "abstract test case" pattern (Meszaros,
  Rainsberger), and modern guidance prefers the _composition_ variant — a function
  that takes the implementation and runs the shared suite — over a base class
  consumers must extend.** That is exactly `assertAdapterConformance(adapter)`.
  Best-practice add: **parameterize one test over the `ADAPTERS` registry** so every
  shipped adapter (and a third party's) is auto-covered. Sources:
  blog.thecodewhisperer.com/.../abstract-test-cases-20-years-later; zalas.pl/contract-test.
- **Compile-time half: author each adapter with `satisfies HarnessAdapter`** at
  the definition site (TS 4.9+) — keeps literal types + excess-property checks. A
  registration helper typed `(a: HarnessAdapter) => …` will **not** reject excess/
  misshapen keys (there's no way to bake `satisfies` into a generic param —
  TS#58031/#51679), so `satisfies` at definition + the runtime kit as the
  behavioral backstop is the correct split (and what vigiles does). Sources:
  freecodecamp.org/.../typescript-satisfies-operator; microsoft/TypeScript#58031.
- **Isolate the kit's test-only deps behind a subpath.** AI SDK accidentally
  re-exported an MSW-backed `test-server` from `ai/test`, pulling `msw`+vitest into
  consumers (#8469). vigiles already exposes the kit from `vigiles/adapter`; keep
  any runner/mock deps optional/peer there.
- **Borrow the Pact `can-i-deploy` idea, not the Broker.** Treat the conformance
  run as a **release gate** (CI fails if an adapter doesn't pass) rather than just
  a unit test. Don't adopt consumer-driven contracts / a Broker — that's for when
  adapter authors drive requirements _back into_ the core; here the core owns the
  contract, so the code-driven abstract-test-case model is the right fit.

## 5. Semver: the relayout is non-breaking; the default param is the only trap

- **Moving an internal file is NOT breaking** when (a) it was never an `exports`
  subpath and (b) the mapped subpath still resolves to the same exported symbols
  and types. What's public is "the mapped entry + its exported symbols," not the
  file location — `exports` already hides `src/adapters/claude-code/*.ts` from deep
  import. So relocating runners to `src/` and repointing the `exports` target is
  **patch/minor**. Sources: nodejs.org/api/packages.html ("more reliable guarantees
  … when handling semver upgrades"); semver.org.
- **Caveat: don't _remove_ a previously-published subpath.** Adding/removing an
  `exports` subpath that consumers could reach is major. Re-pointing an existing
  subpath (`vigiles/harness-test` → moved file) is fine; deleting it is not.
  Source: github.com/npm/feedback/discussions/1068.
- **Prefer pointing `exports` straight at the moved file over a chain of barrel
  re-exports** — barrels load every re-exported module synchronously and can defeat
  tree-shaking. Source: webpack discussions #16863.
- **The default-adapter param is the one real tree-shaking trap:** a default
  parameter value is **not** eliminated even when every caller overrides it
  (open webpack/Parcel limitation), so `{ adapter = claudeCodeAdapter }` pulls the
  whole CC adapter — mock server, SSE renderer, sandbox — into a Codex-only build.
  Mitigations, in order of preference: (1) **import-named entries** (`vigiles/codex`
  brings only Codex) — vigiles's stated design; (2) `"sideEffects": false` so unused
  adapters shake out — but the `adapter-registry` barrel that imports _both_
  adapters is itself a side effect, so keep it off bundle-sensitive paths; (3) if a
  single agnostic entry must default, resolve lazily (`opts.adapter ?? (await
import("./adapters/claude-code")).claudeCodeAdapter`) rather than a baked default
  param. Sources: webpack#15671; parcel#7961; webpack.js.org/guides/tree-shaking.
- **If a subpath ever truly moves/retires:** `npm deprecate` can't target a
  subpath — deprecate **in code** (`@deprecated` JSDoc + `util.deprecate()` runtime
  warning) and ship a **codemod** (AI SDK v5 shipped named transforms like
  `v5/move-react-to-ai-sdk` for exactly this). Sources:
  docs.npmjs.com/cli/.../npm-deprecate; nodejs.org/api/deprecations.html;
  github.com/vercel/ai/.../codemod.

---

## Action plan for the relayout (sequenced)

1. **Extract the neutral runners to the composition root.** New `src/run-hook.ts`
   / `src/harness-test.ts` / `src/eval.ts` hold the adapter-dispatching logic
   (`{ adapter = claudeCodeAdapter }`, dispatch via `HarnessTestDriver`); pull
   `claudeCodeDriver`, `scriptModel`, the Anthropic mock, and the CC sandbox into
   `src/adapters/claude-code/` (where most already are). Resolve the default lazily
   or keep it import-selected to avoid trap #5.
2. **Repoint the agnostic entries.** `src/testing.ts` + `unit/integration/e2e.ts`
   re-export the **neutral** modules; `package.json` `exports` for
   `vigiles/harness-test`, `/run-hook`, `/eval`, `/unit`, `/integration`, `/e2e`
   keep resolving (point at the moved files — non-breaking per #5). The CC-only
   `vigiles/mock-model`, `scriptModel` stay CC.
3. **Add the boundary rule + dogfood it.** Classify an `agnostic-surface` element
   and `disallow` it importing any `*-harness`; optionally add
   `enforce("boundaries/dependencies")` coverage of the new rule. Confirm it would
   fail against today's `export *`-from-CC barrels (the regression test for the
   whole effort).
4. **Parameterize conformance over `ADAPTERS`** and ensure each adapter object is
   authored with `satisfies HarnessAdapter`. Keep the kit's deps behind
   `vigiles/adapter`.
5. **Keep `"sideEffects": false`** accurate (mark genuine side-effecting files) so
   a single-harness consumer shakes the rest out.

This is a patch/minor refactor (no public subpath removed), it deletes the
"agnostic in name only" smell, and it makes Codex pillar 2 reachable through the
documented agnostic surface — which is the precondition for the harness-testing
doc split (`docs/harness-testing.md` agnostic + per-harness CC/Codex docs).

## Sources

Primary sources gathered 2026-06-15 (official docs, source repos, RFCs, 2023–2026):
AI SDK (ai-sdk.dev; vercel/ai #8249, #8469, codemod README), unplugin
(unplugin.unjs.io), Testing Library (testing-library.com; RTL #1103), Node.js
`packages`/`deprecations` docs, semver.org, Drizzle (orm.drizzle.team), Knex
(#6242), ESLint flat config + `use-at-your-own-risk`, Vite/Rollup plugin docs, MUI
date adapters, Passport.js, Babel, Sequelize, eslint-plugin-boundaries
(jsboundaries.dev), dependency-cruiser (sverweij), eslint-plugin-import
no-restricted-paths (#1872), typescript-eslint no-restricted-imports, Nx
boundaries, OpenTelemetry exporter spec + compliance matrix + `InMemorySpanExporter`,
xUnit abstract-test-case (thecodewhisperer, zalas.pl), Pact (docs.pact.io),
TypeScript `satisfies` (#58031, #51679), webpack/Parcel tree-shaking (#15671,
#7961, #16863).
