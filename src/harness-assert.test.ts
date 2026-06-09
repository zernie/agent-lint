/**
 * Tests for the runner-agnostic harness helpers (src/harness-assert.ts): the
 * eval delta helpers and the jest/vitest matchers. The pure logic is exercised
 * here with fake result/report objects (no model, no claude).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  improvement,
  assertImproves,
  assertCreated,
  assertNotCreated,
  assertServedTurns,
  assertToolUsed,
  assertToolNotUsed,
  assertSkillResolved,
  assertToolCount,
  assertToolSequence,
  assertToolCalls,
  vigilesMatchers,
} from "./harness-assert.js";
import type { EvalReport } from "./eval.js";
import type { HarnessTestResult } from "./harness-test.js";

const report: EvalReport = {
  name: "demo",
  trials: 6,
  arms: {
    vanilla: { runs: 6, metrics: { caught: 0 }, stats: {} },
    gated: { runs: 6, metrics: { caught: 0.5 }, stats: {} },
  },
};

/** Minimal HarnessTestResult stand-in for file()-based assertions. */
function fakeResult(
  present: string[],
  toolCalls: HarnessTestResult["toolCalls"] = [],
): HarnessTestResult {
  return {
    exitCode: 0,
    stdout: "",
    stderr: "",
    cwd: "/tmp/x",
    turns: 2,
    toolCalls,
    file: (p: string) => (present.includes(p) ? "content" : null),
    cleanup: () => undefined,
  };
}

test("improvement returns the arm − baseline gap", () => {
  assert.equal(improvement(report, "vanilla", "gated", "caught"), 0.5);
  assert.equal(improvement(report, "gated", "vanilla", "caught"), -0.5);
});

test("assertImproves passes on a positive gap and throws otherwise", () => {
  assert.doesNotThrow(() => {
    assertImproves(report, {
      baseline: "vanilla",
      arm: "gated",
      metric: "caught",
    });
  });
  assert.throws(() => {
    assertImproves(report, {
      baseline: "vanilla",
      arm: "gated",
      metric: "caught",
      by: 0.9,
    });
  });
});

test("assertCreated / assertNotCreated check the sandbox", () => {
  const r = fakeResult(["RESULT"]);
  assert.doesNotThrow(() => {
    assertCreated(r, "RESULT");
  });
  assert.throws(() => {
    assertCreated(r, "MISSING");
  });
  assert.doesNotThrow(() => {
    assertNotCreated(r, "MISSING");
  });
  assert.throws(() => {
    assertNotCreated(r, "RESULT");
  });
});

test("assertServedTurns checks the mock turn count", () => {
  const r = fakeResult([]); // fakeResult sets turns: 2
  assert.doesNotThrow(() => {
    assertServedTurns(r, 2);
  });
  assert.throws(() => {
    assertServedTurns(r, 3);
  });
});

test("vigilesMatchers.toHaveCreated reports pass/fail", () => {
  const r = fakeResult(["BLOCKED"]);
  assert.equal(vigilesMatchers.toHaveCreated(r, "BLOCKED").pass, true);
  assert.equal(vigilesMatchers.toHaveCreated(r, "nope").pass, false);
});

test("vigilesMatchers.toBeatBaseline respects the `by` threshold", () => {
  assert.equal(
    vigilesMatchers.toBeatBaseline(report, "vanilla", "gated", "caught").pass,
    true,
  );
  assert.equal(
    vigilesMatchers.toBeatBaseline(report, "vanilla", "gated", "caught", 0.9)
      .pass,
    false,
  );
});

// --- tool-call assertions (action invariants) ------------------------------

const skillCall = {
  name: "Skill",
  input: { skill: "demo:greet" },
  resultText: "Launching skill: demo:greet",
  isError: false,
};
const bashCall = {
  name: "Bash",
  input: { command: "ls" },
  resultText: "",
  isError: false,
};

test("assertToolUsed: matches by exact name and by regex", () => {
  const r = fakeResult([], [skillCall, bashCall]);
  assertToolUsed(r, "Skill"); // exact
  assertToolUsed(r, /^Bash$/); // regex
  assert.throws(() => {
    assertToolUsed(r, "Task");
  });
  assert.throws(() => {
    assertToolUsed(r, /^mcp__/);
  });
});

test("assertToolNotUsed: the safety negative", () => {
  const r = fakeResult([], [skillCall, bashCall]);
  assertToolNotUsed(r, /^mcp__github__merge/); // never invoked → ok
  assert.throws(() => {
    assertToolNotUsed(r, "Bash"); // was invoked → throws
  });
});

test("assertSkillResolved: needs a non-error Skill tool_use with that name", () => {
  assertSkillResolved(fakeResult([], [skillCall]), "demo:greet");
  assert.throws(() => {
    assertSkillResolved(fakeResult([], [skillCall]), "demo:other"); // wrong name
  });
  const errored = { ...skillCall, isError: true, resultText: "No such skill" };
  assert.throws(() => {
    assertSkillResolved(fakeResult([], [errored]), "demo:greet"); // errored
  });
});

// --- sequence / budget invariants (idea 1) ---------------------------------

const call = (name: string) => ({
  name,
  input: {},
  resultText: "",
  isError: false,
});

test("assertToolCount: min / max / exactly bounds", () => {
  const r = fakeResult([], [call("Read"), call("Write"), call("Write")]);
  assertToolCount(r, "Write", { max: 2 });
  assertToolCount(r, "Read", { exactly: 1 });
  assertToolCount(r, /^mcp__/, { exactly: 0 });
  assert.throws(() => {
    assertToolCount(r, "Write", { max: 1 }); // 2 > 1
  });
  assert.throws(() => {
    assertToolCount(r, "Read", { min: 2 }); // only 1
  });
});

test("assertToolSequence: in-order subsequence (gaps allowed)", () => {
  const r = fakeResult([], [call("Read"), call("Bash"), call("Edit")]);
  assertToolSequence(r, ["Read", "Edit"]); // Read before Edit (Bash between is fine)
  assertToolSequence(r, [/^Read$/, /^Edit$/]); // regex form
  assert.throws(() => {
    assertToolSequence(r, ["Edit", "Read"]); // wrong order
  });
  assert.throws(() => {
    assertToolSequence(r, ["Read", "Read"]); // only one Read
  });
});

test("assertToolCalls: custom invariant — every Edit preceded by a Read", () => {
  const everyEditAfterRead = (calls: readonly { name: string }[]) => {
    let read = false;
    for (const c of calls) {
      if (c.name === "Read") read = true;
      if (c.name === "Edit" && !read) return false;
    }
    return true;
  };
  assertToolCalls(
    fakeResult([], [call("Read"), call("Edit")]),
    everyEditAfterRead,
  );
  assert.throws(() => {
    assertToolCalls(fakeResult([], [call("Edit")]), everyEditAfterRead);
  });
});
