# Eval coverage & isolation — what vigiles tests, how, and what it delegates

> Status: **decided** (2026-06-17). The single source of truth for the question
> "across the whole space of real-world skills/hooks/agents, what can vigiles
> test, at what cost, with what isolation — and where does it hand off to a
> container?" Consolidates a survey of popular community plugin collections and an
> audit of a ~90-artifact real-world production skill set, blended with the
> eval-field landscape. Companion to [`../docs/eval-architecture.md`](../docs/eval-architecture.md)
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
[`../docs/eval-architecture.md`](../docs/eval-architecture.md)). Orthogonally,
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
