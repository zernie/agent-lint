# Harnesses — which one vigiles targets, and how to pick

An agent is **Model + Harness**. The _harness_ is the machine around the model:
the CLI that runs it, the hook protocol, the plugin/skill/subagent layout, the
instruction-file dialect. vigiles is built so the **core is harness-agnostic**
and the harness-specific pieces live behind a swappable **adapter**.

> **Supported today: Claude Code and Codex.** Codex (`vigiles/codex`) is
> auto-detected by the CLI, **verifies** references, **compiles** Codex-shaped
> instructions (`AGENTS.md`) and skills (minimal `SKILL.md`), and runs **Test**-layer
> harness tests against the real `codex` binary (keyless, OpenAI-Responses mock) via
> `runHarnessTest({ adapter: codexAdapter })`. Subagents are a deliberate boundary
> (a Codex subagent is concurrency config, not a tool-contract file — see the
> matrix below). Adding a harness doesn't touch the core.

## You pick the harness by which subpath you import

The adapter is selected at **author time, by your import** — not by a setting in
a config file. Two surfaces:

```ts
// Core — harness-agnostic. The stable API you write tests/evals against.
import { runHarnessTest, runEval, assertHookBlocked } from "vigiles/testing";

// Adapter — the Claude Code-specific pieces, named explicitly.
import { loadPlugin, scriptModel } from "vigiles/claude-code";
```

`vigiles/testing` is the part that never changes when the harness changes:
`runHarnessTest`, `runEval`, `runHook`, the `Trace` predicates, the assertions.
`vigiles/claude-code` is the adapter: the plugin/repo loader that reads real
Claude Code layouts (`.claude-plugin/plugin.json`, `.claude/settings.json`,
`${CLAUDE_PLUGIN_ROOT}`, `skills/`, `agents/`) and the scriptable Anthropic
Messages mock you point `claude` at.

A second harness sits **beside** the first — same core, a different import. Codex
already ships this way:

```ts
import { startCodexMock, codexAdapter } from "vigiles/codex";
```

Nothing in `vigiles/testing` changes, and unused adapters tree-shake out.
Importing the adapter (rather than a `harness:` config key) means the bundle only
carries the adapter you use, and the choice is type-checked where you write it.

## The CLI auto-detects (or reads project config)

The CLI can't take an import, so `vigiles compile`, `vigiles audit`, and
`vigiles lint` **detect** the harness from the repo (a `.claude-plugin/`, an
`AGENTS.md`, …) and work with zero config. When detection is ambiguous, or you
want a deterministic, committed choice, set it explicitly — both override the
sniff:

- a **`harness` key** in `.vigilesrc.json` (`"codex"`, or `["claude-code",
"codex"]` for a repo targeting several), written by `vigiles init`;
- a **`--harness=<name>`** flag on the command, which wins over the config.

The precedence is `--harness=` → config `harness` → auto-detect, and a
multi-harness or ambiguous pick prints a loud notice rather than silently
guessing. A repo declaring several harnesses also gets a byte-identical
`CLAUDE.md`⇄`AGENTS.md` mirror on compile when no sync tool already fans it out.

## What's actually harness-specific (the two axes)

Not everything labelled "Claude Code" is coupled the same way. There are two
independent axes, and a new harness might share one but not the other:

| Axis                    | What it covers                                                                                                                               | Example difference for Codex                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Format / dialect**    | the instruction-file format and plugin layout: `CLAUDE.md` vs `AGENTS.md`, `SKILL.md` frontmatter, the `tools:` contract, `${…_PLUGIN_ROOT}` | emits/verifies `AGENTS.md` instead of `CLAUDE.md` |
| **Runtime / transport** | the binary that runs the model, the hook event protocol, the model mock                                                                      | spawns `codex` with a different hook JSON shape   |

The reference-verification engine (does this linter rule exist and is it enabled,
does this path/script/symbol resolve) is **the same across harnesses** — only the
format it reads/writes and the runtime it drives differ.

## Adapter capability matrix

Not every harness can reach every tier, and pretending otherwise produces fake
adapters that hang or no-op. Each adapter therefore declares an
`AdapterCapabilities` descriptor (`src/core/adapter.ts`), and the conformance kit
**requires a transport port only for the capability the adapter claims** — so a
reference-only harness is a first-class adapter, not a broken one.

| Capability                                  | Descriptor flag                         | Needs ports             | What it unlocks                                                          |
| ------------------------------------------- | --------------------------------------- | ----------------------- | ------------------------------------------------------------------------ |
| **Lint** (layer 1) — reference verification | `referenceVerification` (always `true`) | `dialect`, `layout`     | `compile` / `scan` / `lint` — verify refs, tools, paths                  |
| **Test** (layer 2) — harness testing        | `harnessTesting`                        | `runtime` + `modelMock` | `runHarnessTest` / `runEval` (spawn binary, mock model)                  |
| **Shell-hook tier**                         | `shellHooks`                            | `hookProtocol`          | the `runHook` unit tier (hooks as shell processes)                       |
| **Subagents**                               | `subagents`                             | —                       | the subagent lint rules (`subagent-tool-contract`, …); n/a where `false` |

Where the harnesses land (✅ shipped · 🧪 internal prototype · ⛔ **blocked**, with why):

| Harness                    | Lint | Test (mockable)        | Shell hooks              | Status                                                                       |
| -------------------------- | ---- | ---------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| **Claude Code**            | ✅   | ✅ Anthropic SSE       | ✅ exit 2 / decision     | ✅ **shipped** — the reference adapter                                       |
| **Codex**                  | ✅¹  | ✅ Responses SSE       | ✅ veto (exit 2)         | ✅ **shipped** (`vigiles/codex`) — Lint & Test² (subagents differ by design) |
| **OpenCode**               | ✅   | 🚧 openai-compat³      | ⛔ **code-module hooks** | 🧪 prototype (`src/adapters/opencode/`) — `shellHooks:false`                 |
| **Cursor**                 | ✅   | ⛔ **closed, no BYOM** | ⛔                       | not built — Lint-only at best                                                |
| **Devin / Amp / Amazon Q** | ✅   | ⛔ **un-mockable**     | varies                   | not built — Lint-only (closed backend)                                       |

¹ Codex **Lint is format-correct for the surfaces that map**: references are
verified against the Codex dialect, and `compile` emits Codex-shaped output —
`AGENTS.md` (plain markdown) and minimal `SKILL.md` (`name`/`description` only,
driven by `dialect.skillFrontmatter`), with Claude Code output byte-identical
(the dogfood integrity hash is the guardrail). **Subagents are a deliberate
boundary, not a gap:** a Codex subagent is an `[agents.<name>]` TOML concurrency
table (`max_threads`/`max_depth`), not a tool-contract file — vigiles's `agent()`
doesn't map onto it, so it isn't compiled to Codex (it's still _verified_). The
loader reads Codex's TOML manifest format-aware, so its `[mcp_servers]` table is
detected like CC's JSON `mcpServers`.

² Codex is **shipped**: registered in `ADAPTERS` (the CLI auto-detects a
`.codex/config.toml` or `AGENTS.md` repo) and exported as `vigiles/codex`. **Test
is full and usable through the public API** — `runHarnessTest(spec, { adapter:
codexAdapter })` drives real `codex exec` against the OpenAI **Responses** mock
(`src/adapters/codex/mock-model.ts`), keylessly. The runner is adapter-driven: a
per-harness `HarnessTestDriver` (argv + mock + parse) behind the `wireMock` runtime
seam, with Claude Code as the default and its behaviour byte-identical. A gated
`harness-test.test.ts` runs the real-codex turn (request shape + SSE captured from
live traffic, not guessed). Lint is format-correct per ¹. `runEval` /
trigger-rate for Codex is **in progress** (not usable through the public API yet):
the Codex eval parser/runner/firing-predicate are built and validated against the
real binary; what remains is wiring `{ adapter }` dispatch into
`measureTriggerRate` / `runEval`.

³ OpenCode's mockable tier is **declared but not yet built**: it needs the
openai-compat (Chat Completions) SSE renderer, and the `opencode` binary isn't
wired here yet. The codex path is the proof the same work generalizes.

The takeaway: **everyone converges on Lint** (AGENTS.md is becoming universal),
so the discriminator is Test — and there, _mockability_ is the gate. OpenCode
is the case that splits the matrix mid-row: mockable (so Test is reachable)
but with in-process plugin hooks instead of shell processes (so the `runHook`
unit tier doesn't apply — `shellHooks:false`, no `hookProtocol`).

**Full capability inventory.** This matrix is the brief version. The exhaustive
record of every harness-specific capability (CC vs Codex) — and, per capability,
whether vigiles _verifies_ it, _tests_ it, or **records-only** (acknowledged but
deliberately not supported). Testing every special capability is an explicit non-goal.

## How this is kept honest

The core staying harness-agnostic isn't a convention you have to remember — it's
enforced. `eslint-plugin-boundaries` classifies modules into `verify-core` (the
domain) and `cc-harness` (the Claude Code adapter) and **forbids the core from
importing the adapter** (`eslint.config.mjs`, rule `boundaries/dependencies`).
The dependency only points one way: adapter → core, never core → adapter — the
inward rule that defines a hexagon.

And because vigiles verifies references rather than reimplementing linters, it
**dogfoods** that rule: `CLAUDE.md.spec.ts` carries
`enforce("boundaries/dependencies")`, so `vigiles compile` checks the boundary
rule is present and enabled. The architecture invariant is a verified reference,
not a comment.

## See also

- [`docs/harness-testing.md`](harness-testing.md) — the harness-agnostic test tiers that ride on `vigiles/testing`. Per-harness specifics: [`harness-testing-claude-code.md`](harness-testing-claude-code.md) · [`harness-testing-codex.md`](harness-testing-codex.md).
