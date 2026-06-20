<!-- vigiles:ignore-file -->

# Ecosystem-benchmark v0 — held findings (NOT a published report)

> Internal running log of what the A1 benchmark has measured. The per-run JSON is
> gitignored under `results/`; this is the durable summary. **No report is
> published from here** — a public writeup is a separate, explicitly gated step.
> Method: [`research/benchmark-methodology.md`](../../research/benchmark-methodology.md).

## Caveman Mode — `JuliusBrussee/caveman@f06348c` (75k★)

**Claim:** "cuts token usage ~75%" (skill description) / "65%" (README) — OUTPUT
prose only. **Verdict: DEBUNKED** on agentic coding.

| Pass                      | tasks × trials | mean output cut | mean bill cut      | output % of session | correctness |
| ------------------------- | -------------- | --------------- | ------------------ | ------------------- | ----------- |
| haiku (pilot)             | 2 × 2          | −18%            | −1%                | 1.1%                | 0 regress   |
| **sonnet** (target model) | 3 × 3          | **−18%**        | **−10%** (bill UP) | 0.7%                | 0 regress   |

Per-task on sonnet: slugify −8%, debounce −1%, **review-doc −45%** (the
prose-heavy, multi-turn task — caveman's best-case surface — is where it does the
WORST; output grew 45%, bill grew 22%).

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

## Quality plugins (superpowers / oh-my-claudecode / wshobson)

Loaded natively via `--plugin-dir`; no single published % claim. Pilot only so far
(n=1) — the bill they add on the neutral corpus is the column to fill on a fuller
pass. No correctness regressions observed in the pilot.
