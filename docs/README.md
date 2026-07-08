# Documentation — index

How-to and reference docs for using vigiles. New here? Start with the
[README](../README.md).

## Shipping a plugin?

- [`for-plugin-authors.md`](for-plugin-authors.md) — the plugin-author journey end to end: scan a draft for structural health, fix what it flags, make your skills actually fire for users, rank against a marketplace, and gate it in CI.

## Verify your instruction files (layer 1)

- [`verifying-instruction-files.md`](verifying-instruction-files.md) — the full guide: the markdown→typed-spec ladder, the three rule types (`enforce` / `guidance` / `guard`), verified references + marks, and the before/after tables.
- [`skills-monorepo.md`](skills-monorepo.md) — adopt vigiles in a CI-tested skill library or a plain `.claude/` repo (no `plugin.json`): the three repo shapes it loads, the `sharedDirs` opt-in, and what a `SKILL.md` body ref resolves.

## Guard the harness — compiled hooks

- [`compiled-hooks.md`](compiled-hooks.md) — author a hook as a pure typed function against the closed `vigiles/hook` vocabulary and compile it, making whole classes of hook bugs unrepresentable (false confidence, matcher bypass, capability creep). The deterministic gate instrument beside verify + test.

## Two on-ramps — plain markdown → typed spec

- [`markdown-mode.md`](markdown-mode.md) — verify rules in plain markdown with inline `<!-- vigiles:enforce -->` comments, no TypeScript (frontmatter is a kept, demoted advanced option).
- [`inline-mode.md`](inline-mode.md) — inline-comment mode in depth.
- [`spec-format.md`](spec-format.md) — the typed `.spec.ts` format (target, sections, rules, verified references) — the source of truth.

## Reference

- **Library entry points** (grouped by concern, so a future non-Claude-Code harness can sit beside the current one):
  - `vigiles/linting` — Layer 1: the spec builders + compiler (`claude`, `enforce`, `guidance`, `file`, `cmd`, `symbol`, …).
  - `vigiles/testing` — Layer 2: the three tiers (`runHook`, `runHarnessTest`, `runEval`) + the runner-agnostic assertions.
  - `vigiles/claude-code` — the Claude Code-specific adapter (`loadPlugin`, `scriptModel`, the mock).
  - `vigiles/spec` — the authoring surface (the spec builders; also the module-augmentation target for generated types).
  - Per-tier barrels `vigiles/unit` / `vigiles/integration` / `vigiles/e2e` make a test's capability legible from its import.
- **[API reference (generated) →](https://zernie.github.io/vigiles/)** — every exported symbol across all entry points, generated from the source by API Documenter and published to GitHub Pages. The hand-written guides here are the human-facing layer; this is the exhaustive symbol-level reference.
- [`cli.md`](cli.md) — the full CLI, the Claude Code plugin, and the `lint` validation rules.
- [`github-action.md`](github-action.md) — run vigiles in CI: the composite Action, every input, the sticky PR comment, versioning.
- [`linter-support.md`](linter-support.md) — the 7 linter catalogs + `generate-types` / `generate-schema`.
- [`comparison.md`](comparison.md) — before/after tables, the determinism breakdown, the flow diagram.
- [`related-tools.md`](related-tools.md) — what vigiles composes with rather than replaces.
- **Validation rules:** [`require-instructions-spec`](rules/require-instructions-spec.md) · [`require-skill-spec`](rules/require-skill-spec.md) · [`integrity`](rules/integrity.md) · [`coverage`](rules/coverage.md) · [`untested-skill`](rules/untested-skill.md) · [`untested-subagent`](rules/untested-subagent.md) · [`untested-hook`](rules/untested-hook.md) · [`unmarked-refs`](rules/unmarked-refs.md).

## Test your harness (layer 2)

- [`harness-testing.md`](harness-testing.md) — the task-first how-to guide: pick what you want to test (hook / wiring / skill firing / behaviour) and the tier that answers it, with a copy-paste first test, CI, and the coverage table.
  - [`testing-api.md`](testing-api.md) — the full API reference: every predicate, assertion, `check`, matcher, and option (`measureTriggerRate` / `runEval` / significance), plus imports & harness selection.
  - [`harness-testing-claude-code.md`](harness-testing-claude-code.md) — Claude Code specifics: the oh-my-claudecode walkthrough, `${CLAUDE_PLUGIN_ROOT}` / `pluginDir` / the `Skill` tool, `scriptModel`, the bubblewrap sandbox.
  - [`harness-testing-codex.md`](harness-testing-codex.md) — Codex specifics: `runHarnessTest({ adapter: codexAdapter })` against real `codex exec`, the OpenAI Responses mock, what maps and what doesn't.
- [`testing-matrix.md`](testing-matrix.md) — every use case mapped to its test tier and file.
- [`sandboxing.md`](sandboxing.md) — what the sandbox isolates vs records (honestly): IO / `rm -rf`, the three network modes (deny-all / `recordEgress` / allowlisted `egress: { allow }`), tiers and limits.

## Measure what works (layer 3)

- [`measuring-skills.md`](measuring-skills.md) — A/B a skill, plugin, model, or rule change on real coding tasks: the metric triple (bill / target / blast-radius correctness), the worked `measureArms` example, the ecosystem benchmark, and why it's affordable on your subscription.
- [`migrating-from-promptfoo.md`](migrating-from-promptfoo.md) — move existing skill evals onto the subscription: the concept + assertion mapping, a side-by-side worked example, and the honest gaps (redteam).
- [`eval-architecture.md`](eval-architecture.md) — the cost model + the two testing verbs reconciled with what ships.

## Skills & agents

- [`skills.md`](skills.md) — authoring a SKILL.md across the three on-ramps; the prose-vs-gates split.
- [`agent-setup.md`](agent-setup.md) — non-interactive setup for agents (hooks via settings.json).
- [`agent-workflows.md`](agent-workflows.md) — workflows for Claude Code, Codex, Cursor, multi-agent.
