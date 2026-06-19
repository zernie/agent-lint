/**
 * Hook-event detector suite (vitest). Asserts the verdict AND the high-precision
 * calibration: a close typo of a real event is flagged, but a framework/custom
 * event (no near match) is suppressed when auditing (the han `TeammateIdle` lesson).
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import { verifyHookEvents, confidentHookEventIssues } from "./hook-events.js";
import { claudeCodeDialect as d } from "../adapters/claude-code/dialect.js";

test("real events pass", () => {
  assert.deepEqual(
    verifyHookEvents(["PreToolUse", "SessionStart", "Stop"], d),
    [],
  );
});

test("a close typo is flagged with a did-you-mean", () => {
  const issues = verifyHookEvents(["PreToolUSe"], d);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].suggestion, "PreToolUse");
  assert.match(issues[0].message, /never fires/);
  assert.match(issues[0].message, /Did you mean "PreToolUse"\?/);
});

test("a framework/custom event (no near match) is suppressed when auditing", () => {
  const issues = verifyHookEvents(["TeammateIdle", "WorktreeRemove"], d);
  assert.equal(issues.length, 2); // verify reports all unknowns
  assert.deepEqual(confidentHookEventIssues(issues), []); // but audit drops far ones
});

test("confidentHookEventIssues keeps typos, drops custom events", () => {
  const issues = verifyHookEvents(["PreToolUSe", "TeammateIdle"], d);
  assert.deepEqual(
    confidentHookEventIssues(issues).map((i) => i.event),
    ["PreToolUSe"],
  );
});
