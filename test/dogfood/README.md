# Dogfood corpus — real, SHA-pinned OSS plugins

This is vigiles's **dogfood corpus**: SHA-pinned slices of real, third-party
Claude Code plugins, committed so the loader, scanner, and rules are tested
against **reality** — offline, model-free, in every CI run. Consumed by
`src/adapters/claude-code/vendor.test.ts` (loader invariants),
`src/scan-vendor.test.ts` (golden rule verdicts), `src/scan-cli.test.ts` (CLI
e2e), and the hook/sandbox/agent suites.

Saved audit **reports** from dogfood runs live separately in `research/dogfood/`
(the human-readable `audit`/`lint` output); this dir holds the **inputs** (the
plugin snapshots) the tests load.

## The policy (why this dir exists)

We kept re-fetching OSS to dogfood and throwing the result away. Don't. The rule:

1. **Save what you dogfood, when the license allows.** Any plugin we scan that is
   **MIT/permissively licensed** gets a SHA-pinned slice here, so the finding is
   reproducible forever — not a one-off scan that vanishes when the session ends.
2. **SHA-pinned + never modified.** The directory name carries the upstream commit
   SHA (`name@sha`); the snapshot is frozen, so an upstream fix never changes our
   fixture and the verdict stays deterministic.
3. **Minimal slice, not a mirror.** Vendor only the structural files a check needs
   (frontmatter, manifests, hook scripts) — never an 800-file repo. For breadth we
   can't justify copying, record the scan in the **sweep manifest** below instead.
4. **No-LICENSE upstreams are NOT copied.** A plugin with no LICENSE
   (all-rights-reserved) is never committed here; its bug is still reported with
   repro steps in `research/oss-pr-drafts.md` and a fix can go upstream.

To add a slice: snapshot the minimal files into `test/dogfood/<name>@<sha>/`, add
a row to the right table below, and assert its verdict in `src/scan-vendor.test.ts`
(an FP-guard for a clean plugin, or a true-positive for a bug fixture).

## Conformance / loader slices (clean, well-formed)

| Slice (`dir@sha`)                | Upstream                                          | Purpose                                   |
| -------------------------------- | ------------------------------------------------- | ----------------------------------------- |
| `superpowers@6fd4507`            | github.com/obra/superpowers                       | loader invariants; the known dangling ref |
| `oh-my-claudecode@deee3a4`       | oh-my-claudecode                                  | loader + coverage rungs                   |
| `wshobson-accessibility@cf6059d` | github.com/wshobson/agents (accessibility plugin) | loader + coverage rungs                   |

These carry their own `*.COVERAGE.md`. They double as **FP-guards**: every
high-precision rule (including the five newest) must stay at **zero** on them, or
`scan-vendor.test.ts` fails (the don't-cry-wolf regression).

## Rule fixtures (deliberately carry REAL bugs)

Kept **because** they reproduce a real defect, so each deterministic rule has a
true-positive lock against the wild. Samples for testing, **not** an endorsement;
frozen at their SHA.

| Slice (`dir@sha`)             | Upstream                                                                                                         | License                                            | Reproduces (verified)                                                                                                                                                                                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `madappgang-frontend@6097ad4` | github.com/MadAppGang/claude-code (`plugins/frontend/agents/tester.md`)                                          | MIT — Copyright (c) 2024 MadAppGang - Jack Rudenko | `subagent-tool-contract` (`AskUserQuestion` never available to a subagent) **and** `frontmatter-valid` (the one-line `description:` isn't valid YAML)                                                                                                                                                            |
| `davila7-perf-guard@869640b`  | github.com/davila7/claude-code-templates (`cli-tool/components/hooks/performance/performance-budget-guard.json`) | MIT — Copyright (c) 2025 Daniel (San) Ávila        | `hook-block-ineffective` — the component's own description says it **"blocks deployments"**, but it's a `PostToolUse` hook that `exit 2`, which can't veto (the build already ran): the canonical #19009 false-confidence bug. Vendored as `.claude/settings.json` (the slot the upstream CLI installs it into). |

## Sweep manifest — broader scans (verdict saved even where files aren't)

The deterministic `vigiles audit` run across whole repos, recorded so the breadth
isn't lost when we don't copy every file. ✓ = scanned clean on the new detectors;
✗ = a real finding (slice vendored above or repro in `oss-pr-drafts.md`).

| Repo                                 | License    | Scanned                  | New-detector verdict                                          |
| ------------------------------------ | ---------- | ------------------------ | ------------------------------------------------------------- |
| `wshobson/agents`                    | MIT        | 85 plugins, 158 skills   | ✓ clean (FP-guard breadth)                                    |
| `MadAppGang/claude-code`             | MIT        | ~6 plugins, 131 skills   | ✓ clean on new detectors (older `tester` bug vendored)        |
| `davila7/claude-code-templates`      | MIT        | 872 skills, 59 hook cmps | ✗ `performance-budget-guard` false-confidence hook (vendored) |
| `obra/superpowers`                   | (see repo) | 1 plugin                 | ✓ clean on new detectors                                      |
| `disler/claude-code-hooks-mastery`   | (see repo) | 1 plugin                 | ✓ clean                                                       |
| `disler/…-multi-agent-observability` | (see repo) | 2 plugins                | ✓ clean                                                       |
| `gmickel/flow-next`                  | (see repo) | 2 plugins                | ✓ clean                                                       |
| `anthropics/claude-code-action`      | MIT        | 1 plugin                 | ✓ clean                                                       |

Total this sweep: **156 audit targets across 8 repos** — one true positive
(davila7), zero false positives on the five new detectors. Earlier sessions also
scanned `trailofbits/react-pdf` + `skills-curated`, `ananddtyagi/cc-marketplace` +
`sugar`, and `TheBushidoCollective/han`; their findings hardened `scan.ts`
(multi-line quoted descriptions, relative `./hooks`, existence-guarded hooks,
marketplace dedup) and seeded `research/oss-pr-drafts.md`.
