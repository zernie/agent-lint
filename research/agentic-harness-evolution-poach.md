# Poach: "Agentic Harness Engineering" (AHE) — for the optimize / measure / evolve line

> Deep-read + poach of arXiv:2604.25850 ("Agentic Harness Engineering:
> Observability-Driven Automatic Evolution of Coding-Agent Harnesses", Fudan/PKU,
> 30 Apr 2026; OSS repo `github.com/china-qijizhifeng/agentic-harness-engineering`).
> Saved here because it's the academic, peer-grounded version of vigiles's
> optimize/measure/evolve line — it validates the approach AND hands us a concrete
> mechanism for the still-unbuilt "measured half" of the optimizer.

## What it is (1 paragraph)

AHE is a **closed loop that auto-evolves a coding-agent harness** from observability
alone (base model frozen). Three "observability pillars": (1) **component
observability** — every editable harness component (system prompt, tool desc, tool
impl, middleware, skill, sub-agent config, long-term memory) is a **file-level,
git-versioned, revertible** artifact; (2) **experience observability** — millions of
trajectory tokens distilled into a layered, drill-down evidence corpus; (3)
**decision observability** — every edit is paired with a **self-declared prediction**
(which tasks it fixes / which it risks breaking), **verified next round against
measured task deltas**, and **auto-reverted** if it didn't deliver. Result: 10
iterations lift Terminal-Bench 2 pass@1 **69.7 → 77.0**, beating the human-designed
**Codex-CLI harness (71.9)** and the self-evolving baselines; the frozen harness
transfers cross-benchmark (SWE-bench-verified) and cross-model (+2.3–10.1pp).

## The poaches (ranked)

1. **Falsifiable-prediction-per-edit + auto-rollback — THE poach.** This is exactly
   the wrapper our optimizer's **measured half** (roadmap A2, the "measured A/B"
   `scan --fix-plan` follow-up) needs: when vigiles recommends a harness change,
   attach a **predicted measured delta** (which evals it should improve / regress),
   run the eval, and **auto-confirm or revert** against the observed delta. Turns the
   optimizer from "re-print scan's findings" into a **proof-gated, self-correcting
   loop**. It also generalizes `evolve.ts`'s proof-gated selection — the paper is
   independent validation that proof-gating works, plus the prediction-contract is
   the missing concretization. _Their "manifest as a falsifiable contract" ≈ our
   sidecar + integrity hash + a predicted-delta field._

2. **Empirical validation of enforce() > guidance() (positioning, citeable).** The
   ablation localizes the gain to **tools, middleware (hooks), and long-term memory —
   NOT the system prompt**; system-prompt-only edits were a **−2.3pp REGRESSION**, and
   they conclude _"factual harness structure transfers while prose-level strategy does
   not."_ This is peer-reviewed evidence for vigiles's core thesis: **deterministic /
   structural constraints (enforce(), hooks, tool contracts) carry the reliability
   gain; prose/guidance doesn't.** Cite it in the launch article and as the argument
   for upgrading `guidance()` → `enforce()`.

3. **Component observability = our substrate, validated.** Their pillar (1) —
   file-level, versioned, revertible harness components — is **what vigiles already
   is** (specs compile to git-tracked files with an integrity hash). Confirms the
   substrate is right; their per-component decoupling + file-granularity rollback is
   the same instinct as our per-spec sidecars.

4. **Attribution + the regression-foresight warning.** They cross-reference predicted
   vs observed task sets; fix-precision ≈ 5× random, but **regression-precision only
   ≈ 2× random** → _"evidence-driven targeting works; regression foresight fails."_
   Lesson for our measured half: **predict regressions, not just improvements**, and
   weight the gate toward catching them (the blast-radius column of our metric triple
   is the right place).

5. **Metrics align.** Their fitness = pass@1 + tokens/trial + succ/Mtok ≈ our metric
   triple (bill / target / blast-radius). No change needed; just confirms the shape.

## Honest scope / difference

AHE evolves the harness **autonomously with an LLM in the loop** (GPT-5.4 as
debugger + editor). vigiles is **deterministic-verification-first**; full autonomous
evolution is our speculative `evolve.ts` (parked). **The poach is NOT "build
autonomous evolution"** — it's to lift their **prediction-contract + attribution**
into the optimizer's measured half (a human/CI stays in the loop, the eval is the
oracle). Read their OSS repo for the manifest schema before building A2.

## Next action

When the optimizer's measured A/B half (roadmap A2) is built, wrap each
recommendation in a **falsifiable predicted-delta contract** (eval before/after,
auto-revert on no-improvement, predict regressions explicitly). Until then: cite the
ablation finding (structure > prose) in the launch.

## See also

- `roadmap.md` — A2 (the measured half of `scan --fix-plan`); `evolve.ts` /
  `proofs.ts` (proof-gated selection this validates + concretizes).
- `measurement-authority.md` — the measure-then-optimize identity AHE mirrors.
- `covering-arrays-for-harness.md` — the affordable-eval substrate the measured loop runs on.
