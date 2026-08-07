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
  assert.match(finding?.message ?? "", /Lethal trifecta/);
});

test("Bash is dual (A+C): Bash alone covers two legs, Bash+WebFetch fires", () => {
  const legs = classifyTrifectaLegs(["Bash"], claudeCodeDialect);
  assert.ok(legs.private.includes("Bash"));
  assert.ok(legs.exfil.includes("Bash"));
  assert.equal(legs.untrusted.length, 0);
  // Bash alone (A+C, no B) → not a trifecta.
  assert.equal(lethalTrifectaIssues(["Bash"], claudeCodeDialect), null);
  // Bash (A+C) + WebFetch (B) → all three.
  const finding = lethalTrifectaIssues(["Bash", "WebFetch"], claudeCodeDialect);
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

test("EXPLICIT empty contract ([]) → NO finding (zero tools can't hold a leg)", () => {
  // The caller passes `["*"]` for inherits-all; a literal `[]` means the unit
  // declared zero tools, so it cannot form a trifecta (don't collapse the two).
  assert.equal(lethalTrifectaIssues([], claudeCodeDialect), null);
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

// ---------------------------------------------------------------------------
// A NARROWED `Bash(...)` grant — the remedy this checker recommends
// ---------------------------------------------------------------------------
//
// 🔴 The regression these exist for: `Bash(node ./scripts/log.mjs:*)` was read as plain
// `Bash`, i.e. the whole shell in both leg A and leg C, because the classifier stripped
// everything after `(`. An author who took this checker's own advice — drop a leg,
// allow at most two — saw the score not move, and the reasonable next conclusion is
// that narrowing is pointless. A diagnosis blind to its own prescription teaches the
// wrong lesson. Observed 2026-08-07 on a repo that narrowed nine skills to two named
// ledger commands and stayed at "17 units can read data, reach the web, and run
// commands".

test("a Bash narrowed to a concrete command supplies neither leg", () => {
  const legs = classifyTrifectaLegs(
    ["Bash(node .claude/pipeline/ledger.mjs:*)", "WebFetch"],
    claudeCodeDialect,
  );
  assert.equal(legs.private.length, 0);
  assert.equal(legs.exfil.includes("Bash"), false);
  // …and therefore no trifecta, where bare Bash + WebFetch is one.
  assert.equal(
    lethalTrifectaIssues(
      ["Bash(node .claude/pipeline/ledger.mjs:*)", "WebFetch"],
      claudeCodeDialect,
    ),
    null,
  );
  assert.notEqual(
    lethalTrifectaIssues(["Bash", "WebFetch"], claudeCodeDialect),
    null,
  );
});

// The other direction, and the one that matters more: a grant that LOOKS narrowed but
// still runs whatever the caller likes must keep both legs. When in doubt the
// classifier keeps them — a false "you are exposed" costs an argument, a false "you
// are safe" costs the finding.
test("a Bash that only looks narrowed keeps both legs", () => {
  for (const grant of [
    "Bash(*)",
    "Bash(:*)",
    "Bash()",
    "Bash(node:*)", // program pinned, arguments free — `node -e "..."` is a shell
    "Bash(sh ./deploy.sh:*)", // the shell itself, however pinned
    "Bash(bash scripts/x.sh:*)",
    "Bash(sudo systemctl restart:*)",
    "Bash(curl https://example.com:*)", // a program whose whole job is exfiltration
    "Bash(git push origin main:*)",
    "Bash(/usr/bin/env node x.mjs:*)", // `env` re-opens the door
  ]) {
    assert.notEqual(
      lethalTrifectaIssues([grant, "WebFetch"], claudeCodeDialect),
      null,
      `${grant} + WebFetch should still be a lethal trifecta`,
    );
  }
});
