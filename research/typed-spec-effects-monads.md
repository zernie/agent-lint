# Typed-spec — ALGEBRAIC EFFECTS, MONADS & INTERPRETERS (round 2, deep dive)

> Status: research + prototypes (2026-06-21). Round-2 deepening of one cluster the
> first frontier pass under-covered. The brief: mine algebraic-effect rows/handlers,
> the free-monad/tagless-final "spec as a program interpreted to many backends," and
> runtime graded/writer monads — HARD, past the coarse `pure|bounded|unrestricted`
> ladder `effects.ts` already ships.
>
> **Builds on, does not duplicate:**
>
> - `typed-spec-power.md` — #2 typed purity (a tool field gated by a purity LEVEL).
>   This doc replaces the LEVEL with an effect ROW (a set of legs), the strict generalization.
> - `typed-spec-frontier.md` — F9 killed a graded budget AS A TYPE (TS2589); this doc
>   resurrects the RUNTIME graded form and asks if it's worth it (M4). F1's trifecta
>   leg-fold is the SAME fold mechanism as M1's row, over a different leg-catalog.
> - `fp-for-agent-harness.md` — idea #7 "effect rows per skill" and #3 "hooks as
>   handlers" were sketched there with no buildability test; this doc PROVES which
>   parts survive `tsc` 5.9.3 and which are repackaging.
> - `side-effect-separation.md` / `effect-boundary-design.md` — the shipped 3-rung
>   ladder + runtime purity gate this doc generalizes.
>
> Prototypes (all ground their claims against real `tsc` 5.9.3 / runnable node):
> `research/prototypes/typed-spec-effects-monads/` — `node …/run.mjs` exits 0.

## The one-paragraph answer

`effectSurface` captures the useful 80% of "how constrained is this contract?" — but
it's a **total order** (pure < bounded < unrestricted), and the genuinely
non-replicable frontier win is that effects are a **row** (an independent SET of legs:
`fs-read` / `fs-write` / `net` / `exec` / `spawn`). A row distinguishes two contracts
the ladder calls identical ("both unrestricted") and lets the type name the EXACT
leaked dimension. The algebraic-effect **handler** — discharging a leg by routing it
(net → the egress recorder), shrinking the _residual_ row — is the runtime move the
binary purity gate has no analogue for, and it's buildable today on the existing
PreToolUse rail. The free-monad/tagless-final reframe of the whole compiler is
**elegant but mostly repackaging**: vigiles already dodges drift by sharing one
detector; the AST buys open backend-extension + a _structural_ no-drift proof, a
real-but-incremental win, not a headline. The runtime graded budget is a duplicate of
the eval cost meter (dead, as F9 said); only the monotone _escalation_ grade + a
writer **audit trail** keyed to the row survive, as a Med rider.

## The ranking

Filter on every row: **non-replicable** (could markdown + a linter do it? → ranked
down), **build class** (`TS-types` / `runtime-check` / `hybrid` / `aspirational`),
**value** (does it shrink the harness state-space / stop a real failure / unlock a
real capability — or is it a cute abstraction?).

| #      | Idea                                                                                                                                                | PL source                                                      | vigiles application                                                                                                                          | Non-replicable? why                                                                                                                  | Build class                                             | Value         |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------- |
| **M1** | **Granular effect ROW** — a tool contract's effect is a SET of independent legs (`fs-read`/`fs-write`/`net`/`exec`/`spawn`), not a 3-rung ladder    | Effect rows (Koka `<exn,div>`, Eff, OCaml 5, Unison abilities) | fold the legs over the `const` tools tuple; a declared `grants:` row that omits a needed leg is a `tsc` error NAMING the leg                 | **Yes** — a per-dimension upper bound; the ladder can't say "net but not exec." Markdown lists tools; only the type folds their ROW  | **TS-types** + runtime (PROTOTYPED, real tsc)           | **Very high** |
| **M2** | **Effect HANDLER discharge** — a unit declares `handlers: { net: recorder }`; the live `net` call is ALLOWED but ROUTED, shrinking the residual row | Algebraic-effect handlers (`handle e with { Net k -> … }`)     | a PreToolUse decision that returns `{allow, route, dischargedLeg}` + a `residualRow()`; net allowed-but-mediated, exec still denied          | **Yes** — the binary gate is allow/deny; "allow but route through X, and now the residual effect is smaller" needs the handler shape | **runtime-check** (PROTOTYPED, runs green)              | **High**      |
| **M3** | **Spec as a free-monad AST → many backends** — one contract AST folded by swappable algebras (markdown / gate / Cedar / OTel)                       | Free monad / tagless-final / the interpreter pattern           | reify the contract as data; `fold(algebra)` derives each artifact; a property test proves gate ⇔ markdown over the whole tool space          | **Partly** — vigiles ALREADY avoids drift by sharing `classifyToolEffect`. The AST adds open extension + a STRUCTURAL no-drift proof | **hybrid** (PROTOTYPED — honest caveat)                 | Med           |
| M4     | **Runtime graded + writer monad** — accumulate a monotone escalation GRADE over the effect sequence; append a per-leg WRITER audit trail            | Graded/indexed monads (Katsumata); writer monad                | `runGraded(effects, ceiling)` denies the step that crosses the ceiling MID-SEQUENCE; the log is a diffable receipt                           | Partly — the COST grade duplicates the eval meter; the ESCALATION grade + audit trail are new                                        | **runtime-check** (PROTOTYPED; F9 type form stays dead) | Med           |
| M5     | **Skill combinators (retry/fallback/parallel/race) as Kleisli arrows**                                                                              | Kleisli composition `>=>`; Effect.ts combinators               | `pipe(a, b, c)` ALREADY ships (typed handoff, spec.ts). retry/fallback/race compile to PROSE only — the harness can't actually retry a skill | No — prose a markdown generator emits; no deterministic gate behind it                                                               | aspirational (prose)                                    | Low           |
| M6     | **Reader monad for hook/skill context**                                                                                                             | Reader monad (`Reader<Env, A>`)                                | thread `{cwd, env, transcript}` implicitly                                                                                                   | No — it's an internal plumbing convenience, no user-facing guarantee, no state-space shrink                                          | n/a (internal)                                          | Low (kill)    |

The genuine frontier wins are **M1** (the headline) and **M2** (its runtime
completion). M3 is real-but-incremental (a refactor with two concrete payoffs). M4 is
a Med rider. M5/M6 are repackaging — the crisp NOs.

---

## M1 — Granular effect ROW: past the ladder (the headline) — PROTOTYPED

**The claim.** The shipped `effectSurface` (`src/core/effects.ts`) collapses a tool
contract to **one of three rungs on a total order**: `pure < bounded < unrestricted`.
That answers "how constrained?" but structurally cannot answer "constrained IN WHICH
DIMENSION?". Algebraic-effect systems (Koka's `<exn,div,console>`, OCaml 5 effects,
Unison abilities) type effects as a **row** — an independent SET of legs. Transferred
to the harness: a tool grants `{fs-read}` OR `{net}` OR `{exec}` …, and a contract's
effect is the **union of its tools' legs**. Two contracts the ladder calls identical
(both `unrestricted`) are now distinguished: a doc-fetcher's row is `{fs-read, net}`;
a formatter's is `{fs-read, fs-write}`; **neither needs the other's leg**, and the row
makes that asymmetry typed and checkable.

**Why this is the strict generalization of typed-purity (#2 prior round).** Typed
purity gates `tools` by a purity LEVEL — but `bounded` is a _point on a line_, so a
`bounded` agent that needs to write a file is indistinguishable from one that needs to
hit the network: both are "below unrestricted." The row replaces the point with a
**face of a lattice**: `grants: ["fs-read", "fs-write"]` says _exactly_ "may write,
may NOT reach the net," a constraint the level vocabulary cannot express. Purity is the
1-D projection of the row onto a chain; the row is the full product lattice.

**Why markdown + a linter cannot do this (the non-replicable core).**

1. The check runs at the author's `tsc`, at the keystroke, with **no vigiles run** —
   the author cannot type a contract whose tools leak a leg the declared row omits.
2. The diagnostic **names the exact leaked dimension** (`__effect_leak: "net"`), which
   a coarse "this is unrestricted" lint message structurally cannot — the row carries
   the _which_, not just the _how-much_. A linter parsing tools could re-derive a leg
   set with a hand-written rule, but it does it post-hoc, off-editor, and re-implements
   the fold by hand; the type system folds it for free and refuses the keystroke.
3. It's a **product lattice**, so it composes per-dimension with M2's handlers and F1's
   trifecta legs over the **same `const` tuple** — one fold, three independent effect
   axes (capability legs, taint legs, mediation).

**The mechanism (real, compiles — captured `tsc` 5.9.3).** Tag each tool with its legs
in a `ToolRow` catalog (the per-dimension mirror of the dialect's one
`sideEffectingTools` bucket), fold the union over the tuple (`RowOf`), and gate the
`grants:` row with a set-difference (`RowSatisfied = [Exclude<Needed, Granted>] extends
[never] ? true : { __effect_leak }`). The pass cases (`effect-row.ts`: a fetcher
granting `{fs-read, net}`, a formatter granting `{fs-read, fs-write}` with **no net
leg**, an over-granting case) compile. The violations are rejected, each naming the
leaked leg:

```
effect-row-fails.ts(53,34): error TS2345: ... grants: "fs-read"[] ... is not assignable ...
  Property '__EFFECT_LEAK' is missing ... required in type
  '{ readonly grants: readonly "fs-read"[]; readonly __EFFECT_LEAK: { readonly __effect_leak: "net"; }; }'.
effect-row-fails.ts(61,35): error TS2345: ... tools: ["Read","Grep","WebFetch","Bash"] ...
  '__EFFECT_LEAK': { readonly __effect_leak: "exec"; }     ← buried in a 4-tool list
effect-row-fails.ts(69,36): error TS2345: ... tools: ["Read","Edit"] ...
  '__EFFECT_LEAK': { readonly __effect_leak: "fs-write"; } ← the clobber dimension isolated
```

FAILURE 2 proves the fold finds `exec` buried among four tools; FAILURE 3 isolates
`fs-write` — the exact "this reader can clobber files" dimension the `bounded` rung
folds away. The error tells the author the precise missing leg.

**The honest TS limits (and why they don't sink it).**

- The diagnostic is `__EFFECT_LEAK` / `__effect_leak: "net"`, not a prose
  "this agent leaks the network leg." That's the cleanest TS2345 the `&
{ __EFFECT_LEAK }` shape yields (same ergonomics tradeoff as F1's `allowTrifecta`);
  put the word "effect leak" in the JSDoc the editor surfaces on hover.
- An **unknown / MCP tool** widens `LegsOf<T>` to the **full** leg set (the prototype's
  `T extends keyof ToolRow ? … : EffectLeg`), so an unrecognized tool can never sneak
  under a tight row — it forces the broadest grant. That's the _sound_ default (the
  same conservative posture `classifyToolEffect` takes — unknown ⇒ `"unknown"` ⇒
  unrestricted), but it means the row is precise only over the KNOWN catalog. Correct,
  not a bug: an MCP tool's real effects aren't knowable from the name.
- It sees the DECLARED tools, not what the agent DOES — the author-time **floor**, like
  typed-purity. The runtime gate (M2) is what enforces the row on the live call.

**Non-replicable verdict: YES, and it's the strongest in this doc.** It takes the
shipped purity contract — vigiles's own differentiator — and upgrades its vocabulary
from a 1-D level to an N-D row, so the type names the exact effect dimension at risk.
Markdown can list tools; only a typed spec folds their effect ROW and refuses a
contract that under-declares it.

## M2 — Effect HANDLER discharge: the runtime completion of M1 — PROTOTYPED

**The claim (and why it's the move the binary gate lacks).** In algebraic-effect
systems a _handler_ doesn't merely forbid an effect — it **interprets** it:
`handle comp with { Net k -> record(req); k(resp) }` catches a raw network effect,
routes it through a recorder, and **removes `net` from the residual effect row** of the
handled computation. The shipped `decidePurityGate` is binary — allow or deny by ladder
rung — so it can only say "net: allowed" or "net: denied." It has **no way to express
"net: allowed, but ONLY through the egress recorder, and now this unit's residual
unmediated effect is just `{fs-read}`."** That mediated-and-discharged case is exactly
what a handler models, and it's the safety posture vigiles already wants (the egress
wall, the tool-interception spy) — just without a vocabulary to declare it per-unit.

**The mechanism (runs green — `effect-handler.mjs`).** A contract carries `grants:` (the
M1 row) **and** `handlers: { net: "egress-recorder" }`. The pure decision
`decideHandledEffect(contract, tool)` returns `{ allow, route, dischargedLeg }`:

```
[ok] Read (fs-read) allowed raw — granted, no handler
[ok] WebFetch (net) allowed but DISCHARGED via "egress-recorder" — the handler move
[ok] Bash (exec) DENIED — exec not in granted row {fs-read, net}
[ok] residual row = {fs-read} (net discharged by handler — the inspectable artifact)
[ok] same row, NO handler → net stays in residual {fs-read, net}, WebFetch allowed RAW
```

- **net granted + handled** → allowed, `route: "egress-recorder"`, leg discharged.
- **exec NOT in the row** → denied (the row is the upper bound, M1 at runtime).
- `residualRow(contract)` = granted legs **minus** handled legs — the inspectable
  "what can this unit STILL do unmediated" the binary gate throws away. With the
  recorder, the fetcher's residual is `{fs-read}`; without it, `{fs-read, net}`.

`decideHandledEffect` is the same pure-seam shape as the shipped `decidePurityGate`
(`one-detector-no-drift`) — it drops beside the agent-runtime PreToolUse rail. The
`grants`/`handlers` would compile into the unit's frontmatter (mirroring how `purity`
compiles to `<!-- vigiles:purity:LEVEL -->`), and the hook reads them back. The
`route` is the new bit: instead of just allow/deny, the hook can _rewrite_ the call to
go through a recorder/proxy — which Claude Code's PreToolUse `permissionDecision` +
the egress machinery (`src/egress.ts`) already make possible.

**Why non-replicable + valuable.** No markdown field and no binary linter can express
"allowed but mediated, shrinking the residual effect" — that's the handler's whole
content, a _transformation_ of the effect, not a verdict on it. The value is concrete:
it's the typed, per-unit declaration of the safety posture vigiles already enforces
ad-hoc (record egress, intercept paid tools), and the **residual row** is a new
inspectable the leaderboard/scan can report ("this fetcher's network is fully mediated;
its only unmediated effect is fs-read"). It rides entirely on the existing PreToolUse +
egress rails — low net-new surface.

**Honest limit.** "Discharge" here is _routing_, not a true continuation capture — the
hook can deny or rewrite, but it can't suspend-and-resume the model's tool call the way
a real handler resumes `k`. So M2 is the _safety/auditing_ slice of handlers (the
high-value one), not the full delimited-continuation semantics. That's the right slice:
the harness has no resumable-continuation primitive, and faking one is the aspirational
trap M5 falls into.

## M3 — Spec as a free-monad AST → many backends: real, but mostly repackaging — PROTOTYPED

**The claim, tested honestly.** vigiles already emits many artifacts from one spec —
markdown, the `<!-- vigiles:purity -->` / `<!-- vigiles:effect -->` markers the runtime
gate parses back, types, JSON-schema — via **separate ad-hoc functions**
(`compileClaude` / `compileSkill` / `compileAgent` / `compileRailway`). The free-monad
/ tagless-final question: does reifying the spec as ONE **AST** + a `fold(algebra)`
per backend buy something the ad-hoc compiler doesn't? `spec-interpreter.mjs` builds it
to find out — a tiny contract AST (`allow(leg)` / `handle(leg, via)`), three algebras
(`markdownAlgebra`, `gateAlgebra`, `cedarAlgebra`), and the consistency check:

```
[ok] consistency theorem holds over all 8 tools: gate ⇔ markdown (both folds of one AST)
[ok] handler name is identical in gate.route and markdown — one source, no copy
[ok] cedar backend derived from the same AST — a backend 'for free'
```

**What it genuinely buys (two real things):**

1. **A backend "for free" via open extension.** Adding `cedarAlgebra` (and an
   `otelAlgebra`) cost ZERO edits to the markdown or gate algebras — the Expression
   Problem's "add an interpretation" axis. The ad-hoc `compileX` functions don't
   _structurally_ guarantee this: a new artifact today means a new function that
   re-walks the spec and can quietly diverge in what it considers "allowed."
2. **A STRUCTURAL no-drift proof, not a convention.** The consistency theorem ("for
   every tool, gate ⇔ what the markdown documents") is a property test over folds of
   **one AST**, so the two artifacts _cannot_ mean different things — if someone edited
   one algebra to disagree, the test fails. Today vigiles gets no-drift by _convention_
   (`one-detector-no-drift`: "remember to call the shared `classifyToolEffect`").

**Why it's NOT a headline (the honest kill on the over-claim).** vigiles **already
captures ~80% of the consistency win** the cheap way — by sharing `classifyToolEffect`
between `compile` and `decidePurityGate`. The free-monad upgrade replaces a _shared
function_ with a _shared AST + fold_; the delta is (1) open backend extension and (2)
turning a convention into a structural invariant. Those are real, but they're a
**refactor with two modest payoffs**, not a new capability — and the cost is rewriting
the whole compiler as an interpreter, which fights the shipped `compileX` surface every
consumer reads. Verdict: **a narrow keeper, parked** — adopt the AST+fold _locally_ for
the effect contract (where M1/M2/Cedar/OTel genuinely want a shared source), NOT a
ground-up compiler rewrite. The "provable cross-backend consistency" framing is the one
to lead with if it's ever built; "elegant repackaging" is the honest framing if it's
sold as more.

## M4 — Runtime graded + writer monad: F9's runtime resurrection — PROTOTYPED

F9 killed a graded budget AS A TYPE (TS2589 past ~2k). The round-2 question: is a
RUNTIME graded interpretation worth it? `graded-writer.mjs` builds both shapes:

- **The graded interpreter.** Capability levels form a join-semilattice
  (`observe < mutate < exec < escalate`); `runGraded(effects, ceiling)` folds the
  effect sequence, JOINs the grade (privilege monotone-rising), and **denies the step
  that would cross the declared ceiling MID-SEQUENCE** — a constraint a per-tool gate
  can't see ("the SEQUENCE crossed observe→exec," not "this one tool is exec"):

  ```
  [ok] graded DENY: exec crossed the "mutate" ceiling at the live step
  [ok] escalation monotone: grades 0≤0≤1≤1 — a late observe does NOT reset privilege
  ```

- **The writer monad.** Every decision appends an immutable receipt to a log (the
  writer's second channel) — a per-leg audit trail that's replayable + diffable
  (`A ended "observe", B ended "exec"`).

**Verdict (Med, runtime-only).** The **cost** grade is a duplicate of the eval tier's
`maxCostUsd` / token meter — kill that framing (F9 was right). What survives:

- the **monotone escalation grade** — "this run's privilege rose observe→exec and never
  reset," a _sequence_ property the flat per-tool gate and the static surface both miss;
- the **writer audit trail keyed to the M1 row** — a per-run, per-leg receipt that's the
  natural artifact for `scan` to report and for the noninterference A/B (F4) to diff.

Both are runtime-only; the type form stays dead. A rider on M1's row, not a headline.

## M5 / M6 — the crisp NOs (repackaging)

- **M5 — skill combinators as Kleisli arrows (`retry`/`fallback`/`parallel`/`race`).**
  `fp-for-agent-harness.md` #4/#8 sketched these. The typed-handoff half (`pipe(a,b,c)`
  with `Supplies` checking) **already ships** in `spec.ts` (that's `typed-spec-power`
  #1 — Kleisli composition `>=>` for the data handoff, realized). The _control-flow_
  combinators (retry/fallback/race), though, compile to **PROSE** — the Claude Code
  harness has no primitive to actually retry or race a skill, so `retry(3, skill)` is a
  paragraph the model may or may not honor. That's exactly the "if it needs a model or
  emits a fuzzy instruction, it's a cute analogy not a moat" filter (the
  `analogical-transfer` rule). NO — a markdown generator emits the same prose with no
  deterministic gate behind it. (The bounded `recover: { max }` on `railway()` is the
  one control combinator that's real, because it's a _finite, statically-readable_
  tree — and it already ships.)
- **M6 — Reader monad for hook/skill context.** Threading `{cwd, env, transcript}`
  implicitly is an internal plumbing convenience with no user-facing guarantee and no
  state-space shrink. Not a spec power; an implementation detail. NO.

---

## If we build ONE thing: M1 (the effect ROW), with M2 (the handler) as its runtime half

**Pick M1 + M2 together** — they're the same idea at the two leverage points the brief
names, and they directly extend vigiles's _own_ differentiator (the purity contract):

- **M1 is the type/author-time win:** replace the purity LEVEL with an effect ROW. It's
  the strict generalization of the shipped typed-purity — `pure`/`bounded` become the
  1-D projection of a richer product lattice that names the exact effect dimension
  (`net` vs `exec` vs `fs-write`). PROVEN against `tsc` 5.9.3, same `const`-tuple fold
  mechanism as F1's trifecta, so it composes on the same field.
- **M2 is the runtime completion:** the handler that _discharges_ a leg by routing it
  (net → the egress recorder), shrinking the residual row — the one move the binary
  purity gate has no vocabulary for, buildable on the existing PreToolUse + egress
  rails. It's the typed, per-unit form of the safety posture vigiles already enforces
  ad-hoc.

Together they turn the `tools` field into a **typed effect-row capability lattice with
mediation** — and the residual row is a new inspectable for `scan`/leaderboard. The
real lift is a `ToolRow` per-leg catalog on the dialect (the per-dimension split of
today's one `sideEffectingTools` bucket) + the `grants`/`handlers` fields + the
`route`-carrying gate decision. Same shape as the typed-purity lift, one rung finer.

## The most surprising transferable idea

**The effect HANDLER as a residual-shrinking router (M2).** The surprise isn't the row
(that's a clean generalization) — it's that the harness _already has_ the handler's
machinery (PreToolUse can deny **or rewrite**; the egress recorder mediates net; the
tool-interceptor mediates paid calls) but **no vocabulary to say "this effect is
discharged, so the unit's residual effect is now smaller."** Reframing "mediated
egress" as _discharging the `net` leg_ turns a pile of ad-hoc safety hooks into a single
typed statement — `handlers: { net: recorder }` — whose meaning is computable
(`residualRow`). It reveals that vigiles's safety features are _handlers without the
handler abstraction_, and naming them as such makes the residual effect surface
inspectable for the first time.

## The crispest NO

**Skill combinators as runtime control flow (M5's retry/fallback/race).** They look
like the obvious Effect.ts port, but the Claude Code harness has no primitive to retry
or race a skill — so they compile to PROSE the model may ignore. A markdown generator
emits the identical paragraph. The data-handoff half of Kleisli composition is real and
already shipped (`pipe`); the control-flow half is a cute analogy with no deterministic
gate behind it. Don't dress prose as an effect system.

## Rejected / repackaging-only

- **Free-monad rewrite of the whole compiler (M3 over-claim).** The "provable
  cross-backend consistency" is real but ~80% already held by sharing one detector; a
  ground-up `compileX` → interpreter rewrite fights the shipped surface for an
  incremental no-drift-as-invariant gain. Adopt the AST+fold LOCALLY for the effect
  contract (where Cedar/OTel/gate genuinely share a source); reject it as a compiler
  rewrite.
- **Runtime COST grade (M4 cost framing).** A duplicate of the eval tier's
  `maxCostUsd`/token meter. Dead, as F9 said — keep only the escalation grade + writer
  trail.
- **Reader monad for context (M6).** Internal plumbing, no guarantee, no state-space
  shrink. Not a spec power.
- **Full delimited-continuation handlers (M2's robust form).** The harness has no
  suspend/resume primitive for a model's tool call; faking one is aspirational. M2's
  _routing/discharge_ slice is the buildable, high-value part — don't oversell it as
  OCaml-5 effects with resumable `k`.

## Prototype files (all under `research/prototypes/typed-spec-effects-monads/`)

- `effect-row.ts` — M1: the leg-fold `RowOf` + `RowSatisfied` gate; pass cases (a
  fetcher, a net-free formatter, an over-grant) compile.
- `effect-row-fails.ts` — M1: three contracts that under-declare their row (`net` /
  `exec`-buried-in-4 / `fs-write`), each rejected by `tsc` 5.9.3 naming the leaked leg.
- `effect-handler.mjs` — M2: the runtime discharge gate (`decideHandledEffect` +
  `residualRow`) — net allowed-but-routed, exec denied, residual shrinks. Runs green.
- `spec-interpreter.mjs` — M3: one contract AST, three algebras (markdown/gate/cedar),
  the gate⇔markdown consistency theorem over the whole tool space + the honest caveat.
- `graded-writer.mjs` — M4: the monotone escalation grade with a mid-sequence ceiling
  deny + the writer audit trail; the cost-grade-is-dead verdict inline.
- `run.mjs` — one-shot reproducer: asserts the pass file compiles, the fails file is
  rejected (printing the diagnostics), and all three runtime demos run green.
  `node research/prototypes/typed-spec-effects-monads/run.mjs` exits 0.

All self-contained — they COPY minimal typed/data variants of the builders and do NOT
modify the shipped `src/` (whose `tools` field is a flat `string[]` and whose purity is
a single LEVEL — exactly the gap M1's row would widen).

## See also

- `typed-spec-power.md` — #2 typed purity (the LEVEL M1's ROW generalizes); #1 typed
  handoff = the Kleisli `pipe` M5's data half already ships.
- `typed-spec-frontier.md` — F1 trifecta leg-fold (M1's row is the same fold over a
  capability leg-catalog, not a taint one); F9 graded budget killed at the type level
  (M4 resurrects only the runtime escalation half).
- `fp-for-agent-harness.md` — #7 effect rows / #3 hooks-as-handlers (sketched there;
  M1/M2 are the buildability-tested verdict); #4/#8 combinators (M5's crisp NO).
- `side-effect-separation.md` / `effect-boundary-design.md` — the shipped 3-rung ladder
  - runtime purity gate M1 generalizes and M2 completes.
- `harness-state-space.md` — the row makes more invalid states unrepresentable per
  dimension (the thesis, one lattice-face finer).
- `egress.ts` / `tool-intercept.ts` — the existing mediation rails M2's handler
  `route` compiles onto (they ARE handlers without the abstraction).
