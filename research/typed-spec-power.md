---
status: shipped
topic: spec
---

# Typed-spec power — the non-replicable wins of a `.spec.ts` over markdown

> Status: research + prototype (2026-06-21). Question from the founder: the
> typed `.spec.ts` format is positioned as "the substrate that makes your harness
> testable," but the only clearly-demonstrated win is `result()` →
> `assertAgentOk`. What ELSE does a TYPED (executable, compiler-checked) spec give
> that markdown / YAML frontmatter **structurally cannot**? Rank them; prototype
> the best 1–2.
>
> Companions: `railway-subagents.md`, `spec-syntax-and-railway-scope.md`,
> `typed-contracts-for-agents.md`, `side-effect-separation.md`,
> `divergent-bets.md` (#1/#2 killed), `docs/spec-format.md` ("Why a spec?").
> Prototype: `research/prototypes/typed-spec-power/`.

## The filter (applied to every idea)

A markdown file or YAML frontmatter can hold any FIXED set of string fields, and
vigiles already verifies references in plain markdown (inline comments / `vigiles:`
frontmatter). So "the spec can DECLARE X" is never the answer. An idea only counts
if declaring X **as code** buys something a string format cannot:

- a **compile-time guarantee** (a bug becomes a red squiggle, no tool run);
- a **cross-reference the type system checks** (field A must satisfy field B);
- **composition / computation** (one value derives from another);
- **generation** of a provably-consistent second artifact;
- **refactor-safety** (rename → the compiler finds every use).

The honest test for each row below: **"could markdown + a linter do this?"** If
yes, it's ranked down — even if it sounds good.

## The ranking

| #   | Idea                                                                                                         | Non-replicable?      | Value    | Buildable?         | Verdict                                               |
| --- | ------------------------------------------------------------------------------------------------------------ | -------------------- | -------- | ------------------ | ----------------------------------------------------- |
| 1   | **Typed handoff composition** (`A.ok` must satisfy `B.needs`, checked by `tsc`)                              | **Yes — structural** | **High** | Med (POC done)     | **PURSUE — the killer use**                           |
| 2   | **Make-invalid-states-unrepresentable: typed purity** (a `pure` agent CANNOT be given `Bash` — a type error) | **Yes**              | **High** | **Low (POC done)** | **PURSUE — cheapest big win**                         |
| 3   | Exhaustiveness via discriminated unions (`assertNever` over hook events / tool effects)                      | Yes                  | Med      | Low                | Adopt where a union exists                            |
| 4   | Test-generation from typed fields (exhaustive cases from a `result()` union)                                 | Partly               | Med      | Med                | Sibling workstream; types add exhaustiveness          |
| 5   | Refactor/rename safety + queryable model ("every agent that can push")                                       | Mostly               | Med-Low  | Med                | Real but modest; falls out of #1/#2                   |
| 6   | Higher-order / parameterized specs (`(cfg) => spec`, shared rule-sets, org presets)                          | **No**               | Med      | Low                | DRY only — markdown-replicable via a generator        |
| 7   | One source → many _formats_ (CLAUDE.md + `.mdc` + `.clinerules` …)                                           | No                   | Low      | —                  | **KILLED** (divergent-bets #2); compose, don't absorb |
| 7b  | One source → many _consistency-critical_ artifacts (tool list → Cedar policy)                                | Yes                  | Med      | Med                | Narrow keeper — note below                            |

The two clear winners are **#1 typed handoff composition** and **#2 typed
purity**. Both were prototyped against real `tsc` (evidence below). Everything
else is either modest, already-shipped, or markdown-replicable.

---

## #1 — Typed handoff composition (the killer use) — PROTOTYPED

**The claim.** A multi-agent railway is a _pipeline_: planner → implementer →
reviewer. Each worker PRODUCES a success payload (`result().ok`) and the next
worker CONSUMES some of those fields. The interesting bugs are at the **seams**:

- the reviewer needs a `securityScan` field nobody upstream produces;
- the implementer emits `diff: string` but the reviewer was written against
  `diff: string[]`;
- the steps are listed in the wrong ORDER, so a consumer runs before its producer.

A markdown railway (or the **shipped** `railway()` today) lists steps as **strings**
— `delegate("reviewer")` — and resolves the name against the known-agent set at
COMPILE time (a stale-ref check, good) but **never type-checks the data handoff**.
The shipped `result(ok, err)` erases its field shapes to `Record<string,
OutputFieldType>`, so the compiler cannot see that A's output fails to feed B. The
mismatch surfaces only when the railway RUNS and the reviewer reads an undefined
field.

**Why markdown + a linter cannot do this.** A linter could check that every
`delegate` target exists (vigiles already does). It could even parse `ok:`/`needs:`
frontmatter blocks and compare field NAMES with a custom rule. But:

1. It cannot do it **at edit time, in the author's editor, with zero tool run** —
   the type checker the author already runs is the delivery vehicle.
2. It cannot **carry the shape forward through composition** — after `then(A, B)`
   the pipeline's type IS `B`'s output, so the NEXT `then` is checked against the
   real, computed downstream shape. A linter re-derives this by hand; the type
   system propagates it for free. This is _computation over the spec_, the thing a
   string format has no access to.
3. Field TYPES (`string` vs `string[]`), not just names, are compared structurally.

**The prototype.** `research/prototypes/typed-spec-power/typed-composition.ts`
keeps the `ok`/`err`/`needs` shapes in the TYPE parameters of a `TypedAgent`, and a
`then(pipeline, agent)` combinator whose second argument is well-typed **only** when
the prior `ok` supplies the agent's `needs` (a `Supplies<Producer, Consumer>`
conditional type that collapses to a descriptive error object on a bad handoff).

The good pipeline compiles clean (exit 0). The broken pipelines in `./fails.ts` are
rejected by `tsc` alone, each diagnostic **naming the offending field**:

```
fails.ts(44,3): error TS2345: ... parameter of type
  '{ __HANDOFF_ERROR: { __missing: "securityScan"; required: "string"; }; }'.
fails.ts(58,3): error TS2345: ... parameter of type
  '{ __HANDOFF_ERROR: { __mismatch: "diff"; expected: "string[]"; got: "string"; }; }'.
fails.ts(69,48): error TS2345: ... parameter of type
  '{ __HANDOFF_ERROR: { __missing: "diff"; required: "string"; }; }'.
```

- **`__missing: "securityScan"`** — a consumer needs a field no producer emits.
- **`__mismatch: "diff"; expected: "string[]"; got: "string"`** — a type collision.
- **`__missing: "diff"`** (FAILURE 3) — the same combinator catches an **out-of-order**
  pipeline, because the reviewer placed before the implementer never sees `diff`.

That is three classes of real orchestration bug caught **before any agent runs and
before any `vigiles` command** — purely because the spec is code and the handoff is
a type. No markdown railway can express this; it's the single strongest argument
for the typed format.

**Cost / risk.** The diagnostics are TS2345 wrapped in a `__HANDOFF_ERROR` object —
readable (they name the field) but not as clean as a hand-written message. The
shape-in-the-type approach needs `const` type parameters (TS ≥ 5.0, present). The
real-spec lift is real: today's `result()`/`delegate()` are string-erased, so
shipping this means a typed overload of `agent()`/`railway()` that PRESERVES the
field shapes (the POC shows the mechanism; the shipped builders would need the
generic-carrying variant). It is the highest-value, medium-effort item.

**How it pays into the existing pillars.** This is the _compile-time_ twin of the
shipped `result()` → `assertAgentOk` _test-time_ win: `result()` lets you assert one
worker's outcome with no LLM judge; typed composition lets you prove the **wiring
between** workers before you run them. Same substrate (typed contracts), extended
from one node to the graph — exactly the "railway is a verified orchestration
layer" thesis in `railway-subagents.md`, now with the data-flow edge typed, not
just the name edge.

## #2 — Typed purity: make the invalid state unrepresentable — PROTOTYPED

**The claim.** vigiles already enforces "a `pure` agent may not hold a
side-effecting tool" — but in the COMPILER (`purityViolations`,
`src/core/effects.ts`), i.e. only when you run `vigiles compile`. The type system
can reject it **earlier and for free**: make `tools` for a `pure` agent a
`readonly ReadOnlyTool[]`, so handing it `"Bash"` is a plain assignability error.

**Why markdown + a linter cannot do this.** A linter CAN flag a `pure` skill whose
`tools:` includes `Bash` — and vigiles' `scan`/compile do. But the type-system
version is categorically better in one way a string format never reaches: the bad
state is **unrepresentable**, not _detected-then-rejected_. The author cannot even
TYPE the invalid spec; the editor refuses it at the keystroke. "Detected and
rejected" (linter) vs "cannot be expressed" (type) is the make-invalid-states-
unrepresentable distinction (`harness-state-space.md`) — the type closes the window
the linter only polices.

**The prototype.** `research/prototypes/typed-spec-power/purity-types.ts` defines
`AllowedAt<P>` (the tool set permitted at purity `P`) and types `tools: readonly
AllowedAt<P>[]`. Read-only-only at `pure`, `+Write/Edit/Notebook` at `bounded`,
anything at `dangerously-unrestricted`. The pass cases compile (exit 0); the
violations in `./purity-fails.ts` are rejected by `tsc`:

```
purity-fails.ts(33,19): error TS2322: Type '"Bash"' is not assignable to type 'ReadOnlyTool'.
purity-fails.ts(40,28): error TS2322: Type '"Bash"' is not assignable to type 'ReadOnlyTool | "Write" | "Edit" | "NotebookEdit"'.
```

A `pure` agent **cannot be handed `Bash`**; a `bounded` agent **cannot be handed
`Bash`** — at the author's `tsc`, no vigiles run, clean native error messages.

**Cost / risk — and the honest caveat.** This is the cheapest win to ship (a
discriminated `tools` field type), and its error messages are _cleaner_ than #1's.
BUT: the type can only gate the **statically-decidable** half. The shipped runtime
gate (`decidePurityGate` + `isReadOnlyBash`) does something the type CANNOT — it
admits `git status` and denies `git push` under `bounded` by classifying the
_actual command at the live call_. A type sees `"Bash"`, not the command string.
So typed purity is a **strict author-time addition** to the runtime gate, never a
replacement: it stops you from writing a contradiction, the gate still confines the
allowed-but-undecidable cases at runtime. Frame it that way and it's pure upside.

## #3 — Exhaustiveness (`assertNever`) — adopt where a union already exists

Discriminated unions + `default: assertNever(x)` make "every hook event handled,"
"every tool classified" a compile error when a case is added and a handler isn't.
Genuinely non-replicable (markdown has no `switch`), but it's an _internal_
implementation discipline vigiles already uses (`src/core/hash.ts` `assertNever`),
not a NEW user-facing spec power. Adopt it wherever a spec field is a closed union
(e.g. an author handling every `OutputFieldType`), but it's a Med-value rider on
#1/#2, not a headline.

## #4 — Test generation from typed fields — sibling workstream; types add exhaustiveness

The scaffold workstream (`src/scaffold-test.ts`) already turns a surface into a
runnable starter test from a template. What the TYPES add beyond a template is
**exhaustiveness**: from a `result(ok, err)` discriminated union you can generate
one assertion PER track (assert the `ok` shape AND the `err` shape) and have the
compiler guarantee you covered both — a template hard-codes the cases, the type
DERIVES them. Worth folding into scaffold as "derive cases from the contract
union," but it rides on #1's typed-`result()` lift (you need the shapes in the type
first). Medium value, gated on #1.

## #5 — Refactor-safety + queryable model — real but modest, and it falls out of #1/#2

"Rename an agent and the compiler finds every `delegate` to it"; "statically list
every agent that can push." Both are true once the spec is typed data — but they're
mostly a _consequence_ of #1/#2, not a separate build. Rename-safety already partly
holds (a renamed agent breaks `delegate("old")`'s known-agent check at compile, and
with #1's typed targets it would break at `tsc`). The "query the model" angle
(`scan` already answers "which agent has no tool contract," "which skills overlap")
is **deterministic and lives in `scan`** — it does not need the spec to be typed,
just parsed. So: a nice secondary benefit, not a primary reason to choose types.

## #6 — Higher-order / parameterized specs — DRY only, markdown-replicable. Rank down.

`(config) => spec`, shared rule-sets via `import`, org presets: real ergonomic DRY,
and `shareable-presets.md` already covers the preset angle. BUT it fails the filter:
a markdown generator (a tiny script, or any templating tool) produces the same
fanned-out files. The win is authoring convenience, not a guarantee markdown can't
give. Useful, low-novelty; do it because it's cheap, not because it's a moat.

## #7 / #7b — One source → many artifacts

**#7 (many editor FORMATS — `.mdc`, `.clinerules`, …) is KILLED** (`divergent-bets`
#2, founder "no"; `CLAUDE.md`'s compose-with-sync-tools rule). vigiles emits the
canonical CLAUDE.md/AGENTS.md and lets Ruler/rulesync fan out; it does NOT absorb
per-tool format maintenance. The `target: [...]` byte-identical CLAUDE.md+AGENTS.md
is already shipped and is the _only_ fan-out vigiles owns.

**#7b (one source → a consistency-CRITICAL second artifact) is a narrow keeper.**
The interesting case is NOT another markdown flavour but a different _kind_ of
artifact that must stay in lockstep with the spec: e.g. compile an agent's `tools`
allowlist into a **Cedar policy** (or a JSON-Schema, or a settings.json permission
block) so the runtime gate and the declared contract are provably the same source.
Here the spec being CODE matters: the policy is COMPUTED from the typed tool list,
so they cannot drift. This is a real, non-replicable generation win, but it's
Med-value and downstream of #1/#2; park it as a follow-on, not a headline.

## Recommendation

**Pursue #1 (typed handoff composition) as the single strongest non-replicable use
of a typed spec, with #2 (typed purity) as the cheap companion shipped first.**

- **#2 ships first** — it's a one-field type change (`tools: readonly
AllowedAt<P>[]`), has the cleanest error messages, and is pure upside over the
  existing runtime gate. It's the proof-of-concept that "the type rejects what the
  linter only flags."
- **#1 is the headline** — it's the genuinely new capability: _the compiler proves
  the data-flow wiring of a multi-agent railway before anything runs._ It's the
  compile-time twin of the one already-celebrated win (`result()` →
  `assertAgentOk`), extending typed contracts from a single node to the whole graph.
  It needs the real lift (a generic-carrying `agent()`/`railway()` that preserves
  field shapes instead of erasing them to `Record<string, OutputFieldType>`), and
  the error ergonomics want polish, but the mechanism is proven against `tsc` here.

Everything else is either already shipped (#7 target-array), markdown-replicable
(#6), a modest consequence of the winners (#5), an internal discipline (#3), or
gated on #1 (#4, #7b).

**The one-line answer to "what's the non-replicable killer use of typed specs":**
a markdown railway can name its steps; **only a typed spec can prove the data
handed between them type-checks** — invalid pipelines (missing field, wrong type,
wrong order) don't compile.

## Prototype files (all under `research/prototypes/typed-spec-power/`)

- `typed-composition.ts` — the typed `agent()`/`start()`/`then()` combinators; the
  good pipeline (compiles).
- `fails.ts` — three broken pipelines (missing field / type mismatch / wrong
  order), each rejected by `tsc` naming the field.
- `purity-types.ts` — typed-purity `agent()`; pass cases compile.
- `purity-fails.ts` — `pure`/`bounded` agents handed `Bash`, rejected by `tsc`.
- `run.mjs` — one-shot reproducer: asserts the "good" files compile and the
  "fails" files are rejected, printing the captured diagnostics. Run:
  `node research/prototypes/typed-spec-power/run.mjs`.

These are self-contained — they COPY a minimal type-parameterized variant of the
builders and do NOT modify the shipped `src/core/spec.ts` (whose `result()` /
`delegate()` are string-erased today, which is exactly why the type system can't
see a handoff mismatch yet — the gap #1 would close).

## See also

- `research/railway-subagents.md` — the orchestration-layer thesis #1 extends.
- `research/spec-syntax-and-railway-scope.md` — why railway/`result()` is a
  subagent contract (the boundary that makes the typed handoff meaningful).
- `research/side-effect-separation.md` + `research/effect-boundary-design.md` — the
  runtime purity gate #2 sits ABOVE (type rejects the contradiction; the gate still
  confines the undecidable Bash command at the live call).
- `research/divergent-bets.md` — #1/#2 (compiler-not-linter, many-formats) killed,
  bounding what "generation" should and shouldn't mean here.
