# Harnesses — which one vigiles targets, and how to pick

An agent is **Model + Harness**. The _harness_ is the machine around the model:
the CLI that runs it, the hook protocol, the plugin/skill/subagent layout, the
instruction-file dialect. vigiles is built so the **core is harness-agnostic**
and the harness-specific pieces live behind a swappable **adapter**.

> **Supported today: Claude Code (full) and Codex.** Codex (`vigiles/codex`) ships
> with a **proven pillar-2** transport (harness testing/evals against the real
> `codex` binary via an OpenAI-Responses mock) and is auto-detected by the CLI;
> its pillar-1 _compile renderers_ are still partial (they emit the Claude-Code
> shape until the format-axis renderers land). Adding a harness doesn't touch the
> core — see [`research/code-adapter-architecture.md`](../research/code-adapter-architecture.md).

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

When a second harness lands, it sits **beside** the first — same core, a new
adapter import:

```ts
import { startCodexMock, codexAdapter } from "vigiles/codex"; // shipped
```

Nothing in `vigiles/testing` changes. Unused adapters tree-shake out; there's no
runtime registry and no "harness not found" surprise.

### Why import, not a `harness:` config key

- You're already writing code (`.spec.ts`, `*.harness.mjs`) — naming the adapter
  is one more import, and the types flow through.
- The bundle only carries the adapter you import (each drags in its own spawn /
  SSE / sandbox machinery).
- A config string is a runtime lookup; an import is checked when you write it.

## The CLI is the exception — it auto-detects

The programmatic API names the adapter by import. The **CLI cannot** — so
`vigiles compile`, `vigiles scan`, and `vigiles audit` **detect** the harness
from what's in the repo (a `.claude-plugin/`, an `AGENTS.md`, …) and keep working
with zero config. A `vigiles.config` override is the planned escape hatch if
detection is ever ambiguous.

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

| Capability                            | Descriptor flag                         | Needs ports             | What it unlocks                                          |
| ------------------------------------- | --------------------------------------- | ----------------------- | -------------------------------------------------------- |
| **Pillar 1** — reference verification | `referenceVerification` (always `true`) | `dialect`, `layout`     | `compile` / `scan` / `audit` — verify refs, tools, paths |
| **Pillar 2** — harness testing        | `harnessTesting`                        | `runtime` + `modelMock` | `runHarnessTest` / `runEval` (spawn binary, mock model)  |
| **Shell-hook tier**                   | `shellHooks`                            | `hookProtocol`          | the `runHook` unit tier (hooks as shell processes)       |

Where the harnesses land (✅ shipped · 🧪 internal prototype · ⛔ **blocked**, with why):

| Harness                    | Pillar 1 | Pillar 2 (mockable)    | Shell hooks              | Status                                                              |
| -------------------------- | -------- | ---------------------- | ------------------------ | ------------------------------------------------------------------- |
| **Claude Code**            | ✅       | ✅ Anthropic SSE       | ✅ exit 2 / decision     | ✅ **shipped** — the reference adapter                              |
| **Codex**                  | 🚧¹      | ✅ Responses SSE       | ✅ veto (exit 2)         | ✅ **shipped** (`vigiles/codex`) — pillar 2 full; pillar 1 partial² |
| **OpenCode**               | ✅       | 🚧 openai-compat³      | ⛔ **code-module hooks** | 🧪 prototype (`src/adapters/opencode/`) — `shellHooks:false`        |
| **Cursor**                 | ✅       | ⛔ **closed, no BYOM** | ⛔                       | not built — pillar-1-only at best                                   |
| **Devin / Amp / Amazon Q** | ✅       | ⛔ **un-mockable**     | varies                   | not built — pillar-1-only (closed backend)                          |

¹ Codex **pillar 1 is partial (🚧)**: references are verified and the `AGENTS.md`
target resolves, but the instruction/skill _renderers_ still emit the Claude-Code
shape (and config-table `[agents]` surfaces aren't captured) until the format-axis
renderers land. So the CLI auto-detects a Codex repo, but `compile` output for it
may be CC-shaped for now — the deliberately-accepted caveat of shipping pillar 2
first.

² Codex is **shipped**: registered in `ADAPTERS` (the CLI auto-detects a
`.codex/config.toml` or `AGENTS.md` repo) and exported as `vigiles/codex`. **Pillar
2 is full and proven** — `@openai/codex` installs with no API key (here and in CI),
and `src/adapters/codex/mock-model.ts` serves the OpenAI **Responses** SSE that
real `codex exec` completes a turn against (request shape + event sequence captured
from live codex traffic, not guessed). Pillar 1 is partial per ¹.

³ OpenCode's mockable tier is **declared but not yet built**: it needs the
openai-compat (Chat Completions) SSE renderer, and the `opencode` binary isn't
wired here yet (see
[`research/opencode-prototype-findings.md`](../research/opencode-prototype-findings.md)).
The codex path is the proof the same work generalizes (see
[`research/codex-prototype-findings.md`](../research/codex-prototype-findings.md)).

The takeaway: **everyone converges on pillar 1** (AGENTS.md is becoming universal),
so the discriminator is pillar 2 — and there, _mockability_ is the gate. OpenCode
is the case that splits the matrix mid-row: mockable (so pillar 2 is reachable)
but with in-process plugin hooks instead of shell processes (so the `runHook`
unit tier doesn't apply — `shellHooks:false`, no `hookProtocol`).

**Full capability inventory.** This matrix is the brief version. The exhaustive
record of every harness-specific capability (CC vs Codex) — and, per capability,
whether vigiles _verifies_ it, _tests_ it, or **records-only** (acknowledged but
deliberately not supported) — is in
[`research/harness-capabilities.md`](../research/harness-capabilities.md). Testing
every special capability is an explicit non-goal; that doc is the answer of record
for "does vigiles do X for harness Y?".

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

- [`research/code-adapter-architecture.md`](../research/code-adapter-architecture.md) — the design: the two axes, the ports to extract when adapter #2 lands, and the step-by-step Codex recipe.
- [`docs/harness-testing.md`](harness-testing.md) — the three test tiers that ride on `vigiles/testing`.
- [`research/sync-tool-compatibility.md`](../research/sync-tool-compatibility.md) — composing with _format-axis_ tools (Ruler, rulesync) that distribute the file vigiles authors.
