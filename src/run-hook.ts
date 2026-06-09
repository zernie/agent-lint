/**
 * vigiles — the *unit* tier for Claude Code hooks.
 *
 * A hook is just a process: Claude Code pipes a JSON event to its stdin and
 * reads back an exit code (0 ok, 2 = block) and, optionally, a JSON decision on
 * stdout. `runHook` exercises exactly that contract directly — no `claude`
 * binary, no model, no sandbox — so a hook's logic can be unit-tested in
 * milliseconds:
 *
 *   const r = runHook('"$GUARD" ', {
 *     hook_event_name: "PreToolUse",
 *     tool_name: "Bash",
 *     tool_input: { command: "git commit --no-verify" },
 *   }, { env: { GUARD: guardPath } });
 *   assert.ok(r.blocked);            // exit 2 / decision:block / permission:deny
 *
 * Why this exists alongside `runHarnessTest`:
 *   - It is the cheap base of the pyramid — no CLI dependency, runs anywhere.
 *   - It reaches every event. The deterministic `runHarnessTest` mock can drive
 *     SessionStart/Stop/UserPromptSubmit/Bash PreToolUse|PostToolUse, but NOT
 *     Edit/Write tool events (headless-gated), PreCompact, Notification,
 *     SessionEnd, or SubagentStop. At this tier you hand the hook the event
 *     JSON yourself, so all of them are testable.
 *
 * It does NOT prove the hook is *wired* into the harness (that the settings
 * point at it, that `${CLAUDE_PLUGIN_ROOT}` resolves) — that is what the
 * `plugin:` loader + `runHarnessTest` cover. Use both: unit-test the hook's
 * logic here, then assert it fires in the assembled machine there.
 */
import { spawnSync } from "node:child_process";

/** A hook event payload (the JSON Claude Code writes to the hook's stdin). */
export interface HookInput {
  /** e.g. "PreToolUse", "PostToolUse", "Stop", "SessionStart", "PreCompact". */
  readonly hook_event_name?: string;
  /** PreToolUse/PostToolUse. */
  readonly tool_name?: string;
  readonly tool_input?: unknown;
  readonly tool_response?: unknown;
  /** UserPromptSubmit. */
  readonly prompt?: string;
  /** SessionStart. */
  readonly source?: string;
  /** Stop / SubagentStop. */
  readonly stop_hook_active?: boolean;
  /** Any other event-specific fields. */
  readonly [k: string]: unknown;
}

/** The JSON a hook may print on stdout (all fields optional). */
export interface HookOutput {
  readonly decision?: "approve" | "block";
  readonly reason?: string;
  readonly continue?: boolean;
  readonly stopReason?: string;
  readonly suppressOutput?: boolean;
  readonly systemMessage?: string;
  readonly hookSpecificOutput?: {
    readonly hookEventName?: string;
    readonly permissionDecision?: "allow" | "deny" | "ask";
    readonly permissionDecisionReason?: string;
    readonly additionalContext?: string;
  };
  readonly [k: string]: unknown;
}

export interface RunHookOptions {
  /** Working directory for the hook process. Default: a value won't be set. */
  readonly cwd?: string;
  /** Extra env vars (merged over process.env). `{cwd}` in values is left as-is. */
  readonly env?: Record<string, string>;
  /** Per-run timeout ms. Default 10000. */
  readonly timeoutMs?: number;
}

export interface HookRunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  /** Parsed stdout JSON if the hook emitted a JSON decision, else null. */
  readonly json: HookOutput | null;
  /**
   * Normalized decision: a deny/block via exit 2, `decision:"block"`, or
   * `permissionDecision:"deny"` all set `blocked = true`.
   */
  readonly blocked: boolean;
  /**
   * The decision the hook expressed, preferring the structured
   * `permissionDecision` ("allow"|"deny"|"ask") then legacy `decision`
   * ("approve"|"block"), else undefined.
   */
  readonly decision:
    | HookOutput["decision"]
    | "allow"
    | "deny"
    | "ask"
    | undefined;
}

/** Parse stdout as a hook JSON decision (pure, testable without a process). */
export function parseHookOutput(stdout: string): HookOutput | null {
  const s = stdout.trim();
  if (!s.startsWith("{")) return null;
  try {
    return JSON.parse(s) as HookOutput;
  } catch {
    return null;
  }
}

/**
 * Decide whether a hook result blocked, and the normalized decision. Pure, so
 * the policy is unit-testable independent of spawning anything.
 */
export function decideHook(
  exitCode: number,
  json: HookOutput | null,
): { blocked: boolean; decision: HookRunResult["decision"] } {
  const permission = json?.hookSpecificOutput?.permissionDecision;
  const decision = permission ?? json?.decision;
  const blocked = exitCode === 2 || decision === "block" || decision === "deny";
  return { blocked, decision };
}

/**
 * Run a hook command, piping `input` as JSON to its stdin, and report the exit
 * code + parsed decision. Synchronous (so it can be used inside an eval's
 * `measure` too). `command` is run through a shell, so the same command string a
 * plugin ships (with args / env refs) works verbatim.
 */
export function runHook(
  command: string,
  input: HookInput,
  opts: RunHookOptions = {},
): HookRunResult {
  const res = spawnSync(command, {
    shell: true,
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    input: JSON.stringify(input),
    encoding: "utf-8",
    timeout: opts.timeoutMs ?? 10000,
  });
  const exitCode = res.status ?? (res.signal ? 1 : 0);
  const stdout = res.stdout ?? "";
  const stderr = res.stderr ?? "";
  const json = parseHookOutput(stdout);
  const { blocked, decision } = decideHook(exitCode, json);
  return { exitCode, stdout, stderr, json, blocked, decision };
}
