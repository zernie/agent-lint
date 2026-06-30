/**
 * HookProtocol — the hook-wire PORT (transport axis). How a harness signals that
 * a hook blocked/denied a tool call: the block exit code, the decision values
 * that mean "deny", and the env vars a synthesized event carries. The research
 * (research/harness-landscape.md) found Claude Code and Codex hooks are nearly
 * identical at the wire level (both: JSON on stdin, `permissionDecision: "deny"`
 * / `decision: "block"` / exit 2) — so this descriptor is deliberately thin, and
 * the fact that a second harness needs almost the same values IS the finding.
 * What varies more (config format JSON-vs-TOML, the plugin-root token, the event
 * names) lives in PluginLayout / HarnessDialect, not here.
 *
 * The Claude Code implementation is `claudeCodeHookProtocol` in
 * `src/adapters/claude-code/hook-protocol.ts`.
 */
export interface HookProtocol {
  /** Stable identifier, e.g. "claude-code". */
  readonly name: string;
  /** Exit code a hook process uses to block/deny a tool call (Claude Code: 2). */
  readonly blockExitCode: number;
  /** decision / permissionDecision values that mean "deny" the tool call. */
  readonly denyDecisionValues: readonly string[];
  /**
   * Env vars a synthesized hook event carries beyond the JSON on stdin (Claude
   * Code passes the event on stdin only; Codex adds session_id/cwd/PLUGIN_ROOT/…).
   */
  readonly eventEnvVars: readonly string[];
  /**
   * How a tool matcher is written in the emitted hooks block — `"exact"` (Claude
   * Code: the tool name / `A|B` alternation) or `"regex"` (Codex: an anchored
   * regex `^(A|B)$`). Optional (additive, non-breaking) — absent ⇒ `"exact"`.
   * Used by `compileHookProgram` when rendering the settings block.
   */
  readonly matcherStyle?: "exact" | "regex";
  /**
   * The events whose hook can inject **developer context** into the agent by
   * printing `{ hookSpecificOutput: { hookEventName, additionalContext } }` on
   * stdout. The inject *shape* is shared across Claude Code and Codex (so the
   * runtime emits it once, not per-harness); the genuinely per-harness fact is
   * **which events honor it** — and encoding it here is what makes "this harness
   * can deliver an inject hook" a TESTED contract instead of an assumption. Both
   * Claude Code and Codex support the main lifecycle events (SessionStart,
   * UserPromptSubmit, PostToolUse); a few (Stop, SubagentStop, PreCompact) carry
   * no context on either. An empty list means the harness cannot inject context
   * from a hook at all. Verified for Codex against the official hooks docs
   * (developers.openai.com/codex/hooks). The conformance kit asserts a
   * shell-hook harness declares a non-empty set.
   */
  readonly injectableEvents: readonly string[];
}
