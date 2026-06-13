/**
 * claudeCodeRuntime — the Claude Code `HarnessRuntime` (spawn `claude`, reach the
 * mock via `ANTHROPIC_BASE_URL` with a dummy `ANTHROPIC_API_KEY`). The runners
 * (`harness-test.ts`, `eval.ts`) read the binary + env from here instead of
 * hard-coding them; a Codex adapter defines `codexRuntime` and its runner uses it.
 */
import type { HarnessRuntime } from "../../core/runtime.js";

export const claudeCodeRuntime: HarnessRuntime = {
  name: "claude-code",
  agentBinary: "claude",
  modelBaseUrlEnv: "ANTHROPIC_BASE_URL",
  modelApiKeyEnv: "ANTHROPIC_API_KEY",
  mockApiKey: "sk-vigiles-mock",
};

/**
 * Build the spawn env that points the agent CLI at the mock model: the caller's
 * environment plus the runtime's base-URL var (→ the mock's URL) and a dummy
 * API key. Pure (no spawn), so it's unit-tested directly — the testable seam of
 * the otherwise un-coverable real-subprocess path.
 */
export function mockModelEnv(
  runtime: HarnessRuntime,
  baseUrl: string,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...base,
    [runtime.modelBaseUrlEnv]: baseUrl,
    [runtime.modelApiKeyEnv]: runtime.mockApiKey,
  };
}
