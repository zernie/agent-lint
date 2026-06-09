/**
 * Tests for the runner-agnostic harness helpers (src/harness-assert.ts): the
 * eval delta helpers and the jest/vitest matchers. The pure logic is exercised
 * here with fake result/report objects (no model, no claude).
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  improvement,
  assertImproves,
  reliable,
  assertReliable,
  assertCreated,
  assertNotCreated,
  assertServedTurns,
  assertHookBlocked,
  assertHookAllowed,
  usedTool,
  toolCount,
  skillResolved,
  toolUsedWith,
  outputContains,
  requestContains,
  assertRequestContains,
  hookFired,
  hookBlocked,
  assertToolUsed,
  assertToolNotUsed,
  assertSkillResolved,
  assertToolUsedWith,
  assertOutputContains,
  assertHookFired,
  assertToolCount,
  assertToolSequence,
  assertToolCalls,
  vigilesMatchers,
} from "./harness-assert.js";
import type { EvalReport } from "./eval.js";
import type { HarnessTestResult, HookFire } from "./harness-test.js";
import type { HookRunResult } from "./run-hook.js";

/** Minimal HookRunResult stand-in for the run-hook-tier assertions/matcher. */
function fakeHook(blocked: boolean): HookRunResult {
  return {
    exitCode: blocked ? 2 : 0,
    stdout: "",
    stderr: "",
    json: null,
    blocked,
    decision: blocked ? "deny" : undefined,
  };
}

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
  extra: {
    output?: string;
    hooks?: readonly HookFire[];
    modelRequests?: HarnessTestResult["modelRequests"];
  } = {},
): HarnessTestResult {
  return {
    exitCode: 0,
    stdout: "",
    stderr: "",
    cwd: "/tmp/x",
    turns: 2,
    toolCalls,
    hooks: extra.hooks ?? [],
    output: extra.output ?? "",
    modelRequests: extra.modelRequests ?? [],
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

test("reliable / assertReliable gate on pass^k (succeeded every trial)", () => {
  const rep: EvalReport = {
    name: "rel",
    trials: 4,
    arms: {
      flaky: {
        runs: 4,
        metrics: { safe: 0.75 },
        stats: { safe: { mean: 0.75, std: 0.5, se: 0.25, n: 4, passK: 0 } },
      },
      solid: {
        runs: 4,
        metrics: { safe: 1 },
        stats: { safe: { mean: 1, std: 0, se: 0, n: 4, passK: 1 } },
      },
    },
  };
  assert.equal(reliable(rep, "solid", "safe"), true);
  assert.equal(reliable(rep, "flaky", "safe"), false);
  assert.doesNotThrow(() => {
    assertReliable(rep, { arm: "solid", metric: "safe" });
  });
  assert.throws(() => {
    assertReliable(rep, { arm: "flaky", metric: "safe" });
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

test("assertHookBlocked / assertHookAllowed (run-hook results)", () => {
  assert.doesNotThrow(() => {
    assertHookBlocked(fakeHook(true));
  });
  assert.throws(() => {
    assertHookBlocked(fakeHook(false));
  });
  assert.doesNotThrow(() => {
    assertHookAllowed(fakeHook(false));
  });
  assert.throws(() => {
    assertHookAllowed(fakeHook(true));
  });
});

test("vigilesMatchers.toHaveCreated reports pass/fail", () => {
  const r = fakeResult(["BLOCKED"]);
  assert.equal(vigilesMatchers.toHaveCreated(r, "BLOCKED").pass, true);
  assert.equal(vigilesMatchers.toHaveCreated(r, "nope").pass, false);
});

test("vigilesMatchers.toBlock + every matcher's message() render both states", () => {
  assert.equal(vigilesMatchers.toBlock(fakeHook(true)).pass, true);
  assert.equal(vigilesMatchers.toBlock(fakeHook(false)).pass, false);
  // invoke .message() in pass and fail states to cover the message closures
  assert.match(vigilesMatchers.toBlock(fakeHook(true)).message(), /to block/);
  assert.match(vigilesMatchers.toBlock(fakeHook(false)).message(), /to block/);
  assert.match(
    vigilesMatchers.toHaveCreated(fakeResult(["X"]), "X").message(),
    /to create/,
  );
  assert.match(
    vigilesMatchers.toHaveCreated(fakeResult([]), "X").message(),
    /to create/,
  );
  assert.match(
    vigilesMatchers
      .toBeatBaseline(report, "vanilla", "gated", "caught")
      .message(),
    /to beat/,
  );
  assert.match(
    vigilesMatchers
      .toBeatBaseline(report, "gated", "vanilla", "caught")
      .message(),
    /to beat/,
  );
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

// --- bare predicates (the shared vocabulary) -------------------------------

test("usedTool / toolCount: bare predicates return values, don't throw", () => {
  const r = fakeResult([], [skillCall, bashCall, bashCall]);
  assert.equal(usedTool(r, "Skill"), true);
  assert.equal(usedTool(r, /^Bash$/), true);
  assert.equal(usedTool(r, "Task"), false);
  assert.equal(toolCount(r, "Bash"), 2);
  assert.equal(toolCount(r, /^mcp__/), 0);
});

test("skillResolved: true only for a non-error Skill call by that name", () => {
  assert.equal(skillResolved(fakeResult([], [skillCall]), "demo:greet"), true);
  assert.equal(skillResolved(fakeResult([], [skillCall]), "demo:other"), false);
  const errored = { ...skillCall, isError: true, resultText: "No such skill" };
  assert.equal(skillResolved(fakeResult([], [errored]), "demo:greet"), false);
});

test("toolUsedWith: matches a tool by name AND its input", () => {
  const editCall = {
    name: "Edit",
    input: { file_path: "src/x.ts", old_string: "a", new_string: "b" },
    resultText: "",
    isError: false,
  };
  const r = fakeResult([], [editCall]);
  const targets = (p: string) => (i: unknown) =>
    (i as { file_path?: string }).file_path === p;
  assert.equal(toolUsedWith(r, "Edit", targets("src/x.ts")), true);
  assert.equal(toolUsedWith(r, "Edit", targets("src/other.ts")), false);
  assert.equal(toolUsedWith(r, "Write", targets("src/x.ts")), false);
});

test("assertToolUsedWith: tool-argument assertion (asserts on input, not name)", () => {
  const editCall = {
    name: "Edit",
    input: { file_path: "note.txt" },
    resultText: "",
    isError: false,
  };
  const r = fakeResult([], [editCall]);
  const targets = (p: string) => (i: unknown) =>
    (i as { file_path?: string }).file_path === p;
  assertToolUsedWith(r, "Edit", targets("note.txt"));
  assert.throws(() => {
    assertToolUsedWith(r, "Edit", targets("WRONG.txt"));
  });
});

// --- output predicate (DeepEval-style "what did the agent say") ------------

test("outputContains / assertOutputContains check trace.output", () => {
  const r = fakeResult([], [], { output: "All done: created RESULT.md" });
  assert.equal(outputContains(r, "RESULT.md"), true);
  assert.equal(outputContains(r, /created \w+/), true);
  assert.equal(outputContains(r, "missing"), false);
  assertOutputContains(r, "All done");
  assert.throws(() => {
    assertOutputContains(r, "nope");
  });
});

// --- model-request predicate (did the injected context reach the model) ----

test("requestContains / assertRequestContains search system + messages", () => {
  const r = fakeResult([], [], {
    modelRequests: [
      {
        system: "You have superpowers. Use the using-superpowers skill.",
        messages: [{ role: "user", text: "go" }],
      },
      {
        system: "",
        messages: [
          { role: "user", text: "/audit the repo" },
          { role: "assistant", text: "on it" },
        ],
      },
    ],
  });
  // hits in the system prompt (SessionStart additionalContext shape)
  assert.equal(requestContains(r, "You have superpowers"), true);
  assert.equal(requestContains(r, /super\w+/), true);
  // hits in a message (slash-command expansion shape)
  assert.equal(requestContains(r, "/audit the repo"), true);
  assert.equal(requestContains(r, "never sent"), false);
  assertRequestContains(r, "superpowers");
  assert.throws(() => {
    assertRequestContains(r, "never sent");
  });
});

test("assertRequestContains hints when no requests were captured (eval tier)", () => {
  const r = fakeResult([], [], { modelRequests: [] });
  assert.equal(requestContains(r, "anything"), false);
  assert.throws(() => {
    assertRequestContains(r, "anything");
  }, /harness-tier only/);
});

// --- hook predicates (recorded from the stream, not marker files) ----------

const hookFires: readonly HookFire[] = [
  {
    name: "PreToolUse:Edit",
    event: "PreToolUse",
    exitCode: 2,
    blocked: true,
    output: "BLOCKED",
  },
  {
    name: "PostToolUse:Bash",
    event: "PostToolUse",
    exitCode: 0,
    blocked: false,
    output: "ok",
  },
];

test("hookFired / hookBlocked: match by label and by bare event", () => {
  const r = fakeResult([], [], { hooks: hookFires });
  assert.equal(hookFired(r, "PreToolUse:Edit"), true); // full label
  assert.equal(hookFired(r, "PostToolUse"), true); // bare event
  assert.equal(hookFired(r, /^PreToolUse/), true); // regex
  assert.equal(hookFired(r, "SessionStart"), false);
  assert.equal(hookBlocked(r, "PreToolUse"), true); // the Edit hook blocked
  assert.equal(hookBlocked(r, "PostToolUse"), false); // the Bash hook didn't
});

test("assertHookFired: fires, and { blocked: true } demands a block", () => {
  const r = fakeResult([], [], { hooks: hookFires });
  assertHookFired(r, "PreToolUse:Edit");
  assertHookFired(r, "PreToolUse", { blocked: true });
  assert.throws(() => {
    assertHookFired(r, "SessionStart"); // never fired
  });
  assert.throws(() => {
    assertHookFired(r, "PostToolUse", { blocked: true }); // fired but didn't block
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
