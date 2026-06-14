# Verifying your instruction files

Pillar 1 of vigiles — the **linting layer** for agentic coding. It checks that
every reference your CLAUDE.md / AGENTS.md makes is real: each linter rule exists
**and** is enabled, every file path and script resolves, and every referenced
code symbol actually exists in the file that defines it. Stale references can't
silently mislead the agent.

The [README](../README.md) has the 30-second pitch;
this is the full guide.

## Two on-ramps: markdown, then typed spec

Both are independently useful: start in **markdown** (no new files), step up to a
**typed spec** when you want compiler-grade guarantees.

### Markdown mode — no new files, no TypeScript

Add a comment to your existing CLAUDE.md and audit it:

```md
<!-- vigiles:enforce eslint/no-console "Route output through logger.ts" -->
```

```bash
npx vigiles audit CLAUDE.md
```

Each rule is checked against your real linter config — typos get closest-match
suggestions, disabled rules are flagged. `vigiles audit` enforces them in CI.
Zero install commitment, zero new files.

> **Want editor autocomplete?** Promote the rules into a `vigiles:` YAML
> frontmatter block and run `npx vigiles generate-schema` — your editor's YAML
> language server then autocompletes rule names and red-squiggles typos at edit
> time, still with no TypeScript. Same enforcement, nicer authoring.
> [Markdown mode →](markdown-mode.md)

### Typed spec — compiler-grade guarantees

When you want the strongest guarantees, compile a typed spec. Every linter rule
reference is verified against your real config, every file path against the
filesystem, every npm script against package.json. Stale references become
compile errors — caught at edit time, not when the agent silently ignores you.

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

`npx vigiles compile` turns that into CLAUDE.md (with an integrity hash). The spec
is the source of truth and CLAUDE.md is a build artifact: the agent edits the spec
— hooks auto-compile, types catch typos in the editor, CI catches drift.

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

There's a small family of inline **marks** that `audit` checks, each binding a
reference to its real source:

- `` `vigiles:symbol file#name` `` — the named file actually **defines** that
  symbol (function, class, method, constant), parsed with
  [ast-grep](https://ast-grep.github.io) across **JS/TS, Python, Ruby, Rust, and
  CSS**. Rename it and `audit` fails; in markdown mode the `refs-hook` **forces
  the mark**, blocking edits that leave a code reference bare.
  [Details →](../research/symbol-verification.md)
- `` `vigiles:mcp server#tool` `` — the referenced **MCP tool exists** on its
  server. `audit` reads `.mcp.json`, starts the server, lists its tools, and flags
  a renamed/removed one with a "did you mean" — catching e.g. the GitHub MCP
  server renaming `create_issue` → `issue_write`, which otherwise fails silently.

**Typo-safe at authoring time, too.** `vigiles generate-types` emits a
`.vigiles/generated.d.ts` so `enforce("eslint/no-consolee")` red-squiggles in your
editor; `generate-schema` gives the YAML-frontmatter mode the same via your YAML
language server. Both have `--check` CI freshness modes.
[How it works →](linter-support.md#generate-types)

## The marking nudge — what happens on every file save

Verification only works on references that are _marked_ (`enforce()`, `file()`,
`cmd()`, a `vigiles:symbol` span, or an inline `<!-- vigiles:enforce -->`). The
agent could just write a reference as plain prose, which nothing can verify. So
the plugin ships a **PostToolUse hook that nudges the agent to mark references,
in the loop**, the moment it edits an instruction file. The flow, from save:

1. **The agent edits** `CLAUDE.md` / `AGENTS.md` / `SKILL.md`.
2. **The refs-hook fires** (`refs-nudge.sh` → `vigiles refs-hook`) and scans the
   saved file for **code-shaped references that aren't marks** (a scoped name
   like `` `eslint/no-console` ``, a `camelCase`/`PascalCase` identifier) and for
   `vigiles:symbol` marks whose target is missing.
3. **It reacts by the `unmarked-refs` severity** (`.vigilesrc.json`):
   - **`"warn"` (default) → a non-blocking nudge.** The hook injects a message
     into the agent's context — _"these references aren't verifiable; express
     them as marks, or `<!-- vigiles:ignore -->` if it's prose"_ — and the agent,
     **still editing that file**, can fix them on the spot. Nothing is blocked.
   - **`"error"` → block.** The edit is rejected (exit 2) until the references
     are marked or ignored.
   - **`false` → off.**
4. **The deterministic backstop:** on commit (a git pre-commit hook) and in CI,
   `vigiles audit` / `vigiles refs` re-run the same check — the unbypassable
   floor that catches anything the in-loop nudge didn't.

**What it deliberately does not do:** it can't force a _plaintext_ reference
(no backticks, pure prose) to become a mark — distinguishing a load-bearing
reference from ordinary prose is undecidable (see
[`research/reference-verification-limits.md`](../research/reference-verification-limits.md)).
The nudge catches the common case (the agent backticked something code-shaped);
the rest is a probabilistic job for the shipped instructions, not a hook.

**Harness note:** the in-loop nudge is a hook, so it works on **Claude Code and
Codex**. A harness without hooks doesn't get the per-save nudge — it falls back
to the always-loaded instructions plus the `vigiles audit` CI floor. See the
[`unmarked-refs` rule](rules/unmarked-refs.md).

## What changes with vigiles

### Claude Code

|                                     | Without vigiles              | With vigiles                                                   |
| ----------------------------------- | ---------------------------- | -------------------------------------------------------------- |
| **Instructions**                    | Hand-written CLAUDE.md       | Compiled from `.spec.ts` (build artifact)                      |
| **Linter rule references**          | Trust-based (nobody checks)  | Verified at compile time against real config                   |
| **File paths**                      | Rot silently when renamed    | `file()` references checked against filesystem                 |
| **Commands**                        | Stale scripts go unnoticed   | `cmd()` references checked against package.json                |
| **Direct edits to CLAUDE.md**       | Anyone can, nobody knows     | PreToolUse hook blocks edits, redirects to spec                |
| **Spec / config changes**           | CLAUDE.md drifts out of sync | PostToolUse hooks auto-compile and regenerate types            |
| **guidance → enforce upgrades**     | Manual guesswork             | `/strengthen` reads per-linter docs, suggests upgrades         |
| **New lint rules from PR feedback** | Copy-paste from review       | `/pr-to-lint-rule` generates rule + tests + spec entry         |
| **CI**                              | Nothing to verify            | `vigiles audit` catches hand-edits, disabled rules, stale refs |

**Codex / AGENTS.md** gets the same compile-time checks and the same
`vigiles audit` CI pipeline — just no hooks (no plugin system), so you run
`vigiles compile` manually or in CI.

Everything vigiles compiles and audits is **deterministic** — same input, same
output, no LLM in the loop. The non-deterministic parts (authoring specs,
suggesting upgrades, writing custom rules) are agent skills that run outside the
compilation pipeline. [Determinism breakdown and flow diagram →](comparison.md)

## See also

- [Markdown mode](markdown-mode.md) · [Inline mode](inline-mode.md) — the no-spec on-ramps.
- [Spec format reference](spec-format.md) — every section and rule kind.
- [Linter support](linter-support.md) — the 7 catalogs + `generate-types` / `generate-schema`.
- [CLI & CI reference](cli.md) · [Agent setup](agent-setup.md).
- [Testing your harness](harness-testing.md) — Pillar 2.
