/**
 * Tests for the hook unit tier (src/run-hook.ts) — run a hook process directly
 * against a synthesized event, no `claude` CLI, no model. Covers the pure
 * decision logic and real (tiny shell) hooks across exit codes / JSON output /
 * stdin passthrough / env injection.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runHook,
  parseHookOutput,
  decideHook,
  type HookOutput,
} from "./run-hook.js";

test("parseHookOutput parses a JSON decision and ignores plain text", () => {
  assert.deepEqual(parseHookOutput('{"decision":"block","reason":"no"}'), {
    decision: "block",
    reason: "no",
  });
  assert.equal(parseHookOutput("just a log line"), null);
  assert.equal(parseHookOutput("  not json {x"), null);
});

test("decideHook: exit 2 blocks regardless of stdout", () => {
  const r = decideHook(2, null);
  assert.equal(r.blocked, true);
});

test("decideHook: legacy decision:block blocks on exit 0", () => {
  const json: HookOutput = { decision: "block" };
  const r = decideHook(0, json);
  assert.equal(r.blocked, true);
  assert.equal(r.decision, "block");
});

test("decideHook: permissionDecision:deny blocks and wins over legacy", () => {
  const json: HookOutput = {
    decision: "approve",
    hookSpecificOutput: { permissionDecision: "deny" },
  };
  const r = decideHook(0, json);
  assert.equal(r.blocked, true);
  assert.equal(r.decision, "deny"); // structured field preferred
});

test("decideHook: clean exit 0 with no JSON allows", () => {
  const r = decideHook(0, null);
  assert.equal(r.blocked, false);
  assert.equal(r.decision, undefined);
});

test("runHook: a guard that exits 2 reports blocked", () => {
  const r = runHook("exit 2", {
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
  });
  assert.equal(r.exitCode, 2);
  assert.equal(r.blocked, true);
});

test("runHook: a clean exit 0 is not blocked", () => {
  const r = runHook("exit 0", { hook_event_name: "Stop" });
  assert.equal(r.exitCode, 0);
  assert.equal(r.blocked, false);
});

test("runHook: a hook can read the event from stdin", () => {
  // Real-world shape: the hook inspects tool_input from the piped JSON and
  // blocks on a forbidden flag — the Edit/Write events the mock tier can't reach
  // are just as testable here.
  const guard = `node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      const i=JSON.parse(s);
      if(String(i.tool_input&&i.tool_input.command).includes("--no-verify"))process.exit(2);
    });'`;
  const blocked = runHook(guard, {
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "git commit --no-verify" },
  });
  assert.equal(blocked.blocked, true);
  const ok = runHook(guard, {
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "git commit -m ok" },
  });
  assert.equal(ok.blocked, false);
});

test("runHook: a JSON permission decision on stdout is parsed", () => {
  const cmd = `printf '%s' '{"hookSpecificOutput":{"permissionDecision":"deny","permissionDecisionReason":"nope"}}'`;
  const r = runHook(cmd, { hook_event_name: "PreToolUse" });
  assert.equal(r.blocked, true);
  assert.equal(r.decision, "deny");
  assert.equal(r.json?.hookSpecificOutput?.permissionDecisionReason, "nope");
});

test("runHook: env is injected so command strings with $VARS resolve", () => {
  const r = runHook('test "$VIGILES_FLAG" = "1" && exit 2 || exit 0', {
    hook_event_name: "PreToolUse",
  });
  assert.equal(r.blocked, false); // unset → exit 0
  const r2 = runHook(
    'test "$VIGILES_FLAG" = "1" && exit 2 || exit 0',
    {
      hook_event_name: "PreToolUse",
    },
    { env: { VIGILES_FLAG: "1" } },
  );
  assert.equal(r2.blocked, true);
});
