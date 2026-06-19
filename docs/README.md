# Documentation — index

How-to and reference docs for using vigiles. (The thinking _behind_ vigiles —
design docs, benchmarks, landscape — lives in [`../research/`](../research/README.md).)
New here? Start with the [README](../README.md).

## Verify your instruction files (layer 1)

- [`verifying-instruction-files.md`](verifying-instruction-files.md) — the full guide: the markdown→typed-spec ladder, the three rule types (`enforce` / `guidance` / `guard`), verified references + marks, and the before/after tables.

## Adoption ladder (pick your commitment level)

- [`markdown-mode.md`](markdown-mode.md) — Level 0/1: inline `<!-- vigiles:enforce -->` comments and `vigiles:` YAML frontmatter, no TypeScript.
- [`inline-mode.md`](inline-mode.md) — inline-comment mode in depth.
- [`spec-format.md`](spec-format.md) — Level 2: the typed `.spec.ts` format (target, sections, rules, verified references).

## Reference

- **Library entry points** (grouped by concern, so a future non-Claude-Code harness can sit beside the current one):
  - `vigiles/linting` — Layer 1: the spec builders + compiler (`claude`, `enforce`, `guidance`, `file`, `cmd`, `symbol`, …).
  - `vigiles/testing` — Layer 2: the three tiers (`runHook`, `runHarnessTest`, `runEval`) + the runner-agnostic assertions.
  - `vigiles/claude-code` — the Claude Code-specific adapter (`loadPlugin`, `scriptModel`, the mock).
  - `vigiles/spec` — the authoring surface (the spec builders; also the module-augmentation target for generated types).
  - Per-tier barrels `vigiles/unit` / `vigiles/integration` / `vigiles/e2e` make a test's capability legible from its import.
- [`cli.md`](cli.md) — the full CLI, the GitHub Action, the Claude Code plugin, and the `lint` validation rules.
- [`linter-support.md`](linter-support.md) — the 7 linter catalogs + `generate-types` / `generate-schema`.
- [`comparison.md`](comparison.md) — before/after tables, the determinism breakdown, the flow diagram.
- [`related-tools.md`](related-tools.md) — what vigiles composes with rather than replaces.
- **Validation rules:** [`require-spec`](rules/require-spec.md) · [`require-skill-spec`](rules/require-skill-spec.md) · [`integrity`](rules/integrity.md) · [`coverage`](rules/coverage.md) · [`untested-skill`](rules/untested-skill.md) · [`untested-agent`](rules/untested-agent.md) · [`untested-hook`](rules/untested-hook.md) · [`unmarked-refs`](rules/unmarked-refs.md).

## Test your harness (layer 2)

- [`harness-testing.md`](harness-testing.md) — the task-first how-to guide: pick what you want to test (hook / wiring / skill firing / behaviour) and the tier that answers it, with a copy-paste first test, CI, and the coverage table.
  - [`testing-api.md`](testing-api.md) — the full API reference: every predicate, assertion, `check`, matcher, and option (`measureTriggerRate` / `runEval` / significance), plus imports & harness selection.
  - [`harness-testing-claude-code.md`](harness-testing-claude-code.md) — Claude Code specifics: the oh-my-claudecode walkthrough, `${CLAUDE_PLUGIN_ROOT}` / `pluginDir` / the `Skill` tool, `scriptModel`, the bubblewrap sandbox.
  - [`harness-testing-codex.md`](harness-testing-codex.md) — Codex specifics: `runHarnessTest({ adapter: codexAdapter })` against real `codex exec`, the OpenAI Responses mock, what maps and what doesn't.
- [`testing-matrix.md`](testing-matrix.md) — every use case mapped to its test tier and file. (Coverage roadmap: [`../research/harness-testing-coverage-matrix.md`](../research/harness-testing-coverage-matrix.md).)
- [`sandboxing.md`](sandboxing.md) — what the sandbox isolates vs records (honestly): IO / `rm -rf`, the three network modes (deny-all / `recordEgress` / allowlisted `egress: { allow }`), tiers and limits.

## Skills & agents

- [`skills.md`](skills.md) — authoring a SKILL.md across the three on-ramps; the prose-vs-gates split.
- [`agent-setup.md`](agent-setup.md) — non-interactive setup for agents (hooks via settings.json).
- [`agent-workflows.md`](agent-workflows.md) — workflows for Claude Code, Codex, Cursor, multi-agent.
