/**
 * codexRuntime — EXPERIMENTAL, internal-only. A prototype `HarnessRuntime` for
 * Codex: spawn `codex`, and point it at a no-key mock.
 *
 * PROVEN wiring (validated against real codex-cli 0.139.0): the clean keyless
 * route is NOT the built-in `OPENAI_BASE_URL` override the prototype guessed
 * (the docs called that "messy") — it is a `[model_providers.mock]` provider
 * defined inline via `-c` flags on `codex exec`. `codexMockArgs(baseUrl)`
 * returns that flag array (the `wireMock` recipe as data) and `codexMockEnv()`
 * returns the dummy-key env codex reads through it. So "point at the mock" is a
 * flag-based *operation* here, not a single env var.
 *
 * The `HarnessRuntime` port still requires `modelBaseUrlEnv`/`modelApiKeyEnv`
 * (the env-var transport axis), so we keep valid values for conformance — but
 * codex's real wiring is the flag-based recipe below, not those env vars. The
 * port's `wireMock(baseUrl)` surfaces that recipe as `{ args, env }` so the
 * generalized `runHarnessTest` runner drives codex the same way it drives
 * Claude Code; `codexMockArgs`/`codexMockEnv` remain exported (used by
 * `wireMock` and by `mock-model.test.ts`).
 */
import type { HarnessRuntime } from "../../core/runtime.js";

export const codexRuntime: HarnessRuntime = {
  name: "codex",
  agentBinary: "codex",
  // Kept non-empty for HarnessRuntime conformance (the env-var transport axis).
  // Codex's PROVEN keyless wiring is the flag-based codexMockArgs recipe, not
  // this built-in-provider override.
  modelBaseUrlEnv: "OPENAI_BASE_URL",
  modelApiKeyEnv: "MOCK_KEY",
  mockApiKey: "dummy-key",
  /**
   * Codex reaches the mock through the PROVEN keyless flag recipe (the
   * `-c model_providers.mock.*` array), NOT a single base-URL env var. So
   * `wireMock` carries args (the flags) AND env (the dummy key codex reads
   * `model_providers.mock.env_key` through). The `wireMock` method unifies both
   * transport axes (CC's env-only, Codex's flags) behind one call.
   */
  wireMock(baseUrl: string): {
    readonly args: readonly string[];
    readonly env: Record<string, string>;
  } {
    return { args: codexMockArgs(baseUrl), env: codexMockEnv() };
  },
  /**
   * Codex opts OUT of version partitioning (`""`). It is perpetual `0.x` where
   * the *minor* is the patch cadence (~2 bumps/week, 134 minors in 14 months), so
   * keying `major.minor` like Claude Code would churn the cache/lock weekly. With
   * no stable behavior boundary in the version string, Codex relies on the dated
   * model id + `evalApiVersion` for staleness instead. See research/cache-invalidation.md.
   */
  versionKey(_raw: string): string {
    return "";
  },
};

/**
 * The PROVEN `-c` flag array that points `codex exec` at a mock served at
 * `baseUrl` (e.g. `http://127.0.0.1:PORT`) over the Responses wire API, keyless.
 * Defines a `[model_providers.mock]` provider inline and selects it as the
 * active model provider. `baseUrl` is suffixed with `/v1` (codex appends
 * `/responses`). Combine with `codexMockEnv()` and the `codex exec` flags
 * `--ignore-user-config --skip-git-repo-check --ephemeral
 * --dangerously-bypass-approvals-and-sandbox -c model="gpt-5-codex"`.
 */
export function codexMockArgs(baseUrl: string): string[] {
  return [
    "-c",
    "model_provider=mock",
    "-c",
    'model_providers.mock.name="mock"',
    "-c",
    `model_providers.mock.base_url="${baseUrl}/v1"`,
    "-c",
    'model_providers.mock.wire_api="responses"',
    "-c",
    'model_providers.mock.env_key="MOCK_KEY"',
    "-c",
    "model_providers.mock.requires_openai_auth=false",
    "-c",
    "model_providers.mock.request_max_retries=0",
    "-c",
    "model_providers.mock.stream_max_retries=0",
  ];
}

/**
 * The dummy-key env codex reads `model_providers.mock.env_key` through. Codex
 * sends `Authorization: Bearer dummy-key`; the mock ignores it.
 */
export function codexMockEnv(): Record<string, string> {
  return { MOCK_KEY: "dummy-key" };
}
