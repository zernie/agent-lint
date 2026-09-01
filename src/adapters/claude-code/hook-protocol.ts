/**
 * claudeCodeHookProtocol — the Claude Code `HookProtocol`: a hook blocks via exit
 * code 2 or a `permissionDecision: "deny"` / `decision: "block"` JSON decision;
 * the event arrives on stdin. `decideHook` reads the block code + deny values
 * from here. A Codex adapter's `codexHookProtocol` is nearly identical (the same
 * decision model), adding its own `eventEnvVars` (session_id/PLUGIN_ROOT/…).
 */
import type { HookProtocol } from "../../core/hook-protocol.js";

export const claudeCodeHookProtocol: HookProtocol = {
  name: "claude-code",
  blockExitCode: 2,
  denyDecisionValues: ["block", "deny"],
  eventEnvVars: [],
  // `{"continue": false}` stops the turn outright and returns `stopReason` to
  // the agent — a stronger stop than a per-call deny, and a documented one.
  haltsTurnField: "continue",
  // Events that honor `hookSpecificOutput.additionalContext` (developer-context
  // injection). Covers vigiles's shipped inject hooks: the SessionStart lint
  // summary and the PostToolUse refs / eval-lock nudges.
  injectableEvents: ["SessionStart", "UserPromptSubmit", "PostToolUse"],
};
