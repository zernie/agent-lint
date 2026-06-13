/**
 * Tests for the skill-testing wrapper: scripting the model and asserting the
 * deterministic action/gate sequence with plain assertions.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import { cmd } from "./core/spec.js";
import {
  act,
  checkpoint,
  finish,
  type SkillProgram,
} from "./adapters/claude-code/skill-driver.js";
import { runSkill, scriptModel } from "./skill-test.js";

// A branching skill: classify, then run the matching gate, then a result gate.
const classifySkill: SkillProgram = function* () {
  const lang = yield act("Detect the project language");
  if (lang === "python")
    yield checkpoint(cmd("true")); // pretend: pytest
  else yield checkpoint(cmd("false")); // pretend: a gate that would fail
  yield finish(cmd("true"));
};

test("runSkill drives the python branch and reports the gate sequence", () => {
  const r = runSkill(classifySkill, {
    model: scriptModel({ language: "python" }),
  });
  assert.equal(r.ok, true);
  assert.equal(r.acts[0].answer, "python");
  // exactly two gates ran: the python checkpoint + the terminal result
  assert.deepEqual(
    r.gates.map((g) => g.ok),
    [true, true],
  );
  assert.equal(r.gates.at(-1)?.terminal, true);
});

test("runSkill shows the other branch blocking on its gate", () => {
  const r = runSkill(classifySkill, { model: scriptModel(["typescript"]) });
  assert.equal(r.ok, false);
  assert.equal(r.gates[0].label, "false");
  assert.equal(r.gates[0].ok, false);
  // blocked at the first gate → the result gate never ran
  assert.equal(r.gates.length, 1);
});

test("scriptModel array feeds answers in order (drives a loop)", () => {
  const loopSkill: SkillProgram = function* () {
    for (;;) {
      if ((yield act("Fix the failing test")) === "ok") break;
    }
    yield finish(cmd("true"));
  };
  const r = runSkill(loopSkill, { model: scriptModel(["no", "no", "ok"]) });
  assert.equal(r.ok, true);
  assert.equal(r.acts.length, 3); // looped three times before the model said ok
});
