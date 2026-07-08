---
status: active
topic: eval
---

# Eval coverage & isolation — what vigiles tests, how, and what it delegates

> Status: **decided** (2026-06-17). The single source of truth for the question
> "across the whole space of real-world skills/hooks/agents, what can vigiles
> test, at what cost, with what isolation — and where does it hand off to a
> container?" Consolidates a survey of popular community plugin collections and an
> audit of a ~90-artifact real-world production skill set, blended with the
> eval-field landscape. Companion to [`eval-architecture.md`](eval-architecture.md)
> (the mechanism + roadmap), [`cross-platform-sandboxing.md`](cross-platform-sandboxing.md)
> (the ephemeral run env + the OS-isolation port), and
> [`skill-eval-landscape.md`](skill-eval-landscape.md) (how labs/practitioners eval).

## TL;DR — the shape of the answer

A survey of popular community plugin collections **and** an audit of a
~90-artifact real-world production skill set **converge** on the same three-rung
distribution: **R1 ≈ 48–90%, R2 ≈ 10–43%, R3 ≈ 0–9%.** Net: **R1+R2 covers
~90%+** of real plugin surface with **no Docker, on the subscription**; the R3
apex is **thin** and collapses to a handful of real services (a browser, a
relational DB, redis, an analytics DB). So the highest-leverage build is a
**PATH-shim / record-replay helper** (fake-on-PATH), not a testcontainers
integration — that unlocks the ~43% R2 with no Docker and covers far more real
plugins than container provisioning would. vigiles **composes** with a container
at R3; it does not reinvent the sandbox, and it does **not** pretend to do
containerless reproducible e2e (nobody can — see the landscape below).

## The three-rung model

Every skill/hook/agent decomposes into a deterministic part and a behavioral
part (the `feature = test + eval` decomposition in
[`eval-architecture.md`](eval-architecture.md)). Orthogonally,
what a test needs from the _outside world_ sorts onto three rungs. **Prefer the
lowest rung that faithfully measures the thing under test.**

| Rung   | What it needs                                                                                 | Mechanism                                                                                                                                                                       | Cost / deps                            |
| ------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **R1** | nothing executes — no tool/service/container                                                  | hook-fires (`runHook`), trigger-rate recall+precision (`measureTriggerRate`), tool-contract / `notTool`                                                                         | free or sub-priced; ms-fast; no Docker |
| **R2** | a tool/MCP/API **result**, not the live service                                               | the deterministic logic consumes a result that is **recorded ONCE** from a real tool and **replayed** by shadowing the binary on PATH / stubbing the MCP — no live service runs | sub-priced; ms-fast; no Docker         |
| **R3** | the **real** system's semantics IS what's under test (or output can't be faithfully recorded) | the real disposable service/container — real SQL vs a real schema, a real browser, a real DB/redis/analytics engine                                                             | needs Docker; seconds of cold-start    |

The classifier is mechanical: **"calls a tool" = R1** (you assert the call/args,
you don't need the result); **"needs the result to proceed" = R2** (record the
result once, replay it); **"the real system's behavior is the thing being
verified" = R3** (you can't fake real SQL semantics or a real browser layout).

## The second axis: the correctness oracle (and where prose skills fit)

The three-rung model answers **one** question — _what does the test need from the
outside world?_ It does **not** answer a second, orthogonal question that decides
the **cost**: _what is the correctness oracle — who decides pass/fail?_ Conflating
the two is the trap that makes a prose skill look "R1, therefore cheaply covered"
when it isn't. There are two axes:

- **Axis 1 — external dependency (R1/R2/R3):** does anything execute, and if so a
  recorded result (R2) or a real service (R3)? (the table above.)
- **Axis 2 — the oracle:** can a **deterministic check** decide the verdict (a hook
  block/allow, a tool-contract violation, a structural fact — **free, no model, in
  CI**), or does only a **real model** make the judgment (does a description
  **fire**? does prose guidance **change behavior**? is the output **good**, judged
  by rubric — **runs on your subscription**, not metered API)?

We tag a model-gated artifact with the **`-MG` suffix** on its dependency rung:
**`R1-MG`** = nothing executes _but_ the oracle is a model (the common case — a
prose skill, a description's trigger-rate, an agent's judged review); **`R2-MG`** =
the **model** decides to shell out and we replay the result (e.g. a skill the model
chooses to run that calls `gh`). The suffix is what the dogfood scorecards under
[`../examples/harness/vendor/`](../examples/harness/vendor/) use.

**Where a prose skill fits (the question that prompted this):** a pure-guidance
skill (superpowers' TDD/debugging, a "write a good commit message" skill) is
**`R1-MG`** — dependency-axis **R1** (nothing executes; its description and body
are just text), oracle-axis **model-gated** (its _worth_ is "does the agent
actually go test-first / find root cause?", which only a model can judge). It is
**not** uncovered and it is **not** free: vigiles tests it on your subscription via
`measureTriggerRate` (does the description fire, recall + precision) and a judged
behavioral eval (does following the prose move the output). The cheap tiers prove
it **loads and its hook fires**; proving the **guidance works** is the model-gated
eval tier — and that is the honest boundary, not a coverage hole.

## What vigiles can and can't test (the three buckets)

Folding both axes together gives the boundary to state plainly — publicly and
internally — so nobody mistakes "model-gated" for "uncovered":

| Bucket                          | = axes                       | Cost / where it runs                              | vigiles?                           |
| ------------------------------- | ---------------------------- | ------------------------------------------------- | ---------------------------------- |
| **A — Free & deterministic**    | R1/R2 + deterministic oracle | free, no model, **every commit / CI**             | ✅ owns it                         |
| **B — Model-gated on your sub** | (R1/R2)-MG + model oracle    | real model, **no metered API** — your Pro/Max sub | ✅ owns it (the affordability bet) |
| **C — Needs a real service**    | R3                           | needs Docker; seconds of cold-start               | 🔗 **composes** with a container   |

**A + B = "testable by vigiles"** — free in CI _or_ on the subscription you already
pay for. **C is the only thing vigiles does not run itself**; it composes with a
container at the hand-off and does not reinvent the sandbox. So the honest,
non-confusing way to grade a plugin is **two numbers, not three**: **"% testable at
all (A + B, free + sub)"** vs **"% that needs a container (C)"**. A prose-skill
library scores ~100% testable / ~0% needs-a-container (it's just that most of its
testable surface is bucket B, the sub-priced half); an accessibility/browser plugin
is the worst case, with a large bucket C. Reporting only the single dependency rung
hides which half of "testable" is free vs sub-priced — always say the bucket.

## Record-replay, not LLM-synthesis

The R2 rung is **record-replay (a VCR/cassette pattern), never model-synthesized
stubs.** Do **not** have a model generate the stub outputs: that is the
drift/version-fidelity trap — a synthesized GitHub API body or `git status`
output looks plausible, diverges from the real tool/version, and produces **false
confidence** (a green test against a fiction). Capture the result **once** from
the real tool at a known version, then **replay it deterministically** by
shadowing the binary on PATH (a fake `gh`/`git`/`curl` earlier in PATH that
emits the recorded fixture) or stubbing the MCP endpoint. This reuses the eval
cache's existing record/replay machinery (`src/eval-cache.ts`) — record once, pay
once, replay free. Author-written fixtures are fine **only** for trivial cases
(a one-line status string); anything with real structure is recorded, not
hand-written and not synthesized.

## Coverage distribution (blended, scrubbed)

Across the popular community collections **and** the ~90-artifact production
skill-set audit, the rung distribution is consistent:

- **R1 ≈ 48–90%** — most surface is fire/trigger/contract/safety, testable with
  no tool at all.
- **R2 ≈ 10–43%** — the deterministic logic consumes a recorded tool/MCP/API
  result, replayed.
- **R3 ≈ 0–9%** — genuinely needs a real disposable service.

**Net: R1 + R2 covers ~90%+** of real plugin surface, all **without Docker and on
the subscription**. The R3 apex is **thin** and collapses to a short, finite list
of real services — a browser, a relational DB, redis, an analytics DB. Crucially,
**every common SaaS/CLI integration** — GitHub, issue trackers, chat, CI, linters,
test-runners — is **faithfully replayable at R2** (its output is a stable
recordable artifact), so it never forces a container. R3 is reached only when the
real system's _semantics_ are the thing under test.

## The e2e landscape (correct + honest)

Real e2e side-effecting eval is **common and mature** — it is not an unsolved
problem and vigiles should not claim to have invented it. The field:

- **Benchmarks:** SWE-bench / SWE-bench-Verified, Terminal-Bench, OSWorld,
  WebArena.
- **The labs:** Codex runs each task in a **per-task cloud sandbox**; Anthropic
  runs side-effecting agent evals internally.
- **Frameworks:** AISI **Inspect** ships a **Docker sandbox** for tool-using
  evals.

The load-bearing observation: **every one of these does it INSIDE a
container/VM/cloud sandbox.** There is **no popular "safe reproducible e2e
without a container."** Containerless reproducible side-effecting e2e is not a
gap competitors left open — it does not exist because it cannot be done safely.
So vigiles's position at R3 is: **compose with a container, do not reinvent it,
and do not pretend to do containerless reproducible e2e.** The container is the
disposable service provider; vigiles supplies the harness-loaded-as-shipped, the
`Trace`/check vocabulary, the affordability, and the clean hand-off.

## Chosen approach across axes

The crystal-clear part — how the three rungs sit on safety, viability, and
performance, plus the explicit non-goals.

| Axis            | R1                                         | R2                                         | R3                                                                  |
| --------------- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------- |
| **Safety**      | nothing executes — inherently safe         | fake outputs, **no real system touched**   | real side effects, **only inside an isolated disposable container** |
| **Viability**   | no Docker; runs on the sub; cross-platform | no Docker; runs on the sub; cross-platform | **needs Docker** (Linux-first; macOS via the OS-isolation port)     |
| **Performance** | ms-fast, deterministic                     | ms-fast, deterministic (replay)            | Docker cold-start is **seconds** — keep this tier THIN              |

Layered over all three rungs are the orthogonal protections from
[`cross-platform-sandboxing.md`](cross-platform-sandboxing.md): **provenance
confinement** (foreign code confined-or-refused), the **ephemeral run
environment** (throwaway CWD + HOME + scrubbed env — unconditional for
model-driven runs, no kernel features, cross-platform today), and
**`interceptTools`** (intercept-and-prevent the irreversible external before it
fires). R3's container is the _fourth_ layer, reached only when the real system's
semantics are under test.

**Explicit NON-GOALS** (state them so nobody relitigates):

- **Containerless reproducible e2e** — does not exist; we compose with a container
  at R3 instead of faking it.
- **Per-host egress on macOS** — Seatbelt can't packet-filter per host; macOS
  degrades honestly to deny-all-net (Linux keeps the `nft` wall).
- **Vendor MCP connectors' live semantics** — verifying that a vendor's hosted
  connector behaves is the vendor's job; vigiles verifies the _reference_ and
  replays a _recorded_ result.
- **Becoming a sandbox / container orchestrator** — vigiles composes with Docker /
  the OS-isolation backends; it does not build a new one.

## Competitor comparison

| Class                  | Examples                               | What they do                                                                                                 | What they can't                                                                                                   |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Completion-graders** | promptfoo, DeepEval, Braintrust        | grade a model completion; assertions / scorers / datasets                                                    | **metered API** every run; **no real-harness load** (rebuild an agent from YAML/SDK); **no cheap no-model tiers** |
| **Containerized e2e**  | SWE-bench, AISI Inspect, Codex sandbox | faithful real side-effecting runs inside a container/VM/cloud sandbox                                        | heavy; metered; infra/Docker every run; not the assembled _consumer_ harness as-shipped                           |
| **vigiles**            | —                                      | owns **R1 + R2** (free/sub-priced, no Docker) + **sub-affordability** + a **clean container hand-off at R3** | the apex e2e is delegated to a container — we don't reinvent the sandbox                                          |

**The unclaimed seam vigiles owns:** R1 + R2 + subscription pricing +
compose-with-a-container at R3 — **NOT** "e2e without a container" (that seam is
empty because it's impossible). Completion-graders can't load the real harness or
reach the no-model tiers; containerized-e2e is faithful but heavy and metered.
Nobody packages the cheap deterministic + record-replay tiers _with_
sub-affordability _and_ a clean container hand-off.

**The sub-affordability story is ToS-clean.** vigiles drives _your own_ `claude`
CLI to test _your own_ harness on _your own_ subscription — identical to running
Claude Code yourself. The Claude Agent SDK's ToS restricts _productizing_ claude.ai
login/limits inside a third-party offering; running your own tests on your own sub
is the supported posture, not that. So "real-model evals on the subscription" is a
deliberate, allowed design point, not a loophole. See
[`sdk-harness-testing.md`](sdk-harness-testing.md) (the 2026-06-17 probe) for the
ToS detail and the per-SDK affordability column.

## Dogfood results — the three vendored plugins

The model is dogfooded against the three real pinned plugins under
`examples/harness/vendor/`, with a per-plugin scorecard recording every artifact's
rung, what a proper eval would need, and whether a free test was written. The
runnable R1/R2 tests live in `src/adapters/claude-code/vendor-coverage.test.ts`
(model-free, in CI), complementing `vendor.test.ts` (loadPlugin invariants),
`agent-runtime.test.ts` (the inherits-all rail), and `run-hook.test.ts` (the
bwrap-gated OMC egress/fs checks). Scorecards:

- [`../examples/harness/vendor/oh-my-claudecode.COVERAGE.md`](../examples/harness/vendor/oh-my-claudecode.COVERAGE.md)
  — ~60% free/deterministic, ~33% model-gated, ~7% R3 (live MCP). **Grade B+.**
- [`../examples/harness/vendor/superpowers.COVERAGE.md`](../examples/harness/vendor/superpowers.COVERAGE.md)
  — ~50% free, ~50% model-gated (a prose-skills library — its worth is behavioral),
  ~0% R3. **Grade B.**
- [`../examples/harness/vendor/wshobson-accessibility.COVERAGE.md`](../examples/harness/vendor/wshobson-accessibility.COVERAGE.md)
  — ~30% free (incl. the inherits-all agent footgun), ~25% model-gated, ~45% R3 (a
  real browser / a11y scanner / assistive-tech runtime — the genuine worst case for
  cheap tiers). **Grade C.**

Read as the two-number rollup (bucket A+B vs C): OMC ≈ **93% testable / 7%
needs-a-container**, superpowers ≈ **100% / 0%**, wshobson ≈ **55% / 45%**. The
container number is the only surface vigiles hands off; the rest splits between free
(A) and sub-priced (B).

The honest finding across the three: the cheap tiers comprehensively cover the
**deterministic spine** (hook decisions, tool-contracts/footguns, structure,
shell-out logic via PATH stubs) for free; what they cannot substitute for is the
**behavioral** half (does a description fire, does prose guidance change behavior,
does the audit find real violations) — model-gated on the subscription for prose
skills, and genuinely R3 for the accessibility plugin's browser/AT semantics. The
R3 shortlist collapses to exactly what the model predicts: a headless browser, an
a11y scanner, and a live MCP endpoint.

## Verdict for the build

A **PATH-shim / record-replay helper (fake-on-PATH)** is **higher leverage**
than a testcontainers integration. The coverage distribution is the
justification: the helper unlocks the **~43% R2** with **no Docker** and covers
**far more real plugins** (every GitHub/issue-tracker/chat/CI/linter/test-runner
integration) than container provisioning would. Real-service provisioning stays a
**thin, composed apex** — wired in for the handful of R3 services (browser /
relational DB / redis / analytics DB), not built out as the main event. Build R2
first; compose R3.

## Appendix — the rung-classifier prompt (reusable)

A generic prompt to audit any plugin/skill archive and produce a rung
distribution. Harness-agnostic; names no specific artifact.

```text
You are auditing a collection of agent skills / hooks / commands to decide how
each can be TESTED and at what cost. For every artifact, assign exactly one rung:

- R1 (cheap / deterministic — NOTHING executes): the test only needs to check
  that something FIRES or that a CALL is made with the right arguments — a
  hook's block/allow decision, a skill description's trigger (recall + precision),
  a tool-contract / "did NOT call the forbidden tool" safety check. Rule of thumb:
  "calls a tool" = R1 (assert the call/args; you don't need the result).

- R2 (stub / record-replay — a tool/MCP/API RESULT is needed, not a live service):
  the deterministic logic must CONSUME a tool/MCP/API result to proceed. Record
  that result ONCE from the real tool at a known version, then REPLAY it (shadow
  the binary on PATH / stub the MCP). NEVER synthesize the stub with a model
  (drift/false-confidence). Rule of thumb: "needs the result" = R2.

- R3 (real disposable service / container): the REAL system's semantics IS what's
  under test, or the output can't be faithfully recorded — real SQL vs a real
  schema, a real browser, a real DB/redis/analytics engine. Rule of thumb: "real
  semantics under test" = R3. Reach this rung only when R1/R2 cannot faithfully
  measure the thing.

PREFER THE LOWEST RUNG that still faithfully measures the artifact.

Output:
1. A table: artifact | rung | one-line justification.
2. The rung distribution as percentages (R1 / R2 / R3).
3. An R3 shortlist: the specific real services the R3 artifacts actually need
   (expect a short, finite list — a browser, a relational DB, redis, ...).
```
