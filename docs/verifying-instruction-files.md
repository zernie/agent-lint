# Verifying your instruction files

**`vigiles lint` checks every reference in your CLAUDE.md against reality.** A dead file path, a missing script, a renamed symbol, or a linter rule that doesn't exist (or exists but is disabled) is caught before the agent trusts a stale claim and acts on it.

> The [README](../README.md) has the 30-second pitch; this is the full guide. For the testing layer, see [Testing your harness](harness-testing.md).

## Two ways to lint: a typed spec (the default) or plain markdown

**The default is a typed spec your agent writes.** `init` adopts your existing CLAUDE.md into one. The `edit-spec` and `strengthen` skills keep it current, so you rarely hand-write a `.spec.ts`. Prefer zero new files, or not ready for TypeScript? Plain markdown with inline comments lints too — and gives up nothing on reference verification.

### Markdown mode — the zero-setup floor

Add a comment to your existing CLAUDE.md and lint it:

```md
<!-- vigiles:enforce eslint/no-console "Route output through logger.ts" -->
```

```bash
npx vigiles lint CLAUDE.md
```

Each rule is checked against your real linter config. Typos get closest-match suggestions. Disabled rules are flagged. `vigiles lint` enforces them in CI. Zero install commitment, zero new files.

> **Want editor autocomplete?** Move the rules into a `vigiles:` YAML frontmatter block. `init` already generated the schema, so your editor's YAML language server autocompletes rule names and squiggles typos at edit time — no TypeScript required. [Markdown mode →](markdown-mode.md)

### Typed spec — the default

**You rarely hand-write one.** The `edit-spec` and `strengthen` skills write and update the spec from a plain-English ask. A hook recompiles it on save. The spec is what `init` sets up, and the agent manages it — not a chore. The deeper **compiler-grade guarantees** are gradual and opt-in, like TypeScript's `strict` — [why opt-in?](faq.md#why-are-the-strongest-guarantees-opt-in-not-the-default)

**Markdown mode is not a lesser tier for verification.** It squiggles rule typos at edit time (via the YAML schema `init` generates). Its inline marks — `vigiles:file`, `vigiles:cmd`, `vigiles:symbol`, `vigiles:enforce` — verify file paths, scripts, symbols, and linter rules woven into the prose, exactly like the spec. If you have one instruction file and don't need to generate or share rules, stay in markdown. You give up nothing on reference verification.

**A typed spec adds one thing markdown can't: rules and instructions become composable, type-checked code.**

- **Compose and reuse.** Share a rule-set across many files or repos, generate rules programmatically, and let `tsc` make a stale reference _unrepresentable_ as you author — not just flagged on `lint`.
- **One hashed source.** `compile` stamps the emitted CLAUDE.md with an integrity hash, so agent edits to the spec and hand-edits to the artifact are caught. (This only matters once you've chosen the spec-as-source model. In markdown the file _is_ the source, so there's no drift to detect.)
- **Monotonicity proofs.** A rule can be strengthened (`guidance` → `enforce`) but never silently weakened or removed, gated by the proof system.

The spec is the default — and the clear choice once you're standardizing rules across a codebase, generating them, or wanting the integrity hash. For a single instruction file, markdown is a fully capable floor you can stay on.

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

`npx vigiles compile` turns that into CLAUDE.md. From there the loop runs itself: the agent edits the spec, hooks auto-compile, types catch typos in the editor, and CI catches drift.

## Three rule types

**`enforce()`** — delegated to a linter. vigiles verifies the rule exists in the catalog AND is enabled in your project config. A disabled rule is a compile error.

<!-- vigiles:ignore -->

```typescript
"no-any":    enforce("@typescript-eslint/no-explicit-any", "Use unknown and narrow."),
"no-print":  enforce("ruff/T201", "Use logging module."),
"no-unwrap": enforce("clippy/unwrap_used", "Use expect() with context."),
```

Supports ESLint, Stylelint, Ruff, Clippy, Pylint, RuboCop, and Cedar policies. [Full linter support details →](linter-support.md)

**`guidance()`** — prose advice with no mechanical enforcement. Not untracked, though: guidance rules join the monotonicity proof system, so a rule can be strengthened (`guidance` → `enforce`) but never silently weakened or removed without an explicit allowlist.

**`guard()`** — reactive: runs a command when watched files change (e.g. `*.spec.ts` → `npx vigiles compile`). One declaration emits the hook for every supported system — Claude Code PostToolUse, husky pre-commit, CI — with no copy-pasting the trigger across each. [Full spec format →](spec-format.md)

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

There's a small family of inline **marks** that `lint` checks, each binding a reference to its real source:

- `` `vigiles:symbol file#name` `` — **the named file actually defines that symbol** (function, class, method, constant), parsed with [ast-grep](https://ast-grep.github.io) across JS/TS, Python, Ruby, Rust, and CSS. Rename it and `lint` fails. In markdown mode the `refs-hook` forces the mark, blocking edits that leave a code reference bare.
- `` `vigiles:mcp server#tool` `` — **the referenced MCP tool exists on its server.** `lint` reads `.mcp.json`, starts the server, lists its tools, and flags a renamed/removed one with a "did you mean" — catching e.g. the GitHub MCP server renaming `create_issue` → `issue_write`, which otherwise fails silently.

**Typo-safe at authoring time, too.** `vigiles generate types` emits a `.vigiles/generated.d.ts` so `enforce("eslint/no-consolee")` red-squiggles in your editor. `generate-schema` gives the YAML-frontmatter mode the same via your YAML language server. Both have `--check` CI freshness modes. [How it works →](linter-support.md#generate-types)

## From prose to enforced: the rule map

`vigiles audit` reads the prose rules in your instruction file and **maps** each one to how it could be enforced. This is a **read-only, deterministic** step — no model runs, nothing executes, and it's identical on every machine. It just sorts your rules into four lanes:

| Lane                  | Meaning                                                                                                                                           | The honest next step (opt-in)                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✓ **Enforceable now** | matches an off-the-shelf linter rule (ESLint/Ruff/…) — and the map shows whether it's already on, one line away, or **documented but turned off** | enable it in your lint config (one line), or ask your agent to run the **`strengthen`** skill                                                                          |
| ⛓ **Hook**            | an action a linter can't see (`git push`, "run tests before commit")                                                                              | author a [compiled hook](compiled-hooks.md), then `vigiles compile` wires it into your settings                                                                        |
| ✎ **Prose**           | a judgment call no checker can decide ("keep it readable")                                                                                        | honestly stays prose                                                                                                                                                   |
| ⚙ **Hard to codify**  | looks like a code rule but no off-the-shelf rule matches                                                                                          | stays prose — custom-rule **synthesis** (writes a rule + a soundness gate) is experimental and not yet generally available; nothing is generated for you automatically |

**What runs a model is always a skill _you_ invoke** — on your own subscription, behind consent. `audit` maps and reports; it never rewrites your config, compiles a rule, or calls a model on its own. Installing vigiles does **not** start compiling anything.

> **"Compile" means one thing here.** `vigiles compile` builds your `CLAUDE.md` and hooks from typed sources — it is unrelated to the rule map above. The map's "hard to codify" lane hands off to a _synthesis_ skill, never to `vigiles compile`.

## The validation rules — the full matrix

Beyond the references above, `vigiles lint` runs a set of **deterministic validation rules** over your instruction files, skills, subagents, and hooks. Each has a default severity (`"warn"` / `"error"` / `false`) and is configured in `.vigilesrc.json`. Every rule is **deterministic** — no model, no API key — and links to its own reference doc.

**Not every rule applies to every harness.** A rule is scoped to the _surface_ it checks and runs only where the active harness has that surface. Where the surface doesn't exist, `vigiles lint` reports the rule as **n/a** — loud, never a silent pass or failure. That's what lets one config target Claude Code _and_ Codex without duplicating rules per harness.

| Surface (the gate)          | Rules                                                                                                                                                           | Applies to                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Instruction file &amp; docs | `require-instructions-spec`, `integrity`, `coverage`, `unmarked-refs`, `orphan-docs`                                                                            | all harnesses                             |
| Skills                      | `untested-skill`, `skill-frontmatter`, `description-overlap`, `skill-description-budget`, `frontmatter-valid`, `skill-resource-resolves`, `skill-missing-fence` | all with skills                           |
| Plugin layout               | `plugin-dir-layout`                                                                                                                                             | all with a plugin manifest                |
| MCP                         | `mcp-config`                                                                                                                                                    | all with MCP                              |
| Shell hooks                 | `untested-hook`, `hook-script-exists`, `hook-events`, `hook-matcher`, `hook-block-ineffective`, `prefer-compiled-hooks`                                         | Claude Code, Codex                        |
| Subagents                   | `subagent-tool-contract`, `subagent-frontmatter`, `untested-subagent`, `mcp-tool-resolves`                                                                      | Claude Code (n/a on Codex — no subagents) |
| Safety (skills + subagents) | `lethal-trifecta`, `delegation-trifecta`                                                                                                                        | all (subagent half n/a on Codex)          |

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

| Rule                                                            | Default  | What it checks                                                               |
| --------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| [`skill-frontmatter`](rules/skill-frontmatter.md)               | `"warn"` | Recommend explicit skill `name`+`description` (reliable trigger)             |
| [`description-overlap`](rules/description-overlap.md)           | `"warn"` | No two model-invocable skills have near-identical descriptions               |
| [`skill-description-budget`](rules/skill-description-budget.md) | `"warn"` | A model-invocable skill's description isn't so long the trigger is buried    |
| [`frontmatter-valid`](rules/frontmatter-valid.md)               | `"warn"` | A skill/agent `---` block is valid YAML (js-yaml is strict — warn)           |
| [`skill-resource-resolves`](rules/skill-resource-resolves.md)   | `"warn"` | A SKILL.md body's bundled-file refs (`scripts/`/`references/`) exist on disk |
| [`skill-missing-fence`](rules/skill-missing-fence.md)           | `"warn"` | A SKILL.md opens with a `---` fence (else it loads as body and never fires)  |

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

Disable a rule for one file with `<!-- vigiles-disable require-instructions-spec -->` at the top of the markdown. `--strict` promotes `require-instructions-spec` to `"error"`.

`vigiles init` groups rules by confidence:

- **`structural`** — FP-safe correctness rules (broken tools / dead hooks / broken MCP / collisions). Gates at `error` by default.
- **`workflow`** — opinionated rules a clean repo can still fail because the work isn't done yet (`require-instructions-spec`, `untested-*`). Off by default; added by `--strict`.
- **`nudge`** — recommendations / acknowledged-noisy (`frontmatter-valid`, `skill-frontmatter`, `prefer-compiled-hooks`, `unmarked-refs`). Stays `warn` and never gates.

`--report-only` writes the whole gate at `warn` (nothing fails CI). See [the CLI guide](cli.md#init).

## The marking nudge — what happens on every file save

**Verification only works on references that are marked.** `enforce()`, `file()`, `cmd()`, a `vigiles:symbol` span, or an inline `<!-- vigiles:enforce -->` are all marks. An agent could write a reference as plain prose, which nothing can verify. To close that gap, the plugin ships a **PostToolUse hook that nudges the agent to mark references, in the loop**, the moment it edits an instruction file.

The flow, from save:

1. **The agent edits** `CLAUDE.md` / `AGENTS.md` / `SKILL.md`.
2. **The refs-hook fires** (`refs-nudge.sh` → `vigiles hook-runtime refs`) and scans the saved file for **unmarked linter-rule references** — a slash-scoped name with no file extension, like `` `eslint/no-console` `` — and for `vigiles:symbol` marks whose target is missing. (Deliberately narrow: bare identifiers like `` `runHook` `` and file paths are **not** flagged — too noisy.)
3. **It reacts by the `unmarked-refs` severity** (`.vigilesrc.json`):
   - **`"warn"` (default) → a non-blocking nudge.** The hook injects a message into the agent's context. The agent, still editing that file, can fix the references on the spot. Nothing is blocked.
   - **`"error"` → block.** The edit is rejected (exit 2) until the references are marked or ignored.
   - **`false` → off.**
4. **The deterministic backstop:** on commit (a git pre-commit hook) and in CI, `vigiles lint` / `vigiles refs` re-run the same check — the floor that catches anything the in-loop nudge didn't.

⚠️ **What it deliberately does not do:** it can't force a _plaintext_ reference (no backticks, pure prose) to become a mark. Distinguishing a load-bearing reference from ordinary prose is undecidable. The hook catches the high-signal, low-noise case (a backticked linter-rule name). Bare identifiers, paths, and prose are left to the shipped instructions, not the hook.

ℹ️ **Harness note:** the in-loop nudge is a hook, so it works on **Claude Code and Codex**. A harness without hooks doesn't get the per-save nudge — it falls back to the always-loaded instructions plus the `vigiles lint` CI floor. See the [`unmarked-refs` rule](rules/unmarked-refs.md).

## What changes with vigiles

### Claude Code

|                                  | Without vigiles              | With vigiles                                                                                    |
| -------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| **Instructions**                 | Hand-written CLAUDE.md       | Compiled from `.spec.ts` (build artifact)                                                       |
| **Linter rule references**       | Trust-based (nobody checks)  | Verified at compile time against real config                                                    |
| **File paths**                   | Rot silently when renamed    | `file()` references checked against filesystem                                                  |
| **Commands**                     | Stale scripts go unnoticed   | `cmd()` references checked against package.json                                                 |
| **Direct edits to CLAUDE.md**    | Anyone can, nobody knows     | PreToolUse hook blocks edits, redirects to spec                                                 |
| **Spec / config changes**        | CLAUDE.md drifts out of sync | PostToolUse hooks auto-compile and regenerate types                                             |
| **guidance → enforce upgrades**  | Manual guesswork             | `/strengthen` reads per-linter docs, suggests upgrades                                          |
| **Custom lint rules from prose** | Copy-paste from review       | Experimental — a synthesis skill drafts a rule + a soundness gate (not yet generally available) |
| **CI**                           | Nothing to verify            | `vigiles lint` catches hand-edits, disabled rules, stale refs                                   |

**Codex / AGENTS.md** gets the same compile-time checks and the same `vigiles lint` CI pipeline — just no hooks (no plugin system), so you run `vigiles compile` manually or in CI.

Everything vigiles compiles and lints is **deterministic** — same input, same output, no LLM in the loop. The non-deterministic parts (authoring specs, suggesting upgrades, writing custom rules) are agent skills that run outside the compilation pipeline. [Determinism breakdown and flow diagram →](comparison.md)

## See also

- [Markdown mode](markdown-mode.md) — the no-spec on-ramp (inline `<!-- vigiles:enforce -->` comments).
- [Spec format reference](spec-format.md) — every section and rule kind.
- [Linter support](linter-support.md) — the 7 catalogs + `generate-types` / `generate-schema`.
- [CLI & CI reference](cli.md) · [Agent setup](agent-setup.md).
- [Compiled hooks](compiled-hooks.md) — the deterministic **gate** instrument: author a hook that can't be wrong.
- [Skills monorepo adoption](skills-monorepo.md) — a CI-tested skill library or a plain `.claude/` repo (no `plugin.json`).
- [Testing your harness](harness-testing.md) — Layer 2.
