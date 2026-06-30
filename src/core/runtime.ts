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
  /**
   * How to point the spawned binary at a mock model served at `baseUrl` — the
   * args to add to the binary's argv and the env to spawn it with. For Claude
   * Code this is env-only (`ANTHROPIC_BASE_URL` + a dummy key, no args); for
   * Codex it is the keyless `-c model_providers.mock.*` flag recipe plus a
   * dummy-key env. Behind one method so the runner wires either harness the
   * same way, without knowing which transport axis (env var vs config flags) a
   * given harness uses.
   */
  wireMock(baseUrl: string): {
    readonly args: readonly string[];
    readonly env: Record<string, string>;
  };
  /**
   * Reduce a raw `--version` string to the **behaviorally-significant** token the
   * cache + lock key on — so a harness upgrade that actually moves agent behavior
   * (new system prompt / tool defs) invalidates a stale replay, while churn that
   * doesn't shouldn't partition the key. **What counts as significant is
   * per-harness**, which is exactly why this lives on the port rather than as a
   * universal `major.minor` rule:
   *
   * - **Claude Code** is semver-ish — `major.minor` bumps roughly quarterly
   *   (0.2 → 1.0 → 2.0 → 2.1 over 16 months) while patches ship ~daily — so it
   *   returns `major.minor`: a real behavior boundary, rare enough not to churn.
   * - **Codex** is perpetual `0.x` where the *minor* IS the patch cadence (~2
   *   bumps/week), so `major.minor` would churn weekly — it returns `""`, opting
   *   out of version partitioning and relying on the dated model id +
   *   `evalApiVersion` instead.
   *
   * `""` means "don't partition on the harness version." Pure (no spawn — the
   * caller resolves the raw string via `agentBinary --version`); unit-testable.
   */
  versionKey(raw: string): string;
}
