<!-- vigiles:ignore-file -->

# Ecosystem-benchmark sources & attribution

The A1 ecosystem benchmark (`bench/ecosystem/`) A/Bs **real, published** Claude
Code skills/plugins over the neutral coding corpus. The benchmark's credibility
rests on every entry being real and reproducibly sourced — this file is the
provenance record. The manifest is `bench/ecosystem/skills.mjs`.

## Compression skills (injected as `SKILL.md`, vendored here)

| Skill (`id`) | Upstream (license)                | Sourced                                                                                                                 | Published claim                                             |
| ------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `caveman`    | `JuliusBrussee/caveman` (75,119★, MIT © 2026 Julius Brussee) | `skills/caveman/SKILL.md` — the **real** SKILL.md, fetched 2026-06-20, pinned at `@f06348c` (`skills/caveman/SKILL.md`) | description: "~75%"; repo README: "65%" — OUTPUT prose only |

> The compression CLUSTER's other members — RTK, Claw Compactor, Context Mode,
> CodeGraph, pinchtab (see `research/skill-eval-landscape.md` §2) — compress
> **tool outputs** via a real CLI/MCP binary, not injectable `SKILL.md` prose, so
> A/Bing them needs the tool installed and is a documented follow-on, not a
> manifest entry. Caveman is the one telegraphic-OUTPUT skill that A/Bs cleanly.

## Quality plugins (loaded natively via `--plugin-dir`)

These reuse the SHA-pinned plugin slices already vendored for the loader/scanner
tests — see `examples/harness/vendor/SOURCES.md` for full attribution & licensing.

| Plugin (`id`)            | Slice (`dir@sha`)                | Note                                          |
| ------------------------ | -------------------------------- | --------------------------------------------- |
| `superpowers`            | `superpowers@6fd4507`            | obra/superpowers — workflow/skills plugin     |
| `oh-my-claudecode`       | `oh-my-claudecode@deee3a4`       | opinionated quality/workflow plugin           |
| `wshobson-accessibility` | `wshobson-accessibility@cf6059d` | domain skill/agent plugin (off-domain corpus) |

> These are samples for measurement, **not** endorsements, and are frozen at their
> SHA. A quality plugin carries no single published % claim, so the benchmark
> measures the **bill it adds** and any **blast radius** (correctness) on the
> neutral corpus, not a headline number.
