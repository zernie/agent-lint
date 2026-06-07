/**
 * Tests for the generator skill driver: branching, loops, gating, and
 * short-circuit — the control flow the declarative steps form can't express.
 * The model is a scripted mock; gates use `true`/`false` for determinism.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { cmd } from "./spec.js";
import {
  driveSkill,
  act,
  checkpoint,
  finish,
  type SkillProgram,
} from "./skill-driver.js";

test("driveSkill takes the branch the model's answer selects", () => {
  const prog: SkillProgram = function* () {
    const lang = yield act("Detect the language");
    if (lang === "python") yield checkpoint(cmd("true"));
    else yield checkpoint(cmd("false"));
    yield finish(cmd("true"));
  };

  const py = driveSkill(prog, process.cwd(), () => "python");
  assert.equal(py.ok, true);
  assert.equal(
    py.trace.find((t) => t.effect.kind === "gate")?.outcome?.ok,
    true,
  );

  const js = driveSkill(prog, process.cwd(), () => "js");
  assert.equal(js.ok, false); // js branch gate `false` fails
});

test("driveSkill runs a real loop until the model signals done", () => {
  const answers = ["no", "no", "ok"];
  let i = 0;
  const prog: SkillProgram = function* () {
    for (;;) {
      const r = yield act("Fix the failing test");
      if (r === "ok") break;
    }
    yield finish(cmd("true"));
  };

  const report = driveSkill(prog, process.cwd(), () => answers[i++]);
  assert.equal(report.ok, true);
  assert.equal(report.trace.filter((t) => t.effect.kind === "act").length, 3);
});

test("driveSkill short-circuits at the first failing gate", () => {
  const prog: SkillProgram = function* () {
    yield act("step one");
    yield checkpoint(cmd("false")); // fails
    yield act("never reached");
    yield finish(cmd("true"));
  };

  let calls = 0;
  const report = driveSkill(prog, process.cwd(), () => {
    calls++;
    return "";
  });
  assert.equal(report.ok, false);
  assert.equal(report.blockedAt, 1); // trace[1] is the failing gate
  assert.equal(calls, 1); // the act after the failing gate never ran
});

test("driveSkill reaches the result gate when all gates pass", () => {
  const prog: SkillProgram = function* () {
    yield act("do the thing");
    yield checkpoint(cmd("true"));
    yield finish(cmd("true"));
  };
  const report = driveSkill(prog, process.cwd(), () => "");
  assert.equal(report.ok, true);
  assert.equal(report.trace.at(-1)?.effect.kind, "result");
});
