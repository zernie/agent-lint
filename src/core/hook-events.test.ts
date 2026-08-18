/**
 * Hook-event detector suite (vitest).
 *
 * Every case here is one half of a pair — a planted defect that must FIRE, or a
 * clean input that must stay SILENT. An advisory check cannot be noticed when it
 * dies (silence is its success case), so "stays quiet" on its own is
 * indistinguishable from a detector that was deleted.
 *
 * The regression these pin: until 2026-08-17 the catalog held 9 of the vendor's
 * 31 events, and what an unrecognised name got — an accusation or nothing —
 * was decided by its edit distance to those 9. `Setup` landed 2 away from `Stop`
 * and was told to become it; `PostCompact` landed 3 away from `PreCompact` and
 * drew nothing. Both are documented events.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  verifyHookEvents,
  scoredIssues,
  advisoryIssues,
} from "./hook-events.js";
import { claudeCodeDialect as d } from "../adapters/claude-code/dialect.js";
import { claudeCodeHookEventNames } from "../adapters/claude-code/vocabulary.js";

test("real events pass", () => {
  assert.deepEqual(
    verifyHookEvents(["PreToolUse", "SessionStart", "Stop"], d),
    [],
  );
});

// --- BUG 2: a valid event accused of never firing --------------------------

test("Setup is a real event and draws nothing", () => {
  assert.deepEqual(verifyHookEvents(["Setup"], d), []);
});

test("EVERY documented hook event is silent — all 31, not just Setup", () => {
  // The one-line-fix framing was wrong: 22 of these were missing, and 21 were
  // unreported only because they sat >2 from a name in the old 9-item list.
  assert.equal(claudeCodeHookEventNames.length, 31);
  const noisy = claudeCodeHookEventNames.filter(
    (e) => verifyHookEvents([e], d).length > 0,
  );
  assert.deepEqual(noisy, []);
});

test("the events one character from becoming the next Setup are silent", () => {
  // `SubagentStart` and `PostCompact` sat at distance 3 from a known name. They
  // escaped an accusation by luck, not by design.
  assert.deepEqual(verifyHookEvents(["SubagentStart", "PostCompact"], d), []);
});

// --- BUG 3: unknown names only reported when a near match existed ----------

test("an invented event is REPORTED, not silently accepted", () => {
  for (const invented of [
    "TotallyMadeUpEvent",
    "Zzzzzzzz",
    "XYZ",
    "OnFileSave",
  ]) {
    const issues = verifyHookEvents([invented], d);
    assert.equal(issues.length, 1, `${invented} produced no finding`);
    assert.equal(issues[0].severity, "advisory");
    assert.match(issues[0].message, /not in vigiles's/);
  }
});

test("an unrecognised event blames vigiles's capture, not the repo", () => {
  const [issue] = verifyHookEvents(["OnFileSave"], d);
  assert.match(issue.message, /vigiles is out of date — not your config/);
  assert.match(issue.message, /claude-code 2\.1\.233/);
});

test("a close typo still gets its did-you-mean", () => {
  const [issue] = verifyHookEvents(["PreToolUSe"], d);
  assert.equal(issue.suggestion, "PreToolUse");
  assert.match(issue.message, /Did you mean "PreToolUse"\?/);
});

// --- the severity split: advisories must never reach the grade -------------

test("an unrecognised event vigiles may simply not know is advisory", () => {
  // No near name at all → this could be newer than our capture, so it must not
  // cost a grade. `PreToolUSe` is excluded here on purpose: see the next test.
  const issues = verifyHookEvents(["OnFileSave", "XYZ", "TotallyMadeUp"], d);
  assert.equal(issues.length, 3);
  assert.deepEqual(scoredIssues(issues), []);
  assert.equal(advisoryIssues(issues).length, 3);
});

test("a ONE-edit typo is scored — no two real event names are that close", () => {
  const [issue] = verifyHookEvents(["PreToolUSe"], d);
  assert.equal(issue.severity, "scored");
  assert.match(issue.message, /a hook here never fires/);
});

test("a TWO-edit unknown is hinted but never accused", () => {
  // Two is the width at which real names collide — `Setup`/`Stop` is the one
  // such pair, and using ≤2 as the threshold is what produced the original bug.
  const [issue] = verifyHookEvents(["Stoppp"], d);
  assert.equal(issue.severity, "advisory");
  assert.equal(issue.suggestion, "Stop");
});

test("a wrong-case event is scored — the hook is just as dead", () => {
  // `preToolUse` is distance 0 case-insensitively but never matches the key.
  const [issue] = verifyHookEvents(["preToolUse"], d);
  assert.equal(issue.severity, "scored");
  assert.equal(issue.suggestion, "PreToolUse");
});

test("a dialect with no captured vocabulary still reports, and says so", () => {
  const legacy = { ...d, hookEventVocabulary: undefined, hookEvents: ["Stop"] };
  const [issue] = verifyHookEvents(["Whatever"], legacy);
  assert.equal(issue.severity, "advisory");
  assert.match(issue.message, /no recorded capture/);
});
