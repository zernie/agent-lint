# Harness Landscape & the Codex Extraction Map (mid-2026)

> Researched June 2026 (multi-source, primary docs). Answers two questions: (1)
> what can we **extract now** for the Codex adapter — i.e. which still-CC-shaped
> seams a real second implementation finally lets us design — and (2) what other
> harnesses exist and which is the best adapter after Codex. Companion to
> `research/code-adapter-architecture.md` (the port design).

## Headline: both deferred seams are now unblocked

The two seams `code-adapter-architecture.md` held back — the **hook protocol**
(`run-hook.ts`) and the **model mock** (`mock-model.ts`) — were deferred on a
"don't design an interface against one implementation" rule. **Codex now
provides the concrete second implementation for both**, so they're extractable:

- **Hook protocol:** Codex shipped a real hooks system that is a **near-1:1
  analog of Claude Code's** — same event names, JSON-on-stdin + env vars, and
  crucially **`PreToolUse` can VETO** a tool call (`"permissionDecision":
"deny"`, legacy `"decision": "block"`, or **exit code 2**). It intercepts
  `Bash`, `apply_patch`, and `mcp__server__tool`. So our `agent-runtime`
  PreToolUse enforcement rail ports cleanly.
- **Model mock:** Codex can be pointed at a fake model server (the OpenAI
  analogue of `ANTHROPIC_BASE_URL`) — a `[model_providers.mock]` config block
  with `base_url` + a dummy key. So a deterministic, no-key Codex mock is
  feasible (proven: `0xSero/codex-shim`).

The "wait for a second example" call was right; the wait is over.

## Codex, the concrete facts (mid-2026)

Sources: OpenAI's `developers.openai.com/codex/*` docs + `openai/codex` repo.

- **Binary / headless:** `codex`; non-interactive `codex exec "…" --json`
  (JSONL event stream) + `--output-last-message <path>`.
- **Config home:** `$CODEX_HOME` (default `~/.codex/`), `config.toml` (**TOML**,
  not JSON); project-scoped `.codex/config.toml` (loaded only if trusted).
- **Instruction file:** **`AGENTS.md`** (plain markdown, no frontmatter) +
  `AGENTS.override.md`; global `~/.codex/AGENTS.md`, then repo-root-**down**
  concatenation (nearest wins), 32 KiB cap (`project_doc_max_bytes`).
- **Tools (model-facing):** `shell`/unified `exec`, `apply_patch` (file edits),
  `update_plan`, `web_search`, plus `mcp__server__tool`.
- **Skills:** **`SKILL.md` with YAML `name`/`description`** (custom prompts
  deprecated → skills) — nearly identical to Claude Code's skill shape. Path is
  the one ambiguity: primary docs say `.agents/skills` / `$HOME/.agents/skills`
  / `/etc/codex/skills`; secondary sources say `~/.codex/skills` + `.codex/skills`
  — **probe both**.
- **Subagents:** `[agents]` table in `config.toml` (`agents.<name>`,
  `max_threads`, `max_depth`) + `features.multi_agent` — config, not a dir.
- **MCP:** `[mcp_servers.<id>]` in `config.toml` (stdio `command`/`args` or http
  `url`).
- **Hooks:** events `SessionStart`, `SubagentStart`/`Stop`, `PreToolUse`,
  `PostToolUse`, `PermissionRequest`, `PreCompact`/`PostCompact`,
  `UserPromptSubmit`, `Stop`. Loaded from `~/.codex/hooks.json` or `[hooks]` in
  `config.toml`, and `<repo>/.codex/hooks.json`. Hook program gets **JSON on
  stdin** + env vars (`session_id`, `cwd`, `hook_event_name`, `model`, `turn_id`,
  `permission_mode`, **`PLUGIN_ROOT`**). TOML config form:
  `[[hooks.PreToolUse]]` `matcher = "^Bash$"`. Hash-based trust model.
- **`notify` ≠ hooks:** the separate `notify = [...]` program is **notify-only**
  (argv-JSON, single `agent-turn-complete` event, no veto). The legacy
  side-channel, not the enforcement path.
- **Sandbox / approvals:** `sandbox_mode` (`read-only`/`workspace-write`/
  `danger-full-access`), `approval_policy` (`untrusted`/`on-failure`/
  `on-request`/`never`). macOS Seatbelt; Linux bwrap+seccomp (Landlock
  uncertain/possibly superseded).
- **Mock wiring:** `[model_providers.mock]` `base_url = "http://127.0.0.1:PORT/v1"`,
  `wire_api = "responses"`, `env_key = "OPENAI_API_KEY"` (dummy ok); select via
  `model_provider = "mock"`. **Wire format = OpenAI Responses API** (`POST
/v1/responses`, SSE: `response.created → … → response.output_text.delta* → …
→ response.completed`) — **NOT** Chat Completions (removed Feb 2026), and not
  Anthropic's Messages format.

## Port-by-port: what to extract, and the deltas Codex reveals

| vigiles port                                      | CC value                                                                                    | Codex value                                                                                                             | Verdict                                                                                                                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HarnessDialect** (done)                         | Read/Write/Edit/Bash…, `${CLAUDE_PLUGIN_ROOT}`, CC hook events                              | `shell`/`apply_patch`/`update_plan`/`web_search`, `${PLUGIN_ROOT}`, Codex events (+`PermissionRequest`/`SubagentStart`) | **Just add `codexDialect`.** Already injectable.                                                                                                                                                                              |
| **PluginLayout** (done)                           | `.claude-plugin/`, `.claude/settings.json` (JSON), `CLAUDE.md`, `${CLAUDE_PLUGIN_ROOT}`     | `.codex/` + `~/.codex/`, `config.toml` (**TOML**), `AGENTS.md`, `${PLUGIN_ROOT}`                                        | **Add `codexLayout`.** Gap **FIXED**: `settingsFormat: "json" \| "toml"` added; `loadPlugin` parses Codex's `config.toml` `[hooks]` (`@iarna/toml`). Covered by `assertAdapterLoadsHooks`.                                    |
| **HarnessRuntime** (done)                         | spawn `claude`, point via `ANTHROPIC_BASE_URL` env                                          | spawn `codex exec --json`, point via a **`config.toml` provider block** (not a single env var)                          | **Add `codexRuntime`** — and reveals a real gap: "point at the mock" is an _env var_ for CC but a _config-block write_ for Codex. The runtime port must model "how to wire the mock" as an operation, not assume one env var. |
| **HookProtocol** (was deferred → **extract now**) | `.claude/settings.json` events; stdin JSON; veto via `permissionDecision`/exit 2            | TOML `[[hooks.*]]`; stdin JSON + `PLUGIN_ROOT` env; veto via `permissionDecision`/`decision:block`/exit 2               | **Extract now.** Decision model is ~identical; the interface captures: config format (JSON vs TOML), the env-var set, the event list (→ dialect). `decideHook` logic is largely shared.                                       |
| **ModelMock** (was deferred → **extract now**)    | Anthropic **Messages** SSE via `ANTHROPIC_BASE_URL`                                         | OpenAI **Responses** SSE at `POST /v1/responses` via provider block                                                     | **Extract now.** Port = "given a scripted turn, serve the wire-format's SSE event sequence." Two concrete formats to design against.                                                                                          |
| **frontmatter renderers** (partial)               | `CLAUDE.md` + `SKILL.md`/agent YAML (`disable-model-invocation`, `argument-hint`, `tools:`) | `AGENTS.md` (plain md) + `SKILL.md` (`name`/`description`)                                                              | **Mostly extractable** — CC and Codex `SKILL.md` are nearly identical; the instruction-file target differs (structured CLAUDE.md vs plain AGENTS.md).                                                                         |

**Net:** every port is now either done or extractable against two real
implementations. The two surprises worth acting on: (1) the **layout port needs
a settings-format axis** (JSON vs TOML), and (2) the **runtime port's
"point-at-mock" is not always an env var** (Codex writes a config block). Both
are exactly the wrong-abstraction traps avoided by waiting for Codex.

## Strategic tailwind: the field is converging on Claude Code's shape

The most important landscape finding: **hooks-with-veto + `SKILL.md` skills +
subagents + MCP + `AGENTS.md`** is becoming the de-facto harness shape, and
several tools target Claude Code's exact formats. **Devin's CLI hooks are
explicitly Claude-Code-compatible** (an existing `.claude/settings.json` works
as-is). This validates the harness-agnostic bet — one set of ports increasingly
covers many harnesses, and vigiles' CC-centric model is close to the standard.

## The landscape (a=AGENTS.md, b=MCP, c=hooks-run-user-scripts, d=headless+custom-endpoint)

| Tool                | Type        | OSS             | a                        | b                 | c (hooks)                                              | d (mockable)               | Notes                                           |
| ------------------- | ----------- | --------------- | ------------------------ | ----------------- | ------------------------------------------------------ | -------------------------- | ----------------------------------------------- |
| **Codex**           | CLI         | yes             | ✅                       | ✅                | ✅ veto                                                | ✅ Responses SSE           | **Next adapter.** Near-full CC convergence.     |
| **OpenCode** (sst)  | CLI/TUI     | yes (TS/Bun)    | ✅ (+CLAUDE.md fallback) | ✅                | ✅ JS/TS plugins, rich event bus                       | ✅ openai-compat `baseURL` | Best OSS fit; hooks are code-modules not shell. |
| **Crush** (charm)   | CLI/TUI     | FSL (src-avail) | ✅ (+CRUSH.md)           | ✅                | ✅ **shell** hooks, JSON stdin — but only `PreToolUse` | ✅ openai-compat           | Closest hook analog to CC; license caveat.      |
| **Devin CLI**       | CLI+cloud   | no              | ✅                       | ✅                | ✅ **CC-compatible**                                   | ❌ no BYOM                 | Format twin of CC; can't mock → pillar-1 only.  |
| **Cline / Kilo**    | IDE+SDK     | yes             | ⏳ pending               | ✅ (marketplace)  | ✅ v3.36+                                              | ✅ openai-compat (via SDK) | Extension-first; headless via SDK.              |
| **Gemini CLI**      | CLI         | yes             | GEMINI.md/AGENT.md       | ✅                | ✅ before/after tool                                   | ~ Google-model leaning     | Solid; endpoint flexibility unclear.            |
| **Amazon Q CLI**    | CLI         | partial         | `.amazonq/rules`         | ✅                | ✅ context hooks                                       | ❌ Amazon-locked           | Can't mock → pillar-1 only.                     |
| **Goose** (AAIF)    | CLI/desktop | yes             | has one                  | ✅ native         | ~ extensions/recipes, not lifecycle script hooks       | ✅ 30+ providers/Ollama    | MCP-native; hook model weakest fit.             |
| **Continue** (`cn`) | IDE+CLI     | yes             | ⏳ pending (#6716)       | ✅                | ❌ permission policies, no script hooks                | ✅ openai-compat           | Clean OSS CLI, no hooks.                        |
| **Zed**             | editor      | yes             | ✅                       | ✅                | ❌                                                     | ❌ no headless CLI         | Editor, not a runner.                           |
| **Warp**            | terminal    | no              | uncertain                | ✅                | ❌ local                                               | ~ limited                  | Closed; cloud webhooks not local hooks.         |
| **Auggie**          | CLI         | no              | ✅                       | ✅ (+is-a-server) | ❌                                                     | ✅ BYOM                    | Closed; no hooks.                               |
| **Aider**           | CLI         | yes             | ❌ (CONVENTIONS.md)      | ❌ core           | ❌ (lint/test cmds only)                               | ✅ strong                  | Faded popularity; almost no harness surface.    |
| **Cursor**          | IDE+CLI     | no              | ✅                       | ✅                | ✅ 1.7+                                                | ~ flaky/undocumented       | Closed; IDE-first.                              |
| **Amp**             | CLI         | no              | ✅                       | ✅                | ✅ TS plugin events                                    | ❌ by design               | Blocks custom endpoints → pillar-1 only.        |

## Next-adapter shortlist (after Codex)

The discriminator for **pillar 2 (testing tiers)** is **mockability** — a tool
that can't be pointed at a custom endpoint (Devin, Amp, Amazon Q, Warp, Cursor-ish)
can only support **pillar 1 (static reference verification)**, never the
deterministic/eval tiers. Ranked:

1. **Codex** — deepest convergence, fully mockable. Build it.
2. **OpenCode (sst)** — best OSS all-rounder: AGENTS.md (+CLAUDE.md fallback),
   MCP, rich hooks, headless `opencode run --format json`, openai-compat mock.
   Caveat: hooks are JS/TS plugin modules, so the hook-protocol port must allow a
   non-shell hook transport.
3. **Crush (charm)** — the closest **shell-hook** analog to Claude Code (JSON
   stdin/stdout, `decision: allow/deny`), AGENTS.md, MCP, mockable. Caveats: only
   `PreToolUse` exists yet; FSL (source-available, not OSI) license.
4. **Devin CLI** — strategically notable (CC-compatible hooks, AGENTS.md, SKILL.md,
   MCP) but **closed + un-mockable**, so it would land as a **pillar-1-only**
   adapter (verify references, scan structure; no deterministic test tier).
5. **Cline/Kilo, Gemini CLI** — viable later; extension-first / endpoint-unclear.

**Recommendation:** Codex first (it's the planned one and the richest target),
then **OpenCode or Crush** as the OSS proof that the ports generalize beyond two
OpenAI/Anthropic-shaped harnesses — Crush if we want to validate the shell
HookProtocol, OpenCode if we want the broader surface. Devin is the case that
proves the **two-pillar split matters**: some harnesses can only ride pillar 1.

## Uncertainty flags (verify at build time)

- Codex skills dir: `.agents/skills` (primary docs) vs `~/.codex/skills`
  (secondary) — probe both.
- Codex-as-MCP-server: unconfirmed.
- Exact minimal Responses SSE event set Codex's parser _requires_ — confirm
  against `codex-rs/codex-api/src/` before building the mock.
- Cline/Continue AGENTS.md: pending PRs as of these sources — recheck if merged.
- Crush hooks are "preliminary" (event set will expand); Crush global AGENTS.md
  path unverified.
