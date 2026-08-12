/**
 * Codex EVAL-tier transport — the runner + trace parser that
 * `measureTriggerRate`/`runEval` dispatch to via the `ModelOutputParser` seam.
 *
 * SCHEMA: CONFIRMED against real `codex exec --json` (codex-cli 0.139.0, ChatGPT
 * auth). The stream is the thread/item model:
 *
 *   {"type":"thread.started","thread_id":"…"}
 *   {"type":"turn.started"}
 *   {"type":"item.started","item":{"id":"item_0","type":"command_execution",…}}   // mid-flight
 *   {"type":"item.completed","item":{"id":"item_0","type":"command_execution","command":"…","aggregated_output":"…","exit_code":0}}
 *   {"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"…"}}
 *   {"type":"turn.completed","usage":{"input_tokens":…,"cached_input_tokens":…,"output_tokens":…}}
 *
 * So: assistant text = `item.completed` with `item.type:"agent_message"` →
 * `item.text`; a tool call = `item.type:"command_execution"` → `item.command`;
 * usage rides `turn.completed`. We count `item.completed` ONLY (an `item.started`
 * carries the same `id` mid-flight — counting both double-counts).
 *
 * THE SKILL FINDING: Codex has NO discrete "skill selected" event (its CLI has no
 * Skill-tool concept). When a skill triggers, the model READS the skill's
 * `SKILL.md` via a `command_execution` (`sed/cat … skills/<name>/SKILL.md`) and
 * usually says so in an `agent_message`. So "did skill X fire" on Codex is not a
 * clean trace event like Claude's `Skill` tool_use — it's detected by the
 * SKILL.md read (`codexSkillFired`). Best-effort by nature (a cached skill might
 * not be re-read); pair with a behavioral/judged check for certainty.
 */

import { spawnSync } from "node:child_process";
import { refuseUnderForeignRunner } from "../../core/foreign-runner.js";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import type {
  ParsedModelRun,
  AgentRunArgs,
  RunOut,
  EvalDriver,
} from "../../eval.js";
import type { ToolCall } from "../../core/harness-driver.js";

/** A line of `codex exec --json` output. */
interface CodexEvent {
  readonly type?: string;
  readonly item?: Record<string, unknown>;
  readonly usage?: Record<string, unknown>;
  readonly message?: string;
  readonly error?: { message?: string };
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" ? v : 0);

/** Parse the JSONL stream, skipping blank / non-JSON / malformed lines. */
function parseLines(stdout: string): CodexEvent[] {
  const out: CodexEvent[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const s = line.trim();
    if (!s.startsWith("{")) continue;
    try {
      out.push(JSON.parse(s) as CodexEvent);
    } catch {
      /* tolerate a partial / non-event line */
    }
  }
  return out;
}

/** Is this completed item a tool/command call (vs an agent_message / error)? */
function isToolItem(itemType: string): boolean {
  return (
    itemType === "command_execution" || /function_call|tool/.test(itemType)
  );
}

function buildCall(item: Record<string, unknown>, itemType: string): ToolCall {
  return {
    // command_execution → the shell command; function-style → its name.
    name: str(item.command) || str(item.name) || itemType,
    input: item,
    resultText: str(item.aggregated_output),
    isError: num(item.exit_code) !== 0 && item.exit_code != null,
  };
}

/** Map a `turn.completed` usage block to the common EvalUsage. */
function usageFrom(u: Record<string, unknown>): ParsedModelRun["usage"] {
  return {
    costUsd: 0, // codex on the ChatGPT sub reports no per-run USD
    durationMs: 0,
    inputTokens: num(u.input_tokens),
    outputTokens: num(u.output_tokens),
    cacheCreationTokens: 0,
    cacheReadTokens: num(u.cached_input_tokens),
  };
}

const ZERO_USAGE: ParsedModelRun["usage"] = {
  costUsd: 0,
  durationMs: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
};

/** Parse `codex exec --json` stdout into the common trace fields (confirmed schema). */
export function parseCodexEvalRun(out: { stdout: string }): ParsedModelRun {
  const texts: string[] = [];
  const toolCalls: ToolCall[] = [];
  let usage = ZERO_USAGE;
  for (const e of parseLines(out.stdout)) {
    if (e.type === "turn.completed" && e.usage) usage = usageFrom(e.usage);
    // Count COMPLETED items only — item.started carries the same id mid-flight.
    if (e.type !== "item.completed" || !e.item) continue;
    const itemType = str(e.item.type);
    if (itemType === "agent_message") {
      const t = str(e.item.text);
      if (t) texts.push(t);
    } else if (isToolItem(itemType)) {
      toolCalls.push(buildCall(e.item, itemType));
    }
  }
  return {
    // Fallback to trimmed stdout if no agent_message was seen (keeps output non-empty).
    output: texts.join("\n") || out.stdout.trim(),
    turns: texts.length,
    toolCalls,
    hooks: [],
    subagents: [],
    usage,
  };
}

/**
 * The error message if the run errored or was rate-limited (an `error` /
 * `turn.failed` event), else null. CRITICAL for the eval tier: an errored turn
 * must NOT be scored as a clean "skill didn't fire" miss — dogfooding hit a Codex
 * usage limit ("You've hit your usage limit…") whose `error` event left an empty
 * trace that `codexSkillFired` read as recall 0. A caller should skip/retry an
 * errored run, not count it. (The Claude path has `isRateLimited` + backoff; this
 * is the Codex equivalent detector.)
 */
export function codexRunError(out: { stdout: string }): string | null {
  for (const e of parseLines(out.stdout)) {
    if (e.type === "error") return str(e.message) || "codex error";
    if (e.type === "turn.failed") return str(e.error?.message) || "turn failed";
  }
  return null;
}

/**
 * Did Codex activate skill `name` on this run? Detected by the SKILL.md read —
 * Codex has no discrete skill-selection event, so when a skill triggers the model
 * reads its `…/<name>/SKILL.md` via a `command_execution`. Best-effort (a cached
 * skill might not be re-read); for the trigger-rate `fired` predicate over Codex.
 */
export function codexSkillFired(
  run: { toolCalls: readonly ToolCall[] },
  name: string,
): boolean {
  const needle = `${name}/SKILL.md`;
  return run.toolCalls.some((c) => str(c.name).includes(needle));
}

/**
 * Materialize a (Claude-shaped) plugin dir's skills into `<cwd>/.codex/skills/` —
 * where Codex actually discovers them (validated live: codex reads
 * `<cwd>/.codex/skills/<name>/SKILL.md`). This is the Codex analog of Claude's
 * `--plugin-dir`: `measureTriggerRate` hands the runner a `pluginDir` (the
 * stubbed/packaged skills), and the Codex runner installs them here before the
 * turn. Pure fs — unit-testable without a binary.
 */
export function installCodexSkills(pluginDir: string, cwd: string): number {
  const skillsRoot = join(pluginDir, "skills");
  if (!existsSync(skillsRoot)) return 0;
  let n = 0;
  for (const name of readdirSync(skillsRoot)) {
    const src = join(skillsRoot, name, "SKILL.md");
    if (!existsSync(src)) continue;
    const dest = join(cwd, ".codex", "skills", name, "SKILL.md");
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(src, "utf-8"));
    n += 1;
  }
  return n;
}

/* v8 ignore start -- real codex subprocess; validated against the binary, not the unit gate */
/**
 * The Codex eval-tier `AgentRunner`: install the run's skills into `.codex/skills`
 * (Codex's discovery path, vs Claude's `--plugin-dir`), then drive a real
 * `codex exec --json` turn. The seam `measureTriggerRate(spec, { evalDriver:
 * codexEvalDriver })` dispatches through.
 */
export function codexEvalAgentRunner(args: AgentRunArgs): Promise<RunOut> {
  if (args.pluginDir) installCodexSkills(args.pluginDir, args.cwd);
  return Promise.resolve(
    codexEvalRunner({
      task: args.task,
      cwd: args.cwd,
      timeoutMs: args.timeoutMs,
    }),
  );
}

/**
 * Why Codex trigger-rate is EXPERIMENTAL (not a supported measurement). Codex
 * has NO skill-selection event, so `codexSkillFired` infers firing from whether
 * the model READ `skills/<name>/SKILL.md` — which is wrong in BOTH directions: a
 * cached/already-in-context skill isn't re-read (false NEGATIVE), and an
 * exploratory read while listing isn't a real fire (false POSITIVE). So the
 * number can be off either way. Deterministic `vigiles audit` is fully supported
 * on Codex; only this behavioral tier is experimental until a live run measures
 * the oracle's accuracy vs ground truth. See docs/harness-testing-codex.md.
 */
export const CODEX_TRIGGER_RATE_EXPERIMENTAL =
  "Codex trigger-rate is experimental — Codex has no skill-selection event, so " +
  "firing is inferred from a SKILL.md read (cache → false negative, exploratory " +
  "read → false positive). Treat as directional, not a measurement. Deterministic " +
  "`vigiles audit` is fully supported on Codex.";

/**
 * The Codex eval driver — pass to `measureTriggerRate(spec, { evalDriver:
 * codexEvalDriver })` to run a trigger-rate eval natively on `codex exec`. Pair
 * the spec's `fired` with `codexSkillFired` (Codex has no Skill-tool event).
 */
export const codexEvalDriver: EvalDriver = {
  runner: codexEvalAgentRunner,
  parse: parseCodexEvalRun,
  runError: codexRunError,
  // The harness identity → folded into the trigger-rate lock hash, so a report
  // recorded on Claude Code is STALE if the eval is switched to Codex (and v.v.).
  harness: "codex",
  // Codex-only: the trigger-rate number is not validated (see the constant above).
  experimental: CODEX_TRIGGER_RATE_EXPERIMENTAL,
};

/**
 * Spawn real `codex exec --json` for the eval tier (real model, the user's codex
 * auth — NOT the mock). CONFIRMED flags (codex 0.139.0): `--json` for the event
 * stream, `--skip-git-repo-check` for a bare cwd, the approvals/sandbox bypass so
 * the turn runs unattended, `-C <cwd>` for the working dir, prompt as the trailing
 * positional, and stdin = /dev/null (`stdio: ["ignore",…]`) — codex otherwise
 * blocks on "Reading additional input from stdin…". Needs ChatGPT/API auth +
 * network egress to the model backend.
 */
export function codexEvalRunner(args: {
  task: string;
  cwd: string;
  timeoutMs: number;
}): { code: number; stdout: string } {
  // The DOCUMENTED alternative to the default Claude runner, and the one the
  // untested-skill nudge now recommends — so it is exactly as able to be
  // collected by a stray `npx vitest run`, and exactly as expensive.
  refuseUnderForeignRunner("driving `codex exec`");
  const r = spawnSync(
    "codex",
    [
      "exec",
      "--json",
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
      "-C",
      args.cwd,
      args.task,
    ],
    {
      cwd: args.cwd,
      encoding: "utf-8",
      timeout: args.timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return { code: r.status ?? 1, stdout: r.stdout ?? "" };
}
/* v8 ignore stop */
