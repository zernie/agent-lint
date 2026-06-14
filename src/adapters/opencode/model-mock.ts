/**
 * opencodeModelMock — EXPERIMENTAL, internal-only. OpenCode is OpenAI-compatible
 * and speaks the OpenAI **Chat Completions** API: a turn-consuming request hits
 * `/v1/chat/completions`, with no separate count-tokens endpoint. The descriptor
 * captures the wire facts; the SSE renderer is the deferred piece (built with the
 * OpenCode transport tier, not declared here). NOT exported / NOT registered.
 */
import type { ModelMock } from "../../core/model-mock.js";

export const opencodeModelMock: ModelMock = {
  name: "opencode",
  wireApi: "openai-chat",
  modelEndpoint: "/v1/chat/completions",
  // No count-tokens endpoint (countTokensEndpoint omitted).
};
