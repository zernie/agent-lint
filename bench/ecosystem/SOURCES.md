<!-- vigiles:ignore-file -->

# Ecosystem-benchmark sources & attribution

The A1 ecosystem benchmark (`bench/ecosystem/`) A/Bs **real, published** Claude
Code skills/plugins over the neutral coding corpus. The benchmark's credibility
rests on every entry being real and reproducibly sourced — this file is the
provenance record. The manifest is `bench/ecosystem/skills.mjs`.

## Compression skills (injected prose, vendored here)

These A/B cleanly because the "skill" is a single injectable prose file — dropped
into the run exactly as a user installs it. Both carry a published % claim, so the
report can lead with the gap (claimed vs measured).

| Skill (`id`)      | Upstream (license)                                            | Sourced                                                                                                                   | Published claim                                                                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `caveman`         | `JuliusBrussee/caveman` (75,119★, MIT © 2026 Julius Brussee)  | `skills/caveman/SKILL.md` — the **real** SKILL.md, fetched 2026-06-20, pinned at `@f06348c`                               | description: "~75%"; repo README: "65%" — OUTPUT prose only                                                                                                                                                                                                                            |
| `token-efficient` | `drona23/claude-token-efficient` (5,668★, MIT © 2026 drona23) | `skills/token-efficient/CLAUDE.md` (+ vendored `LICENSE`) — the **real** CLAUDE.md, fetched 2026-06-21, pinned `@0d30a6d` | README headline table: "63%" (a WORD cut over 4 prompts) — the repo's OWN token benchmark admits only ~4% haiku / ~12% sonnet / ~7% opus output-token reduction (the claim≫measured gap is self-documented upstream). Injected as **CLAUDE.md** ("one file, drop it in your project"). |

## The compression CLUSTER — follow-on (needs-binary) tier, NOT manifest entries

The other widely-cited compression tools (see `research/skill-eval-landscape.md` §2)
compress **tool OUTPUTS at runtime via a real CLI/MCP binary**, not injectable
prose, so A/Bing them needs the tool installed and wired — a documented follow-on
"needs-binary" tier, not a text-injection manifest entry. All verified 2026-06-21:

| Tool                   | Upstream (license)                                | Stars (approx) | Published claim                                          | Why not a manifest entry            |
| ---------------------- | ------------------------------------------------- | -------------- | -------------------------------------------------------- | ----------------------------------- |
| RTK                    | `rtk-ai/rtk` (Apache-2.0, branch `develop`)       | ~64,400        | "reduces token consumption **60–90%**"; blog "10M (89%)" | Rust proxy / PreToolUse hook        |
| CodeGraph              | `colbymchenry/codegraph` (MIT)                    | ~52,500        | "**35% cost, 57% tokens, 46% time, 71% tool calls**"     | CLI + MCP server + prebuilt index   |
| Claw Compactor         | `open-compress/claw-compactor` (MIT)              | ~2,200         | "up to **97%**"; README's own output shows 53.9%         | Python CLI (compresses passed text) |
| claude-token-optimizer | `nadimtuhin/claude-token-optimizer` (MIT)         | ~470           | "**90% savings**" (shrinks project context files)        | Node CLI that generates docs        |
| ClaudeSlim             | `apolloraines/claudeslim` (MIT; core proprietary) | ~7             | "**60–85%**"                                             | Local proxy; near-zero hype         |

**License-blocked (do NOT vendor):** `mksglu/context-mode` (~17,900★, "98% reduction")
ships under the **Elastic License 2.0** (source-available, not permissive) — measure
only as a follow-on with the MCP server installed, never vendor its text. The
widely-cited `johnlindquist` "54%" gist has **no license** (all-rights-reserved) →
not vendorable.

**Dropped (not a compression tool):** `pinchtab` (`polly3223/pinchtab-skill`,
`BDuba/pinchtab-mcp-wrapper`) is browser automation — its "12x cost savings" refers
to browser ops, not text compression.

> Star counts are a noisy hype proxy (caveman alone is reported as 65k–144k across
> roundups for the same week); treat all as directional, GitHub-API-verified at
> sourcing time.

## Quality plugins (loaded natively via `--plugin-dir`)

These reuse the SHA-pinned plugin slices already vendored for the loader/scanner
tests — see `test/dogfood/SOURCES.md` for full attribution & licensing.

| Plugin (`id`)            | Slice (`dir@sha`)                | Note                                          |
| ------------------------ | -------------------------------- | --------------------------------------------- |
| `superpowers`            | `superpowers@6fd4507`            | obra/superpowers — workflow/skills plugin     |
| `oh-my-claudecode`       | `oh-my-claudecode@deee3a4`       | opinionated quality/workflow plugin           |
| `wshobson-accessibility` | `wshobson-accessibility@cf6059d` | domain skill/agent plugin (off-domain corpus) |

> These are samples for measurement, **not** endorsements, and are frozen at their
> SHA. A quality plugin carries no single published % claim, so the benchmark
> measures the **bill it adds** and any **blast radius** (correctness) on the
> neutral corpus, not a headline number.
