# Spec API design — strict-typed builders, `doc()` vs `section()`, presets

> Status: best-practice synthesis (2026-06-19). Three external sweeps — typed builders
> (Zod/Drizzle/Kysely/Effect/XState) · tagged-templates + preset composition
> (styled/gql/sql + tsconfig/ESLint/Vite) · Result typing (neverthrow/Effect/fp-ts) —
> applied to vigiles's `src/core/spec.ts`. Concrete recommendations: the `doc()`/`section()`
> split, the `preset()`/`extends()` merge model, and the strict-typing upgrades. Companion to
> `lightweight-spec-authoring.md` (the `doc()` motivation), `shareable-presets.md` (the preset
> bet), `typed-contracts-for-agents.md` (the Result contract).

## Where `spec.ts` stands today

- `instructions\`...\`` tagged template (`string | Ref`) **exists**; `sections`is a`Record`.
- `result(ok, err)` is **stringly-typed** (`OutputFieldType = "string"|"number"|"boolean"|"string[]"`)
  — the contract is declared but the parsed `Result` isn't _statically_ typed from it.
- `delegate(agent: string)` isn't type-checked against sibling agent names.
- **Good already, keep:** branded `VerifiedPath/Cmd/Ref`, `NoInfer` on `file()/symbol()`,
  template-literal `LinterRule` types, the phantom type-state pipeline
  (`RawSpec → … → ReadyToEmit`), and **object-literal builders** (no deep fluent chains —
  which the research flags as a tsc-perf + error-message hazard).

## 1. `doc()` vs `section()` — use BOTH, split by content type

Tagged templates win exactly when content is **"a string with typed holes"** (SQL/GraphQL/CSS)
— which _is_ a CLAUDE.md section (free-form prose with `file()`/`cmd()` holes). Structured
objects win for **named/optional fields you want to exhaustively check** (the rules map, the
`result()` contract). So:

- **Ship `doc\`...\``** — promote `instructions` from per-section to whole-document. Interpolations
  are real typed TS expressions (`file()`/`cmd()`), so they autocomplete with **zero editor
  plugin**. You **cannot** type-check the literal prose (tsc sees `TemplateStringsArray` as
  opaque `string[]`) — fine, it's prose, not a language to validate.
- **Keep the structured builder** (`claude({ rules, commands, … })`, `result()`) for the typed
  parts. Don't force prose into the 4-bucket maps (the `lightweight-spec-authoring.md` finding).
- Borrow Drizzle's `sql<number>\`...\`` **angle-bracket return-type annotation** if a section
  needs to declare an expected shape — compile-time only, no runtime cost.

## 2. `preset()` / `extends()` — copy tsconfig's STRATIFIED merge (not deep-merge)

The cleanest, most predictable model is tsconfig's, and it **corrects** the "deep-merge" sketch
in `shareable-presets.md`:

- **Stratified by field type, documented once:** scalars **override** · the named `rules` object
  **property-merges** (child key wins; `off()` removes) · arrays (`target`, …) **replace**. No
  "smart" deep merge — Vite's deep-merge runs plugins twice (no dedup) and ESLint's
  `files`-intersection-vs-override divergence are the cautionary footguns.
- **Type it:** `extends<const Base>(base, overrides)` where `overrides` may only touch keys the
  preset declares → overriding a renamed/absent key is a **compile error** (catches preset
  drift). Anchor override keys to `Base` with `NoInfer` so they don't widen.
- **Verification re-runs at the consumer** (the `shareable-presets.md` differentiator) — every
  `enforce()`/`file()` re-checked against _this_ repo on compile.

## 3. Strict-typing upgrades (the high-value changes)

1. **Make `result()` produce a real typed `Result`** (today it's stringly-typed). Map the
   contract to TS types — `{ files: "string[]" }` → `{ files: string[] }` via a mapped type
   `FieldType → TSType` — so `assertAgentOk` returns a **typed** value, not `unknown`. And model
   the **error track as a TAGGED discriminated union** (`err` carries a `_tag`/`kind`), not a
   bare `{ reason: string }`: tagged errors give exhaustiveness (`switch(_tag)` + `assertNever`),
   targeted recovery, unambiguous testing (`expect(err._tag).toBe(...)`), and **clean JSON
   round-trip** — exactly the `parseAgentResult` case (a thrown `Error` subclass doesn't
   round-trip; a tagged plain object does).
2. **Type-check `delegate()` targets** against the agent registry — a `keyof`-dependent arg +
   `<const>` capture (the Drizzle/Kysely/XState-target pattern), so `delegate("planr")` is a
   compile error, not a runtime "unknown agent."
3. **`satisfies` at the `claude({...})` boundary** — excess-property checks + full autocomplete
   without widening the result type.
4. Keep branded refs, `NoInfer`, and the phantom type-state pipeline.

## 4. Ergonomics discipline (the anti-patterns to avoid)

- **No deep fluent chains.** Each `.x().y().z()` is another generic instantiation → slow `tsc` +
  unreadable hover types (Zod/ArkType pay this). vigiles already uses object-literal + tagged
  templates — keep it; do not "fluent-ify" the builders.
- **Surface errors EARLY**, at the builder call, not only at `compile()`/emit (XState v5's
  `setup()` lesson — errors at `setup()`, not 200 lines later).
- **Don't ship a clever type-level string DSL.** ArkType's `"string >= 8"` is concise but costs
  onboarding ("PR comments after introducing it"). vigiles's template-literal `LinterRule` types
  are mild and fine — don't push further into parsing a DSL string at the type level.
- **Measure `tsc` perf on a realistic spec.** A generated per-file **symbol union** in the
  `.d.ts` can blow up instantiation (the noted `generate-types` risk) — bound it (only referenced
  files; lazy) and add a `.scope()`-style boundary if needed.
- **Pair any `never`/type-state block with a readable error type** (`Brand.error<"reason">`),
  or the violation points at `never` instead of the human intent.

## The borrow-list (ranked by value)

| Technique                                        | From                  | Apply to                                   | Value    |
| ------------------------------------------------ | --------------------- | ------------------------------------------ | -------- |
| mapped `FieldType→TSType` + **tagged err union** | Effect/neverthrow     | `result()` → typed, assertable, exhaustive | **High** |
| `<const>` param + `keyof` registry               | Drizzle/Kysely/XState | `delegate()` target-checked                | **High** |
| tsconfig **stratified merge**                    | TypeScript            | `extends()`/presets                        | **High** |
| `doc\`...\`` tagged template                     | styled/gql/sql        | prose units                                | **High** |
| `satisfies` at the config boundary               | Zod/Effect            | `claude({...})`                            | Med      |
| `Brand.error<"reason">`                          | Effect                | readable type-state errors                 | Med      |
| `NoInfer` · branded refs · phantom type-state    | (shipped)             | keep                                       | —        |

## See also

- `lightweight-spec-authoring.md` — the `doc()` primitive + the "spec is too heavy" diagnosis.
- `shareable-presets.md` — the preset bet (this corrects its merge model to stratified).
- `typed-contracts-for-agents.md` — the `result()`/railway contract this types properly.
- `harness-state-space.md` — "make illegal states unrepresentable," the principle behind the
  discriminated-union + branded-type recommendations.
