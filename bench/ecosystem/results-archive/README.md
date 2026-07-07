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

| File                                   | Date       | Model  | Skills                                  | Tasks                                                                             | Trials | Bill ($) |
| -------------------------------------- | ---------- | ------ | --------------------------------------- | --------------------------------------------------------------------------------- | ------ | -------- |
| `2026-06-21T13-42-51-687Z_haiku.json`  | 2026-06-21 | haiku  | caveman, token-efficient                | slugify, debounce                                                                 | 2      | 0.2865   |
| `2026-06-21T17-44-13-848Z_sonnet.json` | 2026-06-21 | sonnet | caveman, token-efficient                | slugify, debounce, review-doc                                                     | 5      | 3.4333   |
| `2026-07-06T20-13-50-204Z_sonnet.json` | 2026-07-06 | sonnet | caveman, token-efficient                | slugify, debounce, bigO, review-doc                                               | 5      | 7.2229   |
| `2026-07-06T23-54-18-601Z_sonnet.json` | 2026-07-06 | sonnet | caveman ⚠, token-efficient              | slugify, debounce, bigO, review-doc, refactor-suite                               | 5      | 9.4255   |
| `2026-07-07T01-43-01-120Z_sonnet.json` | 2026-07-07 | sonnet | **caveman (faithful)**, token-efficient | slugify, debounce, bugfix-offbyone, bigO, regex-email, review-doc, refactor-suite | 5      | 10.4132  |

**`2026-07-07T01-43` is the CORRECTED canonical run behind the zernie.com article.** 140 runs
(7 tasks × 5 trials × 2 arms × 2 skills). It fixes a delivery bug that invalidated every
earlier caveman number: caveman had been delivered as a bare `SKILL.md` in the run cwd, which
Claude Code never registers as a skill — so the caveman arm measured an inert, unread file.
Here caveman is installed the real way: a `--plugin-dir` plugin WITH its actual SessionStart
activation hook (reads SKILL.md, injects the ruleset — "on from message one" per the README),
verified telegraphic. Analyze with `node bench/ecosystem/analyze.mjs <json>` (Welch p-values +
output dollar-share).

Headline (faithful): **Caveman output cut 6% mean** (MIXED — 5/7 tasks cut, 2 significant:
bugfix −31% p=.002, regex −28% p=.006; grew on 2), **pooled bill −1% (FLAT, not significant)** —
it genuinely compresses output but doesn't move the bill; **Token-Efficient output −29% (grew),
pooled bill +10%**. Output ~0.6% of session tokens but **~20% of the dollar bill** (a perfect 65%
output cut caps the bill saving at ~13%); 0 regressions; gaps 59 / 92. Log:
`2026-07-07_sonnet-caveman-faithful-7task-5trial.log`. Companion input test (`compress-test.mjs`)
measures caveman's `/caveman-compress` (~46% input claim).

⚠ **The caveman rows in `2026-07-06T23-54` and every earlier run are INVALID** (the bare-SKILL.md
delivery bug — caveman never loaded). Their **token-efficient rows are VALID** (a `CLAUDE.md`
auto-loads as project memory), and Token-Efficient reproduces across all of them (output −23% to
−29%, bill +10% to +13%) — a stable net-negative. Kept for that corroboration + provenance; do
NOT cite their caveman numbers.

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
