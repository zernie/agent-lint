---
status: shipped
topic: spec
---

# Whole-harness codegen — one typed registry, `tsc` over the entire harness

> Status: research + prototype (2026-06-21). Founder's idea: auto-generate ONE
> codegen file that imports ALL of a repo's `*.spec.ts` into a typed registry, so
> `tsc` enforces constraints ACROSS every spec at once — turning the whole agent
> harness into a single type-checked program (think TanStack Router's
> `routeTree.gen.ts`, Prisma's client, tRPC's `AppRouter`). The practical trigger
> is a codegen / watch / build step, the natural extension of the existing
> `generate-types` (`.d.ts`) and `generate-schema` (JSON Schema) machinery — NOT a
> runtime import side effect.
>
> Companions: `typed-spec-moat.md` (the moat synthesis — this is "the harness as a
> compilable formal object" at REPO scale + the §2 capability-diff substrate),
> `typed-spec-power.md` (typed composition #1, the per-file basis this lifts to
> repo scale), `src/core/generate-types.ts` (the codegen to extend),
> `src/core/spec.ts` (`Supplies<>`, `TypedAgentSpec`, `result()` — the shipped
> typed surface this builds on), `src/core/compile.ts` `validateRailway` (today's
> COMPILE-time delegate resolution this lifts to EDIT-time).
>
> Prototype: `research/prototypes/whole-harness-codegen/` —
> `node research/prototypes/whole-harness-codegen/run.mjs` (exits 0; prints the
> captured cross-spec `tsc` errors + the N→time perf curve).

## TL;DR — the verdict in three lines

1. **It works, and it's a real moat lever.** A generated registry lets `tsc` catch
   three classes of cross-spec bug — **dangling delegate**, **duplicate name**,
   **cross-file handoff mismatch** — at edit time, with clean field-naming
   diagnostics, no vigiles run. Markdown structurally cannot; untyped orchestration
   frameworks (LangGraph/CrewAI) cannot (they wire untyped dicts resolved at
   runtime). This is the repo-scale generalization of the already-shipped per-file
   typed composition (`pipe`/`Supplies`).
2. **TypeScript scales — IF you pick the right encoding.** Measured: an **O(N)**
   per-edge encoding type-checks **1000 specs in ~2.0s** with **no TS2589**. The
   **O(N²)** "injective-name map" encoding **walls at TS2589 ≈ N=1000** (and is
   super-linear well before). The fix is the same lesson typed composition already
   learned: keep type-level checks shallow/per-edge; push any whole-set cardinality
   check (duplicate detection) into the **JS generator** (free, O(N), cleaner error).
3. **Viable far past any realistic harness.** Real harnesses are tens of specs; at
   N=50 the marginal cost over plain `tsc` is **~100ms**, at N=200 **~400ms**. The
   ceiling (TS2589) only appears at ~1000 specs and only in the bad encoding — which
   the design avoids entirely. **Buildable. Build it with the scalable encoding.**

## Ranked table — what the registry unlocks

Filter (from `typed-spec-power.md`): an item counts only if doing it AS a generated
typed program buys a guarantee markdown + a linter cannot, AND it survives the
TS-perf reality. `MOAT` = non-replicable product capability; `HELPER` = real rider;
build-class `TS-type` (a generated type) / `JS-gen` (a codegen-time check).

| #     | Unlock                                                                                                                                                           | Non-replicable?                                   | TS scales?                                                      | Build-class             | Verdict                                          | Tag                                   |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------- | ----------------------- | ------------------------------------------------ | ------------------------------------- |
| **1** | **Cross-file typed composition** — `delegate`/`pipe` reference typed agent OBJECTS across files; a cross-file handoff mismatch is a `tsc` error naming the field | **Yes (structural; LangGraph can't either)**      | **Yes — O(N) per edge**                                         | TS-type                 | **PURSUE — the headline**                        | **MOAT**                              |
| **2** | **Dangling `delegate` → `tsc` error** at edit time (today a COMPILE-time fs read in `validateRailway`)                                                           | Yes (edit-time, no run)                           | **Yes — O(N), 2.0s @ 1000, no TS2589**                          | TS-type                 | **PURSUE — cheapest, cleanest**                  | **MOAT**                              |
| **3** | **Duplicate skill/agent NAMES → error** across the whole harness                                                                                                 | Yes                                               | **Type form O(N²) WALLS @ ~1000; JS-gen form O(N) is free**     | **JS-gen** (not a type) | **PURSUE via the generator, NOT a type**         | **MOAT** (engine), encoding-corrected |
| **4** | **Whole-harness capability lattice** — union of every agent's effect/tool surface, the substrate for the §2 capability-diff at repo scale                        | Yes (the diff is the novel product)               | Union over N entries is O(N); the per-cell legs are fixed-arity | TS-type + JS-gen        | **PURSUE as the engine for the capability-diff** | **MOAT** (rides #1/#2)                |
| **5** | **Referential integrity broadly** — every `ref()`/delegate/handoff target resolves at the type level, repo-wide                                                  | Yes                                               | Yes if each ref is one shallow lookup                           | TS-type                 | Adopt — falls out of #1/#2                       | HELPER                                |
| 6     | A single queryable `registry` value ("every agent that can push", scan/codegen input)                                                                            | Mostly (scan already does this deterministically) | trivial                                                         | JS value                | Nice secondary — not a reason to choose codegen  | HELPER                                |

The two clear headline wins are **#1 cross-file handoff** and **#2 dangling
delegate**, both proven against `tsc` 5.9.3 below. **#3 is real but the encoding
matters** — it is the one item where the naive type form is exactly the TS2589 trap,
and the correct answer is a generator-side JS check. **#4** is the substrate the
capability-diff moat (`typed-spec-moat.md` §2) needs, and it composes from #1/#2.

---

## The make-or-break question: does TypeScript scale? — MEASURED

This is the crux. A registry that folds N specs into one record is exactly the shape
the typed-spec research repeatedly warns explodes (TS2589). So we measured, not
assumed: a generator emits N synthetic specs (each a realistic `agent()` with a
4-field `ok`/`err` and a `delegate` edge to the next), folds them into one
`registry`, and times `tsc --noEmit`. Two encodings of the cross-checks:

- **`scalable`** — only the **O(N) dangling-delegate type** (`NoDanglingDelegates`,
  one shallow lookup per entry) + duplicate names detected in the **JS generator**.
- **`naive`** — adds the **O(N²) injective-name MAPPED TYPE** for duplicate names
  (`_KeyForName<N>` walks the whole registry per entry).

### The measured N → `tsc --noEmit` curve (TS 5.9.3, Node 22.22, in-repo)

| N specs | scalable (ms) | TS2589? | naive (ms) |          TS2589?          |
| ------: | ------------: | :-----: | ---------: | :-----------------------: |
|       5 |          ~550 |   no    |       ~550 |            no             |
|      20 |          ~600 |   no    |       ~600 |            no             |
|      50 |          ~650 |   no    |       ~660 |            no             |
|     100 |          ~710 |   no    |       ~800 |            no             |
|     200 |          ~900 |   no    |      ~1050 |            no             |
|     500 |         ~1290 |   no    |      ~2300 |            no             |
|    1000 |     **~2000** | **no**  |  **~5950** | **YES — TS2589, errored** |

(~520ms is fixed `tsc` startup; subtract it for the marginal per-spec cost.)

### Reading the curve

- **The scalable encoding is linear and never walls.** ~550ms floor; marginal cost
  ~**1.5ms/spec**. At N=1000 it is ~2.0s and still clean. There is no TS2589 in the
  scalable encoding at any size tested.
- **The naive (O(N²)) encoding is super-linear and walls at TS2589 ≈ N=1000.** The
  exact failure: `harness.gen.ts(...): error TS2589: Type instantiation is
excessively deep and possibly infinite.` Isolation runs confirmed the WALL is the
  duplicate-name injective map specifically — the dangling check ALONE reaches N=1000
  in ~1.96s clean; adding the O(N²) name map is what blows up. An O(N) object-literal
  variant of the same idea reached **N=2000 in ~1.8s** clean.
- **The practical ceiling for the buildable design is well past any real harness.**
  A realistic harness is **tens** of specs. At N=50 the registry adds **~100ms** over
  plain `tsc`; at N=200, **~400ms**. You would need ~1000 specs to even approach the
  bad encoding's wall, and the shipped design never uses that encoding.

### The encoding rule (the transferable lesson)

> **Per-edge / per-entry checks → a shallow TS type (O(N), scales). Whole-set
> cardinality checks (uniqueness/duplicates) → the JS generator (O(N), free, cleaner
> error). Never encode a set-uniqueness check as an N×N mapped type — that is the
> TS2589 trap.**

This is the SAME lesson the shipped typed composition learned (fixed-arity per-link
`pipe`, not a recursive variadic; `Supplies<>` is one shallow mapped type per
handoff). The registry inherits it: dangling + handoff are per-edge (types);
duplicate-name is set-uniqueness (generator).

---

## Prototype evidence — the captured cross-spec `tsc` errors

`research/prototypes/whole-harness-codegen/` — `node run.mjs` exits 0 after asserting
the GOOD registry compiles clean AND each broken fixture is rejected by `tsc` alone,
each diagnostic naming the offending field. Captured verbatim:

**(1) Dangling delegate** — `fails/dangling/` (`orphan` delegates to `ghost`, which
has no spec):

```
fails/dangling/harness.gen.ts(18,7): error TS2322: Type 'NoDanglingDelegates<...>'
  is not assignable to type 'true'.
  Type '{ readonly __dangling_delegate: "ghost"; readonly from: "orphan"; }'
  is not assignable to type 'true'.
```

**(2) Cross-file handoff mismatch** — `fails/handoff/` (`producer.ok` emits
`diff: string`, the `producer→consumer` edge needs `diff: string[]`):

```
fails/handoff/harness.gen.ts(44,7): error TS2322: Type '{ readonly __handoff_error:
  { readonly __mismatch: "diff"; readonly expected: "string[]"; readonly got:
  "string"; }; }' is not assignable to type 'true'.
```

**(3) Duplicate name (type-level form)** — `fails/duplicate/` (`alpha.spec.ts` and
`beta.spec.ts` both declare `name: "reviewer"`):

```
fails/duplicate/harness.gen.ts(39,7): error TS2322: Type '_NamesUnique' is not
  assignable to type 'true'.
  Type '{ readonly __duplicate_name: "reviewer"; ... }' is not assignable to 'true'.
```

**(3') Duplicate name (the SHIPPABLE form)** — the same fixture run through the
generator with its JS guard on, the O(N) path that does NOT cost `tsc` anything:

```
[generate] DUPLICATE agent name "reviewer" — alpha.spec.ts and beta.spec.ts
(generator exits 2)
```

The GOOD registry (`specs/planner|implementer|reviewer.spec.ts` + a
`planner→implementer` handoff) compiles clean — `tsc --noEmit` exit 0, no errors.

### What the prototype is (and isn't)

- A real **generator** (`generate.mjs`) scans a dir of `*.spec.ts`, emits one
  `harness.gen.ts` importing each as a typed value into a `registry` record, and
  appends the type-level cross-checks. It is the faithful shape of the
  `generate-types`/`generate-schema` extension.
- A **`spec-shim.ts`** byte-faithful to the shipped `agent()`/`result()`/`Shape`/
  `Supplies<>` surface (the prototype must not depend on the repo build, so the types
  are copied, not imported — but they are the real ones, so the findings transfer).
- A **perf harness** (`perf.mjs`) that generates N specs and times both encodings.
- It does **not** wire delegate edges by parsing a `railway()`/`pipe()` declaration —
  the prototype passes `--handoffs a:b` explicitly to exercise the cross-file check.
  In the product the edges come from the spec's own `pipe()`/`delegatesTo`.

---

## Moat-vs-helper call

**MOAT (lever), not a mere helper — with one precise caveat.** The registry is the
repo-scale realization of "the harness becomes a compilable, analyzable formal
object" (`typed-spec-moat.md` §1). Concretely it is **markdown-impossible AND
orchestration-framework-impossible**:

- **vs markdown / a linter:** a linter can check that a `delegate` target exists
  (vigiles already does, in `validateRailway`, at COMPILE time when you run the
  tool). It cannot do it **at edit time in the author's editor with zero tool run**,
  and it fundamentally cannot **carry a data SHAPE forward through composition** so
  that step N's `needs` is checked against the real computed type of step N-1's `ok`.
  That is computation over the spec — a string format has no access to it. The
  registry makes the type checker the author already runs the delivery vehicle.
- **vs LangGraph / CrewAI / AutoGen / the Claude Agent SDK:** these ARE code, but the
  harness they assemble passes **untyped state** (Python dicts, loose message
  objects) between nodes at RUNTIME; a missing/wrong field surfaces as a runtime
  `KeyError`. The registry checks every handoff at **compile time**, across files,
  before anything runs (`typed-spec-moat.md` "the second wall").

It is the substrate for the founder's favorite moat — the **semantic capability-diff
at PR time** (`typed-spec-moat.md` §2): once the whole harness is one typed value,
the capability lattice (#4) is computable, and a PR diff over the COMPUTED type
("this PR widened the blast radius / removed a gate / opened a cross-step trifecta")
falls out. The registry is what makes "diff the harness's capabilities" a repo-wide
operation instead of a per-file one.

**The caveat that keeps it honest:** the registry is an **amplifier of the existing
typed-spec wins, not a new guarantee class.** Each individual check (handoff,
dangling, duplicate) already exists or is prototyped per-file/at-compile-time; the
registry's contribution is **doing them across the WHOLE harness at edit time, as one
program.** That is genuinely non-replicable and genuinely valuable (it's how you get
the repo-scale capability-diff), but it should be sold as "the whole harness is now
one type-checked program," not as inventing a new check. The novel PRODUCT on top is
#4→capability-diff; the registry is its enabling engine.

---

## Staleness / DX assessment

The gen file must regenerate when a spec is added/changed/removed — exactly the
staleness profile of the existing `generate-types`/`generate-schema` codegen, and
vigiles already has the muscle for it:

- **Trigger:** a `guard({ watch: "*.spec.ts", run: "npx vigiles generate-harness" })`
  — the same mechanism as the shipped `recompile-on-spec-change` and
  `regen-types-on-config-change` guards. Add/rename a spec → the guard regenerates
  `harness.gen.ts` → the cross-checks re-run.
- **CI floor:** `harness.gen.ts` is committed (like a lockfile / Prisma client) and a
  CI step asserts `generate-harness` is a no-op diff (the gen file is up to date),
  then `tsc --noEmit` enforces the cross-checks. This is the standard committed-codegen
  contract (TanStack `routeTree.gen.ts`, Prisma client).
- **DX cost — modest, with two real edges:**
  1. **A committed generated file** the author must not hand-edit (mitigated by the
     `// AUTO-GENERATED — DO NOT EDIT` header + the integrity discipline vigiles
     already applies to compiled markdown). The watch guard keeps it fresh in-loop.
  2. **`allowImportingTsExtensions`** (or an emit step) is needed because the gen file
     imports sibling `*.spec.ts` directly — a one-line tsconfig flag under the repo's
     `Node16` module resolution; not a blocker, but a setup detail to document.
- **Net:** the staleness story is solved by reusing the existing guard + committed-codegen
  pattern. The DX is "one more generated file in the build, watched like your types" —
  acceptable, and familiar to anyone who's used Prisma/tRPC/TanStack Router.

---

## The single strongest pick

**Build the registry, scoped to #1 (cross-file handoff) + #2 (dangling delegate) as
generated O(N) TYPES, with #3 (duplicate names) detected in the JS GENERATOR — and
position #4 (the whole-harness capability lattice) as the engine for the
capability-diff moat (`typed-spec-moat.md` §2/§6 build-order step 2→3).**

Why this exact scope:

- #1 + #2 are the **headline non-replicable wins**, both PROVEN against `tsc` with
  clean field-naming errors, and both **measured O(N)** — they scale to ~1000 specs,
  ~∞ past any real harness.
- #3 is a **MOAT in substance but a TS2589 trap in the naive type form** — shipping it
  as a generator check is strictly better (free, O(N), cleaner error) AND avoids the
  one wall the measurement found.
- #4 is the **reason the registry is worth building at all beyond #1/#2**: it is the
  substrate the founder's favorite moat (capability-diff at PR) needs at repo scale.
  The registry is exactly the "whole harness as one value" the diff is computed over.

The honest one-line verdict: **TypeScript DOES scale to a whole-harness registry —
linearly, to ~1000 specs in ~2s — PROVIDED every cross-check is per-edge (a shallow
type) or set-cardinality (the JS generator); the only thing that doesn't scale is the
one O(N²) encoding the design must not use, and the prototype shows both the wall and
the way around it.**

## See also

- `typed-spec-moat.md` — the moat synthesis: §1 "the harness as a compilable formal
  object" (this is its repo-scale form), §2 the capability-diff at PR (which #4
  enables), §3 the keystone computed pipeline type (which the registry hosts), §6
  build-order (step 2 "cross-step accumulation" is exactly #4 over the registry).
- `typed-spec-power.md` — #1 typed composition (the per-file basis this lifts to repo
  scale) + the TS2589/shallow-encoding lesson the perf measurement re-confirms.
- `src/core/generate-types.ts` / `src/core/generate-schema.ts` — the existing codegen
  this extends (the gen file is a third generated artifact beside the `.d.ts` and the
  JSON Schema); `src/core/spec.ts` (`Supplies<>`, `TypedAgentSpec`, `result()`) —
  the shipped typed surface the registry reuses unchanged.
- `src/core/compile.ts` `validateRailway` — today's COMPILE-time delegate resolution
  the registry lifts to EDIT-time (#2).
- Prototype: `research/prototypes/whole-harness-codegen/` (run `node run.mjs`).

```

```
