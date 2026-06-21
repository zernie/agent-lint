<!-- vigiles:ignore-file -->

# Benchmark methodology — how vigiles measures "what actually works"

> Status: v0 (2026-06-20). The README has the pitch (vigiles is the empirical
> authority on what makes agentic coding work); this is the **method** behind the
> measurement — the contestable part a benchmark lives or dies on. Grounded in the
> first worked instance, the P0 caveman measurement
> (`bench/evals/caveman-claim.eval.mjs`). Feeds the two P1 measurement products:
> the **ecosystem benchmark** (rank hyped skills) and **`vigiles optimize`**
> (per-repo recommendations). See [`measurement-authority.md`](measurement-authority.md)
> for the strategy and [`roadmap.md`](roadmap.md) for priority.

A benchmark is only as trustworthy as its method. The whole pitch ("measured ≪
claimed") collapses if the method is gameable or unstated. So the method is
published, not the scores alone — anyone can re-run it on their own subscription
and check.

## 1. The unit: an A/B over one real task

Every measurement is an **A/B on the SAME task**: one arm with the thing under
test (a skill, a model, a rule set), one arm without (the baseline). The harness
is loaded **as it ships** (real `claude` CLI, real system prompt, the skill
injected exactly as a user installs it). The signal is the **delta** between arms,
not an absolute — absolutes drift with model and task, deltas are comparable.

This is `runEval`'s existing shape (arms × trials → mean ± se). It is NOT a
prompt eval: the unit under test is the assembled harness, which is what a generic
YAML-configured eval runner cannot reproduce.

## 2. What counts as a "real task"

A benchmark task is not a trivia question. It must be:

| Property                     | Why                                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Self-contained**           | Reproducible on any machine — seed inputs ship with the task.                                                                           |
| **Checkable**                | Produces an artifact (a file, an `ANSWER:` line) a predicate scores 1/0 — so correctness is deterministic, not model-judged.            |
| **Exercises the behavior**   | Invites the thing under test (a compression skill needs a task that emits compressible prose; a refactor skill needs code to refactor). |
| **Agentic, not single-shot** | Reads files / uses tools, so the token profile matches real coding (input + cache dominate), not a one-shot Q&A.                        |
| **Cheap at N trials**        | Small enough to run ≥3× per arm without a prohibitive bill.                                                                             |

The P0 corpus models this: each task seeds a file, asks the model to read it and
write a checkable artifact (a function, a fix, a Big-O answer), and explain. The
explanation is the compressible surface; the artifact is the fact that must
survive.

## 3. The metric triple — bill, target, blast radius

A single headline number is how vendors mislead. Measure **three**, always:

1. **The bill — `costUsd`** (`total_cost_usd` from the run). This is the honest
   cost: it already weights cache reads ~0.1× and output ~1×, so it doesn't let a
   "saved tokens" claim hide behind cheap cache. **The bill is the metric a
   recommendation is made on.**
2. **The optimization target** — whatever the thing under test claims to move
   (output tokens for a compression skill, latency for a routing change, tool
   calls for a planning skill). Verify the claim on its own terms.
3. **The blast radius — correctness.** A deterministic 1/0 the task's `check`
   returns. A win on metric 1 or 2 that regresses correctness is **not a win** —
   the eval throws/flags it. This is the column a headline never shows.

The load-bearing finding from P0: the target (output tokens) is a **single-digit
%** of a real coding session's tokens, so even a large cut on the target barely
moves the bill. **Measuring only the target overstates the win by ~10–50×.** Hence
the bill, separately, is mandatory.

## 4. Aggregation + significance

- **Trials per arm** (≥3) because a single run is noisy — cache and tool-use vary
  run-to-run. Report mean ± se.
- **Significance, not eyeballing.** A delta is only real if it clears the noise
  floor: Welch's t-test over the per-arm summary stats (`stats.ts`,
  `assertSignificant`). "caveman cut cost 4%" means nothing without the se.
- **Per-repo / per-task variance is the headline caveat.** A skill that helps on
  one task can hurt on another (the P0 corpus already shows per-task sign flips on
  output). So a benchmark reports the **distribution across tasks**, not one mean
  — and `vigiles optimize` measures on **your** tasks, because the ecosystem mean
  may not hold for your repo.

## 5. Affordability (why this is runnable at all)

Every run is the user's own `claude` CLI on their **Pro/Max subscription**
(`apiKeySource: "none"`) — no metered API billing. P0's pilot: 4 real haiku runs,
cents. This is the structural reason vigiles can run a benchmark a competitor
(per-token API billing) cannot afford to. Model lives in the spec (haiku for a
cheap v0 sweep; sonnet/opus — a skill's target models — for the rigorous pass).

## 6. What makes it credible (and contestable)

- **Published tasks + published metric** → reproducible. Anyone re-runs and checks.
- **Deterministic correctness** (a `check` predicate, not an LLM judge) → no
  grader to dispute on the blast-radius column.
- **The method is the product**, not the leaderboard snapshot. A score without
  this method is marketing; a score with it is evidence.

## See also

- [`measurement-authority.md`](measurement-authority.md) — the strategy this serves.
- [`bench/evals/caveman-claim.eval.mjs`](../bench/evals/caveman-claim.eval.mjs) —
  the first worked instance (the P0 caveman measurement).
- [`bench/ecosystem/`](../bench/ecosystem/) — the A1 ecosystem-benchmark v0: the
  generalized loop (`benchmark.mjs`) over a real, SHA-pinned skill manifest
  (`skills.mjs`, provenance in `SOURCES.md`), reusing this exact method over a SET
  of skills. Pilot: `VIGILES_SKILLS=caveman VIGILES_TASKS=2 VIGILES_TRIALS=2 node
bench/ecosystem/benchmark.mjs`.
- [`eval-api-landscape.md`](eval-api-landscape.md) — the eval infra (cost/cache
  capture, significance, regression gating) this method runs on.
- [`skill-eval-landscape.md`](skill-eval-landscape.md) — prior-art skill evals
  (AWS sample-agent-skill-eval) this absorbs trigger-precision + scorecard ideas from.
