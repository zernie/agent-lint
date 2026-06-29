# Vendored plugin sources & attribution

The `examples/harness/vendor/*` directories are **SHA-pinned slices** of real,
third-party Claude Code plugins, committed so vigiles can dogfood its loader,
scanner, and rules against reality — **offline, model-free, in every CI run** (see
`src/adapters/claude-code/vendor.test.ts`, `src/scan-vendor.test.ts`,
`src/scan-cli.test.ts`). Each directory name carries the upstream commit SHA; the
snapshots are never modified.

We vendor only the **minimal structural files** a check needs (frontmatter,
manifests, hook scripts) — never a whole repository.

## Conformance / loader slices

| Slice (`dir@sha`)            | Upstream                                            | Purpose                                  |
| ---------------------------- | -------------------------------------------------- | ---------------------------------------- |
| `superpowers@6fd4507`        | github.com/obra/superpowers                         | loader invariants; the known dangling ref |
| `oh-my-claudecode@deee3a4`   | oh-my-claudecode                                    | loader + coverage rungs                   |
| `wshobson-accessibility@cf6059d` | github.com/wshobson/agents (accessibility plugin) | loader + coverage rungs                   |

These predate this file and each carries its own `*.COVERAGE.md`. They are pinned
slices of their upstream repos — consult the upstream for full license terms.

## Rule fixtures (deliberately carry REAL bugs)

These slices are kept **because** they reproduce a real defect, so the
deterministic rules have a true-positive lock against the wild (not just synthetic
tmp fixtures). They are samples for testing, **not** an endorsement — and they are
frozen at their SHA, so an upstream fix never changes them.

| Slice (`dir@sha`)              | Upstream                                  | License | Reproduces (verified)                                                                 |
| ------------------------------ | ----------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| `madappgang-frontend@6097ad4`  | github.com/MadAppGang/claude-code (`plugins/frontend/agents/tester.md`) | MIT — Copyright (c) 2024 MadAppGang - Jack Rudenko | `agent-tool-contract` (`AskUserQuestion` is never available to a subagent) **and** `frontmatter-valid` (the one-line `description:` isn't valid YAML) |
| `davila7-perf-guard@869640b`    | github.com/davila7/claude-code-templates (`cli-tool/components/hooks/performance/performance-budget-guard.json`) | MIT — Copyright (c) 2025 Daniel (San) Ávila | `hook-block-ineffective` — the component's own description says it **"blocks deployments"**, but it's a `PostToolUse` hook that `exit 2`, which can't veto (the build already ran): the canonical #19009 false-confidence bug. Vendored as `.claude/settings.json` (the slot the upstream CLI installs the hook into). |

> Licensing note: only MIT/permissively-licensed upstreams are vendored here. A
> plugin with no LICENSE (all-rights-reserved) is **not** copied into this repo —
> its bug is still reported (with reproduction steps) in
> `research/oss-pr-drafts.md`, and a fix can be sent upstream, but its files are
> not committed here.
