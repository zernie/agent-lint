/**
 * Tests for action gates: deterministic checks bound to a tool action type,
 * fired regardless of plan order (the dynamic-workflow reframe).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateAction, type ActionGate } from "./action-gate.js";

const cwd = process.cwd();
const g = (on: string, command: string, when?: string): ActionGate => ({
  on,
  gate: { kind: "cmd", command, retry: 1 },
  when,
});

test("an action gate fires only for the matching tool", () => {
  const gates = [g("Write", "false")];
  assert.equal(evaluateAction({ tool: "Read" }, gates, cwd).allow, true);
  assert.equal(evaluateAction({ tool: "Write" }, gates, cwd).allow, false);
});

test("`when` filters on the tool input", () => {
  const gates = [g("Write", "false", ".ts")];
  assert.equal(
    evaluateAction({ tool: "Write", input: { file_path: "x.js" } }, gates, cwd)
      .allow,
    true, // .js doesn't match the .ts filter → gate not fired
  );
  assert.equal(
    evaluateAction({ tool: "Write", input: { file_path: "x.ts" } }, gates, cwd)
      .allow,
    false, // .ts matches → false gate blocks
  );
});

test("`{file}` is substituted with the action's path", () => {
  const gates = [g("Write", "test -f {file}")];
  assert.equal(
    evaluateAction(
      { tool: "Write", input: { file_path: "package.json" } },
      gates,
      cwd,
    ).allow,
    true, // file exists
  );
  const blocked = evaluateAction(
    { tool: "Write", input: { file_path: "nope.zzz" } },
    gates,
    cwd,
  );
  assert.equal(blocked.allow, false);
  assert.match(blocked.message, /Action gate failed after Write/);
});

test("passing gates allow the action", () => {
  const d = evaluateAction(
    { tool: "Write", input: { file_path: "x" } },
    [g("Write", "true")],
    cwd,
  );
  assert.equal(d.allow, true);
});

test("no configured gates → always allow", () => {
  assert.equal(evaluateAction({ tool: "Write" }, [], cwd).allow, true);
});
