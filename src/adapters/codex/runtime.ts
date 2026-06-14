/**
 * codexRuntime — EXPERIMENTAL, internal-only. A prototype `HarnessRuntime` for
 * Codex: spawn `codex`, reach a mock via the OpenAI base-URL env.
 *
 * Finding (research/codex-prototype-findings.md): the port's single
 * `modelBaseUrlEnv` FITS Codex only via the built-in-provider override
 * (`OPENAI_BASE_URL`), which the docs call "messy". The clean Codex path is a
 * `[model_providers.mock]` block written to `config.toml` — i.e. "point at the
 * mock" wants to be an *operation* (env var OR config-file write), the deferred
 * `wireMock` gap. The env-var route works enough to prototype; the richer op is
 * the real fix when the Codex transport tier is built.
 */
import type { HarnessRuntime } from "../../core/runtime.js";

export const codexRuntime: HarnessRuntime = {
  name: "codex",
  agentBinary: "codex",
  modelBaseUrlEnv: "OPENAI_BASE_URL",
  modelApiKeyEnv: "OPENAI_API_KEY",
  mockApiKey: "sk-mock",
};
