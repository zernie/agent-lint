<!-- vigiles:ignore-file -->

# Ecosystem-benchmark — archived canonical runs (the data behind FINDINGS)

The raw per-run JSON the A1 benchmark (`bench/ecosystem/benchmark.mjs`) emits is
gitignored under `../results/` (scratch — regenerated on every run). **This sibling
dir is the COMMITTED archive of the canonical runs** the published numbers in
[`../FINDINGS.md`](../FINDINGS.md) are computed from — so the measurement DATA (the
moat) survives a container reclaim and is auditable/reproducible, and we never pay to
re-run just to recover it.

Keep this curated: archive a run here only when its numbers are cited in FINDINGS (or
a published leaderboard/article). Routine/experimental runs stay in `../results/`.

## Runs

| File                                   | Date       | Model  | Skills                   | Tasks                         | Trials | Bill ($) |
| -------------------------------------- | ---------- | ------ | ------------------------ | ----------------------------- | ------ | -------- |
| `2026-06-21T13-42-51-687Z_haiku.json`  | 2026-06-21 | haiku  | caveman, token-efficient | slugify, debounce             | 2      | 0.2865   |
| `2026-06-21T17-44-13-848Z_sonnet.json` | 2026-06-21 | sonnet | caveman, token-efficient | slugify, debounce, review-doc | 5      | 3.4333   |
| `2026-07-06T20-13-50-204Z_sonnet.json` | 2026-07-06 | sonnet | caveman, token-efficient | slugify, debounce, bigO, review-doc | 5 | 7.2229 |
| `2026-07-06T23-54-18-601Z_sonnet.json` | 2026-07-06 | sonnet | caveman, token-efficient | slugify, debounce, bigO, review-doc, refactor-suite | 5 | 9.4255 |

**`2026-07-06T23-54` is the canonical run behind the published zernie.com article**
("Everyone Measuring AI-Agent Token Savings Is Measuring the Wrong Number"). 100 runs
(5 tasks × 5 trials × 2 arms × 2 skills), and the FIRST archived run carrying per-arm
**confidence intervals** (`baselineStats`/`skillStats` — full mean/std/se/n/passK per
metric) plus the longest task (`refactor-suite`: a 3-file module → fix + refactor +
test + review + answer, the multi-turn steelman). Headline: Caveman output −37% (grew,
MIXED — helped 2/5, hurt 3/5) / bill +27%; Token-Efficient output −23% (grew, MIXED) /
bill +13%; output 0.5–1.1% of session every task; 0 regressions; overclaim gaps 102 and
86 points. Per-task the CIs show most "cuts" overlap zero (noise); the only two effects
that clear their error bars point OPPOSITE ways (Caveman: a real 24% cut on one-line
slugify, a real 75% GROWTH on the prose-heavy review). Full console log:
`2026-07-06_sonnet-5task-5trial.log`.

The earlier `2026-07-06T20-13` run (80 runs, 4 tasks, no CIs — Caveman −8% / bill +2%,
Token-Efficient −24% / bill +12%) is KEPT as corroboration: Token-Efficient is stable
across the two runs (−24% vs −23% output; +12% vs +13% bill), while Caveman's point
estimate swings (−8% → −37%), which is itself the finding — the effect is noise-dominated,
so the sign isn't stable run to run. Supersedes the 06-21 sonnet magnitude too (Caveman
was −18% *cut* there).

Schema (per file): `{ model, trials, tasks[], runningCost, leaderboard[] }`; each
`leaderboard` row carries `claim`, `meanOutCut`/`meanCostCut`/`meanOutShare`,
`outCutMin`/`Max`, `helped`/`hurt`/`mixed`, `claimGap`, `anyRegress`, and per-task
`tasks[]`. From the `23-54` run on, each `tasks[]` row also carries `baselineStats` and
`skillStats` — the full `MetricStat` (`mean`/`std`/`se`/`n`/`passK`) per metric, so every
number has an error bar.

**Method:** [`../../../research/benchmark-methodology.md`](../../../research/benchmark-methodology.md)
(the metric triple — bill / target / blast-radius — + significance, affordability).
**Reproduce:** `VIGILES_SKILLS=… VIGILES_TASK_NAMES=… VIGILES_TRIALS=… VIGILES_MODEL=… node bench/ecosystem/benchmark.mjs`
(real-model, runs on the Pro/Max subscription, `apiKeySource:"none"`).
