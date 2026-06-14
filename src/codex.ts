/**
 * `vigiles/codex` — the OpenAI Codex harness adapter. Sits beside
 * `vigiles/claude-code`: same harness-agnostic `vigiles/testing` core, a
 * different transport (the `codex` binary + the OpenAI **Responses** SSE mock).
 *
 * Pillar 2 (harness testing) is proven here — `startCodexMock` serves the
 * Responses SSE that real `codex exec` completes a turn against, keylessly (see
 * `codexMockArgs`/`codexMockEnv` for the wiring). Pillar 1 instruction/skill
 * *renderers* still emit the Claude-Code shape until the format-axis renderers
 * land (see `research/code-adapter-architecture.md`).
 */
export * from "./adapters/codex/dialect.js";
export * from "./adapters/codex/layout.js";
export * from "./adapters/codex/runtime.js";
export * from "./adapters/codex/hook-protocol.js";
export * from "./adapters/codex/model-mock.js";
export * from "./adapters/codex/mock-model.js";
export * from "./adapters/codex/adapter.js";
