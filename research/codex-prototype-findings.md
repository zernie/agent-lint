# Codex prototype — does the adapter kit actually generalize?

> An **internal, non-shipped** Codex adapter (`src/adapters/codex/`) built to
> validate the harness-adapter architecture against a real second harness. It is
> NOT registered (`ADAPTERS`), NOT exported (`vigiles/*`), and the CLI never
> auto-detects it — it exists only to be run through the conformance kit and the
> real compiler + loader (`src/adapters/codex/codex.test.ts`). Built from
> `research/harness-landscape.md`.

## UPDATE (2026-06-14): the transport tier is now PROVEN against real codex ✅

The original verdict below proved the **format + layout** axes and flagged the
**transport** (runtime + ModelMock) as unbuildable here "because `codex` isn't
installed." That premise was wrong: **`@openai/codex` (0.139.0) installs and runs
in this environment with no API key** (and now in CI). With the real binary in
hand, the two deferred transport gaps are closed against reality:

- **Wire format — confirmed by live traffic.** Pointed real `codex exec` at a
  logging mock: it sends `POST /v1/responses` (`wire_api=responses`,
  `Accept: text/event-stream`, `Authorization: Bearer <env_key>`) with a Responses
  body (`instructions`, `input[]` messages, `tools[]`, `stream:true`). The
  `codexModelMock` descriptor (`openai-responses` + `/v1/responses`) was right.
- **ModelMock renderer — BUILT + proven (gap #2 closed).**
  `src/adapters/codex/mock-model.ts` (`renderResponsesSSE` / `parseResponsesRequest`
  / `startCodexMock`) serves the exact 9-event Responses SSE sequence; a gated test
  drives **real `codex exec`** against it and asserts the turn completes (the
  scripted assistant text is printed). No API key, deterministic.
- **`wireMock` — PROVEN as a keyless flag recipe (gap #1 closed).** Codex points
  at the mock via `-c model_provider=mock -c model_providers.mock.{base_url,
wire_api,env_key,requires_openai_auth,request_max_retries,stream_max_retries}`
  (+ `CODEX_HOME` + a dummy `env_key` value), exported as
  `codexMockArgs`/`codexMockEnv`. This **corrects** the prototype's guess that the
  `OPENAI_BASE_URL` env var was the path.

What's left to **ship** Codex is now small and non-transport: register
`codexAdapter` + export `vigiles/codex` (a deliberate auto-detect change), and the
still-deferred format-axis pieces (gaps #3–#5 below remain). The hard, previously-
blocking transport half is done. The rest of this doc is the original prototype
verdict, kept for the record.

## Verdict: the format + layout axes generalize with ZERO core changes ✅

`codexAdapter` — the five Codex ports bundled — **passes the full conformance
kit** and drives the real engine against Codex-shaped fixtures:

- `assertAdapterConformance(codexAdapter)` ✅ — every port populated; cross-port
  invariants hold (all names `"codex"`, `instructionFile` `"AGENTS.md"` ∈
  `instructionTargets`, plugin-root tokens agree).
- `assertAdapterLoadsHooks(codexAdapter)` ✅ — a **TOML** `config.toml [hooks]`
  block round-trips through the loader (the `settingsFormat` axis works).
- `compileAgent(spec, { dialect: codexDialect })` ✅ — the **same** compiler
  accepts a Codex built-in (`shell`) and flags a Claude Code tool (`Read`) under
  the Codex catalog. The dialect injection is real.
- `loadPlugin(dir, codexLayout)` ✅ — a real Codex repo (AGENTS.md + a `skills/`
  surface + TOML `[[hooks.PreToolUse]]` with `${PLUGIN_ROOT}`) loads: instruction
  file picked up, surface materialized under `.codex/`, hooks parsed from TOML,
  `${PLUGIN_ROOT}` expanded.

So the **format axis (`HarnessDialect`) and layout axis (`PluginLayout` +
`settingsFormat`) are proven** — adding Codex's _authoring/verification_ support
is writing value objects, no core edits, exactly as designed. `HookProtocol`
came out **identical** to Claude Code (the thin port was right).

## Gaps the prototype concretely exposed (the honest part)

Building it surfaced real, specific limitations — each maps to a deferred item:

1. **[CLOSED — see UPDATE] `HarnessRuntime` "point at the mock" is half-shaped.**
   Was: Codex's single `modelBaseUrlEnv` only works via the `OPENAI_BASE_URL`
   override ("messy"). RESOLVED: the proven path is the keyless
   `-c model_provider=mock` flag recipe (`codexMockArgs`/`codexMockEnv`), NOT the
   env var — the prototype's guess is corrected.
2. **[CLOSED — see UPDATE] `ModelMock` is a descriptor, not yet a renderer.**
   Was: the OpenAI Responses SSE renderer didn't exist and `codex` wasn't
   installed. RESOLVED: `codex` installs here + in CI, and
   `src/adapters/codex/mock-model.ts` serves the Responses SSE that real
   `codex exec` completes a turn against (gated test). Built against live traffic.
3. **The layout port is still JSON-shaped for manifest + MCP.** Codex has no JSON
   manifest (`config.toml` carries everything) and its MCP servers live in a
   `[mcp_servers]` TOML table — but `loadPlugin`'s manifest read and `hasMcp` are
   JSON-only, so MCP detection silently misses Codex. (`settingsFormat` fixed the
   _hooks_ read; manifest/MCP want the same treatment.)
4. **Config-defined surfaces aren't captured.** `surfaceDirs` is dir-based;
   Codex subagents are a `[agents]` TOML table (config, not a directory), and the
   skills dir is ambiguous (`.agents/skills` vs `~/.codex/skills`). (Deferred gap #7.)
5. **The generic loader lives in the CC adapter.** `loadPlugin` is layout-driven
   and harness-agnostic in spirit, but physically sits in
   `src/adapters/claude-code/plugin-loader.ts`, so the Codex prototype imports it
   **cross-adapter** (`codex → claude-code`). It should move to a shared/core
   location so adapters don't depend on each other. (New finding — not previously
   logged.)

## What this means

The bet held end-to-end: the **format/layout half** was one object set (no core
changes), and the **transport half** — once we stopped assuming the binary was
unavailable — was built and proven against real `codex` (gaps 1–2 closed). What
remains to ship Codex is now bounded and non-transport: extend the layout port for
TOML manifest/MCP + config-surfaces (gaps 3–4), move `loadPlugin` to a shared
location (gap 5), the format-axis instruction/skill renderers, then register
`codexAdapter` + add a `vigiles/codex` export (a deliberate auto-detect change).

The boundary holds for the prototype too: `src/adapters/codex/**` is a
`codex-harness` element in `eslint.config.mjs`, and `verify-core` may import
neither it nor `cc-harness`.
