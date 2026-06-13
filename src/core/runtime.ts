/**
 * HarnessRuntime — the runtime/transport PORT (hexagonal transport axis). The
 * facts the test tiers need to actually drive a harness: the agent binary to
 * spawn, and the env a no-key mock model is reached through (the base-URL var,
 * the API-key var, and a dummy key the mock ignores). These were hard-coded
 * `"claude"` / `ANTHROPIC_*` literals in `harness-test.ts` and `eval.ts`; behind
 * this interface a second harness (Codex) supplies its own `HarnessRuntime`
 * (a different binary + its model's env) and the runners spawn it the same way.
 *
 * The Claude Code implementation is `claudeCodeRuntime` in
 * `src/adapters/claude-code/runtime.ts`.
 */
export interface HarnessRuntime {
  /** Stable identifier, e.g. "claude-code". */
  readonly name: string;
  /** The CLI binary that runs the agent, e.g. "claude". */
  readonly agentBinary: string;
  /** Env var pointing the client at the mock model, e.g. "ANTHROPIC_BASE_URL". */
  readonly modelBaseUrlEnv: string;
  /** Env var carrying the (dummy) API key, e.g. "ANTHROPIC_API_KEY". */
  readonly modelApiKeyEnv: string;
  /** A dummy key value the mock ignores — avoids needing real auth. */
  readonly mockApiKey: string;
}
