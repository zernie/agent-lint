/**
 * Tool-contract detector test suite (vitest) — the shared cross-referencing moat
 * reused by compileAgent / scan / the subagent-tool-contract lint rule.
 *
 * Cases come in pairs: a planted defect that must FIRE, and a valid input that
 * must stay SILENT. Silence alone proves nothing about a detector that is
 * supposed to be quiet most of the time.
 *
 * The regression these pin: until 2026-08-17 vigiles had the vendor's rename
 * backwards — `Agent` (current) was on the never-available denylist and `Task`
 * (the deprecated alias) was in the built-in catalog — so it told orchestrator
 * subagents to delete the one tool they exist to use, while real tools it had
 * never heard of (`EndConversation`, `TaskOutput`, `Workflow`) and outright
 * invented ones passed in silence.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  verifyToolContract,
  scoredIssues,
  advisoryIssues,
  closestTool,
  disallowedToolIssues,
} from "./tool-contract.js";
import { claudeCodeDialect as d } from "../adapters/claude-code/dialect.js";

test("a clean contract (built-ins + MCP) has no issues", () => {
  assert.deepEqual(
    verifyToolContract(["Read", "Edit", "Bash", "mcp__server__tool"], d),
    [],
  );
});

// --- BUG 4: the rename was encoded backwards -------------------------------

test("Agent is NOT reported as never-available", () => {
  const scored = scoredIssues(verifyToolContract(["Agent"], d));
  assert.deepEqual(scored, []);
});

test("Agent is reported as conditional, quoting the vendor's condition", () => {
  const [issue] = verifyToolContract(["Agent"], d);
  assert.equal(issue.kind, "conditional");
  assert.equal(issue.severity, "advisory");
  assert.match(issue.message, /depth limit/);
  // The old message told you to delete it. That is the harm, not the noise.
  assert.doesNotMatch(issue.message, /remove it from the tools list/);
});

test("Agent(worker) — the parenthesised allowlist form — is not scored either", () => {
  assert.deepEqual(
    scoredIssues(verifyToolContract(["Agent(worker, researcher)"], d)),
    [],
  );
});

test("Task is accepted as the deprecated alias it is, and says so", () => {
  const [issue] = verifyToolContract(["Task"], d);
  assert.equal(issue.severity, "advisory");
  assert.match(issue.message, /deprecated alias of "Agent"/);
});

test("the docs' own worked example is clean", () => {
  // `tools: Agent(worker, researcher), Read, Bash` ships in the vendor docs.
  assert.deepEqual(
    scoredIssues(
      verifyToolContract(["Agent(worker, researcher)", "Read", "Bash"], d),
    ),
    [],
  );
});

test("ExitPlanMode is conditional (plan mode), not never-available", () => {
  const [issue] = verifyToolContract(["ExitPlanMode"], d);
  assert.equal(issue.kind, "conditional");
  assert.match(issue.message, /permissionMode is plan/);
});

test("the unconditionally-withheld tools ARE scored", () => {
  for (const tool of [
    "AskUserQuestion",
    "EnterPlanMode",
    "ScheduleWakeup",
    "EndConversation",
    "TaskOutput",
    "WaitForMcpServers",
    "Workflow",
  ]) {
    const scored = scoredIssues(verifyToolContract([tool], d));
    assert.equal(scored.length, 1, `${tool} was not scored`);
    assert.equal(scored[0].kind, "never-available");
  }
});

test("the four false negatives from the dogfood sweep now fire", () => {
  // EndConversation / TaskOutput / WaitForMcpServers / Workflow were silent.
  const scored = scoredIssues(
    verifyToolContract(
      ["EndConversation", "TaskOutput", "WaitForMcpServers", "Workflow"],
      d,
    ),
  );
  assert.equal(scored.length, 4);
});

// --- BUG 3's tool half: invented names were silently accepted ---------------

test("an invented tool is REPORTED, not silently accepted", () => {
  const issues = verifyToolContract(["NotARealTool"], d);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, "unknown");
  assert.equal(issues[0].severity, "advisory");
  assert.match(issues[0].message, /not in vigiles's/);
});

test("the newly-real tools are recognised, not flagged", () => {
  // PowerShell / ToolSearch / SendMessage / Artifact / Monitor / worktrees are
  // in the vendor's background-subagent kept-list; vigiles had none of them.
  assert.deepEqual(
    verifyToolContract(
      [
        "PowerShell",
        "ToolSearch",
        "SendMessage",
        "Artifact",
        "Monitor",
        "EnterWorktree",
        "ExitWorktree",
        "TaskStop",
      ],
      d,
    ),
    [],
  );
});

test("tools that no longer exist are reported rather than approved", () => {
  // MultiEdit / BashOutput / KillBash / LS appear nowhere in the vendor docs.
  // All four are now REPORTED; the severity split is honest about what vigiles
  // can actually tell. `LS` sits 1 edit from the live `LSP`, and at that
  // distance no two real names collide, so it is scored. The other three are
  // further out, where "removed since our capture" and "newer than our capture"
  // are indistinguishable — so they are advisory. Both halves are true
  // statements; neither pretends to knowledge vigiles does not have.
  for (const gone of ["MultiEdit", "BashOutput", "KillBash"]) {
    const issues = verifyToolContract([gone], d);
    assert.equal(issues.length, 1, `${gone} was silently accepted`);
    assert.equal(issues[0].severity, "advisory");
  }
  const [ls] = verifyToolContract(["LS"], d);
  assert.equal(ls.severity, "scored");
});

test("a close typo is flagged with a did-you-mean (edit distance ≤ 2)", () => {
  const [issue] = verifyToolContract(["Edt"], d);
  assert.equal(issue.kind, "unknown");
  assert.equal(issue.suggestion, "Edit");
  assert.match(issue.message, /Did you mean "Edit"\?/);
});

test("a suggestion never points at a tool the platform withholds", () => {
  // `Workflo` is 1 from `Workflow`, which is withheld — suggesting it would
  // trade one dead reference for another.
  assert.notEqual(closestTool("Workflo", d), "Workflow");
});

test("advisory issues never reach the grade", () => {
  const issues = verifyToolContract(["Agent", "NotARealTool", "MultiEdit"], d);
  // none of these is 1 edit from a real name
  assert.equal(issues.length, 3);
  assert.deepEqual(scoredIssues(issues), []);
  assert.equal(advisoryIssues(issues).length, 3);
});

test("a Tool(restriction) suffix is stripped to its base tool", () => {
  assert.deepEqual(verifyToolContract(["Bash(git status:*)"], d), []);
});

test('a "*" wildcard (all tools) is not flagged', () => {
  assert.deepEqual(verifyToolContract(["*"], d), []);
});

// --- the block-list mirror: near-match is the real signal here --------------

test("disallowedToolIssues flags ONLY a close typo of a real tool (block-list)", () => {
  // Bsh → typo of Bash (flagged); Bash → legitimately blocked (ok);
  // AskUserQuestion → withheld, harmless to list (ok); mcp__x__y → a plugin tool
  // to block (ok); Zzzzzz → bare unknown, nobody meant a real tool (suppressed).
  const issues = disallowedToolIssues(
    ["Bsh", "Bash", "AskUserQuestion", "mcp__x__y", "Zzzzzz"],
    d,
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].tool, "Bsh");
  assert.equal(issues[0].suggestion, "Bash");
  assert.match(issues[0].message, /blocks nothing/);
});

test("blocking a conditional tool is not a finding", () => {
  assert.deepEqual(disallowedToolIssues(["Agent", "ExitPlanMode"], d), []);
});
