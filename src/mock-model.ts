/**
 * `vigiles/mock-model` — composition-root re-export of the Claude Code scriptable
 * Anthropic-Messages mock (`scriptModel`, `startMock`, `extractRequest`).
 *
 * The mock's wire format is harness-specific (Anthropic Messages here; Codex uses
 * the OpenAI Responses mock in `vigiles/codex`), so this is a Claude-Code-flavored
 * transport. It lives at the composition root so the harness-agnostic tier
 * barrels (`vigiles/integration`, `vigiles/e2e`) can re-export it without reaching
 * into the adapter directly (enforced by the `agnostic-surface` eslint boundary).
 */
export * from "./adapters/claude-code/mock-model.js";
