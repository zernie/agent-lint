/**
 * opencodeRuntime — EXPERIMENTAL, internal-only. A prototype `HarnessRuntime` for
 * OpenCode: spawn `opencode`, reach a mock via the OpenAI-compatible base-URL env.
 * OpenCode is BYOM/openai-compatible, so the env-var "point at the mock" route
 * fits cleanly. NOT exported / NOT registered.
 */
import type { HarnessRuntime } from "../../core/runtime.js";

export const opencodeRuntime: HarnessRuntime = {
  name: "opencode",
  agentBinary: "opencode",
  modelBaseUrlEnv: "OPENAI_BASE_URL",
  modelApiKeyEnv: "OPENAI_API_KEY",
  mockApiKey: "sk-mock-opencode",
  /** Env-only (OpenAI-compatible base-URL override), like Claude Code. */
  wireMock(baseUrl: string): {
    readonly args: readonly string[];
    readonly env: Record<string, string>;
  } {
    return {
      args: [],
      env: {
        [opencodeRuntime.modelBaseUrlEnv]: baseUrl,
        [opencodeRuntime.modelApiKeyEnv]: opencodeRuntime.mockApiKey,
      },
    };
  },
};
