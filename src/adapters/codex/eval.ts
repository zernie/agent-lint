/**
 * Codex EVAL-tier transport — increment 2 of native Codex eval (the runner +
 * trace parser that `measureTriggerRate`/`runEval` will dispatch to via the
 * `ModelOutputParser` seam landed in increment 1).
 *
 * ⚠️ STATUS: SCAFFOLD pending live-binary validation. There is no `codex` binary
 * in the build env, so the exact `codex exec --json` line schema is UNVERIFIED.
 * `parseCodexEvalRun` is therefore deliberately TOLERANT and multi-shape: it
 * probes the two plausible Codex JSONL event models (the older `{msg:{type,…}}`
 * event stream and the newer `{type:"item.*", item:{…}}` thread/item stream) and
 * degrades to empty fields on anything it doesn't recognise, rather than
 * crashing. Each extractor is small and isolated so finishing it against captured
 * JSONL is a field-name edit, not a rewrite. See the env-validation checklist in
 * research/codex-prototype-findings.md (2026-06-18 update).
 *
 * NOT yet wired into the public `measureTriggerRate({ adapter })` dispatch — that
 * is increment 3, deliberately gated until the schema is confirmed, so an
 * unvalidated parser can't silently report recall 0 under the public API.
 *
 * The deepest open question (only the binary can answer): a Claude skill
 * activation is an explicit `Skill` tool_use; a Codex skill is a
 * progressive-disclosure `SKILL.md` instruction, so it may NOT surface as a
 * discrete event at all. If it doesn't, `toolCalls` will not carry a "Skill"
 * entry and the Codex "fired" predicate must become a behavioral/judged check.
 */

import { spawnSync } from "node:child_process";

import type { ParsedModelRun } from "../../eval.js";
import type { ToolCall } from "../../core/harness-driver.js";

/** A single line of `codex exec --json` output, shape-agnostic. */
interface CodexEvent {
  readonly type?: string;
  readonly msg?: Record<string, unknown>;
  readonly item?: Record<string, unknown>;
  readonly usage?: Record<string, unknown>;
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

// --- shape probes (ASSUMED — verify each against captured `codex exec --json`) ---

/** Assistant text from either event model. */
function assistantText(e: CodexEvent): string {
  // older: { msg: { type: "agent_message", message: "…" } }
  if (str(e.msg?.type) === "agent_message") return str(e.msg?.message);
  // newer: { type: "item.completed", item: { item_type|type: "assistant_message", text } }
  const itype = str(e.item?.item_type) || str(e.item?.type);
  if (
    e.type?.startsWith("item.") &&
    /assistant|agent_message|message/.test(itype)
  ) {
    return str(e.item?.text);
  }
  return "";
}

/** Build a ToolCall from an event's payload object. */
function buildCall(
  src: Record<string, unknown> | undefined,
  fallbackName: string,
): ToolCall {
  return {
    name: str(src?.name) || str(src?.command) || fallbackName,
    input: src ?? {},
    resultText: "",
    isError: false,
  };
}

/** A tool/command/function call from either event model, or null. */
function toolCall(e: CodexEvent): ToolCall | null {
  // older: { msg: { type: "exec_command_begin"|"function_call", command|name, … } }
  const mtype = str(e.msg?.type);
  if (/exec_command|function_call|tool/.test(mtype))
    return buildCall(e.msg, mtype);
  // newer: { type: "item.*", item: { item_type|type: "command_execution"|"function_call", … } }
  const itype = str(e.item?.item_type) || str(e.item?.type);
  if (e.type?.startsWith("item.") && /command|function_call|tool/.test(itype)) {
    return buildCall(e.item, itype);
  }
  return null;
}

/** Token usage from a `token_count` event or an inline `usage` block. */
function usageFromEvent(
  e: CodexEvent,
): { input: number; output: number } | null {
  const u = str(e.msg?.type) === "token_count" ? e.msg : e.usage;
  if (!u) return null;
  return {
    input: num(u.input_tokens) || num(u.prompt_tokens),
    output: num(u.output_tokens) || num(u.completion_tokens),
  };
}

/**
 * Parse `codex exec --json` stdout into the common trace fields. Tolerant by
 * design (see file header). Returns Claude-shaped `ParsedModelRun` so it slots
 * into the `ModelOutputParser` seam unchanged.
 */
export function parseCodexEvalRun(out: { stdout: string }): ParsedModelRun {
  const events = parseLines(out.stdout);
  const texts: string[] = [];
  const toolCalls: ToolCall[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  for (const e of events) {
    const t = assistantText(e);
    if (t) texts.push(t);
    const call = toolCall(e);
    if (call) toolCalls.push(call);
    const u = usageFromEvent(e);
    if (u) {
      inputTokens += u.input;
      outputTokens += u.output;
    }
  }
  return {
    // Fallback to the trimmed stdout (what parseCodexRun does) when no assistant
    // text event was recognised — keeps the output non-empty pre-validation.
    output: texts.join("\n") || out.stdout.trim(),
    turns: texts.length,
    toolCalls,
    hooks: [],
    subagents: [],
    usage: {
      costUsd: 0, // codex exec is keyless/sub; no per-run USD reported
      durationMs: 0,
      inputTokens,
      outputTokens,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    },
  };
}

/* v8 ignore start -- real codex subprocess; validated against the binary, not the unit gate */
/**
 * Spawn real `codex exec --json` for the eval tier (real model, the user's codex
 * auth — NOT the mock). Returns the raw stdout for `parseCodexEvalRun`. Flags are
 * a best guess pending validation: `--json` for the event stream,
 * `--skip-git-repo-check` for a bare temp cwd, `--ignore-user-config` to keep the
 * host config out. The prompt is the trailing positional. Plugin/skill install
 * wiring (where Codex discovers the skills under test) is TODO — confirm with the
 * binary how `codex exec` is pointed at a skill set.
 */
export function codexEvalRunner(args: {
  task: string;
  cwd: string;
  timeoutMs: number;
}): { code: number; stdout: string } {
  const r = spawnSync(
    "codex",
    [
      "exec",
      "--json",
      "--skip-git-repo-check",
      "--ignore-user-config",
      args.task,
    ],
    {
      cwd: args.cwd,
      encoding: "utf-8",
      timeout: args.timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return { code: r.status ?? 1, stdout: r.stdout ?? "" };
}
/* v8 ignore stop */
