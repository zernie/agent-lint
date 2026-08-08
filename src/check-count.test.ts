/**
 * The check counter — the channel a harness script reports through, so
 * `vigiles test` can tell "ran nothing" from "ran and passed". Pure: the
 * process bits (env, exit hook, file write) are injected.
 */
import { test, beforeEach } from "vitest";
import assert from "node:assert/strict";

import {
  CHECK_COUNT_ENV,
  recordCheck,
  checksRecorded,
  resetCheckCount,
  armCheckReport,
} from "./check-count.js";
import { runHook } from "./run-hook.js";
import { assertHookAllows } from "./harness-assert.js";
import { defineHook, allow, tool } from "./hook.js";

/** Capture what an armed report would write, without touching the disk. */
function fakes(env: NodeJS.ProcessEnv): {
  deps: Parameters<typeof armCheckReport>[0];
  exit: () => void;
  written: { path: string; contents: string }[];
} {
  const written: { path: string; contents: string }[] = [];
  let onExit = (): void => {
    throw new Error("never armed");
  };
  return {
    deps: {
      env,
      onExit: (fn) => {
        onExit = fn;
      },
      write: (path, contents) => written.push({ path, contents }),
    },
    exit: () => {
      onExit();
    },
    written,
  };
}

beforeEach(() => {
  resetCheckCount();
});

test("counts, and reports the count at exit", () => {
  const env: NodeJS.ProcessEnv = { [CHECK_COUNT_ENV]: "/tmp/x.count" };
  const f = fakes(env);
  assert.equal(armCheckReport(f.deps), true);
  recordCheck();
  recordCheck(2);
  assert.equal(checksRecorded(), 3);
  f.exit();
  assert.deepEqual(f.written, [{ path: "/tmp/x.count", contents: "3" }]);
});

test("reports ZERO — the whole point, and the one thing silence must not mean", () => {
  // A script that loaded the API and used none of it says so explicitly. The
  // runner turns this into `∅ 0 CHECKS`; an absent file it leaves as a pass.
  const f = fakes({ [CHECK_COUNT_ENV]: "/tmp/zero.count" });
  armCheckReport(f.deps);
  f.exit();
  assert.deepEqual(f.written, [{ path: "/tmp/zero.count", contents: "0" }]);
});

test("does not arm when the runner asked for no count (a standalone `node x.mjs`)", () => {
  const f = fakes({});
  assert.equal(armCheckReport(f.deps), false);
  assert.throws(() => {
    f.exit();
  }, /never armed/); // no exit hook was installed
  assert.deepEqual(f.written, []);
});

test("drops the env var, so a spawned CHILD cannot report over its parent", () => {
  // A harness spawns processes for a living. An inherited count path would let a
  // child's exit overwrite the parent's count with its own — usually zero.
  const env: NodeJS.ProcessEnv = { [CHECK_COUNT_ENV]: "/tmp/x.count" };
  armCheckReport(fakes(env).deps);
  assert.equal(env[CHECK_COUNT_ENV], undefined);
});

test("arms once — a second copy of vigiles in the process does not double-report", () => {
  const env: NodeJS.ProcessEnv = { [CHECK_COUNT_ENV]: "/tmp/x.count" };
  const first = fakes(env);
  assert.equal(armCheckReport(first.deps), true);
  const second = fakes({ [CHECK_COUNT_ENV]: "/tmp/other.count" });
  assert.equal(armCheckReport(second.deps), false);
});

test("an unwritable report path never crashes a passing harness on the way out", () => {
  const f = fakes({ [CHECK_COUNT_ENV]: "/nope/x.count" });
  armCheckReport({
    ...f.deps,
    write: () => {
      throw new Error("EACCES");
    },
  });
  assert.doesNotThrow(() => {
    f.exit();
  });
});

// --- the tiers count themselves ---------------------------------------------
//
// A harness author should never have to call `recordCheck` for ordinary work; if
// they did, the counter would measure diligence instead of activity, and the
// first person to forget would be told their file verified nothing. Each tier
// reports its own runs, so the count tracks what the script DID.

test("runHook counts as a check", () => {
  runHook("exit 0", { hook_event_name: "PreToolUse" });
  assert.equal(checksRecorded(), 1);
});

test("an in-process compiled-hook assertion counts as a check", () => {
  // The tier with no subprocess at all — without this, a harness that only tests
  // compiled hooks would look like it did nothing.
  const gate = defineHook({
    on: "PreToolUse",
    match: tool("Bash"),
    decide: () => allow(),
  });
  assertHookAllows(gate, { tool_name: "Bash", tool_input: { command: "ls" } });
  assert.equal(checksRecorded(), 1);
});
