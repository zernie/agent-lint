/**
 * `vigiles/check` vocabulary test suite (Phase 0).
 *
 * Pure, model-free: build a fake `Trace` / `HookRunResult` and assert each
 * check's pass/fail, its 0–1 score, that the FAILURE MESSAGE is actionable (not
 * a bare "false"), and that it round-trips through `toJSON`. The messages are the
 * product, so they're tested as much as the verdict.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  tool,
  skill,
  output,
  hookFired,
  wrote,
  blocked,
  allowed,
  evalChecks,
  assertChecks,
  type Check,
} from "./check.js";
import type { Trace, ToolCall, HookFire } from "./harness-test.js";
import type { HookRunResult } from "./run-hook.js";

function makeTrace(over: Partial<Trace> = {}): Trace {
  return {
    toolCalls: [],
    hooks: [],
    output: "",
    modelRequests: [],
    turns: 0,
    file: () => null,
    ...over,
  };
}

function toolCall(name: string, over: Partial<ToolCall> = {}): ToolCall {
  return { name, input: {}, resultText: "", isError: false, ...over };
}

function hook(event: string): HookFire {
  return {
    name: `${event}:*`,
    event,
    exitCode: 0,
    blocked: false,
    output: "",
  };
}

function hookResult(over: Partial<HookRunResult> = {}): HookRunResult {
  return {
    exitCode: 0,
    stdout: "",
    stderr: "",
    json: null,
    blocked: false,
    egress: [],
    filesWritten: [],
    decision: undefined,
    ...over,
  };
}

test("tool(): pass when used, actionable message + score when not", () => {
  const used = makeTrace({ toolCalls: [toolCall("Bash")] });
  const r1 = tool("Bash").eval(used);
  assert.equal(r1.pass, true);
  assert.equal(r1.score, 1);

  const other = makeTrace({ toolCalls: [toolCall("Read"), toolCall("Edit")] });
  const r2 = tool("Bash").eval(other);
  assert.equal(r2.pass, false);
  assert.equal(r2.score, 0);
  assert.match(r2.message, /expected the agent to use tool "Bash"/);
  assert.match(r2.message, /\[Read, Edit\]/); // names the tools it DID use
  assert.deepEqual(tool("Bash").toJSON(), { kind: "tool", name: "Bash" });
});

test("skill(): resolves on a non-error Skill call with the right id", () => {
  const fired = makeTrace({
    toolCalls: [toolCall("Skill", { input: { skill: "vig:test-harness" } })],
  });
  assert.equal(skill("vig:test-harness").eval(fired).pass, true);

  // wrong skill id → fail, message lists what was invoked
  const wrong = makeTrace({
    toolCalls: [toolCall("Skill", { input: { skill: "vig:other" } })],
  });
  const r = skill("vig:test-harness").eval(wrong);
  assert.equal(r.pass, false);
  assert.match(r.message, /\[vig:other\]/);

  // errored Skill call doesn't count
  const errored = makeTrace({
    toolCalls: [
      toolCall("Skill", { input: { skill: "vig:x" }, isError: true }),
    ],
  });
  assert.equal(skill("vig:x").eval(errored).pass, false);
  assert.deepEqual(skill("vig:x").toJSON(), { kind: "skill", id: "vig:x" });
});

test("output(): substring and regex, with a truncated got-message", () => {
  const t = makeTrace({ output: "the answer is 42, done." });
  assert.equal(output("42").eval(t).pass, true);
  assert.equal(output(/answer is \d+/).eval(t).pass, true);

  const miss = output("nope").eval(t);
  assert.equal(miss.pass, false);
  assert.match(miss.message, /expected output to contain nope/);
  assert.match(miss.message, /the answer is 42/); // shows actual

  assert.deepEqual(output("x").toJSON(), {
    kind: "output",
    matcher: "x",
    regex: false,
  });
  assert.equal(output(/x/i).toJSON().regex, true);
});

test("hookFired(): matches by event, lists fired events on miss", () => {
  const t = makeTrace({ hooks: [hook("PreToolUse"), hook("Stop")] });
  assert.equal(hookFired("Stop").eval(t).pass, true);
  const miss = hookFired("PostToolUse").eval(t);
  assert.equal(miss.pass, false);
  assert.match(miss.message, /\[PreToolUse, Stop\]/);
});

test("wrote(): checks the work-dir file presence", () => {
  const t = makeTrace({ file: (p) => (p === "DONE" ? "x" : null) });
  assert.equal(wrote("DONE").eval(t).pass, true);
  const miss = wrote("NOPE").eval(t);
  assert.equal(miss.pass, false);
  assert.match(miss.message, /expected the agent to create "NOPE"/);
});

test("blocked()/allowed(): hook-decision checks over HookRunResult", () => {
  const b = hookResult({ blocked: true, exitCode: 2 });
  const a = hookResult({ blocked: false, exitCode: 0 });
  assert.equal(blocked().eval(b).pass, true);
  assert.equal(blocked().eval(a).pass, false);
  assert.match(blocked().eval(a).message, /expected the hook to block/);
  assert.equal(allowed().eval(a).pass, true);
  assert.equal(allowed().eval(b).pass, false);
  assert.deepEqual(blocked().toJSON(), { kind: "blocked" });
});

test("evalChecks(): evaluates every check, preserving order", () => {
  const t = makeTrace({ toolCalls: [toolCall("Bash")], output: "done" });
  const checks: Check<Trace>[] = [tool("Bash"), output("done"), tool("Read")];
  const results = evalChecks(t, checks);
  assert.deepEqual(
    results.map((r) => r.pass),
    [true, true, false],
  );
});

test("assertChecks(): passes silently, throws collecting ALL failures", () => {
  const t = makeTrace({ toolCalls: [toolCall("Bash")], output: "done" });
  // all pass → no throw
  assertChecks(t, [tool("Bash"), output("done")]);

  // two fail → one throw listing both messages
  assert.throws(
    () => {
      assertChecks(t, [tool("Bash"), tool("Read"), output("nope")]);
    },
    (err: Error) => {
      assert.match(err.message, /2 of 3 check\(s\) failed/);
      assert.match(err.message, /use tool "Read"/);
      assert.match(err.message, /output to contain nope/);
      return true;
    },
  );
});
