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

## Why their OWN benchmarks report a win (methodology audit, 2026-06-21)

Read both repos' actual benchmark code (`caveman/benchmarks/run.py`,
`drona23/.../benchmark/run.py` + `SUMMARY.md`). The headline numbers come from a setup
that is the **inverse of agentic coding** — four choices, each inflating the %:

**Caveman (`benchmarks/run.py`, generates the README ~75% table):**

1. **Single-shot, one-turn Q&A** — `messages=[{role:user, content:prompt}]`: one message,
   **no tools, no file reads, no multi-turn**. The 10 prompts are coding-FLAVORED
   ("explain react re-render", "microservices vs monolith") but are "answer the question"
   prose, not an agentic task loop — the exact setting where a verbose assistant rambles
   and brevity shows biggest.
2. **Output tokens ONLY** — `savings = 1 − caveman_out/normal_out`. Input tokens are never
   counted — including the SKILL.md loaded as the system prompt EVERY call, and (in real
   use) the cache/tool-result input that dominates a session. The README even concedes
   caveman "only affects output tokens — thinking/reasoning untouched."
3. **Vanilla headline baseline** — `NORMAL_SYSTEM = "You are a helpful assistant."` (no
   concision instruction), so caveman beats a rambler. (Fair note: the author DID add a
   separate `evals/` three-arm harness that compares vs `"Answer concisely."` — but that
   is NOT what generates the headline ~75% table; the headline is vs vanilla.)
4. **No correctness/quality gate** — counts tokens, never checks the terser answer kept the
   information. Token reduction with info loss still reads as "savings."

→ Net: output-token reduction on single-shot Q&A vs a no-concision baseline, blind to
input + correctness. On real multi-turn coding with whole-session accounting + a
correctness gate (our harness), output is ~0.7% of the bill and the style doesn't even
reduce it (output GROWS, bill UP).

**Token-Efficient — the author already debunked his own headline.** The 63% is a **WORD
count** over single-shot prompts; the repo's own `benchmark/SUMMARY.md` states plainly:
_"the published 63% reduction does not reproduce"_ (real token effect −2% haiku to −11%
opus), _"word-count benchmarks overstate the token win,"_ _"per-turn input overhead
cancels output saving,"_ and it _"measures one-shot Q&A prompts, not agentic/coding
loops."_ So the gap is a vanity headline vs honest fine-print — and even the fine-print
number doesn't reproduce on agentic coding (we measured −10%, output grew).

**The one-line thesis for the writeup:** _they measured output-word reduction on
single-shot Q&A against a verbose baseline, ignoring input and correctness — every one of
those is the opposite of how a coding agent actually runs._

## Caveman — prior art (don't claim our thesis as novel; lead with what's NEW)

> **⚠️ SATURATION WARNING (2026-06-21): the caveman debunk is CROWDED and ~6 months old.**
> A fresh "caveman is vaporware" article is LATE and will draw "already covered" pushback.
> Web-confirmed: input-dominance is the consensus take (top HN comment), independent
> measurements exist (Kuba Guzik 14–21%, GrowwStacks "no savings", devneeddev/X, Decrypt,
> andrew.ooo), the author conceded "preliminary testing," and token-efficient's author
> debunked his own headline. **Do NOT make caveman the flagship.** Our novelty is the
> METHOD, not the verdict: a reproducible, multi-turn, correctness-gated harness (others
> ran one-off single-shot tests), the benchmark-CODE audit (others only asserted "input
> dominates"), the sharper finding (output GROWS / −55% on the best-case task), and the
> SAME harness across N skills. **Lead with the leaderboard/method; caveman is one
> validation ROW (it agrees with prior work → proves the harness is sound), not the story.**

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
3. **The headline number uses a vanilla baseline (precise, fair version):** the README
   ~75% table is generated by `benchmarks/run.py`, whose baseline is
   `NORMAL_SYSTEM = "You are a helpful assistant."` — no concision instruction, so the
   delta is vs a rambler. The author DID add a separate `evals/` three-arm harness vs
   `"Answer concisely."` (so it's not hidden) — but the **headline** ~75% is the
   weak-baseline number. Citable, but state it as "the headline uses the vanilla
   baseline," not "they concealed it" (don't-cry-wolf applies to our claims too).

---

## Fresh Sonnet run — 2026-07-06 (supersedes the magnitude numbers above; the run the zernie.com article uses)

4 tasks (slugify, debounce, bigO, review-doc) × 5 trials × 2 arms, sonnet, **80 runs, ~$7.22 API-equivalent, $0 metered**. Clean harness sign convention (`out_cut>0` = reduction). Raw: `results/2026-07-06T20-13-50-204Z_sonnet.json` (gitignored).

| Skill | claim | mean output cut | mean bill cut | output % of session | correctness | per-task spread |
| --- | --- | --- | --- | --- | --- | --- |
| **Caveman** (now ~84k★) | 75% | **−8% (GREW)** | **+2% (flat/up)** | 0.5–1.3% | 0 regress | out −18%..+5%, cut 1/4 (bigO +5%; grew slugify −6% / debounce −18% / review −12%); cost slugify −12% vs debounce +19% |
| **Token-Efficient** (~5.7k★) | 63% | **−24% (GREW)** | **+12% (up)** | 0.4–1.2% | 0 regress | out −49%..0% (slugify −46% / debounce −49% / bigO −3% / review 0%) |

**KEY UPDATE vs the earlier sonnet 3×5** (which had Caveman at −18% *reduction*): this larger 4-task run shows Caveman *growing* output (−8%). So the output effect is **NOT stable at −18% cut — the direction flips across runs.** The instability itself is the finding.

ROBUST, every condition: output **0.4–1.3% of session** (every task), the **63–75% headline never reproduces**, **0 correctness regressions**, **no reliable bill saving** (Token-Efficient reliably +12%; Caveman flat/mixed). Do NOT quote "bill always up" (Caveman saved 12% on one task) or "stable −18% cut" (superseded). Both authors self-disclose the output-only/net-negative caveat (credited in the article).
