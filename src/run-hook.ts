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
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  decideSandbox,
  sandboxAvailable,
  bwrapArgs,
  setenvArgs,
  type SandboxMode,
} from "./sandbox.js";

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
  /**
   * Provenance of the hook command. `true` (default) means YOU authored it — the
   * usual case at this tier, a command written inline in the test — so it runs
   * directly. `false` marks it foreign (a vendored third-party hook script),
   * which makes confinement the DEFAULT: with no explicit `sandbox`, an untrusted
   * hook behaves as `sandbox: "auto"` — confined under bubblewrap, or refused if
   * none is available — so foreign code is never run unconfined by accident. This
   * mirrors the harness tier, where trust follows `plugin`/`pluginDir`
   * provenance (`specTrusted` in `src/sandbox.ts`); the unit tier takes a raw
   * command string with no provenance signal, so you declare it here.
   */
  readonly trusted?: boolean;
  /**
   * Confine the hook under bubblewrap (Linux). When unset, the mode follows
   * {@link RunHookOptions.trusted}: a trusted hook runs directly (`false`), an
   * untrusted one is confined-or-refused (`"auto"`). Set it explicitly to
   * override: `"auto"`/`"strict"` force confinement (a no-egress namespace with a
   * cleared environment — your `opts.env` is added back — or a **refusal** if no
   * bwrap is available), and `false` is the opt-out that runs even untrusted code
   * unconfined. macOS/Windows have no bwrap, so `"auto"`/`"strict"` throw there —
   * see `src/sandbox.ts`.
   */
  readonly sandbox?: SandboxMode;
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

/** The raw fields of a hook spawn that the result parser needs. */
export interface HookSpawnResult {
  readonly status: number | null;
  readonly signal: string | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Spawn a hook (command + piped event) — the injectable seam over the real spawn. */
export type HookSpawner = (
  command: string,
  input: HookInput,
  opts: RunHookOptions,
) => HookSpawnResult;

/** The spawn seams `runHookWith` needs, so its decision logic is testable. */
export interface RunHookDeps {
  /** Whether bubblewrap confinement is available (Linux + bwrap). */
  readonly available: boolean;
  /** Run the command directly (unconfined). */
  readonly direct: HookSpawner;
  /** Run the command confined under bubblewrap. */
  readonly sandboxed: HookSpawner;
}

/**
 * The hook-run orchestration with injectable spawn seams: pick direct vs.
 * confined via the safe-by-default policy (`decideSandbox`), then parse the exit
 * code + stdout into a normalized decision. Exported so all three branches
 * (direct / sandbox / refuse) are unit-tested with fake spawners — no real
 * bwrap. `runHook` is this with the real seams.
 */
export function runHookWith(
  command: string,
  input: HookInput,
  opts: RunHookOptions,
  deps: RunHookDeps,
): HookRunResult {
  // Confinement follows provenance: a trusted hook (the default) runs directly;
  // marking a hook untrusted defaults it to "auto" (confine-or-refuse), so
  // foreign code is never run unconfined by accident. An explicit `sandbox`
  // overrides the default either way. The trust fed to decideSandbox stays
  // `false` at this tier — a raw command has no provenance, so an explicit
  // "auto"/"strict" here is always a request to *confine*, not "trusted→direct".
  const mode: SandboxMode =
    opts.sandbox ?? (opts.trusted === false ? "auto" : false);
  const decision = decideSandbox({
    trusted: false,
    mode,
    available: deps.available,
  });
  if (decision.action === "throw") throw new Error(decision.reason);
  const res =
    decision.action === "sandbox"
      ? deps.sandboxed(command, input, opts)
      : deps.direct(command, input, opts);
  const exitCode = res.status ?? (res.signal ? 1 : 0);
  const stdout = res.stdout ?? "";
  const stderr = res.stderr ?? "";
  const json = parseHookOutput(stdout);
  const { blocked, decision: dec } = decideHook(exitCode, json);
  return { exitCode, stdout, stderr, json, blocked, decision: dec };
}

/** Run the hook command directly through a shell (the default, unconfined). */
function directSpawn(
  command: string,
  input: HookInput,
  opts: RunHookOptions,
): HookSpawnResult {
  const res = spawnSync(command, {
    shell: true,
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    input: JSON.stringify(input),
    encoding: "utf-8",
    timeout: opts.timeoutMs ?? 10000,
  });
  return {
    status: res.status,
    signal: res.signal,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

/* v8 ignore start -- spawns real bwrap; exercised by the bwrap-gated integration
   test (skipped without bwrap). The decision logic is runHookWith (unit-tested
   with fakes); the confinement argv is bwrapArgs/setenvArgs (unit-tested). */
function sandboxedSpawn(
  command: string,
  input: HookInput,
  opts: RunHookOptions,
): HookSpawnResult {
  const ioDir = mkdtempSync(join(tmpdir(), "vigiles-hook-sbx-"));
  const home = join(ioDir, "home");
  mkdirSync(home);
  // The hook gets a confined writable work dir: the caller's cwd if given, else
  // the throwaway IO dir (so a hook that writes a marker still works).
  const cwd = opts.cwd ?? ioDir;
  try {
    const args = [
      ...bwrapArgs({
        cwd,
        ioDir,
        home,
        path: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
      }),
      ...setenvArgs(opts.env ?? {}),
      "sh",
      "-c",
      command,
    ];
    const res = spawnSync("bwrap", args, {
      cwd,
      env: process.env,
      input: JSON.stringify(input),
      encoding: "utf-8",
      timeout: opts.timeoutMs ?? 10000,
    });
    return {
      status: res.status,
      signal: res.signal,
      stdout: res.stdout ?? "",
      stderr: res.stderr ?? "",
    };
  } finally {
    rmSync(ioDir, { recursive: true, force: true });
  }
}

const REAL_DEPS: RunHookDeps = {
  available: sandboxAvailable(),
  direct: directSpawn,
  sandboxed: sandboxedSpawn,
};
/* v8 ignore stop */

/**
 * Run a hook command, piping `input` as JSON to its stdin, and report the exit
 * code + parsed decision. Synchronous (so it can be used inside an eval's
 * `measure` too). `command` is run through a shell, so the same command string a
 * plugin ships (with args / env refs) works verbatim. Mark a hook you didn't
 * write with `trusted: false` and it is confined by default (or pass `sandbox:
 * "auto"` directly) — see {@link RunHookOptions.trusted}.
 */
export function runHook(
  command: string,
  input: HookInput,
  opts: RunHookOptions = {},
): HookRunResult {
  return runHookWith(command, input, opts, REAL_DEPS);
}
