# Verifying your instruction files

**Your CLAUDE.md drifts the moment you refactor.** It still points the agent at a
file that moved and a script that was renamed — and the agent trusts the stale
claim as fact and acts on fiction. `vigiles lint` resolves every reference against
reality: a dead file path, a missing script, a renamed code symbol, or a linter
rule that doesn't exist (or exists but is **disabled**) is caught before it can
mislead the agent.

> The [README](../README.md) has the 30-second pitch; this is the full guide. For
> the testing layer, see [Testing your harness](harness-testing.md).

## Two ways to lint: a typed spec (the default) or plain markdown

**The default is a typed spec your agent writes** — `init` adopts your existing
CLAUDE.md into one and the `edit-spec` / `strengthen` skills keep it current, so you
rarely hand-write a `.spec.ts`. Prefer zero new files, or not ready for TypeScript?
Plain markdown with inline comments lints too — and gives up nothing on reference
verification.

### Markdown mode — the zero-setup floor

Add a comment to your existing CLAUDE.md and lint it:

```md
<!-- vigiles:enforce eslint/no-console "Route output through logger.ts" -->
```

```bash
npx vigiles lint CLAUDE.md
```

Each rule is checked against your real linter config — typos get closest-match
suggestions, disabled rules are flagged. `vigiles lint` enforces them in CI.
Zero install commitment, zero new files.

> **Want editor autocomplete?** Move the rules into a `vigiles:` YAML
> frontmatter block — `init` already generated the schema, so your editor's YAML
> language server autocompletes rule names and squiggles typos at edit time, no
> TypeScript required. [Markdown mode →](markdown-mode.md)

### Typed spec — the default

**You rarely hand-write one.** It's TypeScript for your harness, but the
`edit-spec` / `strengthen` skills write and update the spec from a plain-English ask
and a hook recompiles it on save — so the spec is the default `init` sets up and the
agent manages, not a chore. The deeper **compiler-grade guarantees** are gradual and
opt-in, like TypeScript's `strict` — here's what they buy you.

**Markdown mode is not a lesser tier for verification.** It squiggles rule typos
at edit time (the YAML schema `init` generates), and its inline marks —
`vigiles:file`, `vigiles:cmd`, `vigiles:symbol`, `vigiles:enforce` — verify file
paths, scripts, symbols, and linter rules _woven into the prose_, exactly like the
spec. If you have one instruction file and don't need to generate or share rules,
stay in markdown; you give up nothing on reference verification.

A typed spec adds one thing markdown can't: **rules and instructions become
composable, type-checked code.**

- **Compose and reuse.** Share a rule-set across many files or repos, generate
  rules programmatically, and let `tsc` make a stale reference _unrepresentable_ as
  you author — not just flagged on `lint`.
- **One hashed source.** `compile` stamps the emitted CLAUDE.md with an integrity
  hash, so the agent edits the spec and hand-edits to the artifact are caught.
  (This only matters once you've chosen the spec-as-source model — in markdown the
  file _is_ the source, so there's no drift to detect.)
- **Monotonicity proofs.** A rule can be strengthened (`guidance` → `enforce`) but
  never silently weakened or removed, gated by the proof system below.

So: the spec is the default — and the clear choice once you're standardizing rules
across a codebase, generating them, or wanting the integrity hash. For a single
instruction file, markdown is a fully capable floor you can stay on, not a lesser
tier.

```typescript
// CLAUDE.md.spec.ts
import { claude, enforce, guidance } from "vigiles/spec";

export default claude({
  commands: {
    "npm run build": "Compile TypeScript to dist/",
    "npm test": "Build and run all tests",
    // ✗ "npm run typecheck" → compile error: script not in package.json
  },

  keyFiles: {
    "src/utils/narrowing.ts": "Type guard utilities",
    // ✗ "src/utils/type-helpers.ts" → compile error: file not found
  },

  rules: {
    "no-explicit-any": enforce(
      "@typescript-eslint/no-explicit-any",
      "Use unknown and narrow with type guards.",
    ),
    // ✗ if rule is disabled in config → compile error

    "research-first": guidance("Google unfamiliar APIs first."),
  },
});
```

`npx vigiles compile` turns that into CLAUDE.md. From there the loop runs itself:
the agent edits the spec, hooks auto-compile, types catch typos in the editor, and
CI catches drift.

## Three rule types

**`enforce()`** — delegated to a linter. vigiles verifies the rule exists in the
catalog AND is enabled in your project config. A disabled rule is a compile error.

<!-- vigiles:ignore -->

```typescript
"no-any":    enforce("@typescript-eslint/no-explicit-any", "Use unknown and narrow."),
"no-print":  enforce("ruff/T201", "Use logging module."),
"no-unwrap": enforce("clippy/unwrap_used", "Use expect() with context."),
```

Supports ESLint, Stylelint, Ruff, Clippy, Pylint, RuboCop, and Cedar policies.
[Full linter support details →](linter-support.md)

**`guidance()`** — e.g. `guidance("Google unfamiliar APIs first.")` — prose advice
with no mechanical enforcement, but not untracked: guidance rules join the
monotonicity proof system, so a rule can be strengthened (`guidance` → `enforce`)
but never silently weakened or removed without an explicit allowlist.

**`guard()`** — reactive: runs a command when watched files change (e.g.
`*.spec.ts` → `npx vigiles compile`). One declaration emits the hook for every
supported system (Claude Code PostToolUse, husky pre-commit, CI) — no
copy-pasting the trigger across each. [Full spec format →](spec-format.md)

## Verified references

`file()`, `cmd()`, `symbol()`, and `ref()` catch stale references at compile time:

```typescript
import { claude, file, cmd, symbol, ref, instructions } from "vigiles/spec";

export default claude({
  sections: {
    architecture: instructions`
      Core engine in ${file("src/core/compile.ts")}.
      Compile specs with ${symbol("src/core/compile.ts", "compileClaude")}.
      Run ${cmd("npm test")} to verify.
      See ${ref("skills/strengthen/SKILL.md")} for the strengthen skill.
    `,
    // If any path / script / symbol is stale → compile error
  },
  // ...
});
```

There's a small family of inline **marks** that `lint` checks, each binding a
reference to its real source:

- `` `vigiles:symbol file#name` `` — the named file actually **defines** that
  symbol (function, class, method, constant), parsed with
  [ast-grep](https://ast-grep.github.io) across **JS/TS, Python, Ruby, Rust, and
  CSS**. Rename it and `lint` fails; in markdown mode the `refs-hook` **forces
  the mark**, blocking edits that leave a code reference bare.
- `` `vigiles:mcp server#tool` `` — the referenced **MCP tool exists** on its
  server. `lint` reads `.mcp.json`, starts the server, lists its tools, and flags
  a renamed/removed one with a "did you mean" — catching e.g. the GitHub MCP
  server renaming `create_issue` → `issue_write`, which otherwise fails silently.

**Typo-safe at authoring time, too.** `vigiles generate types` emits a
`.vigiles/generated.d.ts` so `enforce("eslint/no-consolee")` red-squiggles in your
editor; `generate-schema` gives the YAML-frontmatter mode the same via your YAML
language server. Both have `--check` CI freshness modes.
[How it works →](linter-support.md#generate-types)

## The validation rules — the full matrix

Beyond the references above, `vigiles lint` runs a set of **deterministic
validation rules** over your instruction files, skills, subagents, and hooks.
Each has a default severity (`"warn"` / `"error"` / `false`) and is configured in
`.vigilesrc.json`. Every rule is **deterministic** (no model, no API key) and
links to its own reference doc.

**Not every rule applies to every harness.** A rule is scoped to the _surface_ it
checks and runs only where the active harness has that surface — elsewhere
`vigiles lint` reports it as **n/a** (loud, never a failure). That's what lets one
config target Claude Code _and_ Codex without duplicating rules per harness:
universal rules stay bare and run everywhere; surface rules light up only where
the surface exists.

| Surface (the gate)          | Rules                                                                                                                               | Applies to                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Instruction file &amp; docs | `require-instructions-spec`, `integrity`, `coverage`, `unmarked-refs`, `orphan-docs`                                                | all harnesses                             |
| Skills                      | `untested-skill`, `skill-frontmatter`, `description-overlap`, `frontmatter-valid`, `skill-resource-resolves`, `skill-missing-fence` | all with skills                           |
| Plugin layout               | `plugin-dir-layout`                                                                                                                 | all with a plugin manifest                |
| MCP                         | `mcp-config`                                                                                                                        | all with MCP                              |
| Shell hooks                 | `untested-hook`, `hook-script-exists`, `hook-events`, `hook-matcher`, `hook-block-ineffective`, `prefer-compiled-hooks`             | Claude Code, Codex                        |
| Subagents                   | `subagent-tool-contract`, `subagent-frontmatter`, `untested-subagent`, `mcp-tool-resolves`                                          | Claude Code (n/a on Codex — no subagents) |
| Safety (skills + subagents) | `lethal-trifecta`, `delegation-trifecta`                                                                                            | all (subagent half n/a on Codex)          |

The per-family tables below give each rule's default severity and what it checks.

### Spec &amp; integrity

| Rule                                                              | Default  | What it checks                                                                                   |
| ----------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| [`require-instructions-spec`](rules/require-instructions-spec.md) | `"warn"` | Every CLAUDE.md / AGENTS.md has a `.spec.ts` behind it (narrow — inline/frontmatter don't count) |
| [`integrity`](rules/integrity.md)                                 | `"warn"` | Compiled markdown wasn't hand-edited (SHA-256 check)                                             |
| [`coverage`](rules/coverage.md)                                   | `false`  | The spec covers enough of the project surface                                                    |
| [`require-skill-spec`](rules/require-skill-spec.md)               | `false`  | Every SKILL.md has a `.spec.ts` (the consistent parallel; off by default)                        |

### Test coverage

| Rule                                              | Default  | What it checks                                   |
| ------------------------------------------------- | -------- | ------------------------------------------------ |
| [`untested-skill`](rules/untested-skill.md)       | `"warn"` | Every skill (`SKILL.md`) ships with a test/eval  |
| [`untested-subagent`](rules/untested-subagent.md) | `"warn"` | Every subagent (`agents/*.md`) ships a test/eval |
| [`untested-hook`](rules/untested-hook.md)         | `"warn"` | Every file-backed hook script ships a test/eval  |

### Reference marking

| Rule                                      | Default  | What it checks                                                                                                                    |
| ----------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [`unmarked-refs`](rules/unmarked-refs.md) | `"warn"` | Code-shaped references are marked (verifiable); drives the [refs-hook nudge](#the-marking-nudge--what-happens-on-every-file-save) |

### Subagent contracts

| Rule                                                              | Default  | What it checks                                                                |
| ----------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| [`subagent-tool-contract`](rules/subagent-tool-contract.md)       | `"warn"` | A subagent's `tools:` are real (catalog cross-ref — never-available / typo)   |
| [`disallowed-tools-contract`](rules/disallowed-tools-contract.md) | `"warn"` | A subagent's `disallowedTools:` are real tools (a typo blocks nothing)        |
| [`subagent-frontmatter`](rules/subagent-frontmatter.md)           | `"warn"` | Subagent frontmatter valid (`name`+`description`; `model`/`color` not a typo) |

### Hooks &amp; MCP

| Rule                                                            | Default  | What it checks                                                                   |
| --------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| [`hook-events`](rules/hook-events.md)                           | `"warn"` | A hook registers under a real event name (a typo never fires)                    |
| [`hook-matcher`](rules/hook-matcher.md)                         | `"warn"` | A hook `matcher` fires (no tool-name typo / malformed-or-undeclared MCP form)    |
| [`hook-block-ineffective`](rules/hook-block-ineffective.md)     | `"warn"` | A hook that looks like it blocks actually can (right event + right deny field)   |
| [`hook-script-exists`](rules/hook-script-exists.md)             | `"warn"` | A hook's referenced script file exists on disk (else it never runs)              |
| [`mcp-config`](rules/mcp-config.md)                             | `"warn"` | A declared MCP server can start (has a `command` or `url`)                       |
| [`mcp-tool-resolves`](rules/mcp-tool-resolves.md)               | `"warn"` | A subagent's `mcp__server__tool` names a declared (or built-in) server           |
| [`mcp-hook-target-resolves`](rules/mcp-hook-target-resolves.md) | `"warn"` | A `type: mcp_tool` hook names a declared server + a tool                         |
| [`prefer-compiled-hooks`](rules/prefer-compiled-hooks.md)       | `false`  | One nudge: hand-written hooks could be compiled (recommendation; off by default) |

### Skill triggers

| Rule                                                          | Default  | What it checks                                                               |
| ------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| [`skill-frontmatter`](rules/skill-frontmatter.md)             | `"warn"` | Recommend explicit skill `name`+`description` (reliable trigger)             |
| [`description-overlap`](rules/description-overlap.md)         | `"warn"` | No two model-invocable skills have near-identical descriptions               |
| [`frontmatter-valid`](rules/frontmatter-valid.md)             | `"warn"` | A skill/agent `---` block is valid YAML (js-yaml is strict — warn)           |
| [`skill-resource-resolves`](rules/skill-resource-resolves.md) | `"warn"` | A SKILL.md body's bundled-file refs (`scripts/`/`references/`) exist on disk |
| [`skill-missing-fence`](rules/skill-missing-fence.md)         | `"warn"` | A SKILL.md opens with a `---` fence (else it loads as body and never fires)  |

### Structure

| Rule                                              | Default  | What it checks                                                                                    |
| ------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| [`plugin-dir-layout`](rules/plugin-dir-layout.md) | `"warn"` | No functional surface dir (skills/agents/commands) sits inside the `.claude-plugin/` manifest dir |

### Safety

| Rule                                                  | Default  | What it checks                                                                                                                 |
| ----------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [`lethal-trifecta`](rules/lethal-trifecta.md)         | `"warn"` | No unit (subagent / model-invocable skill) holds all three lethal-trifecta legs (read-private + ingest-untrusted + exfiltrate) |
| [`delegation-trifecta`](rules/delegation-trifecta.md) | `"warn"` | No subagent's _effective_ capability (own ∪ delegated-to) forms a lethal trifecta that no single unit shows                    |

### Docs hygiene

| Rule                                  | Default | What it checks                                                                            |
| ------------------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| [`orphan-docs`](rules/orphan-docs.md) | (on)    | A doc in a configured directory that no other `.md` references (instruction files exempt) |

### Configure

Set severities in `.vigilesrc.json`:

```json
{
  "rules": {
    "require-instructions-spec": "error",
    "integrity": "error",
    "coverage": ["warn", { "scripts": 50, "linterRules": 5 }]
  }
}
```

Disable a rule for one file with `<!-- vigiles-disable require-instructions-spec -->`
at the top of the markdown. `--strict` promotes `require-instructions-spec` to
`"error"`.

`vigiles init` groups rules by confidence: the FP-safe **`structural`** group
(broken tools / dead hooks / broken MCP / collisions) gates at `error` by default;
the opinionated **`workflow`** group (`require-instructions-spec`, `untested-*`)
is added by `--strict`; the **`nudge`** group (`frontmatter-valid`,
`skill-frontmatter`, `prefer-compiled-hooks`, `unmarked-refs`) stays `warn` and
never gates. `--report-only` writes the whole gate at `warn` (nothing fails CI).
See [the CLI guide](cli.md#init).

## The marking nudge — what happens on every file save

Verification only works on references that are _marked_ (`enforce()`, `file()`,
`cmd()`, a `vigiles:symbol` span, or an inline `<!-- vigiles:enforce -->`). The
agent could just write a reference as plain prose, which nothing can verify. So
the plugin ships a **PostToolUse hook that nudges the agent to mark references,
in the loop**, the moment it edits an instruction file. The flow, from save:

1. **The agent edits** `CLAUDE.md` / `AGENTS.md` / `SKILL.md`.
2. **The refs-hook fires** (`refs-nudge.sh` → `vigiles hook-runtime refs`) and scans the
   saved file for **unmarked linter-rule references** — a slash-scoped name with
   no file extension, like `` `eslint/no-console` `` — and for `vigiles:symbol`
   marks whose target is missing. (It's deliberately narrow: bare identifiers like
   `` `runHook` `` and file paths are **not** flagged — too noisy.)
3. **It reacts by the `unmarked-refs` severity** (`.vigilesrc.json`):
   - **`"warn"` (default) → a non-blocking nudge.** The hook injects a message
     into the agent's context — _"these references aren't verifiable; express
     them as marks, or `<!-- vigiles:ignore -->` if it's prose"_ — and the agent,
     **still editing that file**, can fix them on the spot. Nothing is blocked.
   - **`"error"` → block.** The edit is rejected (exit 2) until the references
     are marked or ignored.
   - **`false` → off.**
4. **The deterministic backstop:** on commit (a git pre-commit hook) and in CI,
   `vigiles lint` / `vigiles refs` re-run the same check — the unbypassable
   floor that catches anything the in-loop nudge didn't.

**What it deliberately does not do:** it can't force a _plaintext_ reference
(no backticks, pure prose) to become a mark — distinguishing a load-bearing
reference from ordinary prose is undecidable.
It catches the high-signal, low-noise case (a backticked linter-rule name); bare
identifiers, paths, and prose are left to the shipped instructions, not the hook.

**Harness note:** the in-loop nudge is a hook, so it works on **Claude Code and
Codex**. A harness without hooks doesn't get the per-save nudge — it falls back
to the always-loaded instructions plus the `vigiles lint` CI floor. See the
[`unmarked-refs` rule](rules/unmarked-refs.md).

## What changes with vigiles

### Claude Code

|                                     | Without vigiles              | With vigiles                                                  |
| ----------------------------------- | ---------------------------- | ------------------------------------------------------------- |
| **Instructions**                    | Hand-written CLAUDE.md       | Compiled from `.spec.ts` (build artifact)                     |
| **Linter rule references**          | Trust-based (nobody checks)  | Verified at compile time against real config                  |
| **File paths**                      | Rot silently when renamed    | `file()` references checked against filesystem                |
| **Commands**                        | Stale scripts go unnoticed   | `cmd()` references checked against package.json               |
| **Direct edits to CLAUDE.md**       | Anyone can, nobody knows     | PreToolUse hook blocks edits, redirects to spec               |
| **Spec / config changes**           | CLAUDE.md drifts out of sync | PostToolUse hooks auto-compile and regenerate types           |
| **guidance → enforce upgrades**     | Manual guesswork             | `/strengthen` reads per-linter docs, suggests upgrades        |
| **New lint rules from PR feedback** | Copy-paste from review       | `/pr-to-lint-rule` generates rule + tests + spec entry        |
| **CI**                              | Nothing to verify            | `vigiles lint` catches hand-edits, disabled rules, stale refs |

**Codex / AGENTS.md** gets the same compile-time checks and the same
`vigiles lint` CI pipeline — just no hooks (no plugin system), so you run
`vigiles compile` manually or in CI.

Everything vigiles compiles and lints is **deterministic** — same input, same
output, no LLM in the loop. The non-deterministic parts (authoring specs,
suggesting upgrades, writing custom rules) are agent skills that run outside the
compilation pipeline. [Determinism breakdown and flow diagram →](comparison.md)

## See also

- [Markdown mode](markdown-mode.md) · [Inline mode](inline-mode.md) — the no-spec on-ramps.
- [Spec format reference](spec-format.md) — every section and rule kind.
- [Linter support](linter-support.md) — the 7 catalogs + `generate-types` / `generate-schema`.
- [CLI & CI reference](cli.md) · [Agent setup](agent-setup.md).
- [Compiled hooks](compiled-hooks.md) — the deterministic **gate** instrument: author a hook that can't be wrong.
- [Testing your harness](harness-testing.md) — Layer 2.
