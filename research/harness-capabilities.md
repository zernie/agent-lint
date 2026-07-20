---
status: active
topic: adapters
---

# Harness capability inventory — Claude Code vs Codex (and what vigiles does about each)

> A written, exhaustive inventory of the harness-specific capabilities across the
> harnesses vigiles targets. The point is **completeness of the record, not
> completeness of support**: vigiles deliberately does NOT try to test every
> special capability of every harness. This doc says, for each capability, what
> the harness offers and vigiles's stance — _verify_ (pillar 1), _test_ (pillar 2),
> _record-only_ (acknowledged, not exercised), or _N/A_.
>
> The brief, executable version is the capability matrix in
> [`docs/harnesses.md`](../docs/harnesses.md); this is the long form behind it.

## vigiles's stance, stated once

- **Verify (pillar 1)** — vigiles checks that references in an instruction/skill/
  agent file are real and enabled (linter rules, paths, scripts, tools, MCP). This
  is format-axis work and applies to every harness with an instruction format.
- **Test (pillar 2)** — vigiles drives the real binary against a mock model to test
  the assembled harness (hooks fire, a skill triggers, an output changes). This
  needs a _mockable_ binary; it does not, and will not, cover every CLI feature.
- **Record-only** — a real capability we acknowledge but deliberately don't test,
  because it's out of scope (cloud orchestration, session management, structured
  output, etc.). Listing it here is the support decision: "known, not pursued."
- **N/A** — the harness doesn't have it.

Testing-everything is an explicit non-goal. A capability being "record-only" is a
decision, not a backlog item, unless this doc says otherwise.

## A. Authoring surfaces (pillar-1 territory)

| Capability           | Claude Code                                  | Codex                                          | vigiles stance                                                                 |
| -------------------- | -------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| Instruction file     | `CLAUDE.md`                                  | `AGENTS.md` (+`CLAUDE.md` fallback)            | **Verify + compile** — renderer is format-neutral (AGENTS.md = plain markdown) |
| Skills               | `skills/<n>/SKILL.md` (YAML frontmatter)     | `SKILL.md` (name/description)                  | **Verify + compile** — minimal SKILL.md via `dialect.skillFrontmatter`¹        |
| Subagents            | `agents/<n>.md` (YAML frontmatter, `tools:`) | `[agents]` **TOML table** in config            | **Verify** (tool contract); **not compiled** to Codex by design²               |
| Slash commands       | `commands/<n>.md`                            | commands (config)                              | **Verify** (detected by loader/scan); not deeply modelled                      |
| MCP servers          | `.mcp.json` / manifest `mcpServers` (JSON)   | `[mcp_servers]` **TOML table**                 | **Verify** — format-aware manifest read detects Codex's TOML `[mcp_servers]`   |
| Plugin manifest      | `.claude-plugin/plugin.json` (JSON)          | `config.toml` (no separate JSON manifest)      | **Verify**; layout port reads both JSON and TOML manifests (format-aware)      |
| Tool contract syntax | `tools:` built-in catalog + `mcp__*`         | shell/apply_patch/update_plan/web_search + MCP | **Verify** via the injected dialect (per-harness catalog)                      |
| Plugin-root token    | `${CLAUDE_PLUGIN_ROOT}`                      | `${PLUGIN_ROOT}`                               | **Verify** (resolved by the loader from the layout port)                       |

¹ `compileSkill` reads `dialect.skillFrontmatter`: Codex's `"minimal"` profile
emits only `name`/`description`; CC's `"claude-code"` keeps the full set
(disable-model-invocation / argument-hint). CC output is byte-identical.
² **Deliberate boundary, not a gap:** a Codex subagent is an `[agents.<name>]`
TOML concurrency table (`max_threads`/`max_depth`), not a tool-contract file —
vigiles's `agent()` doesn't map onto it, so it isn't compiled to Codex (still
verified). The generic loader now lives at the composition root
(`src/plugin-loader.ts`, layout-injected), so no adapter imports a sibling — there is
no remaining functional Codex gap.

## B. Runtime / transport (pillar-2 territory)

| Capability            | Claude Code                                | Codex                                                    | vigiles stance                                                 |
| --------------------- | ------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------- |
| Binary / one-shot     | `claude -p … --output-format json`         | `codex exec … --json`                                    | **Test** — both driveable (driver `buildArgs`)                 |
| Model API wire format | Anthropic **Messages** SSE                 | OpenAI **Responses** SSE (`/v1/responses`)               | **Test** — both have a mock renderer (proven vs real bins)     |
| Point at a mock       | `ANTHROPIC_BASE_URL` env                   | `-c model_provider=…` config flags (keyless)             | **Test** — unified behind `HarnessRuntime.wireMock`            |
| Hooks                 | shell processes, JSON-on-stdin + env       | shell processes, JSON-on-stdin + env (config `[hooks]`)  | **Test** (shell-hook tier) — both `shellHooks: true`           |
| Hook veto             | exit 2 / `permissionDecision:deny`         | exit 2 / `permissionDecision` / `decision:block`         | **Test** — `HookProtocol` is ~identical across the two         |
| Hook trust model      | N/A                                        | persisted hook trust (`--dangerously-bypass-hook-trust`) | **Record-only** — Codex-specific; not modelled                 |
| Hook event names      | PreToolUse/PostToolUse/Stop/SubagentStop/… | +PermissionRequest/PostCompact/SubagentStart/…           | **Verify** (dialect `hookEvents`); event-shape parity untested |

## C. Codex capabilities Claude Code does not have

All **record-only** unless noted — acknowledged, deliberately out of vigiles scope.

| Codex capability                                      | What it is                                                                                                                                                      | Why record-only for vigiles                                   |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `--oss` / `--local-provider`                          | native local models (lmstudio/ollama) + `[model_providers]` BYOM                                                                                                | Helps our _mocking_ (keyless), but not a thing we test        |
| `codex cloud`                                         | browse/apply Codex Cloud tasks                                                                                                                                  | Remote orchestration — out of scope                           |
| `codex app-server` / `exec-server` / `remote-control` | daemon/server modes                                                                                                                                             | Service surface — out of scope                                |
| `codex sandbox` + `--sandbox` modes                   | `read-only`/`workspace-write`/`danger-full-access` as a primitive                                                                                               | vigiles has its own bwrap sandbox for tests; not codex's      |
| `codex fork` / `archive` / `unarchive`                | richer session management                                                                                                                                       | Session lifecycle — out of scope                              |
| `codex apply`                                         | apply the agent's last diff as `git apply`                                                                                                                      | Out of scope                                                  |
| `codex review`                                        | dedicated non-interactive code-review subcommand                                                                                                                | Out of scope (CC does this via subagents)                     |
| `--output-schema`                                     | final message conforming to a JSON Schema                                                                                                                       | **Candidate** — could back a result-contract/eval check later |
| feature flags                                         | Goals, Steer, CollaborationModes, GuardianApproval, ToolSuggest, Personality, FastMode, Sqlite, WorkspaceDependencies, BrowserUse, ComputerUse, ImageGeneration | Model/product features — out of scope                         |

## D. Claude Code capabilities Codex does not (cleanly) have

Recorded for symmetry; vigiles's CC support already covers the verify/test-relevant ones.

| Claude Code capability            | Notes                                                    | vigiles stance                                             |
| --------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| `disable-model-invocation` skills | user-invoked-only skills (the 7/9 vigiles ships)         | **Verify** (load gate) — covered                           |
| `argument-hint` / `$ARGUMENTS`    | command arg surface                                      | **Verify** — covered                                       |
| Subagent dispatch via `Task`      | the PreToolUse tool-contract rail (declared-vs-enforced) | **Test** (agent-runtime rail) — covered                    |
| `--plugin-dir` install            | install a real pinned plugin for trigger-rate evals      | **Test** — covered (pillar 2)                              |
| **Skill-selection event**         | a discrete "skill fired" signal → a PRECISE trigger-rate | **Test on CC; EXPERIMENTAL on Codex** — see the note below |
| Bedrock / Vertex providers        | enterprise model routing                                 | **Record-only** — not a test axis                          |
| Output styles / statusline        | TUI presentation                                         | **N/A** — presentation, nothing to verify                  |
| Plan mode                         | a planning phase                                         | **Record-only**                                            |

### Decision (2026-07-20) — Codex trigger-rate is EXPERIMENTAL, not "supported"

The **deterministic** `vigiles audit` is FULL parity on Codex (proven live +
`scan-cli.test.ts`). Only the model-gated **trigger-rate** ("does a skill fire?") is
scoped down, and **Codex-only** — on Claude Code it stays a supported measurement.

Why not just "unvalidated": Claude Code emits a discrete skill-selection event, so
firing is a fact. Codex emits **none**, so `codexSkillFired` infers firing from a
`SKILL.md` read — which is **wrong in both directions** (cache → false negative;
exploratory read → false positive). A number that can be off either way is not a
measurement, and shipping it as one violates the precision / don't-cry-wolf premise
(a wrong number is worse than no number). So the code makes it loud, not silent:
`codexEvalDriver.experimental` carries the caveat, `measureTriggerRate` warns on
stderr + stamps `report.experimental`, and the formatters print `⚠ EXPERIMENTAL`
above the numbers (`audit --harness=codex` included).

**Promotion gate:** a live run that MEASURES the oracle's own accuracy — drive real
`codex exec --json` over skills with known ground-truth firing and score
`codexSkillFired` against it. That decides: promote to supported, keep experimental,
or drop Codex to deterministic-only. Gated on `codex` on PATH + Codex quota. Full
user-facing writeup: [`docs/harness-testing-codex.md`](../docs/harness-testing-codex.md#trigger-rate-on-codex-is-experimental).

## How to use this doc

When someone asks "does vigiles test Codex's `X`?", this is the answer of record.
Moving a row from **record-only** to **test** is a deliberate scope expansion that
should update this table and add the capability to the executable matrix in
`docs/harnesses.md`. The default answer for anything not in the verify/test columns
is "no, by design."

See also: [`docs/harnesses.md`](../docs/harnesses.md) (the brief matrix),
[`research/codex-prototype-findings.md`](codex-prototype-findings.md) (the gaps),
[`research/harness-landscape.md`](harness-landscape.md) (the wider landscape).
