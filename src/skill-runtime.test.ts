/**
 * Tests for the skill runtime: parsing vigiles:gate / vigiles:result markers
 * out of a compiled SKILL.md and executing the gate ladder with short-circuit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseSkillGates, runGate, runSkillGates } from "./skill-runtime.js";

const SAMPLE = `# skill

### Step 1
do a thing
<!-- vigiles:gate "true" -->

### Step 2
do another
<!-- vigiles:gate "false" retry:2 -->

## Result
<!-- vigiles:result "true" -->
`;

test("parseSkillGates extracts step gates (with retry) and the result gate", () => {
  const g = parseSkillGates(SAMPLE);
  assert.equal(g.steps.length, 2);
  assert.deepEqual(g.steps[0], {
    step: 1,
    gate: { kind: "cmd", command: "true", retry: 1 },
  });
  assert.deepEqual(g.steps[1], {
    step: 2,
    gate: { kind: "cmd", command: "false", retry: 2 },
  });
  assert.deepEqual(g.result, { kind: "cmd", command: "true", retry: 1 });
});

test("parseSkillGates parses file gates", () => {
  const g = parseSkillGates(
    "### Step 1\n<!-- vigiles:gate file:package.json -->\n",
  );
  assert.deepEqual(g.steps[0].gate, {
    kind: "file",
    path: "package.json",
    retry: 1,
  });
});

test("runGate: command exit 0 passes, non-zero fails", () => {
  assert.equal(
    runGate({ kind: "cmd", command: "true", retry: 1 }, process.cwd()).ok,
    true,
  );
  assert.equal(
    runGate({ kind: "cmd", command: "false", retry: 1 }, process.cwd()).ok,
    false,
  );
});

test("runGate: file existence", () => {
  assert.equal(
    runGate({ kind: "file", path: "package.json", retry: 1 }, process.cwd()).ok,
    true,
  );
  assert.equal(
    runGate({ kind: "file", path: "nope.nonexistent", retry: 1 }, process.cwd())
      .ok,
    false,
  );
});

test("runSkillGates short-circuits at the first failing gate", () => {
  const report = runSkillGates(parseSkillGates(SAMPLE), process.cwd());
  assert.equal(report.ok, false);
  assert.equal(report.blockedAt, 2);
  // step 1 ran (passed), step 2 ran (failed), result NOT reached.
  assert.equal(report.results.length, 2);
  assert.equal(report.results[0].ok, true);
  assert.equal(report.results[1].ok, false);
});

test("runSkillGates runs the result gate when all steps pass", () => {
  const md = `### Step 1
<!-- vigiles:gate "true" -->

## Result
<!-- vigiles:result "true" -->
`;
  const report = runSkillGates(parseSkillGates(md), process.cwd());
  assert.equal(report.ok, true);
  assert.equal(report.blockedAt, null);
  assert.equal(report.results.length, 2);
  assert.equal(report.results[1].at, "result");
});
