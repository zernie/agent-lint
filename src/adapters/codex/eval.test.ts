/**
 * Codex eval-parser test suite. SYNTHETIC fixtures — there's no `codex` binary in
 * the build env, so these encode the two PLAUSIBLE `codex exec --json` schemas the
 * tolerant parser targets (the older `{msg:{type,…}}` event stream and the newer
 * `{type:"item.*", item:{…}}` thread/item stream). When the live binary lands,
 * replace these with CAPTURED JSONL and adjust field names if needed (the parser
 * is structured so that's a small edit). Proves: tolerance across both shapes,
 * graceful degradation on junk, and the Claude-shaped output contract.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import { parseCodexEvalRun } from "./eval.js";

// Older event-stream shape: { msg: { type, … } } per line.
const EVENT_STREAM = [
  JSON.stringify({ msg: { type: "task_started" } }),
  JSON.stringify({
    msg: { type: "exec_command_begin", command: "grep -r foo" },
  }),
  JSON.stringify({
    msg: { type: "agent_message", message: "Here is the answer." },
  }),
  JSON.stringify({
    msg: { type: "token_count", input_tokens: 1200, output_tokens: 80 },
  }),
].join("\n");

// Newer thread/item shape: { type: "item.*", item: { … } } per line.
const THREAD_ITEM = [
  JSON.stringify({ type: "turn.started" }),
  JSON.stringify({
    type: "item.completed",
    item: { item_type: "command_execution", command: "ls -la" },
  }),
  JSON.stringify({
    type: "item.completed",
    item: { item_type: "assistant_message", text: "Done." },
  }),
  JSON.stringify({
    type: "turn.completed",
    usage: { input_tokens: 50, output_tokens: 10 },
  }),
].join("\n");

test("parseCodexEvalRun reads the older event-stream shape", () => {
  const r = parseCodexEvalRun({ stdout: EVENT_STREAM });
  assert.equal(r.output, "Here is the answer.");
  assert.equal(r.turns, 1);
  assert.equal(r.toolCalls.length, 1);
  assert.equal(r.toolCalls[0].name, "grep -r foo");
  assert.equal(r.usage.inputTokens, 1200);
  assert.equal(r.usage.outputTokens, 80);
});

test("parseCodexEvalRun reads the newer thread/item shape", () => {
  const r = parseCodexEvalRun({ stdout: THREAD_ITEM });
  assert.equal(r.output, "Done.");
  assert.equal(r.turns, 1);
  assert.equal(r.toolCalls.length, 1);
  assert.equal(r.toolCalls[0].name, "ls -la");
  assert.equal(r.usage.inputTokens, 50);
});

test("parseCodexEvalRun tolerates junk + falls back to trimmed stdout", () => {
  // Non-JSON lines and a malformed object are skipped; with no recognised
  // assistant-text event, output falls back to the trimmed raw stdout.
  const r = parseCodexEvalRun({
    stdout: "not json\n{ broken \nplain text reply  \n",
  });
  assert.equal(r.output, "not json\n{ broken \nplain text reply");
  assert.equal(r.turns, 0);
  assert.deepEqual(r.toolCalls, []);
});

test("parseCodexEvalRun returns the Claude-shaped ParsedModelRun contract", () => {
  const r = parseCodexEvalRun({ stdout: "" });
  // shape slots straight into the ModelOutputParser seam
  assert.deepEqual(Object.keys(r).sort(), [
    "hooks",
    "output",
    "subagents",
    "toolCalls",
    "turns",
    "usage",
  ]);
  assert.deepEqual(r.hooks, []);
  assert.deepEqual(r.subagents, []);
});
