<!-- vigiles:ignore-file -->

# Testing-API design — the ideal shape (deterministic + non-deterministic)

> Status: design proposal (2026-06-15). There are **no external users yet**, so
> this is a free design — the goal is a world-class testing API, not a migration
> path. Companion to `eval-api-landscape.md` (eval _infra_ features + status) and
> `promptfoo-deep-dive.md`; this doc is about the **API shape** — the surface a
> user writes harness tests and evals against.

Two questions, answered together:

1. **What makes a world-class testing API** — for both _deterministic_
   verification (assert pass/fail) and _non-deterministic_ measurement
   (mean ± se across trials)?
2. **Do we even need all those layers?** (unit / integration / e2e / eval, plus a
   3×-expressed assertion surface.)

The conclusion is one coherent shape. The short version: **one `Trace`, one
declarative `check` vocabulary, two evaluators (strict / scored), three tiers.**

---

## Part 1 — What great DETERMINISTIC testing APIs do

Prior art, distilled to the principle each one teaches:

- **`node:assert`** — minimal, throws, zero-dep, universal. _Principle:_ the base
  case is a plain throwing function; everything else is sugar over it.
- **Chai / Jest / Vitest `expect`** — a fluent chain plus `expect.extend` custom
  matchers whose **failure messages** are the real product
  (`expected agent to use "Bash", got [Read, Edit]`). _Principle:_ readability +
  a great failure message is 80% of an assertion library's value.
- **Testing-Library** — semantic, user-centric queries (`getByRole`) and
  intentionally _no_ access to implementation detail. _Principle:_ assert at the
  level of **intent**, not mechanism ("the agent used a tool", not "stdout
  matched this regex").
- **fast-check** — property/invariant testing: generate inputs, assert
  invariants. _Principle:_ for **pure functions** (a hook _is_ one:
  `(event) → decision`), test invariants over many inputs, not a few examples.
- **Vitest `expect.poll` / `.toSatisfy` / test `retry`** — assertion that
  **polls/retries** because the world is async/flaky. _Principle:_ when the thing
  under test is uncertain, the assertion itself must aggregate, not snapshot once.
- **Snapshot testing** — capture-and-diff against a committed baseline.
  _Principle:_ for large structured output, diff vs a stored reference beats
  hand-written expectations.

**Deterministic principles:** one entry; fluent + composable; the failure message
_is_ the product; assert intent not mechanism; runner-agnostic; throw on fail.

---

## Part 2 — What great NON-DETERMINISTIC / AI-eval APIs do

- **promptfoo** — assertions are **data**, each **scored 0–1**, combined as a
  weighted average with a per-test **threshold**; two families (deterministic:
  `equals`/`contains`/`regex`/schema/`cost`/`latency`/custom-JS; model-graded:
  `llm-rubric`/`g-eval`/`similar`); agentic `trajectory:*`; `repeat` N +
  `maxConcurrency`; output to **JSON / JUnit / HTML**. _Principle:_
  **assertion-as-data** → serializable → CI, regression baselines,
  threshold-with-tolerance, and a dashboard, all for free.
- **DeepEval** — metric **objects** (`GEval`, faithfulness, tool-correctness),
  each `(output) → score` with a threshold, pytest-native. _Principle:_ a
  reusable **scorer library**; a metric is a first-class value you compose.
- **Inspect (UK AISI)** — scorers + **epochs** (repeat) + **reducers**
  (aggregate, a pass^k story) + **stderr** on metrics. _Principle:_ repeat +
  reduce + spread are first-class, not bolted on.
- **Braintrust** — scorers + experiment **diffing** vs baseline + dashboards.
  _Principle:_ persist experiments; the unit of progress is a **diff**.

**The fundamental shift:** for a non-deterministic system a single run's pass/fail
is _noise_. You need **trials → aggregate (mean, pass^k) → spread (se) →
threshold-with-tolerance → significance vs a baseline**. "It passed" becomes "it
passes 9/10 ± 0.1, which is not worse than main."

**Non-deterministic principles:** assertions are data (scored 0–1); trials +
aggregate + spread; threshold not boolean; serializable for CI/baseline; reusable
scorers; **never gate a single run**.

---

## Part 3 — The synthesis: one data model, two verdict modes

The two worlds look different but share a substrate vigiles **already has**: the
`Trace` (`toolCalls`, `hooks`, `output`, `modelRequests`, `turns`, `file()`).
`runHarnessTest` and `runEval` both return a `Trace`; a hook decision
(`runHook`'s `HookRunResult`) is its smaller sibling (`{ blocked, decision,
egress, filesWritten }`) — correctly so, because a hook has no tool calls.

The deterministic and non-deterministic worlds differ on exactly **one axis: the
verdict mode.** A _check_ over a `Trace` is the same data either way; what changes
is how you evaluate it:

| Mode       | Used by            | Behaviour                                                                |
| ---------- | ------------------ | ------------------------------------------------------------------------ |
| **strict** | unit / integration | one run, **throw** with a message on first failed check                  |
| **scored** | eval               | N trials, each check → 0–1, **aggregate ± se**, threshold-with-tolerance |

So the ideal is a **single declarative check vocabulary over `Trace`**, evaluated
two ways. This is literally promptfoo's assertion-as-data (the non-det half) fused
with Chai/Vitest's fluent-with-messages (the det half), grounded on the `Trace`
vigiles already produces. One vocabulary; the runner picks the mode.

---

## Part 4 — Do we need all those layers? (the second question, folded in)

Two over-segmentations, same disease, same cure.

**Tiers — it's 3 kinds, not 4.** There's a clean axis: _what a test needs_.

- **unit** (`runHook`) — needs **nothing**; tests a hook's decision logic.
- **integration** (`runHarnessTest`) — needs the **`claude` binary + a mock
  model**; tests the hook is wired into the assembled machine and fires.
- **eval** (`runEval`) — needs a **real model + key**; measures behaviour.

`e2e` is **not** a fourth kind. The code proves it: `src/e2e.ts` re-exports
`integration` and adds exactly **one** symbol (`egressRoutes`). It's integration
whose only extra variable is real network egress, split out solely because egress
needs a privileged sandbox (slirp4netns) most CI can't give. That's a
**capability of integration**, promoted to a tier.

**Assertion surface — it's 1 vocabulary, expressed 3×.** Every `Trace` concept
appears as a bare predicate (`usedTool`), a throwing assert (`assertToolUsed`),
and (for 3) a matcher (`toBlock`) — ~40 exports for what is really a handful of
fields plus a few helpers. Most predicates are one-liners over public `Trace`
fields (`usedTool(t, "Bash")` ≡ `t.toolCalls.some(c => c.name === "Bash")`).

**The shared cure:** keep the thing the layering gets _right_ — the **capability
ladder** (import path = "what this test is allowed to need", so you physically
can't hide a `$`/network test in the free gate, and fast/free failures surface
first) — and shed the redundant _named_ expression of it. Collapse `e2e` into
`integration` (egress as a capability flag), and collapse predicate/assert/matcher
into **one check vocabulary with two evaluators**.

---

## Part 5 — The ideal API (recommended shape)

A declarative **check** vocabulary over `Trace`, two evaluators, an optional
fluent veneer, three tiers.

```ts
// ONE vocabulary — each check is DATA: { eval(trace) → {pass, score, message}, toJSON() }
import { tool, skill, output, hookFired, wrote, trigger } from "vigiles/check";

// --- deterministic (strict): one run, throws with a good message ---
import { run, expect } from "vigiles/testing";
const r = await run(spec); // unit|integration; egress is a capability: run(spec, { egress })
expect(r, [tool("Bash"), output(/done/), hookFired("PreToolUse")]);

// --- non-deterministic (scored): same checks, aggregated across trials ---
import { measure } from "vigiles/testing";
const report = await measure(spec, {
  trials: 10,
  checks: [skill("vigiles:test-harness"), trigger({ min: 0.8 })],
});
// report: per-check rate ± se, pass^k, threshold verdict — and report.toJUnit()
```

Why this is the world-class shape:

- **One vocabulary, two modes.** `tool("Bash")` reads as pass/fail on one run
  **and** as a rate across trials. Collapses the 3× surface; unifies det +
  non-det (Part 3).
- **Checks are data → serializable.** `toJSON()` / `toJUnit()` falls out for free
  — which closes the scorecard's open CI gaps (persisted reports, regression
  baselines) **and** gives the promptfoo bridge a 1:1 target (our `tool()` ↔
  their `trajectory:*`). This is the same assertion-as-data lever promptfoo,
  DeepEval, and Inspect all rest on.
- **Failure messages are first-class.** Each check owns its message
  (`expected the agent to resolve skill vigiles:test-harness; it used [Read]`) —
  the Testing-Library/Chai lesson. A thin `vigiles/vitest` veneer maps checks →
  matchers (`expect(r).toUse("Bash")`) for runner-native ergonomics, but it's
  optional sugar over the same checks.
- **Raw `Trace` stays first-class.** Checks are for composition + serialization,
  not a mandatory wrapper — `r.toolCalls`, `r.output`, `r.file()` remain the
  primary, smallest surface. (The honest reframe from the assertion-surface
  discussion: lead with the fields; checks/matchers are sugar.)
- **3 tiers, egress as a capability.** `vigiles/unit` (no-model `run`),
  `vigiles/integration` (real-`claude` `run`, `{ egress }` opt-in),
  `vigiles/eval` (`measure`). The import path stays a capability contract; the
  near-empty `e2e` barrel disappears.

### Options considered (and why C wins)

| Option                                              | Det + non-det unified | Serializable (CI/baseline/bridge) | Messages | Effort |
| --------------------------------------------------- | --------------------- | --------------------------------- | -------- | ------ |
| **A** — Trace-first + thin matchers (minimal)       | no (two surfaces)     | no                                | ok       | low    |
| **B** — fluent `expect(trace).toUse(...).and(...)`  | awkward (chain split) | **no** (chains are code)          | great    | medium |
| **C** — declarative checks + two evaluators ✅      | **yes**               | **yes**                           | great    | high   |
| **D** — property/invariant layer for hooks (add-on) | n/a (orthogonal)      | n/a                               | n/a      | low    |

- **A** is the safe non-revamp; it leaves det/non-det as two surfaces and gives
  up serialization.
- **B** (a Chai/Vitest fluent chain) has the best ergonomics but chains are
  **code, not data**, so you lose JSON/JUnit/baseline/bridge — and a strict-vs-
  scored chain is clumsy.
- **C** is the recommendation: checks-as-data is the one design that unifies the
  two worlds _and_ unlocks CI/regression/bridge, with the fluent veneer layered
  on for ergonomics.
- **D** is orthogonal and cheap: a `property()` layer that fast-check-style
  fuzzes a hook's `(event) → decision` for invariants ("never both allow and
  block"). Pairs with any option; high-value for hook robustness. Recommend as an
  add-on to the unit tier.

**Recommendation: C as the core + D as a unit-tier add-on, on 3 tiers with egress
as a capability of integration.**

---

## Migration (clean break — no users to protect)

1. Keep `Trace` exactly as-is (it's the right substrate) and **document it as the
   primary surface**.
2. Add `vigiles/check` — the check vocabulary (`tool`/`skill`/`output`/
   `hookFired`/`wrote`/`trigger`/…), each a pure `{ eval, toJSON }`. Fully
   unit-testable, no model.
3. Add the two evaluators: `expect(trace, checks)` (strict, throws) and
   `measure(spec, { trials, checks })` (scored ± se, reuses today's
   `measureTriggerRateWith` aggregation + `stats.ts`).
4. Replace the predicate/`assert*`/matcher trio with: raw fields (primary) +
   checks (composition) + a generated matcher veneer (`vigiles/vitest`,
   `vigiles/jest`).
5. Fold `e2e` into `integration` (`run(spec, { egress })`); drop the `vigiles/e2e`
   barrel.
6. Wire `checks.toJUnit()` / `report.toJUnit()` into CI + the committed baseline,
   and expose the same checks to the promptfoo provider bridge.

## Risks / counterpoints

- **Indirection.** Checks add a layer over raw field access — mitigated by
  keeping `Trace` fields first-class and primary; checks are opt-in for
  composition/serialization.
- **Veneer quality.** The matcher veneer must carry the checks' messages, or it's
  worse than `node:assert`. Test the messages, not just the pass/fail.
- **Scope creep.** Checks are the _assertion_ layer, not a dataset/scorer
  platform — that stays promptfoo's lane (per `eval-api-landscape.md`'s
  don't-rebuild-the-eval-stack decision). `measure` reuses existing aggregation;
  it does not grow a dashboard.

## See also

- `research/eval-api-landscape.md` — eval _infra_ features, the scorecard, and the
  shipped B/A/C status (this doc is the API-_shape_ complement).
- `research/promptfoo-deep-dive.md` — the assertion-as-data model this borrows.
- `research/fp-for-agent-harness.md` — the property-testing-for-hooks idea
  (Option D) and the Result/Validation framing.
- `docs/harness-testing.md` — the current tier model + runner-agnostic usage the
  revamp would replace.
