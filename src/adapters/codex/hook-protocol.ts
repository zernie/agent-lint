/**
 * codexHookProtocol — EXPERIMENTAL, internal-only. Codex's hook wire protocol.
 * Finding: it is essentially IDENTICAL to Claude Code's (exit 2 / `decision:block`
 * / `permissionDecision:deny`) — the thin `HookProtocol` port was the right call.
 * The genuine deltas are the env vars a hook receives + the TOML config format
 * (the latter lives in PluginLayout.settingsFormat, not here).
 */
import type { HookProtocol } from "../../core/hook-protocol.js";

export const codexHookProtocol: HookProtocol = {
  name: "codex",
  blockExitCode: 2,
  denyDecisionValues: ["block", "deny"],
  eventEnvVars: [
    "session_id",
    "cwd",
    "hook_event_name",
    "model",
    "turn_id",
    "permission_mode",
    "PLUGIN_ROOT",
  ],
};
