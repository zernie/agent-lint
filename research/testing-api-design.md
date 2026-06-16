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
declarative `check` vocabulary, two evaluators (strict / scored), and two execution scopes over a static lint floor (not four tiers).**

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

The layer names (unit / integration / e2e / eval) are **borrowed from app
testing, not derived from the harness**, and that's why they don't sit right.
Derive them instead from two real axes: **scope** (what's under test) and
**capability** (what the test needs to run).

### The harness only has two execution scopes

A Claude Code harness has two _structurally_ different things you can run:

- A **hook** is a standalone process — `(event JSON) → decision`. You can execute
  it **in isolation** (`runHook`). It's the _only_ surface that's independently
  runnable.
- **Everything else** — skills, CLAUDE.md, settings, subagents, commands, MCP —
  is **not independently runnable**. A skill description only does something when
  a live agent is choosing skills; a CLAUDE.md rule only acts inside a running
  turn. The only way to exercise their _behaviour_ is to run the **whole
  assembled agent**.

So there are two scopes — **hook** and **harness (the whole agent)** — plus a
**static floor** for the non-hook surfaces that can't be executed in isolation at
all: "does the skill load / have a description / do its refs resolve / does the
agent's tool contract hold" — which is the **lint pillar** + `skills-dogfood`, not
a runtime tier.

### "unit only works with hooks" — that's structural, not a missing capability

`runHook` is hooks-only because hooks are the only executable surface, **not**
because it lacks a capability — it's the capability **floor** (needs nothing). The
isolated tier for a _non-hook_ surface isn't a runtime test at all; it's the
**static** check (lint). There is no "unit test a skill's behaviour" because a
skill has no behaviour outside a live agent. So: hooks get a behavioural unit
tier; everything else gets a _static_ isolated tier (lint) and a _behavioural_
tier only at harness scope.

### Each higher layer adds exactly one capability — that's the whole ladder

| Tier (today)             | Scope   | Capability it adds over the one below   |
| ------------------------ | ------- | --------------------------------------- |
| `runHook` (unit)         | hook    | — (the floor: nothing)                  |
| `runHarnessTest` (integ) | harness | spawn `claude` + serve a **mock** model |
| e2e                      | harness | **real egress** through a sandbox       |
| `runEval` (eval)         | harness | a **real model** + API key              |

Read down the **Scope** column: **integration, e2e, and eval are all the same
scope** — the whole assembled agent. They differ only by _realness knobs_: the
model (mock → deterministic; real → measured) and the network (confined →
real-egress). That's exactly why they feel redundant — **they are one tier with
capability flags, not three kinds.**

### Your integration-vs-e2e instinct, resolved

In app testing, "integration" means a few components wired together (often real
local IO) and "e2e" means the full system through real external interfaces. By
that definition vigiles's **"integration" is misnamed**: `runHarnessTest` runs the
**entire real system** (the `claude` binary + every hook/plugin/setting) with only
the _model_ swapped for a deterministic double. That's not classic integration —
it's **"e2e with the model stubbed."** And there's no genuine classic integration
tier to be had, because the harness doesn't decompose into integratable
components (a hook in the machine isn't "two components talking"; it's the whole
agent running).

But the conclusion isn't "drop integration, keep e2e." The value of
`runHarnessTest` isn't that it's a _middle_ tier — it's that it's the
**deterministic whole-system run** (mock model → no key, repeatable, gate every
commit). e2e (real egress) and eval (real model) are _more-real variants of the
same whole-system scope_. You keep the deterministic run as the workhorse and add
realness on top; you don't replace it with the privileged/paid variants.

### The derived model

> **Two execution scopes — `hook` and `harness` — over a static `lint` floor; the
> harness run carries the realness as capability flags (`model: mock | real`,
> `egress`), and the flag picks the verdict mode** (mock → strict assert; real →
> scored ± se, from Part 3).

Concretely that's: `vigiles lint` (static floor) · `runHook` (hook scope) ·
`runHarness(spec, { model, egress })` (harness scope) — one entry that subsumes
today's integration + e2e + eval. The capability ladder (and its CI legibility —
you can't hide a `$`/network test in the free gate) is **preserved**; the
redundant _named_ tiers (`integration` vs `e2e` vs `eval` as separate barrels)
collapse into flags.

### Same story for the assertion surface

It's **1 vocabulary expressed 3×**: every `Trace` concept appears as a bare
predicate (`usedTool`), a throwing assert (`assertToolUsed`), and (for 3) a
matcher (`toBlock`) — ~40 exports for a handful of fields plus a few helpers, most
one-liners over public `Trace` fields (`usedTool(t, "Bash")` ≡
`t.toolCalls.some(c => c.name === "Bash")`). Same cure: collapse to **one check
vocabulary, two evaluators** (Part 3), with raw `Trace` fields primary.

**Both fixes are the same move:** keep the capability _ladder_ (it's the real
value); shed the redundant _named_ expression of it.

---

## Part 5 — The ideal API (recommended shape)

A declarative **check** vocabulary over `Trace`, two evaluators, an optional
fluent veneer — over **two execution scopes (`runHook`, `runHarness`) and a static
`lint` floor** (Part 4), with realness as flags, not tiers.

```ts
// ONE vocabulary — each check is DATA: { eval(trace) → {pass, score, message}, toJSON() }
import { tool, skill, output, hookFired, wrote, trigger } from "vigiles/check";
import { runHook, runHarness, expect, measure } from "vigiles/testing";

// --- hook scope: execute one hook in isolation, no agent, no model ---
expect(runHook(hook, event), [hookFired("PreToolUse")]); // strict, throws

// --- harness scope, mock model → DETERMINISTIC (strict). egress is a flag. ---
const r = await runHarness(spec, { model: "mock", egress: true });
expect(r, [tool("Bash"), output(/done/)]); // gate every commit, no key

// --- harness scope, real model → MEASURED (scored). same checks. ---
const report = await measure(spec, {
  trials: 10,
  checks: [skill("vigiles:test-harness"), trigger({ min: 0.8 })],
}); // per-check rate ± se, pass^k, threshold verdict — report.toJUnit()
```

`model: "mock"` selects strict evaluation (deterministic assert); a real model
selects scored evaluation (the `measure` entry). Today's `integration`, `e2e`, and
`eval` are the **one `runHarness` scope** under different flags.

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
- **Two scopes + a static floor, not four tiers.** `runHook` (hook scope),
  `runHarness(spec, { model, egress })` (harness scope — subsumes integration /
  e2e / eval via flags), over the `vigiles lint` static floor. The import path
  still encodes the capability contract (`vigiles/unit` exposes no-model surface;
  the harness entry adds `claude`/egress/model), so you can't hide a `$`/network
  test in the free gate — but the redundant `integration`/`e2e`/`eval` barrels
  collapse into flags (Part 4).

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

**Recommendation: C as the core + D as a hook-scope add-on, over two scopes (runHook / runHarness) with egress
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

## Part 6 — Build plan (phased; additive before breaking)

Each phase ships green; the only thing to keep passing is our own suite +
examples (no external users). Lowest-risk first.

- **Phase 0 — `vigiles/check` vocabulary. ✅ SHIPPED.** The declarative checks
  (`tool`/`skill`/`output`/`hookFired`/`wrote`/`blocked`/`allowed`), each a pure
  `Check<T>` with `eval → {pass, score, message}` + `toJSON`, typed over `Trace`
  vs `HookRunResult`. `src/check.ts` (+ `src/check.test.ts`), exported at
  `vigiles/check` only (NOT folded into `vigiles/testing` yet — `hookFired`
  collides with the legacy predicate; reconciled in Phase 6). Additive, model-free.
- **Phase 1 — strict evaluator + matcher veneer. ✅ SHIPPED.** `assertChecks(target,
checks)` throws collecting **all** failures (Validation-applicative). ONE generic
  matcher covers the whole vocabulary — `expect(r).toPass(tool("Bash"))` /
  `toPassAll([...])` — carrying each check's message; vitest/jest type
  augmentations + cross-runner tests. Legacy surface untouched (Phase 6).
- **Phase 2 — `runHarness` (the harness-scope entry). ✅ SHIPPED.** The
  deterministic harness run (`model:"mock"`, wraps `runHarnessTest`); a real-model
  run is non-deterministic so a single one can't be asserted — `runHarness(spec,
{ model:"real" })` throws and points at `measure()`. (The e2e-barrel fold + a
  materialized real path stay for the breaking cleanup.)
- **Phase 3 — `measure(spec, { trials, checks })`. ✅ SHIPPED.** Scores a check
  vocabulary across trials → per-check rate ± se + pass^k, reusing `runEvalWith`
  (one arm). `measureWith` is the injectable-runner, unit-tested core; defaults to
  `model:"sonnet"`.
- **Phase 4 — serialization → CI. ✅ SHIPPED (lib half).** `checkReportToJUnit`
  (each check a `<testcase>`, fails below `min`) + `assertRates` (the scored gate)
  - `formatCheckReport`, off `checkLabel(check.toJSON())`. Pure + unit-tested.
    _Remaining:_ wire into the committed `eval-baseline` + the Action, and the
    promptfoo provider bridge.
- **Phase 5 — `propertyHook` (Option D). ✅ SHIPPED.** Invariant testing of a
  hook's `(event) → decision` over generated events, reusing `proofs.ts`
  `propertyTest` (seeded, shrinks; no fast-check dep); injectable `decide` runner.
- **Phase 6 — front-door the new surface; defer the mass deletion.** ✅ DONE:
  `docs/harness-testing.md` leads with checks (`assertChecks`/`measure`/`toPass`).
  **Deliberately NOT done:** ripping out the ~40 legacy predicate/`assert*`/matcher
  helpers + the `e2e` barrel and rewriting the ~900-test suite/examples/docs off
  them. On a no-users lib that's high-churn cleanup with **no functional gain**
  and real regression risk — the new surface is the recommended front door now;
  the legacy surface stays as working sugar and is removed in a single, separately
  reviewed major-version cleanup (resolving the `vigiles/check`↔`vigiles/testing`
  `hookFired` collision then). "Additive before breaking" — and the breaking step
  is the one to take slowly.

**Update (2026-06-16): the safe half of Phase 6 shipped.** `vigiles/check` folded
into `vigiles/testing` + `vigiles/unit` (the check `hookFired` wins via an
explicit re-export over the two `export *`s); `e2e` collapsed to a deprecated
alias with egress as a capability of `integration`. The legacy
predicate/`assert*`/matcher fronts were KEPT — at their true (small) blast radius
they proved to be context-appropriate surfaces (compose / node:test / vitest-jest)
unified _under_ the one check vocabulary, not redundancy; deleting them is churn
with no greatness gain. The full barrel rename stays a major-version cleanup.

## Part 7 — Greatness re-evaluation + the eval-side gaps (post-cleanup)

**Is it great?** On the two things that decide it — yes. (1) _Unification_: one
`Trace`, one `check` vocabulary, two evaluators (`assertChecks` strict /
`measure` scored), serialized for free (`toJUnit`), runner- and harness-agnostic.
(2) _The moat_: the deterministic sub-model tiers (`runHook` / `runHarness`-mock,
no key) that promptfoo/DeepEval/Inspect structurally can't have, plus pass^k +
significance and real-harness fidelity. The surface is coherent and discoverable;
raw `Trace` stays primary; a single matcher (`toPass`) fronts the whole vocabulary.

**Extensibility.** Adding a check is trivial (`Check<T>`); adding a harness is an
adapter bundle; adding a tier is a capability flag. One real seam to watch: the
`Check.eval` is **synchronous**. That's fine for deterministic checks and even for
a `judge()`-backed one (`judge` blocks via `execSync`), but a future _async_
scorer (a streaming judge, an HTTP grader) would not fit — if that arrives, add an
`AsyncCheck` (`eval → Promise<CheckResult>`) consumed only by `measure`, never by
the strict `assertChecks`.

**Gaps — ranked, eval-side first. Update (2026-06-16): 1–3 + the cheap part of 4
SHIPPED; the harness axis added.**

1. **`judged(rubric, { min })` — model-graded check. ✅ SHIPPED.** A `Check<Trace>`
   that grades `trace.output` against a rubric via an **injectable** `judge` fn
   (default the real `judge()`, which blocks via `spawnSync`, so it fits the sync
   `eval`). Composes into `measure`/`assertRates`/`toJUnit` like any check —
   closes the promptfoo `llm-rubric` / DeepEval `GEval` parity gap. Unit-tested
   with a fake judge (no model).
2. **`cost()` / `latency()` / `tokens()` checks. ✅ SHIPPED.** `Check<UsageTrace>`
   over a run's `usage` (eval tier only), so `measure` can gate `cost({ maxUsd })`
   etc. alongside behavioural checks. `measure.checks` widened to `Check<RunContext>`.
3. **Checks × A/B arms + significance. ✅ SHIPPED.** `measureArms(spec, { arms,
checks })` scores the SAME checks per arm; `compareCheck(report, baseline, arm,
i)` returns a Welch `Comparison` (reuses `stats.ts`). The harness-A/B moat (hook
   ON vs OFF) now reads as a per-check significance, not a hand-fed delta.
4. **Multi-surface CC eval — the deepest gap (mostly SHIPPED).**
   - `mcp(server, tool)` ✅ — matches `mcp__server__tool` in the tool list.
   - **Subagents (`Task`) as nested traces ✅** — `Trace.subagents` recovers each
     subagent's tool calls (CC tags them with `parent_tool_use_id`; the `Task`
     input carries `subagent_type`), and `subagent(name, [checks])` runs the whole
     vocabulary recursively over that sub-trace, so you can assert what the
     subagent _did_. `parseSubagents` is unit-tested on synthetic stream-json;
     **wants one real-CC-subagent run to confirm the field names** (`parent_tool_use_id`
     / `subagent_type`) against current output.
   - Still open: **slash-command expansion** (pre-model; needs mock-prompt
     capture) and **multi-turn conversations** (`measure`/`runEval` give a single
     task) — both want per-turn slices.
5. **Trace fidelity on the real-model tier.** `modelRequests` is **mock-tier only**
   — on a real `runEval` you cannot assert _what reached the model_; no
   thinking/per-turn capture. Largely inherent to the real API.
6. **CC-feature drift.** New hook events / surfaces must be tracked in `HookFire`
   parsing + the dialect — ongoing maintenance.

**The harness axis (different harnesses). ✅ Verified + documented.** The check
vocabulary is **harness-agnostic by construction** — every check reads generic
`Trace` fields (`toolCalls`/`hooks`/`output`/`turns`/`file`), never a Claude-Code
shape, so it evaluates correctly over a Codex-shaped (sparse) Trace: `output`
passes, `tool`/`hookFired` fail gracefully rather than throw (a unit test pins
this). The **runners** already dispatch per-harness via the adapter
(`runHarness`/`runHarnessTest` take `{ adapter }`); the **eval tier**'s
convenience (`measure`/`runEval`) defaults to Claude Code, but `measureWith`/
`measureArmsWith`/`runEvalWith` take an **injectable runner**, so a Codex eval
injects a Codex `AgentRunner` over the same checks. The one remaining harness-axis
item: an adapter-dispatched `measure()` convenience (today it's the injectable
seam, not a built-in Codex default), plus a richer Codex `parseRun` so `tool`/
`skill` checks have a populated trace there.

**Recommended next bet:** #4's nested-trace `Trace` model (subagents/turns) — the
genuinely new capability — now that 1–3 made `measure` a promptfoo-class scored
evaluator. 5–6 + the eval-tier adapter convenience are opportunistic.

## See also

- `research/eval-api-landscape.md` — eval _infra_ features, the scorecard, and the
  shipped B/A/C status (this doc is the API-_shape_ complement).
- `research/promptfoo-deep-dive.md` — the assertion-as-data model this borrows.
- `research/fp-for-agent-harness.md` — the property-testing-for-hooks idea
  (Option D) and the Result/Validation framing.
- `docs/harness-testing.md` — the current tier model + runner-agnostic usage the
  revamp would replace.
