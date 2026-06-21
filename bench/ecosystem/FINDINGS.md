<!-- vigiles:ignore-file -->

# Ecosystem-benchmark v0 — held findings (NOT a published report)

> Internal running log of what the A1 benchmark has measured. The per-run JSON is
> gitignored under `results/`; this is the durable summary. **No report is
> published from here** — a public writeup is a separate, explicitly gated step.
> Method: [`research/benchmark-methodology.md`](../../research/benchmark-methodology.md).

## Caveman Mode — `JuliusBrussee/caveman@f06348c` (75k★)

**Claim:** "cuts token usage ~75%" (skill description) / "65%" (README) — OUTPUT
prose only. **Verdict: DEBUNKED** on agentic coding.

| Pass                               | tasks × trials | mean output cut | mean bill cut     | output % of session | correctness |
| ---------------------------------- | -------------- | --------------- | ----------------- | ------------------- | ----------- |
| haiku (pilot)                      | 2 × 2          | −18%            | −1%               | 1.1%                | 0 regress   |
| haiku (re-run, 2026-06-21)         | 2 × 2          | **+30%**        | +16%              | 1.3%                | 0 regress   |
| sonnet (3 tasks × 3)               | 3 × 3          | −18%            | −10%              | 0.7%                | 0 regress   |
| **sonnet (3 tasks × 5, CREDIBLE)** | 3 × 5          | **−18%**        | **+8%** (bill UP) | **0.7%**            | 0 regress   |

> **The sonnet −18% is now STABLE** (two independent sonnet runs both land at −18% mean
> output cut), so it's the number to quote — NOT the noisy haiku figures (the two haiku
> 2×2 runs swung −18%↔+30%, a 48-pt spread; 2-trial haiku is too noisy for magnitude).
> Robust facts, model-agnostic: output is ~0.7–1% of session tokens (so even a real cut
> barely moves the bill), and the 63–75% headline NEVER reproduces — on multi-turn coding
> output GROWS and the bill goes UP.

Per-task on sonnet (5 trials): slugify −8%, debounce +8%, **review-doc −55%** (the
prose-heavy, multi-turn task — caveman's supposed best-case surface — is where it does
the WORST: output grew 55%, bill grew 23%). The "best case" is the worst case.

**Why the claim misleads (the structural kill):** output is **<1% of session
tokens** (the rest is input + cache from reads/tool-results), so even a _true_ 75%
output cut moves the actual bill by a fraction of a percent. The 65–75% headline
is a single-shot-Q&A artifact; on multi-turn coding the telegraphic style did not
compress — it cost MORE, and most on the longest task.

**Answers the "but my real session is 322 turns" objection** (a caveman user's own
`caveman-stats` hook showed 246K output vs **59M cache-read** — i.e. output ≈0.4%
of the session, confirming the share argument from the tool's own data). Testing
the longer/heavier task made the debunk _stronger_, not weaker.

Caveats (honest): the corpus tasks top out at ~10 turns (not 322); the absolute %
is noisy at 3 trials; the robust facts are the **direction** (no compression, bill
up) and the **<1% output-share** (model-agnostic).

## Token-Efficient CLAUDE.md — `drona23/claude-token-efficient@0d30a6d` (5.7k★)

**Claim:** README headline table "63%" reduction. **Verdict: DEBUNKED** on agentic coding.

| Pass                               | tasks × trials | mean output cut | mean bill cut     | output % of session | correctness |
| ---------------------------------- | -------------- | --------------- | ----------------- | ------------------- | ----------- |
| haiku (pilot)                      | 2 × 2          | **−2%**         | **−3%** (bill UP) | 1.1%                | 0 regress   |
| **sonnet (3 tasks × 5, CREDIBLE)** | 3 × 5          | **−10%**        | **+3%** (bill UP) | **0.7%**            | 0 regress   |

Per-task on sonnet (5 trials): slugify +3%, debounce +1%, **review-doc −35%** (output
GREW 35% on the prose-heavy task; overclaim gap **73 points** vs the 63% headline).
**The key kill:** the repo's OWN reproducible token benchmark claims ~12% output reduction
on sonnet — we measured **−10% (output grew)** on multi-turn coding, so even the author's
honest number doesn't reproduce here. The CLAUDE.md's persistent input-token overhead
makes it net-negative, exactly as the README itself warns ("at low usage it costs more
than it saves"). The 63% headline is a 465→170 **WORD** count over 4 single-shot prompts.

Caveats (honest): output is ~0.7% of session tokens so the bill impact is tiny either
way; the robust fact is the **direction** (net-negative: output + bill both up), which
holds across haiku + sonnet and matches the repo's own admission. Both compression skills
do WORST on the prose-heavy review-doc task — the surface telegraphic style should help.

## Quality plugins (superpowers / oh-my-claudecode / wshobson)

Loaded natively via `--plugin-dir`; no single published % claim. Pilot only so far
(n=1) — the bill they add on the neutral corpus is the column to fill on a fuller
pass. No correctness regressions observed in the pilot.

## Compression cluster — follow-on (needs-binary) tier

The other hyped compression tools (RTK 60–90% / CodeGraph 57% / Claw 97% /
claude-token-optimizer 90% / ClaudeSlim 60–85%) compress tool OUTPUTS via a real
CLI/MCP binary, so they're a documented follow-on tier, not text-injection manifest
entries. Context Mode (98%) is Elastic-licensed (not vendorable). Full
classification + provenance in `SOURCES.md`.

## Caveman — prior art (don't claim our thesis as novel; lead with what's NEW)

A 2026-06 web sweep found the space is **loudly claimed but lightly measured** — which
is the opening, but our qualitative thesis is already public, so cite it:

- **The author conceded the headline.** On [HN](https://news.ycombinator.com/item?id=47647455)
  (`JBrussee-2`): "my '~75%' README number is from **preliminary testing, not a rigorous
  benchmark**." Top comment (`nayroclade`) already makes OUR argument: "you're never gonna
  blow your token budget on output. Input tokens are the bottleneck."
- **Independent measurements (thin but real):** Kuba Guzik (72 runs, Sonnet+Opus,
  [Medium](https://medium.com/@KubaGuzik/i-benchmarked-the-viral-caveman-prompt-to-save-llm-tokens-then-my-6-line-version-beat-it-d8e565f95e15))
  → **9–21% output**, and a 6-line 85-token prompt BEAT the 552-token skill (the skill's
  own input cost works against it); 100% correct, no regression. GrowwStacks (1 Opus-4.7
  high-thinking coding task) → **~0% savings** ("80–90% of tokens go to thinking + code,
  not conversation"). andrew.ooo → output is "10–30% of a CC bill … input/context
  dominate" → "5–15% bill cut."
- **Consensus:** the 65–75% survives ONLY for single-shot discursive Q&A vs a weak
  baseline; on multi-turn agentic coding it collapses to ~0–21%. Matches our measured −18%
  (output went UP) — direction-consistent, pessimistic end.

**What's genuinely NEW (vigiles's wedge — nobody has done these):**

1. A **rigorous, reproducible, tool-driven harness over a real MULTI-TURN agentic coding
   session** — every existing test is single-shot Q&A or one ad-hoc task.
2. The **bill decomposed** (input + cache-read + cache-write + reasoning + output) with the
   output slice shown numerically against the claimed delta + correctness (the metric
   triple). On Fable 5 ($50/M output vs $1/M cache-read) output is ~17% of the $ bill — so
   the honest debunk is "the saving is UNMEASURED/estimated and doesn't reproduce," not
   "output is negligible."
3. **An unaudited baseline discrepancy no independent writeup caught:** the caveman README
   says the baseline is `"Answer concisely."` but the committed `benchmarks/run.py` ships
   `"You are a helpful assistant."` — i.e. the published delta is vs a vanilla baseline,
   inflating it. A concrete, citable methodological hole.
