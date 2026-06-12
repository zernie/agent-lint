<p align="center">
  <img src="logo.png" width="140" alt="vigiles logo" />
</p>

<h1 align="center">vigiles</h1>

<p align="center">
  <em>Quis custodiet ipsos custodes?</em> — Who watches the watchmen?
</p>

<p align="center">
  <strong>Test &amp; verify your Claude Code harness.</strong><br />
  vigiles <strong>verifies the references</strong> your instruction files make — linter rules, file paths, scripts, code symbols — and <strong>evals</strong> whether your hooks, skills, and CLAUDE.md actually change what the agent does.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/vigiles"><img src="https://img.shields.io/npm/v/vigiles?color=orange" alt="npm version" /></a>
  <a href="https://github.com/zernie/vigiles/actions"><img src="https://img.shields.io/github/actions/workflow/status/zernie/vigiles/ci.yml?branch=main" alt="CI" /></a>
  <a href="https://github.com/zernie/vigiles/blob/main/LICENSE"><img src="https://img.shields.io/github/license/zernie/vigiles" alt="License" /></a>
</p>

<p align="center">
  <b>Two pillars →</b>
  &nbsp;<a href="#verify-your-instruction-files">① Verify your instruction files</a>
  &nbsp;·&nbsp;
  <a href="#test-your-claude-code-harness">② Test your Claude Code harness</a>
</p>

---

<details>
<summary><b>Contents</b></summary>

[**Two pillars — pick one or both**](#two-pillars--pick-one-or-both)

**Pillar 1 — verify your instruction files** · references your CLAUDE.md makes that a linter, the filesystem, and package.json can prove

- Two adoption levels: [markdown](#markdown-mode--no-new-files-no-typescript) → [typed spec](#typed-spec--compiler-grade-guarantees)
- [What changes with vigiles](#what-changes-with-vigiles)
- [Quick start](#quick-start)
- [Three rule types](#three-rule-types) — `enforce` / `guidance` / `guard`
- [Verified references](#verified-references) — `file` / `cmd` / `symbol` / `ref`

**Pillar 2 — [test your Claude Code harness](#test-your-claude-code-harness)** · deterministic, no-API-key tests that your hooks and skills actually fire — full guide in [docs/harness-testing.md](docs/harness-testing.md)

**More** — [CLI & CI](#cli--ci) · [Skills](#skills) · [Related tools](#related-tools)

</details>

## Two pillars — pick one or both

`Agent = Model + Harness`. Your harness is everything that steers a run — the **instructions** you write _and_ the **hooks, skills, and settings** that enforce them — and it's usually trusted on hope. vigiles makes it verifiable, in two pillars of equal weight. Adopt either on its own, or both:

|       | Pillar                                                              | What it does                                                                                                                                                                 |
| ----- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **①** | [**Verify your instruction files**](#verify-your-instruction-files) | Every linter rule, file path, script, and code symbol your CLAUDE.md cites is checked against reality, so stale references can't silently mislead the agent.                 |
| **②** | [**Test your harness**](#test-your-claude-code-harness)             | Your hooks and skills are code — vigiles tests that they actually fire, **deterministically and for free** (no model, no API key) before you ever pay for a real-model eval. |

They share the thesis but not a dependency: verify your instructions without ever writing a harness test, or test your harness without a single `.spec.ts`. Pick the pillar that hurts today.

## Verify your instruction files

Your CLAUDE.md lies to your agent. Here's the fix.

Hand-written CLAUDE.md files rot silently. Here's what a typical one looks like:

```markdown
## Code Style

Never use `any` — the `@typescript-eslint/no-explicit-any` rule
catches this. Always use `unknown` and narrow with type guards.
See `src/utils/type-helpers.ts` for project utilities.

## Testing

Run `npm run typecheck` before submitting. Every service in
src/services/ should have a corresponding test file.
```

Reads fine. Four things are wrong:

1. `@typescript-eslint/no-explicit-any` — disabled to unblock a deadline, never re-enabled
2. `src/utils/type-helpers.ts` — renamed to `src/utils/narrowing.ts` last quarter
3. `npm run typecheck` — script removed from package.json
4. Service/test pairing — no automated check, just a hope

The agent reads this, trusts it, and writes code based on stale claims nobody verified. vigiles **verifies the references in your instruction files** — that each linter rule exists and is enabled, that every file path and script is real, and that referenced **code symbols** (functions, classes, constants) actually exist in the files that define them — and meets you at whatever commitment level you want.

Two levels, both independently useful: start in **markdown** (no new files), step up to a **typed spec** when you want compiler-grade guarantees.

### Markdown mode — no new files, no TypeScript

Add a comment to your existing CLAUDE.md and audit it:

```md
<!-- vigiles:enforce eslint/no-console "Route output through logger.ts" -->
```

```bash
npx vigiles audit CLAUDE.md
```

Each rule is checked against your real linter config — typos get closest-match suggestions, disabled rules are flagged. `vigiles audit` enforces them in CI. Zero install commitment, zero new files.

> **Want editor autocomplete?** Promote the rules into a `vigiles:` YAML frontmatter block and run `npx vigiles generate-schema` — your editor's YAML language server then autocompletes rule names and red-squiggles typos at edit time, still with no TypeScript. Same enforcement, nicer authoring. [Markdown mode →](docs/markdown-mode.md)

### Typed spec — compiler-grade guarantees

When you want the strongest guarantees, compile a typed spec. Every linter rule reference is verified against your real config, every file path against the filesystem, every npm script against package.json. Stale references become compile errors — caught at edit time, not when the agent silently ignores you.

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

```bash
$ npx vigiles compile

✓ CLAUDE.md.spec.ts → CLAUDE.md
  2 rules (1 linter-verified, 1 guidance)
  ~180 tokens
```

At this level the spec is the source of truth and CLAUDE.md is a build artifact. The agent edits the spec — hooks auto-compile, types catch typos in the editor, CI catches drift.

Companion repo for [Feedback Loop Is All You Need](https://zernie.com/blog/feedback-loop-is-all-you-need).

## What Changes With vigiles

### Claude Code

|                                     | Without vigiles              | With vigiles                                                   |
| ----------------------------------- | ---------------------------- | -------------------------------------------------------------- |
| **Instructions**                    | Hand-written CLAUDE.md       | Compiled from `.spec.ts` (build artifact)                      |
| **Linter rule references**          | Trust-based (nobody checks)  | Verified at compile time against real config                   |
| **File paths**                      | Rot silently when renamed    | `file()` references checked against filesystem                 |
| **Commands**                        | Stale scripts go unnoticed   | `cmd()` references checked against package.json                |
| **Direct edits to CLAUDE.md**       | Anyone can, nobody knows     | PreToolUse hook blocks edits, redirects to spec                |
| **Spec edits**                      | N/A                          | PostToolUse hook auto-compiles to markdown                     |
| **Linter config changes**           | CLAUDE.md drifts out of sync | PostToolUse hook auto-regenerates types                        |
| **guidance → enforce upgrades**     | Manual guesswork             | `/strengthen` reads per-linter docs, suggests upgrades         |
| **New lint rules from PR feedback** | Copy-paste from review       | `/pr-to-lint-rule` generates rule + tests + spec entry         |
| **CI**                              | Nothing to verify            | `vigiles audit` catches hand-edits, disabled rules, stale refs |

<details>
<summary><b>Codex</b> (same compile-time checks, no hooks)</summary>

|                               | Without vigiles                  | With vigiles                                            |
| ----------------------------- | -------------------------------- | ------------------------------------------------------- |
| **Instructions**              | Hand-written AGENTS.md           | Compiled from `.spec.ts`                                |
| **Linter rule references**    | Trust-based                      | Verified at compile time                                |
| **File paths / commands**     | Rot silently                     | Checked at compile time                                 |
| **Direct edits to AGENTS.md** | Undetected                       | CI catches hash mismatch                                |
| **Hooks / auto-compile**      | Not available (no plugin system) | Not available — run `vigiles compile` manually or in CI |
| **CI**                        | Nothing to verify                | Same `vigiles audit` pipeline as Claude                 |

</details>

Everything vigiles compiles and audits is **deterministic** — same input, same output, no LLM in the loop. The non-deterministic parts (authoring specs, suggesting upgrades, writing custom rules) are agent skills that run outside the compilation pipeline. [Determinism breakdown and flow diagram →](docs/comparison.md)

## Quick Start

The fastest path is markdown mode — add a marker to your existing CLAUDE.md and audit it, no install or new files (see [markdown mode](#markdown-mode--no-new-files-no-typescript) above and [docs/markdown-mode.md](docs/markdown-mode.md)). When you want compiler-grade guarantees, scaffold a typed spec:

```bash
npx vigiles init
```

The wizard auto-detects your project, creates a spec, scans your linters, compiles to markdown, adds a CI step, and installs Claude Code hooks. After install: the agent edits the spec (hooks block direct CLAUDE.md edits), the spec auto-compiles on save, and `vigiles audit` catches drift in CI.

Start with `guidance()` rules (zero config). When you're ready, run `/strengthen` to find rules that can be upgraded to compile-verified `enforce()`. Already have a hand-written CLAUDE.md? The wizard detects it and offers migration. Flags (`--strict`, `--target=AGENTS.md`, `--no-gha`) and non-interactive agent usage are in the [CLI reference](docs/cli.md) and [agent setup guide](docs/agent-setup.md).

## Three Rule Types

**`enforce()`** — delegated to a linter. vigiles verifies the rule exists in the catalog AND is enabled in your project config. A disabled rule is a compile error.

<!-- vigiles:ignore -->

```typescript
"no-any":    enforce("@typescript-eslint/no-explicit-any", "Use unknown and narrow."),
"no-print":  enforce("ruff/T201", "Use logging module."),
"no-unwrap": enforce("clippy/unwrap_used", "Use expect() with context."),
```

Supports ESLint, Stylelint, Ruff, Clippy, Pylint, RuboCop, and Cedar policies. [Full linter support details →](docs/linter-support.md)

**`guidance()`** — prose advice. No mechanical enforcement, but not untracked: guidance rules participate in the monotonicity proof system. Once a rule exists, it can be strengthened ( `guidance` → `enforce` ) but never weakened or removed without an explicit allowlist. This prevents silent erosion of conventions over time.

```typescript
"research-first": guidance("Google unfamiliar APIs first."),
```

**`guard()`** — reactive: runs a command when watched files change (e.g. `*.spec.ts` → `npx vigiles compile`). One declaration emits hooks for every supported system (Claude Code PostToolUse, husky pre-commit, etc.) — no copy-pasting the same trigger across `.claude/settings.json`, `.husky/`, and CI. Same monotonicity guarantees as `enforce()`. [Full spec format →](docs/spec-format.md)

## Verified References

`file()`, `cmd()`, `symbol()`, and `ref()` catch stale references at compile time:

```typescript
import { claude, file, cmd, symbol, ref, instructions } from "vigiles/spec";

export default claude({
  sections: {
    architecture: instructions`
      Core engine in ${file("src/compile.ts")}.
      Compile specs with ${symbol("src/compile.ts", "compileClaude")}.
      Run ${cmd("npm test")} to verify.
      See ${ref("skills/strengthen/SKILL.md")} for the strengthen skill.
    `,
    // If any path / script / symbol is stale → compile error
  },
  // ...
});
```

There's a small family of inline **marks** that `audit` checks, each binding a reference to its real source:

- `` `vigiles:symbol file#name` `` — the named file actually **defines** that symbol (function, class, method, constant), parsed with [ast-grep](https://ast-grep.github.io) across **JS/TS, Python, Ruby, Rust, and CSS**. Rename it and `audit` fails; in markdown mode the `refs-hook` **forces the mark**, blocking edits that leave a code reference bare. [Details →](research/symbol-verification.md)
- `` `vigiles:mcp server#tool` `` — the referenced **MCP tool exists** on its server. `audit` reads `.mcp.json`, starts the server, lists its tools, and flags a renamed/removed one with a "did you mean" — catching e.g. the GitHub MCP server renaming `create_issue` → `issue_write`, which otherwise fails silently.

**Typo-safe at authoring time, too.** `vigiles generate-types` emits a `.vigiles/generated.d.ts` so `enforce("eslint/no-consolee")` red-squiggles in your editor; `generate-schema` gives the YAML-frontmatter mode the same via your YAML language server. Both have `--check` CI freshness modes. [How it works →](docs/linter-support.md#generate-types)

## Test your Claude Code harness

Verifying references proves your instructions are _true_ — but the hooks and
skills that enforce them still have to **actually fire**. A hook can be wired
wrong, a skill's description can fail to trigger, injected context can never reach
the model — all silently, all passing a naive "did it run?" check. So vigiles's
second pillar **tests the harness itself**, as the assembled machine it ships as.

It's a small library of plain async functions (drops into node:test / vitest /
jest, or a zero-setup `vigiles test`), with three tiers, cheapest first. The
design bet is **deterministic and cheap**: the first two tiers never call a model
or need an API key, so they run on every commit for free — the opposite of
eval-only frameworks like promptfoo, where every run hits a real model **by
design**. You only reach for the paid real-model tier when the question genuinely
needs it.

- **Unit-test a hook** — `runHook` hands a hook a fake event and checks block/allow. No `claude`, no model, milliseconds, reaches **every** event type.
- **Deterministic harness test** — `runHarnessTest` runs the **real** `claude` against a **scripted mock model**, so your hooks fire for real with no API key and the same result every time.
- **Eval** — `runEval` runs the real model A/B (change on vs off) and reports the gap as **mean ± se**, with a Welch-t-test [significance gate](docs/harness-testing.md#significance--is-the-gap-real), regression baselines, and cost/latency/token tracking.

```typescript
import { runHook } from "vigiles/run-hook";

const r = runHook(guardCommand, {
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command: "git commit --no-verify" },
});
assert(r.blocked); // exit 2 / decision:"block" / permissionDecision:"deny"
```

**[Full guide → `docs/harness-testing.md`](docs/harness-testing.md)** — the tier
walkthrough, testing skills for real, "fired ≠ landed" (`trace.modelRequests`),
the safe-by-default sandbox for untrusted plugins, the surface × tier coverage
matrix, and how it compares to promptfoo. Also: [benchmarks](research/benchmarks-runtime-gates.md).

## CLI & CI

```bash
npx vigiles init        # Scaffold a spec (full setup wizard)
npx vigiles compile     # Compile .spec.ts → .md
npx vigiles audit       # Verify hashes + inline/frontmatter/spec rules + symbols + coverage
npx vigiles test        # Run *.harness.mjs deterministic harness tests (no API key)
npx vigiles eval        # Run *.eval.mjs real-model harness evals (--trials=N)
```

`vigiles audit` enforces four rules — `require-spec`, `require-skill-spec`, `integrity`, `coverage` — configurable in `.vigilesrc.json`. The GitHub Action runs `audit` by default; the Claude Code plugin (`npx skills add zernie/vigiles`) adds the Pre/PostToolUse hooks that block direct `.md` edits and auto-compile specs. [Full CLI, Action, plugin & validation reference →](docs/cli.md)

## Skills

Install with [Vercel Skills](https://github.com/vercel-labs/skills): `npx skills add zernie/vigiles`

<details>
<summary><b>The 8 skills</b></summary>

| Skill                  | What it does                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `strengthen`           | Upgrade `guidance()` → `enforce()` using linter-specific reference docs                           |
| `edit-spec`            | Edit a spec file — guided workflow with compile step                                              |
| `migrate-to-spec`      | Convert a hand-written CLAUDE.md to a typed `.spec.ts`                                            |
| `generate-rule`        | Add a new `enforce()` / `guidance()` rule to a spec                                               |
| `pr-to-lint-rule`      | Turn a recurring PR review comment into a lint rule + spec entry                                  |
| `enforce-rules-format` | Validate all rules have enforcement classification                                                |
| `audit-feedback-loop`  | Score your repo's feedback loop maturity                                                          |
| `test-harness`         | Test a Claude Code harness — pick the tier (unit / deterministic / eval) and write a passing test |

</details>

## Related Tools

vigiles composes with other tools rather than replacing them: architectural linters ([ast-grep](https://ast-grep.github.io/), [Dependency Cruiser](https://github.com/sverweij/dependency-cruiser)) referenced via `enforce()`, and file-sync tools ([Ruler](https://github.com/intellectronica/ruler), [rulesync](https://github.com/dyoshikawa/rulesync)) that distribute the compiled output. [How it fits with each, and why runtime-LLM rule checkers are the opposite paradigm →](docs/related-tools.md)

## Documentation

- **[docs/](docs/README.md)** — how-to & reference: the adoption ladder, CLI, linter support, the harness-testing guide, skills/agents.
- **[research/](research/README.md)** — the thinking behind it: design docs, the [harness-testing coverage roadmap](research/harness-testing-coverage-matrix.md), benchmark findings, landscape, and parked ideas.

## License

[MIT](LICENSE)
