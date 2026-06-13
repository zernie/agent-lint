# CLI & CI reference

Full command-line surface, the GitHub Action, the Claude Code plugin, and the
`vigiles audit` validation rules. For the pitch and quick start, see the
[README](../README.md).

## Commands

```bash
npx vigiles init [--target=X.md]    # Scaffold a spec (runs full setup wizard by default)
npx vigiles compile [files...]      # Compile .spec.ts → .md
npx vigiles audit [files...]        # Verify hashes + inline/frontmatter/spec rules + symbols + coverage
npx vigiles refs <file.md>          # Check the symbol references in an instruction file
npx vigiles test [files...]         # Run *.harness.mjs deterministic harness tests (no API key)
npx vigiles eval [files...]         # Run *.eval.mjs real-model harness evals (--trials=N)
npx vigiles scan [dir]              # Report what a plugin/repo ships + what's broken (no model)
npx vigiles generate-types          # Emit .d.ts from project state (for spec mode)
npx vigiles generate-types --check  # Verify .d.ts is up to date
npx vigiles generate-schema         # Emit JSON Schema for vigiles: frontmatter (Level 1)
npx vigiles generate-schema --check # Verify schema.json is up to date
```

### `init` flags

| Flag                 | Effect                                                |
| -------------------- | ----------------------------------------------------- |
| `--strict`           | Sets require-spec and require-skill-spec to `"error"` |
| `--target=AGENTS.md` | Creates AGENTS.md spec instead of CLAUDE.md           |
| `--no-gha`           | Skip adding CI step to GHA workflow                   |

Works the same for humans and agents — fully non-interactive. See the
[agent setup guide](agent-setup.md) and [agent workflows](agent-workflows.md).

### `scan [dir]`

Point vigiles at any plugin or repo (defaults to `.`) and get a read-only report
of what it ships and what's structurally broken — **no model, no API key**. It
re-aims the existing machinery (`loadPlugin`, `parseAgentTools`,
`findUntestedSurfaces`): per-skill description presence + user-invoked flag,
per-agent tool contract (and the "no `tools:` line → inherits every tool"
footgun), hook scripts resolved across the braced/unbraced `$CLAUDE_PLUGIN_ROOT`
forms (`ok` / `missing` / `unresolved`), command + MCP detection, untested-surface
count, and the loader's dangling-ref / surface warnings. `--json` for CI.

```bash
npx vigiles scan ./some-plugin          # human-readable report for one plugin
npx vigiles scan ./some-plugin --json   # structured, for pipelines
npx vigiles scan ./plugins/*/           # ≥2 targets → ranked health leaderboard
```

Pass **more than one directory** and `scan` switches to a **ranked health
leaderboard** — a deterministic structural-health score (0–100 + A–F) per
plugin, worst issues first. Weights: a missing hook script −15 (won't run), a
skill with no usable description −10 (can't trigger), an agent with no `tools:`
contract −5 (inherits everything), an untested surface −3. Scoring deliberately
ignores the loader's free-text warnings (they include doc-mention false
positives), so the ranking stays defensible.

This is the deterministic substrate for the plugin/skill leaderboard and the
harness-aware supply-chain audit (see `research/divergent-bets.md`,
`research/agent-supply-chain-security.md`); behavioural columns that need to
_run_ the plugin (observed egress, real trigger-rate, safety) build on top.

## GitHub Action

```yaml
- uses: zernie/vigiles@main # runs `audit` by default
- uses: zernie/vigiles@main
  with:
    command: compile # compile specs in CI
```

To verify generated types are fresh in CI:

```yaml
- run: npx vigiles generate-types --check
```

## Claude Code plugin

Without the plugin, you're responsible for manually running `compile` and
`generate-types`. With it, the agent works with fresh instruction files
automatically.

```bash
npx skills add zernie/vigiles
```

The plugin provides two hooks:

- **PreToolUse** (Edit/Write) — blocks direct edits to compiled `.md` files and redirects the agent to the `.spec.ts` source
- **PostToolUse** (Edit/Write) — auto-runs `generate-types` on linter config changes, `compile` on `.spec.ts` changes

## Validation rules

`vigiles audit` validates instruction files with four rules:

| Rule                                                | Default  | What it checks                                                               |
| --------------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| [`require-spec`](rules/require-spec.md)             | `"warn"` | Every CLAUDE.md/AGENTS.md has a spec, inline rule, or `vigiles:` frontmatter |
| [`require-skill-spec`](rules/require-skill-spec.md) | `"warn"` | Every SKILL.md has a `.spec.ts`                                              |
| [`integrity`](rules/integrity.md)                   | `"warn"` | Compiled markdown wasn't hand-edited (SHA-256 check)                         |
| [`coverage`](rules/coverage.md)                     | `false`  | Spec covers enough of the project surface                                    |
| [`untested-surface`](rules/untested-surface.md)     | `"warn"` | Every skill/agent/hook has a test or eval                                    |

Configure in `.vigilesrc.json`:

```json
{
  "rules": {
    "require-spec": "error",
    "integrity": "error",
    "coverage": ["warn", { "scripts": 50, "linterRules": 5 }]
  }
}
```

Disable per-file with `<!-- vigiles-disable require-spec -->` at the top of the markdown.
