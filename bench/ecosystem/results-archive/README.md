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

Schema (per file): `{ model, trials, tasks[], runningCost, leaderboard[] }`; each
`leaderboard` row carries `claim`, `meanOutCut`/`meanCostCut`/`meanOutShare`,
`outCutMin`/`Max`, `helped`/`hurt`/`mixed`, `claimGap`, `anyRegress`, and per-task `tasks[]`.

**Method:** [`../../../research/benchmark-methodology.md`](../../../research/benchmark-methodology.md)
(the metric triple — bill / target / blast-radius — + significance, affordability).
**Reproduce:** `VIGILES_SKILLS=… VIGILES_TASK_NAMES=… VIGILES_TRIALS=… VIGILES_MODEL=… node bench/ecosystem/benchmark.mjs`
(real-model, runs on the Pro/Max subscription, `apiKeySource:"none"`).
