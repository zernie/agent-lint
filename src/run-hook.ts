/**
 * vigiles — the *unit* tier for agent hooks.
 *
 * A hook is just a process with a protocol on top: the harness pipes a JSON
 * event to its stdin and reads back an exit code (0 ok, 2 = block) and,
 * optionally, a JSON decision on stdout. `runHook` is exactly that protocol —
 * and nothing else.
 *
 * Everything underneath (spawning, shells, stdin, confinement, egress recording,
 * write recording) lives in `./run-script.ts`, because none of it is about
 * hooks. This module is the thin specialization:
 *
 *     runHook  =  runScript  +  event-to-stdin  +  exit-code-to-decision
 *
 * Reach for {@link runScript} instead when the thing under test is an ordinary
 * program — a helper script has effects, not a decision, and its result type
 * says so.
 *
 *   const r = runHook('"$GUARD"', {
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
import type { HookProtocol } from "./core/hook-protocol.js";
import { claudeCodeHookProtocol } from "./adapters/claude-code/hook-protocol.js";
import { propertyTest } from "./core/proofs.js";
import {
  runScriptWith,
  REAL_DEPS,
  type RunScriptOptions,
  type ScriptRunResult,
  type RunScriptDeps,
} from "./run-script.js";

export type { EgressAttempt } from "./run-script.js";
// The general runner this module specializes. Re-exported so `vigiles/unit`'s
// hook surface and the script surface stay one import away from each other.
export { runScript, runScriptWith, egressRoutes } from "./run-script.js";
export type {
  RunScriptOptions,
  ScriptRunResult,
  ScriptSpawnResult,
  ScriptSpawner,
  RunScriptDeps,
} from "./run-script.js";

/**
 * Options for {@link runHook} — every {@link RunScriptOptions} knob except
 * `stdin`, which the hook layer owns (it serializes the event there).
 */
export type RunHookOptions = Omit<RunScriptOptions, "stdin">;

// ---------------------------------------------------------------------------
// propertyHook — invariant testing for a hook's (event) → decision (Phase 5 of
// research/testing-api-design.md). A hook is a pure-ish function; instead of a
// few example events, generate MANY (mutate from a seed) and assert invariants
// hold for every decision — "never both allow and block", "PostToolUse output is
// always valid JSON", etc. Reuses the deterministic `propertyTest` from
// proofs.ts (no fast-check dep; seeded, shrinks the counterexample). The `decide`
// runner is injectable, so the loop is unit-testable with a pure fake; pass
// `(e) => runHook(cmd, e)` to property-test a real hook.
// ---------------------------------------------------------------------------

/** Result of {@link propertyHook}: the first shrunk counterexample, if any. */
export interface HookPropertyResult<E> {
  readonly passed: boolean;
  readonly iterations: number;
  /** The (shrunk) event that broke an invariant — present iff `!passed`. */
  readonly counterexample?: E;
  /** Which invariant failed — present iff `!passed`. */
  readonly failedInvariant?: string;
}

/**
 * Property-test a hook's decision over generated events. Throws nothing — returns
 * a result you assert on (`assert.ok(r.passed)`), so the counterexample is
 * inspectable. `mutate(event, rng)` produces a variation from the running event;
 * each named invariant is checked against `decide(event)`.
 */
export function propertyHook<E, D>(opts: {
  readonly seed: E;
  readonly mutate: (event: E, rng: number) => E;
  readonly decide: (event: E) => D;
  readonly invariants: Record<string, (decision: D, event: E) => boolean>;
  readonly iterations?: number;
}): HookPropertyResult<E> {
  const wrapped: Record<string, (e: E) => boolean> = {};
  for (const [name, inv] of Object.entries(opts.invariants)) {
    wrapped[name] = (e: E) => inv(opts.decide(e), e);
  }
  const r = propertyTest(opts.seed, opts.mutate, wrapped, {
    iterations: opts.iterations ?? 100,
    sequenceLength: 1, // each event is independent — no mutation sequence
    seed: 1,
  });
  if (r.passed) return { passed: true, iterations: r.iterations };
  const last = r.failingSequence?.[r.failingSequence.length - 1];
  return {
    passed: false,
    iterations: r.iterations,
    counterexample: r.shrunk ?? last,
    failedInvariant: r.failedInvariant,
  };
}

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

export interface HookRunResult extends ScriptRunResult {
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
  protocol: HookProtocol = claudeCodeHookProtocol,
): { blocked: boolean; decision: HookRunResult["decision"] } {
  const permission = json?.hookSpecificOutput?.permissionDecision;
  const decision = permission ?? json?.decision;
  const blocked =
    exitCode === protocol.blockExitCode ||
    (decision !== undefined && protocol.denyDecisionValues.includes(decision));
  return { blocked, decision };
}

/**
 * The hook layer over {@link runScriptWith}: serialize the event to stdin, run
 * the program, then read the exit code + stdout JSON as a normalized decision.
 * Exported so the decision logic is unit-testable with fake spawners — no real
 * bwrap. `runHook` is this with the real seams.
 */
export function runHookWith(
  command: string,
  input: HookInput,
  opts: RunHookOptions,
  deps: RunScriptDeps,
): HookRunResult {
  const res = runScriptWith(command, JSON.stringify(input), opts, deps);
  const json = parseHookOutput(res.stdout);
  const { blocked, decision } = decideHook(res.exitCode, json);
  return { ...res, json, blocked, decision };
}

/**
 * Run a hook command, piping `input` as JSON to its stdin, and report the exit
 * code + parsed decision. Synchronous (so it can be used inside an eval's
 * `measure` too). `command` is run through a shell, so the same command string a
 * plugin ships (with args / env refs) works verbatim. Mark a hook you didn't
 * write with `trusted: false` and it is confined by default (or pass `sandbox:
 * "auto"` directly) — see {@link RunScriptOptions.trusted}.
 *
 * Testing a program that is NOT a hook? Use {@link runScript}.
 */
export function runHook(
  command: string,
  input: HookInput,
  opts: RunHookOptions = {},
): HookRunResult {
  return runHookWith(command, input, opts, REAL_DEPS);
}
