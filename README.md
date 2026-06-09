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

---

<details>
<summary><b>Contents</b></summary>

**Pillar 1 — verify your instruction files** · references your CLAUDE.md makes that a linter, the filesystem, and package.json can prove

- Three adoption levels: [inline comments](#level-0--inline-comments-30-seconds-no-new-files) → [YAML frontmatter](#level-1--yaml-frontmatter-editor-autocomplete-still-no-typescript) → [typed spec](#level-2--typed-spec-compiler-grade-guarantees)
- [What changes with vigiles](#what-changes-with-vigiles)
- [Quick start](#quick-start)
- [Three rule types](#three-rule-types) — `enforce` / `guidance` / `guard`
- [Verified references](#verified-references) — `file` / `cmd` / `symbol` / `ref`

**Pillar 2 — [test your Claude Code harness](#test-your-claude-code-harness)** · eval whether your hooks, skills, and CLAUDE.md actually change what the agent does

- [Level 1 — unit-test a hook (no AI)](#level-1--test-a-hook-by-itself-no-ai-milliseconds)
- [Level 2 — does it fire in a real session?](#level-2--does-it-fire-in-a-real-session-free-scripted-ai)
- [Level 3 — does it change behaviour?](#level-3--does-it-change-what-claude-does-real-ai-occasional)
- [Test skills for real + assert on actions](#test-your-skills-for-real--and-assert-on-what-claude-did)
- [Run them in CI](#run-them-in-ci)

**More** — [CLI & CI](#cli--ci) · [Skills](#skills) · [Maturity levels](#maturity-levels) · [Related tools](#related-tools)

</details>

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

Three levels. Each is independently useful; adopt as far up as you like.

### Level 0 — inline comments (30 seconds, no new files)

Add a comment to your existing CLAUDE.md and audit it:

```md
<!-- vigiles:enforce eslint/no-console "Route output through logger.ts" -->
```

```bash
npx vigiles audit CLAUDE.md
```

Each rule is checked against your real linter config — typos get closest-match suggestions, disabled rules are flagged. Zero install commitment, zero new files.

### Level 1 — YAML frontmatter (editor autocomplete, still no TypeScript)

Promote your rules into a `vigiles:` block at the top of the file:

```yaml
---
# yaml-language-server: $schema=./.vigiles/schema.json
vigiles:
  enforce:
    - rule: "@typescript-eslint/no-explicit-any"
      why: "Use unknown and narrow with type guards."
    - rule: eslint/no-console
      why: "Route output through logger.ts"
---
```

`npx vigiles generate-schema` emits a JSON Schema from your project's _actual_ enabled rules, so your editor's built-in YAML language server (VS Code, JetBrains, neovim) autocompletes rule names and red-squiggles typos — at edit time, with no TypeScript in the project. `vigiles audit` enforces the same rules in CI. [Markdown mode →](docs/markdown-mode.md)

### Level 2 — typed spec (compiler-grade guarantees)

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

The fastest path is markdown mode — add a marker to your existing CLAUDE.md and audit it, no install or new files (see [Level 0 / Level 1](#level-0--inline-comments-30-seconds-no-new-files) above and [docs/markdown-mode.md](docs/markdown-mode.md)). When you want compiler-grade guarantees, scaffold a typed spec:

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

**Symbol references are cross-language.** `symbol("file", "name")` (and the markdown mark `` `vigiles:symbol file#name` ``) verify the named file actually **defines** the symbol — function, class, method, or constant — parsed with [ast-grep](https://ast-grep.github.io) across **JS/TS, Python, Ruby, Rust, and CSS**. Rename it and `audit` fails. In markdown mode the `refs-hook` (PostToolUse) **forces the mark**, blocking edits that leave a code reference bare. [Symbol verification →](research/symbol-verification.md)

**Typo-safe at authoring time, too.** `vigiles generate-types` emits a `.vigiles/generated.d.ts` so `enforce("eslint/no-consolee")` red-squiggles in your editor; `generate-schema` gives Level 1 frontmatter the same via your YAML language server. Both have `--check` CI freshness modes. [How it works →](docs/linter-support.md#generate-types)

## Test your Claude Code harness

You wrote hooks, a skill, a CLAUDE.md rule — how do you know they work, beyond
running Claude and eyeballing it? vigiles ships a library to **test the harness
itself**, at three levels, cheapest first. It's plain async functions, so it
drops into **node:test / vitest / jest**, or a zero-setup `vigiles test`.

### Level 1 — test a hook by itself (no AI, milliseconds)

A hook is just a process that's handed a "Claude is about to do X" event and
answers block/allow. Hand it a fake event and check the answer — no `claude`, no
model, and **every** event type is reachable (incl. Edit/Write, PreCompact,
SessionEnd):

```typescript
import { runHook } from "vigiles/run-hook";

const r = runHook(guardCommand, {
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command: "git commit --no-verify" },
});
assert(r.blocked); // exit 2 / decision:"block" / permissionDecision:"deny"
```

The same shape governs **MCP tools** — the dominant real MCP test — with no
server running, because the hook only sees the tool _name_:

```typescript
// block the destructive github-MCP tool; read-only ones pass
runHook(guard, {
  hook_event_name: "PreToolUse",
  tool_name: "mcp__github__merge_pull_request",
  tool_input: { pull_number: 42 },
}).blocked; // true
```

### Level 2 — does it fire in a real session? (free, scripted "AI")

Right logic ≠ wired in correctly. `runHarnessTest` runs the **real** `claude`
against a **scripted mock model** you control — your hooks fire for real, the
agent's turns are fixed, no API key, same result every time. Covers the
governance shapes: SessionStart, Stop, UserPromptSubmit, and Bash **and
Edit/Write** Pre/PostToolUse.

```typescript
import { runHarnessTest, scriptModel } from "vigiles/harness-test";

const r = await runHarnessTest({
  settings: {
    hooks: {
      Stop: [
        { hooks: [{ type: "command", command: "test -f DONE || exit 2" }] },
      ],
    },
  },
  model: scriptModel([
    { text: "I'm done" }, // tries to stop → blocked (no DONE)
    { tool: "Bash", input: { command: "touch DONE" } },
    { text: "now done" },
  ]),
});
assert(JSON.parse(r.stdout).num_turns > 1); // the Stop hook forced more work
```

### Level 3 — does it change what Claude does? (real AI, occasional)

`runEval` runs the **real** model N times with your change **on vs off** and
reports the gap. Costs tokens, so you run it now and then — not on every save:

```typescript
import { runEval, formatEvalReport } from "vigiles/eval";

const report = await runEval({
  arms: { off: {}, on: { settings: { hooks: { PostToolUse: [refsHook] } } } },
  task: "Document chargeCard in SKILL.md, referencing it by name.",
  measure: (ctx) => ({
    marked: ctx.sh("grep -c vigiles:symbol SKILL.md") !== "0",
  }),
  trials: 6,
});
console.log(formatEvalReport(report)); // off marked=0.00   on marked=0.50
```

### Test your skills for real — and assert on what Claude _did_

Install a plugin the way Claude actually does (`pluginDir` → `--plugin-dir`) so
its **skills genuinely activate**, then assert on the agent's _actions_, not a
stdout grep:

```typescript
import { assertSkillResolved, assertToolNotUsed } from "vigiles/harness-assert";

const r = await runHarnessTest({
  pluginDir: "./my-plugin",
  transcript: true, // populate r.toolCalls
  allowedTools: ["Read", "Write", "Bash", "Skill"],
  model: scriptModel([
    { tool: "Skill", input: { skill: "my-plugin:greet" } },
    { text: "ok" },
  ]),
});
assertSkillResolved(r, "my-plugin:greet"); // the skill fired, no error
assertToolNotUsed(r, /^mcp__github__merge/); // the safety negative: the scary tool was never called
```

`assertToolNotUsed` is how you test a safety rule **honestly** — _proving_ the
dangerous tool was never used, which "the file looks unchanged" can't. It works
on **real third-party plugins** too: the suite confirms real `obra/superpowers`
and `wshobson/agents` skills resolve this way, with no markers injected.

### Run them in CI

`vigiles test` runs `*.harness.mjs` files (free, no key); `vigiles eval` runs
`*.eval.mjs` files (real model). Point a test at a whole plugin (or `"./"` for
your repo) to load **what ships** — hooks (with `${CLAUDE_PLUGIN_ROOT}`
resolved), CLAUDE.md, skills, subagents, commands — and `loadPlugin().warnings`
flags anything only a real model can drive, so you never silently test an empty
machine.

```bash
npx vigiles test examples/harness/policy-gate.harness.mjs
npx vigiles eval --trials=6 examples/harness/skill-outcome.eval.mjs
```

[Full guide → `docs/harness-testing.md`](docs/harness-testing.md) · [what's covered (matrix)](research/harness-testing-coverage-matrix.md) · [benchmarks](research/benchmarks-runtime-gates.md).

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

| Skill                  | What it does                                                            |
| ---------------------- | ----------------------------------------------------------------------- |
| `strengthen`           | Upgrade `guidance()` → `enforce()` using linter-specific reference docs |
| `edit-spec`            | Edit a spec file — guided workflow with compile step                    |
| `migrate-to-spec`      | Convert a hand-written CLAUDE.md to a typed `.spec.ts`                  |
| `generate-rule`        | Add a new `enforce()` / `guidance()` rule to a spec                     |
| `pr-to-lint-rule`      | Turn a recurring PR review comment into a lint rule + spec entry        |
| `enforce-rules-format` | Validate all rules have enforcement classification                      |
| `audit-feedback-loop`  | Score your repo's feedback loop maturity                                |

## Maturity Levels

From [Feedback Loop Is All You Need](https://zernie.com/blog/feedback-loop-is-all-you-need):

| Level | Name                 | What it means                                                       |
| ----- | -------------------- | ------------------------------------------------------------------- |
| 0     | Vibes                | No CI, no linters, no CLAUDE.md                                     |
| 1     | Guardrails           | CI + standard linters, no custom rules                              |
| 2     | Architecture as Code | Custom lint rules + enforced CLAUDE.md                              |
| 3     | The Organism         | CI + custom rules + visual tests + observability + scheduled agents |

## Related Tools

vigiles owns one thing: compile-time verification of typed specs against real linter configs, filesystems, and package.json, plus testing the harness those specs describe. Everything else it composes with rather than replaces — architectural linters ([ast-grep](https://ast-grep.github.io/), [Dependency Cruiser](https://github.com/sverweij/dependency-cruiser)) referenced via `enforce()`, file-sync tools ([Ruler](https://github.com/intellectronica/ruler), [rulesync](https://github.com/dyoshikawa/rulesync)) that distribute the compiled output, and markdown/prose linters that check a different layer. [How vigiles composes with each, and why runtime-LLM rule checkers are the opposite paradigm →](docs/related-tools.md)

## License

[MIT](LICENSE)
