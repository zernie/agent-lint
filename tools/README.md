# `tools/` — human-run maintenance scripts (never in CI)

Occasional scripts a **maintainer runs by hand** — network I/O (cloning repos),
breadth sweeps, asset generation. They are NOT part of the shipped library: not
`src/`, not compiled to `dist/`, not tested, never run in CI. Run them from the
repo root. (The BUILD pipeline — `api-extractor.mjs`, `build-report.mjs` — lives in
`scripts/`, not here; `tools/` is only the human-run stuff.)

## Live — dogfood-corpus maintenance

- **`refresh-vendor.sh`** — re-fetch + re-pin the SHA-pinned vendored plugin
  snapshots under `test/dogfood/`. **Run when:** bumping a vendored plugin to a
  newer upstream commit. See `research/dogfood-corpus.md`.
- **`dogfood-sweep.sh`** — run `vigiles audit` across a pinned list of real OSS
  Claude Code plugins and tally what the detectors find. **Run when:** before a
  release or after a detector change, to prove no false-positive regression on
  real plugins (breadth, vs the few SHA-pinned slices asserted in tests).

## Occasional — pre-launch

- **`fp-sweep.sh`** — launch-readiness "don't cry wolf" sweep: clone popular
  plugins/marketplaces, run `vigiles audit`, surface any high-precision rule flag
  as a false-positive candidate to triage. **Run when:** pre-launch FP triage.

## Demo assets — for the UNBUILT "polished demo" (roadmap)

- **`demo.sh`** — record an asciinema cast of `vigiles lint` catching stale
  references (`asciinema rec --command "bash tools/demo.sh" vigiles.cast`).
- **`make-demo-gif.py`** — generate an animated terminal GIF (Pillow).

  > ⚠️ **Status:** both feed the roadmap item "Build the ONE polished front-door
  > demo," which is **not built yet**. The old `vigiles-demo.gif` was removed as
  > unreferenced, so their output is currently unused. Kept as the tooling for
  > that item — delete if the demo direction is dropped.

## Not skills — on purpose

A `tools/` script is deterministic automation; a skill is a model **procedure with
judgment**, so these are not skills. The two _with_ real judgment on their output
(`fp-sweep` triage, `dogfood-sweep` regression summary) are a roadmap candidate to
wrap as `.claude/skills/` contributor skills at launch — the skill would _invoke_
the script and reason about the result. `refresh-vendor` / `demo.sh` /
`make-demo-gif.py` stay plain scripts (mechanical or interactive, no judgment).
