/**
 * Lethal-trifecta detector suite (vitest) — the headline Safety check. Asserts
 * the Rule of Two: ≤ 2 legs is clean, all 3 is a finding; `Bash` is dual (A+C) so
 * Bash + a leg-B tool already fires; inherits-all is advisory, an explicit
 * all-three is hard; MCP tools classify per leg; unknown tools map to nothing.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  classifyTrifectaLegs,
  lethalTrifectaIssues,
} from "./lethal-trifecta.js";
import { claudeCodeDialect } from "../adapters/claude-code/dialect.js";

test("clean 2-of-3 (Read + WebFetch, no exfil-only leg beyond fetch) → ...", () => {
  // Read (leg A) + WebSearch (leg B only) — no exfil leg → safe.
  assert.equal(
    lethalTrifectaIssues(["Read", "WebSearch"], claudeCodeDialect),
    null,
  );
});

test("explicit all-three → a hard finding naming each leg", () => {
  // Read (A) + WebSearch (B) + WebFetch (C, also B) → all three legs.
  const finding = lethalTrifectaIssues(
    ["Read", "WebSearch", "WebFetch"],
    claudeCodeDialect,
  );
  assert.notEqual(finding, null);
  assert.equal(finding?.severity, "hard");
  assert.ok(finding && finding.legs.private.includes("Read"));
  assert.ok(finding && finding.legs.untrusted.includes("WebSearch"));
  assert.ok(finding && finding.legs.exfil.includes("WebFetch"));
  assert.match(finding!.message, /Lethal trifecta/);
});

test("Bash is dual (A+C): Bash alone covers two legs, Bash+WebFetch fires", () => {
  const legs = classifyTrifectaLegs(["Bash"], claudeCodeDialect);
  assert.ok(legs.private.includes("Bash"));
  assert.ok(legs.exfil.includes("Bash"));
  assert.equal(legs.untrusted.length, 0);
  // Bash alone (A+C, no B) → not a trifecta.
  assert.equal(lethalTrifectaIssues(["Bash"], claudeCodeDialect), null);
  // Bash (A+C) + WebFetch (B) → all three.
  const finding = lethalTrifectaIssues(
    ["Bash", "WebFetch"],
    claudeCodeDialect,
  );
  assert.notEqual(finding, null);
  assert.equal(finding?.severity, "hard");
});

test("a Tool(restriction) suffix is stripped before classifying", () => {
  // Bash(git:*) still classifies as Bash (A+C); + WebSearch (B) → trifecta.
  const finding = lethalTrifectaIssues(
    ["Bash(git:*)", "WebSearch"],
    claudeCodeDialect,
  );
  assert.notEqual(finding, null);
  assert.ok(finding && finding.legs.private.includes("Bash"));
});

test("inherits-all (empty contract) → an advisory finding", () => {
  const finding = lethalTrifectaIssues([], claudeCodeDialect);
  assert.notEqual(finding, null);
  assert.equal(finding?.severity, "advisory");
  assert.match(finding!.message, /Inherits-all/);
});

test("inherits-all (wildcard '*') → an advisory finding", () => {
  const finding = lethalTrifectaIssues(["*"], claudeCodeDialect);
  assert.notEqual(finding, null);
  assert.equal(finding?.severity, "advisory");
});

test("mcp__* servers classify per leg (github get_file=A, fetch=B, github PR=C)", () => {
  const legs = classifyTrifectaLegs(
    [
      "mcp__github__get_file_contents",
      "mcp__fetch__fetch",
      "mcp__github__create_pull_request",
    ],
    claudeCodeDialect,
  );
  assert.ok(legs.private.includes("mcp__github__get_file_contents"));
  assert.ok(legs.untrusted.includes("mcp__fetch__fetch"));
  assert.ok(legs.exfil.includes("mcp__github__create_pull_request"));

  const finding = lethalTrifectaIssues(
    [
      "mcp__github__get_file_contents",
      "mcp__fetch__fetch",
      "mcp__github__create_pull_request",
    ],
    claudeCodeDialect,
  );
  assert.notEqual(finding, null);
  assert.equal(finding?.severity, "hard");
});

test("an unknown tool maps to NO leg (high-precision)", () => {
  const legs = classifyTrifectaLegs(
    ["TotallyMadeUpTool", "mcp__weirdserver__do_thing"],
    claudeCodeDialect,
  );
  assert.equal(legs.private.length, 0);
  assert.equal(legs.untrusted.length, 0);
  assert.equal(legs.exfil.length, 0);
  assert.equal(
    lethalTrifectaIssues(["TotallyMadeUpTool"], claudeCodeDialect),
    null,
  );
});

test("two legs only (private MCP + untrusted, no exfil) → no finding", () => {
  assert.equal(
    lethalTrifectaIssues(
      ["mcp__filesystem__read_file", "WebSearch"],
      claudeCodeDialect,
    ),
    null,
  );
});
