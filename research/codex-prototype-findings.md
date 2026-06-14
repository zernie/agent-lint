# Codex prototype — does the adapter kit actually generalize?

> Started as an internal, non-shipped Codex adapter (`src/adapters/codex/`) to
> validate the harness-adapter architecture against a real second harness; it is
> **now SHIPPED** — registered in `ADAPTERS` (the CLI auto-detects a Codex repo)
> and exported as `vigiles/codex`. **Pillar 2 (harness testing) is full and proven
> against the real `codex` binary; pillar 1 (compile) is format-correct for the
> surfaces that map** — AGENTS.md + minimal SKILL.md, CC output byte-identical
> (subagents are a deliberate boundary, not a gap — see below). This doc records
> how the bet was validated and what remains. Built from
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

Codex is now **shipped**: `codexAdapter` is registered in `ADAPTERS` (CLI
auto-detect) and exported as `vigiles/codex`. The hard, previously-blocking
transport half is done and proven. **The pillar-2 runner is now adapter-driven**:
`runHarnessTest(spec, { adapter: codexAdapter })` drives real `codex exec` through
the public API (a per-harness `HarnessTestDriver` behind the `wireMock` runtime
seam; CC stays the default, byte-identical), verified by a gated real-codex test.
What remains is purely the format-axis polish (gaps #3–#5 below): the
instruction/skill renderers behind the dialect, TOML manifest/MCP reads, and
relocating the shared loader — so pillar-1 `compile` output for a Codex repo is
CC-shaped until then. `runEval` follows the same driver seam (not yet done). The
rest of this doc is the original prototype verdict, kept for the record.

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
3. **[CLOSED] The layout port was JSON-shaped for manifest + MCP.** Was:
   `loadPlugin`'s manifest read and `hasMcp` were JSON-only, so Codex's
   `[mcp_servers]` TOML table was silently missed. RESOLVED: a format-aware
   `safeReadManifest(root, layout)` reads the manifest in the layout's
   `settingsFormat` (JSON or TOML); both the hooks-manifest read and `hasMcp` route
   through it, so Codex's TOML `[mcp_servers]` is detected (gated test in
   codex.test.ts). CC output unchanged (same key/file → identical warning).
4. **Config-defined surfaces aren't captured.** `surfaceDirs` is dir-based;
   Codex subagents are a `[agents]` TOML table (config, not a directory), and the
   skills dir is ambiguous (`.agents/skills` vs `~/.codex/skills`). (Deferred gap #7.)
5. **The generic loader lives in the CC adapter.** `loadPlugin` is layout-driven
   and harness-agnostic in spirit, but physically sits in
   `src/adapters/claude-code/plugin-loader.ts`, so the Codex prototype imports it
   **cross-adapter** (`codex → claude-code`). It should move to a shared/core
   location so adapters don't depend on each other. (New finding — not previously
   logged.)
6. **[CLOSED] Instruction-file + SKILL.md renderers are now dialect-correct for
   Codex.** `compileClaude` is format-neutral (plain markdown, no frontmatter =
   the AGENTS.md shape; the h1 target comes from the dialect), and `compileSkill`
   now reads `dialect.skillFrontmatter`: under Codex's `"minimal"` profile it
   emits ONLY `name` + `description`, dropping the CC-only keys
   (disable-model-invocation / argument-hint). CC output stays byte-for-byte
   identical (the dogfood integrity hash is unchanged). The CLI passes the
   detected adapter's dialect into `compileSkill`, so a Codex repo compiles
   Codex-shaped skills.

## Non-goal: compiling vigiles subagents to Codex

Deliberately NOT implemented (a model mismatch, not a missing renderer). vigiles's
`agent()` is a **verified tool contract** rendered to a Claude-Code-shaped subagent
markdown file. A Codex "subagent" is an `[agents.<name>]` **TOML concurrency table**
(`max_threads` / `max_depth`) — a runtime-orchestration knob, not a tool contract.
The two models don't map, so `compileAgent` does not emit a TOML `[agents]` block,
and there is no plan to add one. The Codex dialect still **verifies** an `agent()`'s
tool contract against its built-in catalog; only the OUTPUT renderer is CC-only.
(Comment at `compileAgent` in `src/core/compile.ts`.)

## What this means

The bet held end-to-end: the **format/layout half** was one object set (no core
changes), and the **transport half** — once we stopped assuming the binary was
unavailable — was built and proven against real `codex` (gaps 1–2 closed). On that
basis Codex is now **registered + exported** (`vigiles/codex`). The instruction-file
and SKILL.md renderers are now dialect-correct (gap 6, closed). The remaining
format-axis polish: extend the layout port for TOML manifest/MCP + config-surfaces
(gaps 3–4) and move `loadPlugin` to a shared location (gap 5). Compiling subagents
to Codex is a non-goal (above), not on this list.

The boundary holds for the prototype too: `src/adapters/codex/**` is a
`codex-harness` element in `eslint.config.mjs`, and `verify-core` may import
neither it nor `cc-harness`.
