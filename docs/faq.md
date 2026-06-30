# FAQ

Quick answers to the questions people ask before adopting vigiles. The
[README](../README.md) has the pitch; this fills in the "but wait…".

## Isn't this just a markdown linter?

No. A markdown linter checks _style_ — heading levels, line length. vigiles checks whether your instruction file is **true**: every file path, script, code symbol, and linter rule it names must actually **exist and be enabled**, resolved against your real repo and your real linter config.

A renamed file or a disabled rule is caught before your agent ever acts on the stale claim. And that's just the Lint layer — vigiles also **tests** your hooks/skills and **measures** whether a skill helps. See [verifying instruction files](verifying-instruction-files.md).

## Why a typed spec — and do I have to write TypeScript?

**No — your agent writes the spec, not you.** `init` adopts your existing CLAUDE.md _into_ one faithfully: every heading becomes a verbatim section, no rule invented. The `edit-spec` / `strengthen` skills author and maintain it from plain-English asks, recompiling on save. You rarely touch it by hand.

The spec is the default because markdown has no structure to check against. A typed `.spec.ts` gives you:

- **Autocomplete** — rule names and paths resolve as you type.
- **Edit-time red squiggles** — a dead path is caught before lint, not after.
- **Reuse** — compose and share rules across files and repos.

**Not ready for a spec?** Lint plain markdown with zero new files — inline `<!-- vigiles:enforce -->` comments, no TypeScript — and `vigiles eject` turns a spec back into markdown anytime. The deeper compiler-grade guarantees are **gradual and opt-in, like TypeScript's `strict`**.

## Does `init` overwrite or touch my files?

No. `init` is **non-destructive**. If you already have a `CLAUDE.md` / `AGENTS.md`, it **adopts** it into a spec — every heading becomes a verbatim section, no rule invented — but **leaves your file exactly as-is**. You only switch a file to spec-managed when _you_ run `vigiles compile`, with a diff to review.

`vigiles eject` hands any managed file back as plain markdown you own. It's never a one-way door.

## Does it work with Claude Code _and_ Codex?

Yes. vigiles targets Claude Code today and OpenAI Codex via
[`vigiles/codex`](harnesses.md); the CLI auto-detects which one your repo uses
(`.claude/` vs `AGENTS.md` / `.codex/`). The Lint layer is harness-agnostic; the
Test layer drives the real `claude` / `codex` CLI. You can even
[teach it your own harness](authoring-an-adapter.md).

## Do I need an API key? What does it cost?

**Most of vigiles needs no model and no key.** Lint and the deterministic Test tiers run in milliseconds on every commit, free.

The only thing that needs a model is a real-model **eval**. That runs on **your own Claude Pro/Max subscription** via the `claude` CLI — **$0 of metered API tokens**. Tools like promptfoo / DeepEval hit a metered API and bill per token on every run. See [the eval architecture](eval-architecture.md).

## Does it work on a non-JavaScript repo (Python, Rust, Go…)?

✅ **Yes for Lint** — `npx vigiles lint` verifies your `CLAUDE.md` against your repo and linters (Ruff, Clippy, Pylint, RuboCop, … alongside ESLint) with **no install**.

The typed-spec / `compile` path needs `vigiles` installed locally (it's an npm package). On a repo without a `package.json`, either add one (`npm init -y && npm i -D vigiles`) or stay in inline-comment mode — both are fully supported.

## Is it safe to run `init`? What if I change my mind?

Safe. `init` never overwrites instruction files (see above), and in a fresh repo it **defers** the compile with a clear next step instead of erroring.

To back out: `vigiles eject <file>` returns the file to plain markdown and removes the spec. Uninstalling the dev dependency leaves your repo as plain markdown plus CI you can delete. Nothing is locked in.

## How is the Eval layer different from promptfoo / DeepEval?

Two things set it apart.

**Cost:** promptfoo / DeepEval bill per token against a metered API on every run. vigiles answers most questions with no model at all and runs the rest on your subscription.

**What's under test:** vigiles loads your harness **exactly as it ships** — the real agent + your real `CLAUDE.md` + hooks. It A/Bs it on real tasks and reports cost + the target metric + a correctness check. A "saved tokens" win that breaks the code isn't counted as a win. See [measuring skills](measuring-skills.md).

## See also

- [Verifying instruction files](verifying-instruction-files.md) — the Lint layer.
- [Testing your harness](harness-testing.md) — hooks, skills, subagents.
- [Measuring skills](measuring-skills.md) — the affordable eval.
- [CLI reference](cli.md) · [Harnesses](harnesses.md) · [Safety & sandboxing](safety.md)
