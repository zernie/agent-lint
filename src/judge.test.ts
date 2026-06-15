/**
 * Tests for the LLM-judge response parsing (src/judge.ts). The model call
 * itself needs claude + auth, but the verdict parsing is pure — that's what we
 * pin here (the part most likely to silently break).
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import { parseJudgeOutput } from "./judge.js";

test("parses claude --output-format json (verdict in the `result` field)", () => {
  const stdout = JSON.stringify({
    result: '{"score": 0.8, "reason": "clear and ordered"}',
  });
  const v = parseJudgeOutput(stdout);
  assert.equal(v.score, 0.8);
  assert.equal(v.pass, true);
  assert.equal(v.reason, "clear and ordered");
});

test("parses a bare / prose-wrapped JSON verdict", () => {
  const v = parseJudgeOutput(
    'blah blah {"score": 0.3, "reason": "thin"} trailing',
  );
  assert.equal(v.score, 0.3);
  assert.equal(v.pass, false); // below default 0.5 threshold
  assert.equal(v.reason, "thin");
});

test("respects a custom threshold", () => {
  assert.equal(parseJudgeOutput('{"score":0.3}', 0.2).pass, true);
  assert.equal(parseJudgeOutput('{"score":0.3}', 0.5).pass, false);
});

test("clamps score into [0,1]", () => {
  assert.equal(parseJudgeOutput('{"score": 1.7}').score, 1);
  assert.equal(parseJudgeOutput('{"score": -2}').score, 0);
});

test("returns a safe verdict on unparseable / empty output", () => {
  const empty = parseJudgeOutput("");
  assert.equal(empty.score, 0);
  assert.equal(empty.pass, false);

  const junk = parseJudgeOutput("the model refused, no json here");
  assert.equal(junk.score, 0);
  assert.match(junk.reason, /unparseable/);

  const noScore = parseJudgeOutput('{"reason": "forgot the score"}');
  assert.equal(noScore.score, 0);
  assert.match(noScore.reason, /unparseable/);
});

test("tolerates malformed JSON between braces (firstJsonObject catch)", () => {
  // Has `{` and `}` but invalid JSON between → JSON.parse throws → null.
  const v = parseJudgeOutput("prefix { score: nope, } suffix");
  assert.equal(v.score, 0);
  assert.match(v.reason, /unparseable/);
});
