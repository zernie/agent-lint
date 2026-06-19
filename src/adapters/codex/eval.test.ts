/**
 * Codex eval-parser test suite. Fixtures are REAL `codex exec --json` output
 * captured from codex-cli 0.139.0 (ChatGPT auth) — a plain turn, a tool-calling
 * turn, and a skill-activating turn. They ground the parser in the confirmed
 * thread/item schema (assistant = item.completed/agent_message/text; tool =
 * command_execution/command; usage on turn.completed; item.started deduped).
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import { parseCodexEvalRun, codexSkillFired } from "./eval.js";

// Real plain turn.
const PLAIN = [
  `{"type":"thread.started","thread_id":"019ede3d-5bcd-7731-80c2-3678a1b86f24"}`,
  `{"type":"turn.started"}`,
  `{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"HELLO_CODEX"}}`,
  `{"type":"turn.completed","usage":{"input_tokens":11625,"cached_input_tokens":4992,"output_tokens":8,"reasoning_output_tokens":0}}`,
].join("\n");

// Real tool-calling turn (note item.started + item.completed for the same id).
const TOOL = [
  `{"type":"thread.started","thread_id":"019ede3d-cd48-7bc3-ae50-1b670a261d2b"}`,
  `{"type":"turn.started"}`,
  `{"type":"item.started","item":{"id":"item_0","type":"command_execution","command":"/bin/bash -lc 'echo VIGILES_TOOL_TEST'","aggregated_output":"","exit_code":null,"status":"in_progress"}}`,
  `{"type":"item.completed","item":{"id":"item_0","type":"command_execution","command":"/bin/bash -lc 'echo VIGILES_TOOL_TEST'","aggregated_output":"VIGILES_TOOL_TEST\\n","exit_code":0,"status":"completed"}}`,
  `{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"It printed VIGILES_TOOL_TEST"}}`,
  `{"type":"turn.completed","usage":{"input_tokens":23349,"cached_input_tokens":16128,"output_tokens":54,"reasoning_output_tokens":0}}`,
].join("\n");

// Real skill-activating turn — the model READS the SKILL.md via a command_execution.
const SKILL = [
  `{"type":"thread.started","thread_id":"019ede3e-b5e3-7090-abb8-5a34ad2eeef2"}`,
  `{"type":"turn.started"}`,
  `{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"I’m using the vigiles-marker skill because you invoked its trigger word."}}`,
  `{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"/bin/bash -lc \\"sed -n '1,220p' /tmp/cxreal/.codex/skills/vigiles-marker/SKILL.md\\"","status":"in_progress"}}`,
  `{"type":"item.completed","item":{"id":"item_1","type":"command_execution","command":"/bin/bash -lc \\"sed -n '1,220p' /tmp/cxreal/.codex/skills/vigiles-marker/SKILL.md\\"","aggregated_output":"---\\nname: vigiles-marker\\n---\\n","exit_code":0,"status":"completed"}}`,
  `{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"SKILL_FIRED_XYZZY"}}`,
  `{"type":"turn.completed","usage":{"input_tokens":23704,"cached_input_tokens":16640,"output_tokens":110,"reasoning_output_tokens":0}}`,
].join("\n");

test("parseCodexEvalRun reads a plain turn (agent_message + usage)", () => {
  const r = parseCodexEvalRun({ stdout: PLAIN });
  assert.equal(r.output, "HELLO_CODEX");
  assert.equal(r.turns, 1);
  assert.deepEqual(r.toolCalls, []);
  assert.equal(r.usage.inputTokens, 11625);
  assert.equal(r.usage.outputTokens, 8);
  assert.equal(r.usage.cacheReadTokens, 4992); // cached_input_tokens
});

test("parseCodexEvalRun reads a tool turn, deduping item.started/completed", () => {
  const r = parseCodexEvalRun({ stdout: TOOL });
  // exactly ONE command_execution (item.started for the same id is not counted)
  assert.equal(r.toolCalls.length, 1);
  assert.equal(r.toolCalls[0].name, "/bin/bash -lc 'echo VIGILES_TOOL_TEST'");
  assert.equal(r.toolCalls[0].resultText, "VIGILES_TOOL_TEST\n");
  assert.equal(r.toolCalls[0].isError, false);
  assert.equal(r.output, "It printed VIGILES_TOOL_TEST");
});

test("codexSkillFired detects a skill via its SKILL.md read", () => {
  const r = parseCodexEvalRun({ stdout: SKILL });
  // the trigger surfaced as the model reading vigiles-marker/SKILL.md
  assert.equal(codexSkillFired(r, "vigiles-marker"), true);
  assert.equal(codexSkillFired(r, "some-other-skill"), false);
  // and on a turn with no skill read:
  assert.equal(
    codexSkillFired(parseCodexEvalRun({ stdout: PLAIN }), "x"),
    false,
  );
});

test("parseCodexEvalRun is tolerant + returns the Claude-shaped contract", () => {
  const r = parseCodexEvalRun({ stdout: "not json\n{ broken \nplain reply  " });
  assert.equal(r.output, "not json\n{ broken \nplain reply"); // fallback to trimmed stdout
  assert.equal(r.turns, 0);
  assert.deepEqual(Object.keys(r).sort(), [
    "hooks",
    "output",
    "subagents",
    "toolCalls",
    "turns",
    "usage",
  ]);
});
