/**
 * claudeCodeModelMock — the Claude Code `ModelMock`: the mock speaks Anthropic
 * **Messages** SSE; a turn-consuming request hits `/v1/messages`, and the client
 * probes `/v1/messages/count_tokens`. `startMock` reads these endpoints from
 * here. A Codex adapter's `codexModelMock` would set `wireApi:
 * "openai-responses"` and `modelEndpoint: "/v1/responses"` with no count-tokens
 * endpoint, and ship its own Responses-SSE renderer.
 */
import type { ModelMock } from "../../core/model-mock.js";

export const claudeCodeModelMock: ModelMock = {
  name: "claude-code",
  wireApi: "anthropic-messages",
  modelEndpoint: "/v1/messages",
  countTokensEndpoint: "count_tokens",
};
