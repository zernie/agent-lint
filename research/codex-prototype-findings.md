# Codex prototype — does the adapter kit actually generalize?

> An **internal, non-shipped** Codex adapter (`src/adapters/codex/`) built to
> validate the harness-adapter architecture against a real second harness. It is
> NOT registered (`ADAPTERS`), NOT exported (`vigiles/*`), and the CLI never
> auto-detects it — it exists only to be run through the conformance kit and the
> real compiler + loader (`src/adapters/codex/codex.test.ts`). Built from
> `research/harness-landscape.md`.

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

1. **`HarnessRuntime` "point at the mock" is half-shaped.** Codex's single
   `modelBaseUrlEnv` only works via the built-in-provider `OPENAI_BASE_URL`
   override (docs call it "messy"); the clean path is a `[model_providers.mock]`
   block written to `config.toml`. The port needs a `wireMock(baseUrl) → { env?,
configFiles? }` operation, not just an env-var name. (Deferred gap #2.)
2. **`ModelMock` is a descriptor, not yet a renderer.** `codexModelMock` declares
   `openai-responses` + `/v1/responses` correctly, but the OpenAI **Responses**
   SSE renderer + request parser don't exist — so the _transport_ test tiers
   (run a real `codex` against a mock) can't run. Also: `codex` isn't installed
   here, so the transport tiers are unrunnable regardless. The format axis is
   what's provable today. (Deferred gap #3.)
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

The bet held: the **format/layout half of a second harness is one object set**,
proven end-to-end against Codex with no core changes. The remaining work is
exactly the transport pieces already flagged as "shape against the second
implementation" — and now we have that second implementation to shape them. To
ship Codex: build the Responses mock renderer + the `wireMock` op (gaps 2–3),
extend the layout port for TOML manifest/MCP + config-surfaces (gaps 3–4), move
`loadPlugin` to a shared location (gap 5), then register `codexAdapter` + add a
`vigiles/codex` export.

The boundary holds for the prototype too: `src/adapters/codex/**` is a
`codex-harness` element in `eslint.config.mjs`, and `verify-core` may import
neither it nor `cc-harness`.
