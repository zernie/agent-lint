<p align="center">
  <img src="logo.png" width="140" alt="vigiles logo" />
</p>

<h1 align="center">vigiles</h1>

<p align="center">
  <em>Quis custodiet ipsos custodes?</em> — Who watches the watchmen?
</p>

<p align="center">
  <strong>The missing linting + testing layer for agentic coding.</strong><br />
  vigiles <strong>lints</strong> the references your instruction files make — linter rules, file paths, scripts, code symbols — and <strong>tests</strong> whether your hooks, skills, and CLAUDE.md actually change what the agent does.
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

- [**Two pillars — pick one or both**](#two-pillars--pick-one-or-both)
- **Pillar 1** — [verify your instruction files](#verify-your-instruction-files) · full guide: [docs/verifying-instruction-files.md](docs/verifying-instruction-files.md)
- **Pillar 2** — [test your Claude Code harness](#test-your-claude-code-harness) · full guide: [docs/harness-testing.md](docs/harness-testing.md)
- [Quick start](#quick-start) · [CLI & CI](#cli--ci) · [Skills](#skills) · [Related tools](#related-tools)

</details>

## Two pillars — pick one or both

An agent runs real commands in your repo — it can delete the wrong files, leak a secret, or burn tokens looping on a stale instruction nobody checked. You'd never ship an app without a linter and a test suite. An AI agent steering your codebase is no different — so why is its harness trusted on vibes?

`Agent = Model + Harness`. Your harness is everything that steers a run — the **instructions** you write _and_ the **hooks, skills, and settings** that enforce them. vigiles is the **missing linting + testing layer for agentic coding**: it **lints** your instruction files and **tests** your harness. Two pillars of equal weight — adopt either on its own, or both:

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

> **Set it up — paste this into Claude Code:**
>
> > Install vigiles and verify my instruction files. Scan my CLAUDE.md / AGENTS.md, turn its real claims into checked references (linter rules, file paths, scripts, symbols), run `vigiles audit`, and show me what's already stale. Use sensible defaults, but **ask me first** whether to stay in markdown mode or generate a typed `.spec.ts`, and whether to wire the audit into CI and install the edit-blocking hooks.

Or do it by hand — add a marker to your existing CLAUDE.md and audit it, no install, no new files:

```md
<!-- vigiles:enforce eslint/no-console "Route output through logger.ts" -->
```

```bash
npx vigiles audit CLAUDE.md
```

Each reference is checked against reality — a typo gets a closest-match suggestion, a disabled rule is flagged. That's **markdown mode**; step up to a **typed spec** (`.spec.ts` → compiled CLAUDE.md, compiler-grade guarantees) when you want it.

→ **Full guide: [docs/verifying-instruction-files.md](docs/verifying-instruction-files.md)** — the adoption ladder, the three rule types (`enforce` / `guidance` / `guard`), verified references (`file` / `cmd` / `symbol` / `ref`), and the before/after tables.

## Quick Start

```bash
npx vigiles init
```

The wizard auto-detects your project, creates a spec, scans your linters, compiles to markdown, adds a CI step, and installs Claude Code hooks. After install: the agent edits the spec (hooks block direct CLAUDE.md edits), the spec auto-compiles on save, and `vigiles audit` catches drift in CI. Prefer no new files? Stay in [markdown mode](docs/markdown-mode.md). Start with `guidance()` rules and `/strengthen` them to `enforce()` later; flags and agent usage are in the [CLI reference](docs/cli.md).

Companion repo for [Feedback Loop Is All You Need](https://zernie.com/blog/feedback-loop-is-all-you-need).

## Test your Claude Code harness

Verifying references proves your instructions are _true_ — but the hooks and
skills that enforce them still have to **actually fire**. A hook can be wired
wrong, a skill's description can fail to trigger, injected context can never reach
the model — all silently, all passing a naive "did it run?" check. So vigiles's
second pillar **tests the harness itself**, as the assembled machine it ships as.

> **Set it up — paste this into Claude Code:**
>
> > Install vigiles and use its `test-harness` skill to write and run a harness test for this project. If I didn't say what to test, pick something real from my hooks / skills / settings, choose the cheapest tier (unit / deterministic / eval), write the test, and run it. Use good defaults, but **ask me** whether to gate it in CI and whether to add a real-model eval.

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
import { runHook } from "vigiles/testing";

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

- **The two pillar guides:** [verifying instruction files](docs/verifying-instruction-files.md) (Pillar 1) · [testing your harness](docs/harness-testing.md) (Pillar 2).
- **[docs/](docs/README.md)** — the full how-to & reference index: adoption ladder, CLI, linter support, skills/agents.
- **[research/](research/README.md)** — the thinking behind it: design docs, the [harness-testing coverage roadmap](research/harness-testing-coverage-matrix.md), benchmark findings, landscape, and parked ideas.

## License

[MIT](LICENSE)
