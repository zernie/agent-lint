# The ecosystem benchmark

A/B the most-hyped Claude Code skills and plugins over a neutral real-task corpus,
and report the metric triple — **bill** (`costUsd`), **target** (whatever the skill
claims to move), and **blast radius** (correctness) — leading with the debunks
(claimed ≫ measured).

Skills install the **faithful** way (`--plugin-dir` + their real activation hook),
so the treatment actually loads into the session — not a bare `SKILL.md` dropped in
the working directory, which Claude Code never registers. See
[`CAVEMAN-INVESTIGATION.md`](./CAVEMAN-INVESTIGATION.md) for how we caught and fixed
that delivery bug, and [`FINDINGS.md`](./FINDINGS.md) for the corrected canonical run.

## Reproduce

Runs use your own `claude` CLI on your Pro/Max subscription (`apiKeySource: "none"`)
— **$0 metered**; the `$` figures are API-equivalent yardsticks. Name the file
explicitly so there's no accidental fan-out across the whole manifest.

```bash
# Cheap sanity pilot (seconds, pennies) — 2 tasks × 2 trials
VIGILES_SKILLS=caveman VIGILES_TASKS=2 VIGILES_TRIALS=2 \
  node bench/ecosystem/benchmark.mjs

# The published caveman result: 7 tasks × 5 trials on Sonnet (~140 runs, ~$10
# API-equivalent, $0 on a subscription) — matches FINDINGS.md's canonical run
VIGILES_SKILLS=caveman VIGILES_MODEL=sonnet VIGILES_TASKS=7 VIGILES_TRIALS=5 \
  node bench/ecosystem/benchmark.mjs
```

Point it at any skill in the manifest ([`skills.mjs`](./skills.mjs)) via
`VIGILES_SKILLS=<name>`. Output is an incremental per-skill table plus a JSON dump
under `results/`. Method: [`../../research/benchmark-methodology.md`](../../research/benchmark-methodology.md);
the general "measure your own skill" guide: [`../../docs/measuring-skills.md`](../../docs/measuring-skills.md).
