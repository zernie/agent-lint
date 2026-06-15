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
npx vigiles test [files...]         # Run *.harness.{mjs,ts} deterministic harness tests (no API key)
npx vigiles eval [files...]         # Run *.eval.{mjs,ts} real-model harness evals (--trials=N)
npx vigiles scan [dir]              # Report what a plugin/repo ships + what's broken (no model)
npx vigiles generate-types          # Emit .d.ts from project state (for spec mode)
npx vigiles generate-types --check  # Verify .d.ts is up to date
npx vigiles generate-schema         # Emit JSON Schema for vigiles: frontmatter (Level 1)
npx vigiles generate-schema --check # Verify schema.json is up to date
```

`vigiles test` / `vigiles eval` run scripts in JS **or** TS and report each as
**pass / skip / fail** — a tier that can't run (e.g. deterministic with no
`claude`) reports a loud `⊘ SKIPPED`, tallied separately, never a fake green.
Unit-tier `runHook` tests need no `claude` and always run. A skip passes by
default; in a CI job that **asserts** the capability is present, add `--no-skip`
so a skipped tier **fails** (a green-with-skips is untested surface).

By default `init` sets up **both pillars**: it scaffolds a typed spec + types
(Pillar 1), a starter `vigiles.harness.mjs` (Pillar 2), wires CI as a
`zernie/vigiles@v1` workflow (creating `.github/workflows/vigiles.yml` when none
exists), and installs the Claude Code plugin.

**Interactive vs non-interactive:** run in a terminal (a TTY), `init` prompts for
which pillars, CI, and the plugin. Run by an agent, in CI, or with piped input
(no TTY) — or with `--yes` — it skips the prompts and applies the defaults. So
"set up vigiles" from a Claude Code / Codex prompt Just Works without hanging.

### `init` flags

| Flag                         | Effect                                                           |
| ---------------------------- | ---------------------------------------------------------------- |
| `--yes`, `-y`                | Skip prompts; use defaults (both pillars, CI, plugin)            |
| `--verify` / `--no-verify`   | Pillar 1 — verify instruction-file references (default on)       |
| `--testing` / `--no-testing` | Pillar 2 — scaffold a harness test (default on)                  |
| `--harness=claude,codex`     | Which harness(es) to set up (default: auto-detect from the repo) |
| `--no-gha`                   | Skip wiring CI                                                   |
| `--no-plugin`                | Skip installing the Claude Code plugin                           |
| `--strict`                   | Set `require-spec` / `require-skill-spec` to `"error"`           |
| `--target=AGENTS.md`         | Create a bare spec for one file (Pillar 1 only)                  |

Passing a single positive pillar flag selects only it (`--verify` = pillar 1
only); pass both, or neither, for both. `init` also adds `vigiles` to your
`devDependencies` (moving it out of `dependencies` if it's there) so the
scaffolded `vigiles.harness.mjs` resolves `vigiles/testing`. (The deprecated
`--pillars=both|verify|test` still works as an alias.)

See the [agent setup guide](agent-setup.md) and
[agent workflows](agent-workflows.md).

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

The Action is a **composite action over the published `npx vigiles` CLI** — it
runs the exact artifact you'd run locally, so there's no separate bundle to drift.
Every input maps to a real CLI flag.

### Quick start

```yaml
name: vigiles
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read # all the Action needs; it only reads files and emits annotations

jobs:
  vigiles:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - uses: zernie/vigiles@v1 # runs `audit` by default
```

That's the whole thing — `audit` verifies that every linter rule, file path,
script, and symbol your `CLAUDE.md` / `AGENTS.md` cites is real and enabled, checks
the integrity hashes, and reports coverage. Failures appear inline as GitHub
annotations and fail the job.

### Compile specs in CI

```yaml
- uses: zernie/vigiles@v1
  with:
    command: compile # spec.ts → markdown; fails if a reference is stale
    paths: CLAUDE.md.spec.ts # optional; auto-discovers when omitted
```

### Inputs

| Input               | Default   | Description                                                                                 |
| ------------------- | --------- | ------------------------------------------------------------------------------------------- |
| `command`           | `audit`   | `audit` (verify references + integrity + coverage) or `compile` (specs → markdown).         |
| `paths`             | _(auto)_  | Comma/space-separated paths — `.md` for `audit`, `.spec.ts` for `compile`. Auto-discovers.  |
| `version`           | `latest`  | npm version of `vigiles` to run (`1`, `1.2.3`, `latest`). `local` runs a checked-out build. |
| `max-rules`         | _(unset)_ | Cap rules per spec (maps to `--max-rules`).                                                 |
| `catalog-only`      | `false`   | Only check that linter rules exist; skip config-enabled checks (maps to `--catalog-only`).  |
| `working-directory` | `.`       | Directory to run vigiles in.                                                                |
| `comment`           | `true`    | On `pull_request` events, post/update a sticky PR comment with the result.                  |
| `github-token`      | _(auto)_  | Token for the PR comment. Defaults to the workflow token (`${{ github.token }}`).           |

### Output channels

Beyond the `valid` step output, the Action reports **three** ways:

1. **Inline annotations** — failures appear on the diff (`::error`).
2. **Job summary** — a markdown result block on the run page (`$GITHUB_STEP_SUMMARY`).
3. **Sticky PR comment** — on `pull_request` events, one comment that is _updated in place_ each run (found by a hidden marker, never duplicated). Requires `pull-requests: write`; set `comment: false` to disable.

```yaml
permissions:
  contents: read
  pull-requests: write # needed for the sticky PR comment

# ...
- id: vigiles
  uses: zernie/vigiles@v1
- run: echo "passed=${{ steps.vigiles.outputs.valid }}"
```

The `valid` output is `'true'` if vigiles passed (exit 0), `'false'` otherwise.
Exit codes (also reflected in `valid`): **0** clean · **1** warnings · **2** hard errors.
On a fork PR (read-only token) the comment step degrades to a warning — the job still passes/fails on the result.

### Versioning

**The Action tag and the npm version are two separate version lines.** The Action
is a thin composite that runs the published `npx vigiles@<version>` CLI, so:

- **Action ref** (`uses: zernie/vigiles@v1`) — pin the **floating major tag**
  `@v1` for automatic patch/minor updates to the _Action wrapper_ (the release
  pipeline keeps `v1` pointed at the latest `1.x` of the action). Pin a full tag
  (`@v1.2.3`) or a commit SHA for byte-for-byte reproducibility. `@main` tracks
  unreleased `HEAD`.
- **CLI version** (`version:` input, default `latest`) — selects which published
  `vigiles` npm release the Action runs (currently `3.x`). Leave it `latest`, or
  pin `version: '3'` / `version: '3.0.0'` to lock the CLI independently of the
  Action tag.

So `uses: zernie/vigiles@v1` with the default `version: latest` runs the newest
`vigiles` CLI (3.x today) through the v1 action wrapper. The `@v1` does **not**
mean "vigiles 1.x". To lock both: `uses: zernie/vigiles@v1` + `with: { version: '3' }`.

```yaml
- uses: zernie/vigiles@v1
  with:
    version: "3" # pin the CLI major; @v1 pins the action wrapper
```

To verify generated types are fresh in CI:

```yaml
- run: npx vigiles generate-types --check
```

## Claude Code plugin

Without the plugin, you're responsible for manually running `compile` and
`generate-types`. With it, the agent works with fresh instruction files
automatically, and the consumer skills (`strengthen`, `migrate-to-spec`,
`test-harness`, `edit-spec`, `generate-rule`) are available.

The plugin installs through the **Claude Code plugin marketplace** — globally
into `~/.claude/plugins/`, **not** vendored into your repo. In a Claude Code
session:

```
/plugin marketplace add zernie/vigiles
/plugin install vigiles@vigiles
```

`vigiles init` does this for you (it runs the non-interactive `claude plugin`
CLI when available, else prints these two commands). Nothing is written to your
working tree, so there is nothing to `.gitignore` or accidentally commit.

The plugin provides hooks:

- **PreToolUse** (Edit/Write) — blocks direct edits to compiled `.md` files and redirects the agent to the `.spec.ts` source
- **PostToolUse** (Edit/Write) — auto-runs `generate-types` on linter config changes, `compile` on `.spec.ts` changes; nudges marking unmarked references
- **SessionStart** — surfaces the project's vigiles state

> Internal vigiles-development skills (`generate-logo`, `pr-to-lint-rule`,
> `enforce-rules-format`, `audit-feedback-loop`) live under `dev/` and are **not**
> shipped to consumers. Contributors load them with `--plugin-dir dev/`.

### Codex

Codex has no plugin marketplace, but the same skills install **globally** via the
cross-agent [`skills` CLI](https://github.com/vercel-labs/skills) — to the global
agents store `~/.agents/skills/` (which Codex reads), again not vendored into your
repo:

```bash
npx skills add zernie/vigiles -a codex -g -y
```

(The `-g` is what keeps it out of your repo — without it, `skills` vendors into
`./.agents/skills/`. `-y` skips the confirmation prompt.)

`vigiles init --harness=codex` (or auto-detection on an `AGENTS.md` repo) runs
this for you. Codex reads `AGENTS.md` directly, so no plugin is needed for
instructions; only the authoring skills install. Codex **hooks**
(`.codex/config.toml [hooks]`) are not auto-wired yet — add them by hand if you
want compile-on-edit.

## Validation rules

`vigiles audit` validates instruction files; the refs-hook nudges marking on edit:

| Rule                                                | Default  | What it checks                                                                  |
| --------------------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| [`require-spec`](rules/require-spec.md)             | `"warn"` | Every CLAUDE.md/AGENTS.md has a spec, inline rule, or `vigiles:` frontmatter    |
| [`require-skill-spec`](rules/require-skill-spec.md) | `"warn"` | Every SKILL.md has a `.spec.ts`                                                 |
| [`integrity`](rules/integrity.md)                   | `"warn"` | Compiled markdown wasn't hand-edited (SHA-256 check)                            |
| [`coverage`](rules/coverage.md)                     | `false`  | Spec covers enough of the project surface                                       |
| [`untested-surface`](rules/untested-surface.md)     | `"warn"` | Every skill/agent/hook has a test or eval                                       |
| [`unmarked-refs`](rules/unmarked-refs.md)           | `"warn"` | Instruction-file references are marked (verifiable); drives the refs-hook nudge |

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
