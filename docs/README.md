# Documentation — index

How-to and reference docs for using vigiles. (The thinking _behind_ vigiles —
design docs, benchmarks, landscape — lives in [`../research/`](../research/README.md).)
New here? Start with the [README](../README.md).

## Verify your instruction files (pillar 1)

- [`verifying-instruction-files.md`](verifying-instruction-files.md) — the full guide: the markdown→typed-spec ladder, the three rule types (`enforce` / `guidance` / `guard`), verified references + marks, and the before/after tables.

## Adoption ladder (pick your commitment level)

- [`markdown-mode.md`](markdown-mode.md) — Level 0/1: inline `<!-- vigiles:enforce -->` comments and `vigiles:` YAML frontmatter, no TypeScript.
- [`inline-mode.md`](inline-mode.md) — inline-comment mode in depth.
- [`spec-format.md`](spec-format.md) — Level 2: the typed `.spec.ts` format (target, sections, rules, verified references).

## Reference

- **Library entry points** (grouped by concern, so a future non-Claude-Code harness can sit beside the current one):
  - `vigiles/linting` — Pillar 1: the spec builders + compiler (`claude`, `enforce`, `guidance`, `file`, `cmd`, `symbol`, …).
  - `vigiles/testing` — Pillar 2: the three tiers (`runHook`, `runHarnessTest`, `runEval`) + the runner-agnostic assertions.
  - `vigiles/claude-code` — the Claude Code-specific adapter (`loadPlugin`, `scriptModel`, the mock).
  - The granular paths (`vigiles/spec`, `vigiles/run-hook`, `vigiles/harness-test`, …) keep working.
- [`cli.md`](cli.md) — the full CLI, the GitHub Action, the Claude Code plugin, and the `audit` validation rules.
- [`linter-support.md`](linter-support.md) — the 7 linter catalogs + `generate-types` / `generate-schema`.
- [`comparison.md`](comparison.md) — before/after tables, the determinism breakdown, the flow diagram.
- [`related-tools.md`](related-tools.md) — what vigiles composes with rather than replaces.
- **Validation rules:** [`require-spec`](rules/require-spec.md) · [`require-skill-spec`](rules/require-skill-spec.md) · [`integrity`](rules/integrity.md) · [`coverage`](rules/coverage.md) · [`untested-surface`](rules/untested-surface.md) · [`unmarked-refs`](rules/unmarked-refs.md).

## Test your harness (pillar 2)

- [`harness-testing.md`](harness-testing.md) — the full guide: the four layers (verify-refs / hook-unit / deterministic / eval), `pluginDir` native skill testing, action/sequence assertions, runner-agnostic usage, the CLI fallback.
- [`testing-matrix.md`](testing-matrix.md) — every use case mapped to its test tier and file. (Coverage roadmap: [`../research/harness-testing-coverage-matrix.md`](../research/harness-testing-coverage-matrix.md).)
- [`sandboxing.md`](sandboxing.md) — what the sandbox isolates vs records (honestly): IO / `rm -rf`, the three network modes (deny-all / `recordEgress` / allowlisted `egress: { allow }`), tiers and limits.

## Skills & agents

- [`skills.md`](skills.md) — authoring a SKILL.md across the three on-ramps; the prose-vs-gates split.
- [`agent-setup.md`](agent-setup.md) — non-interactive setup for agents (hooks via settings.json).
- [`agent-workflows.md`](agent-workflows.md) — workflows for Claude Code, Codex, Cursor, multi-agent.
