/**
 * codexModelMock — EXPERIMENTAL, internal-only. Codex speaks the OpenAI
 * **Responses** API: a turn-consuming request hits `/v1/responses`, and there is
 * no count-tokens endpoint. Finding: the `ModelMock` *descriptor* captures the
 * wire facts cleanly; the SSE *renderer* (the `response.created → … →
 * response.completed` event sequence + a Responses request-parser) is the
 * deferred piece — built with the Codex transport tier, not declared here.
 */
import type { ModelMock } from "../../core/model-mock.js";

export const codexModelMock: ModelMock = {
  name: "codex",
  wireApi: "openai-responses",
  modelEndpoint: "/v1/responses",
  // No count-tokens endpoint (countTokensEndpoint omitted).
};
