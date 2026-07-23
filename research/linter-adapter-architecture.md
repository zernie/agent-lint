---
status: active
topic: architecture
---

# LinterAdapter — make a linter a cohesive, type-enforced unit (P0)

**Status:** stages 0–3 SHIPPED on PR #116 (2026-07-23); the dispatch-map collapse
(Stage 4) remains. The design of record for retiring the scattered-registry
structure behind vigiles's linter cross-referencing engine.
Roadmap entry: `research/roadmap.md` → Now. Prompted by the PR #114 review:
adding the JVM/Go linters (#109) produced a steady stream of the same bug class
(3 detekt review P2s, 5 stale doc references, uneven tests) because **a "linter"
is not a cohesive unit** — it is smeared across parallel registries with nothing
enforcing completeness. This is the exact problem the `HarnessAdapter` port +
`rule-meta.ts` registry already solved elsewhere in the repo; apply the same
pattern to linters.

## The problem: scattered-parallel-registries

To add one linter today you must independently edit **~7 code sites across 3
files + 2 docs + a test file**, with nothing linking them — miss any one and it
fails **silently** (no compile error, no test):

| #   | Site                                                                                    | Needed for                                                     |
| --- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | `src/core/spec.ts` `BuiltinLinter` union                                                | the `enforce("X/…")` ref type                                  |
| 2   | `src/core/linters.ts` `CLI_RULE_CHECKS`                                                 | existence check (CLI linters)                                  |
| 3   | `src/core/linters.ts` `LINTER_CONFIG_CHECKERS`                                          | enabled-state (else silently `"unknown"`)                      |
| 4   | `src/core/linters.ts` `CLI_TOOL_FOR_LINTER`                                             | PATH check (CLI linters)                                       |
| 5   | `src/core/linters.ts` `getCliRuleSet` if/else chain **or** `checkLinterRule` `??`-chain | typo suggestions / bespoke resolvers (cedar, vigiles-internal) |
| 6   | `src/core/generate-types.ts` `discoverXRules` fn **+** the `discoverers[]` array        | `.d.ts` `XRule` union                                          |
| 7   | `docs/linter-support.md` + `docs/spec-format.md` + `linters.test.ts`                    | parity                                                         |

Key smells (all source-verified):

- The three runtime maps are `Record<string, fn>` keyed by a **bare string**, not
  `BuiltinLinter`. There is **no object** that bundles a linter's capabilities; a
  linter's identity is the _coincidence_ of the same string key appearing in N
  maps, plus optional bespoke branches in a `??`-chain.
- Per-linter capability **variance is implicit** in which map has an entry:
  cedar is in none of the three maps (bespoke `tryCedarPolicy`, always-enabled);
  ktlint/checkstyle are absent from `getCliRuleSet` by omission; "ktlint has no
  catalog CLI" lives only as a prose comment.
- `rule-catalog.ts` has a **third** hardcoded linter union
  (`AvailableRule.linter: "eslint" | "pylint"`), unrelated to `BuiltinLinter`.
- **Nothing enforces completeness.** No `Record<BuiltinLinter, …>` exhaustiveness
  (so a `BuiltinLinter` member with empty maps compiles and returns `"unknown"`
  at runtime), and no registry-loop conformance test (unlike
  `adapter-contract.test.ts`, which loops `ADAPTERS` and even fails when an
  adapter dir isn't registered).

**Proof the discipline already failed:** after #109 shipped the 4 new linters,
`docs/spec-format.md` still listed `BuiltinLinter` as only the original 7, and 4
other docs carried a stale "7 catalogs." A change touched 6 of 7 places — the
definition of whack-a-mole.

## The fix: mirror `HarnessAdapter` / `rule-meta.ts`

Bundle every scattered capability into one object, register it in one place, and
make incompleteness a **compile error + a conformance-test failure** — exactly
the two mechanisms the repo already trusts for harnesses and rules.

```ts
// src/core/linter-adapter.ts (new; harness-agnostic domain)
interface LinterCapabilities {
  existenceCheck: "node-api" | "cli" | "filesystem" | "format-only";
  configCheck: boolean; // has a real enabled-state read
  catalogEnumeration: boolean; // can list rules (eslint/pylint); ktlint/checkstyle = false
  alwaysEnabled: boolean; // cedar = true (a found policy is "enabled")
  generateTypes: boolean; // emits an XRule .d.ts union
}

interface LinterAdapter {
  name: BuiltinLinter;
  capabilities: LinterCapabilities; // models the variance explicitly
  cliTool?: string; // was CLI_TOOL_FOR_LINTER
  checkExists(rule: string, basePath: string): void | boolean; // was CLI_RULE_CHECKS / resolvers / tryCedarPolicy
  configEnabled?(rule: string, basePath: string): ConfigEnabledStatus; // was LINTER_CONFIG_CHECKERS
  enumerateRules?(basePath: string): Set<string>; // was getCliRuleSet chain (typo suggestions)
  discoverEnabled?(basePath: string): DiscoveredRules | null; // was discoverXRules + discoverers[]
}
```

Then:

1. **Registry = the exhaustiveness gate.**
   `const LINTERS: Record<BuiltinLinter, LinterAdapter>` — a missing linter is a
   **tsc error** (the `rule-meta.ts` pattern). Derive `BuiltinLinter` FROM the
   registry keys so `spec.ts` can never drift from the runtime again.
2. **Conformance loop = the parity gate.**
   `linter-contract.test.ts` doing `for (const l of Object.values(LINTERS))`:
   assert `capabilities.configCheck ⇒ configEnabled` present,
   `catalogEnumeration ⇒ enumerateRules`, `generateTypes ⇒ discoverEnabled`, and
   a **docs-parity set-match** (every linter is in `docs/linter-support.md` +
   `BuiltinLinter` prose) — the single mechanism that would have caught the
   `spec-format.md` drift. Mirrors `adapter-contract.test.ts` + the `rule-meta`
   coverage test.
3. **Collapse the `??`-chain.** `checkLinterRule`'s bespoke
   `tryCedarPolicy`/`tryVigilesInternal`/`tryScopedPlugin` branches become
   `capabilities.existenceCheck` variants dispatched from the registry.
4. **Authoring surface (the harness half).** A `docs/authoring-a-linter.md`
   guide + an `assertLinterConformance` kit (siblings of
   `docs/authoring-an-adapter.md` + `assertAdapterConformance`), and optionally
   an `add-a-linter` contributor skill under `.claude/skills/`. Adding a linter
   becomes "write one object; the compiler + one test tell you what's missing."

**Migration is mostly gathering, not redesign:** the pure parsers already exist
as `@internal`-exported functions (`parseDetektConfig`, `ktlintEnabledStatus`,
`checkstyleEnabledStatus`, the `golangci*` helpers) and slot straight into
`LinterAdapter` methods. The risk is the `checkLinterRule` `??`-chain rewire; do
it behind the existing `linters.test.ts` per-linter suites (which stay green as
a golden).

## Why P0

It is the structural fix for a class that has already produced ~10 bugs across
two review rounds and will recur on every future linter. It also unlocks
`rule-catalog.ts`'s third linter union folding into the same registry. Cost is
bounded (gathering + one test + one dispatch rewrite), and it converts a
whole mole species into a compile error — the anti-whack-a-mole the founder
asked for. Best delivered as its own PR off `main` (not stacked on the large
#114), so the refactor diff is reviewable in isolation.

## Shipped so far (stages 0–3, PR #116)

The port and its gates are built — a linter is now one type-enforced unit:

- **Stage 0** — `src/core/linter-adapter.ts`, the type-only leaf port
  (`LinterAdapter`, `LinterCapabilities`, `ConfigEnabledStatus`,
  `DiscoveredRules`), imports only the `BuiltinLinter` type (no cycle).
- **Stage 1** — `BUILTIN_LINTERS` single-source array in `spec.ts` →
  `BuiltinLinter`; the `LINTERS: Record<BuiltinLinter, LinterAdapter>` registry
  in `linters.ts` built via `cliAdapter` / `nodeApiAdapter` helpers + a cedar
  literal. A missing linter is now a **tsc error**.
- **Stage 2** — `src/core/linter-contract.test.ts`, the conformance loop:
  key === `name`, each capability flag ⇔ its method's presence,
  `existenceCheck === "cli"` ⇔ `cliTool`, and a set-match against
  `BUILTIN_LINTERS` **and** `docs/linter-support.md` **and** the site chip list
  (`Wedge.tsx`) — the drift that shipped "only 7 catalogs" would fail here.
- **Stage 3** — `generate-types.ts` iterates the registry
  (`Object.values(LINTERS).map(a => a.discoverEnabled?.(…))`) instead of a
  parallel `discoverers[]` list.
- **CI parity** — the `test` job installs detekt/ktlint/checkstyle/golangci-lint
  (pinned, cached, Temurin 21) + a `command -v` sanity gate, so their
  previously-`skipIf`-gated tests RUN (no silent skips).
- **Authoring surface** — `.claude/skills/add-a-linter/SKILL.md` (contributor
  skill): "write one object; tsc + the conformance test tell you what's missing."
  (A separate `docs/authoring-a-linter.md` + `assertLinterConformance` kit is not
  needed while linters are a closed builtin set — no third-party extension path,
  unlike harness adapters.)

**Down-payments that landed earlier on #114**, same spirit — one shared parser
replacing many copies: the **markdown-it fence oracle** (`src/core/markdown.ts`,
retiring 5 regex fence toggles) and the **js-yaml detekt-config parser**
(`parseDetektConfig`, retiring 3 regex parsers).

## Remaining: Stage 4 — collapse the dispatch maps

The one structural piece left. The adapter methods currently DELEGATE to the four
legacy maps rather than replace them: `checkExists` calls `CLI_RULE_CHECKS` /
`LINTER_RESOLVERS`, `configEnabled` is `LINTER_CONFIG_CHECKERS[name]`, the PATH
tool is still `CLI_TOOL_FOR_LINTER`, and `checkLinterRule`'s `??`-chain
(`tryNodeResolver` / `tryCliCheck` / `tryCedarPolicy` / …) still reads the maps
directly. So `LINTERS` is the single source for the TYPE, discovery, and
conformance, but not yet for runtime DISPATCH. Stage 4 inlines each map's bodies
into the adapter methods and routes the `??`-chain through
`capabilities.existenceCheck`, deleting the four maps so the registry is the
literal single dispatch source. ~200 lines of core-moat surgery behind the
existing `linters.test.ts` golden suites — best as its own PR off `main`.
