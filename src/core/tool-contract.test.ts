/**
 * Tool-contract detector test suite (vitest) — the shared cross-referencing moat
 * reused by compileAgent / scan / the agent-tool-contract lint rule. Asserts the
 * verdict AND the high-precision calibration that keeps it from crying wolf when
 * auditing third-party plugins (the TaskCreate/TaskGet lesson).
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  verifyToolContract,
  confidentToolIssues,
  closestTool,
  disallowedToolIssues,
} from "./tool-contract.js";
import { claudeCodeDialect as d } from "../adapters/claude-code/dialect.js";

test("disallowedToolIssues flags ONLY a close typo of a real tool (block-list)", () => {
  // Bsh → typo of Bash (flagged); Bash → legitimately blocked (ok); Agent →
  // never-available, harmless to list (ok); mcp__x__y → a plugin tool to block
  // (ok); Zzzzzz → bare unknown, likely a plugin tool, not a typo (suppressed).
  const issues = disallowedToolIssues(
    ["Bsh", "Bash", "Agent", "mcp__x__y", "Zzzzzz"],
    d,
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].tool, "Bsh");
  assert.equal(issues[0].suggestion, "Bash");
  assert.match(issues[0].message, /blocks nothing/);
});

test("a clean contract (built-ins + MCP) has no issues", () => {
  const issues = verifyToolContract(
    ["Read", "Edit", "Bash", "mcp__server__tool"],
    d,
  );
  assert.deepEqual(issues, []);
});

test("a never-available tool is flagged (curated denylist)", () => {
  const issues = verifyToolContract(["Read", "AskUserQuestion"], d);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, "never-available");
  assert.equal(issues[0].tool, "AskUserQuestion");
  assert.match(issues[0].message, /never available to a subagent/);
});

test("a close typo is flagged with a did-you-mean (edit distance ≤ 2)", () => {
  const issues = verifyToolContract(["Edt"], d);
  assert.equal(issues[0].kind, "unknown");
  assert.equal(issues[0].suggestion, "Edit");
  assert.match(issues[0].message, /Did you mean "Edit"\?/);
});

test("a far unknown gets NO suggestion (and is suppressed when auditing)", () => {
  // `TaskGet` is distance 3 from `Task` — a real plugin tool set, not a typo.
  const issues = verifyToolContract(["TaskGet"], d);
  assert.equal(issues[0].kind, "unknown");
  assert.equal(issues[0].suggestion, null);
  // The high-confidence subset (what scan/lint act on) drops it → no cry-wolf.
  assert.deepEqual(confidentToolIssues(issues), []);
});

test("confidentToolIssues keeps never-available + close-typo, drops bare unknowns", () => {
  const issues = verifyToolContract(["AskUserQuestion", "Edt", "TaskGet"], d);
  const confident = confidentToolIssues(issues);
  assert.deepEqual(confident.map((i) => i.tool).sort(), [
    "AskUserQuestion",
    "Edt",
  ]);
});

test("a Tool(restriction) suffix is stripped to its base tool", () => {
  assert.deepEqual(verifyToolContract(["Bash(git status:*)"], d), []);
});

test('a "*" wildcard (all tools) is not flagged', () => {
  assert.deepEqual(verifyToolContract(["*"], d), []);
});

test("closestTool only suggests within edit distance 2", () => {
  assert.equal(closestTool("Edt", d), "Edit"); // distance 1
  assert.equal(closestTool("TaskGet", d), null); // distance 3 → no guess
});
