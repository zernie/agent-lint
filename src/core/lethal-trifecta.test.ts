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
  skillFenceLegs,
  skillTrifectaIssue,
  dialectSupportsSkillFence,
} from "./lethal-trifecta.js";
import { claudeCodeDialect } from "../adapters/claude-code/dialect.js";
import { codexDialect } from "../adapters/codex/dialect.js";

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
  assert.match(finding?.message ?? "", /no explicit tools/);
});

test("an unreadable contract whose SALVAGE names all three legs still convicts", () => {
  // One-directional: a salvage may make the verdict worse, never better. A real
  // vendored plugin (madappgang's tester.md) is exactly this shape — malformed
  // block, explicit all-three tool list — and demoting it to advisory would lose
  // a genuine exfil path.
  const finding = lethalTrifectaIssues(
    ["Read", "WebSearch", "WebFetch"],
    claudeCodeDialect,
    { contractUnreadable: true },
  );
  assert.equal(finding?.severity, "hard");
  assert.match(finding?.message ?? "", /Lethal trifecta/);
  assert.match(finding?.message ?? "", /SALVAGED/);
});

test("an unreadable contract that reads NARROW falls back to inherits-all", () => {
  // The defect itself: Read + Bash is private + exfil with no untrusted leg, so
  // the salvage scored CLEAN. What a strict loader yields from that block is no
  // contract at all — every leg.
  const finding = lethalTrifectaIssues(["Read", "Bash"], claudeCodeDialect, {
    contractUnreadable: true,
  });
  assert.equal(finding?.severity, "advisory");
  assert.match(finding?.message ?? "", /not valid YAML/);
  // …and the same list in a block that PARSES is still clean (Rule of Two).
  assert.equal(lethalTrifectaIssues(["Read", "Bash"], claudeCodeDialect), null);
});

test("an UNREADABLE contract says so, instead of 'no explicit tools'", () => {
  // The caller (scan-core) passes the wildcard when the frontmatter block exists
  // but js-yaml rejects it. Same severity, different sentence: telling an author
  // who plainly declared `allowed-tools:` that they declared no tools sends them
  // hunting the wrong bug. Name the YAML, and name what it was scored as instead.
  const finding = lethalTrifectaIssues(["*"], claudeCodeDialect, {
    contractUnreadable: true,
  });
  assert.equal(finding?.severity, "advisory");
  assert.match(finding?.message ?? "", /not valid YAML/);
  assert.match(finding?.message ?? "", /INHERITS-ALL/);
  assert.doesNotMatch(finding?.message ?? "", /no explicit tools/);
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

// ---------------------------------------------------------------------------
// SKILLS — `disallowed-tools` is the fence; `allowed-tools` is not
// ---------------------------------------------------------------------------
//
// 🔴 What these pin, and why the suite would otherwise let the defect back in.
// A skill's `allowed-tools:` PRE-APPROVES the tools it lists; Claude Code's docs
// say so outright ("It does not restrict which tools are available: every tool
// remains callable") and two issues closed as not-planned (#18837, #37683 — the
// second reproduced interactively on a live model) confirm it. `disallowed-tools`
// was then measured across 9 runs and DOES remove the tool: with the skill active,
// "Permission to use Read has been denied.", and through a `Task` subagent in the
// same run, "Read is disabled for this session, in subagents as well as here."
//
// `skillTrifectaIssue` therefore takes ONLY the deny list. There is no parameter
// through which `allowed-tools` could reach it — the strongest form of "a narrow
// allowed-tools does not reduce the finding" — and the tests below pin the
// behaviour that would break first if someone re-introduced the old reading.

test("a skill with NO fence holds all three legs, whatever it pre-approved", () => {
  const f = skillTrifectaIssue(null, claudeCodeDialect);
  assert.equal(f?.severity, "advisory");
  assert.equal(f?.fence, "none");
  assert.match(f?.message ?? "", /No `disallowed-tools:` line/);
  // The fix travels WITH the finding — a diagnosis with no prescription teaches
  // the author that narrowing is pointless (the lesson this file learned once).
  assert.match(f?.message ?? "", /disallowed-tools/);
  // …and it names the built-ins that supply each leg, so "which one" is answered.
  assert.deepEqual(f?.legs.private, ["Read", "Grep", "Glob", "Bash"]);
  assert.deepEqual(f?.legs.untrusted, ["WebFetch", "WebSearch", "Bash"]);
});

test("🔴 an EMPTY deny list is exactly as EXPOSED as no list — allow-side width is not an input", () => {
  // `skillTrifectaIssue` has no `allowed-tools` parameter at all, so the only way
  // to express "declared a lot" vs "declared a little" is the deny list. Both
  // degenerate deny lists must produce the same exposure; if a future change adds
  // an allow-side parameter that narrows the legs, this pair diverges.
  const none = skillTrifectaIssue(null, claudeCodeDialect);
  const empty = skillTrifectaIssue([], claudeCodeDialect);
  assert.notEqual(none, null);
  assert.equal(empty?.severity, none?.severity);
  assert.deepEqual(empty?.legs, none?.legs);
});

test("🔴 …but an EXPLICIT `disallowed-tools: []` is an ATTEMPT, not a missing line", () => {
  // The two states differ in what the AUTHOR did, and the doc contract on
  // `skillTrifectaIssue` always said so — the code folded them together anyway.
  // The damage was ROUTING, not wording: `fence: "none"` is swept into the
  // whole-surface aggregate ("N of M skills declare no tool fence"), so the one
  // author who reached for the field and got nothing from it was the one who
  // never got a line of their own.
  const empty = skillTrifectaIssue([], claudeCodeDialect);
  assert.equal(empty?.fence, "ineffective");
  assert.match(empty?.message ?? "", /declared but EMPTY/);
  // It must NOT claim the line is absent — that is the sentence which sends an
  // author looking for something they have already written.
  assert.doesNotMatch(empty?.message ?? "", /No `disallowed-tools:` line/);
  // The absent case keeps saying exactly that.
  const none = skillTrifectaIssue(null, claudeCodeDialect);
  assert.equal(none?.fence, "none");
  assert.match(none?.message ?? "", /No `disallowed-tools:` line/);
  // 🔴 Unreadable frontmatter is NOT an attempt: a strict loader parses no block,
  // so whatever it appears to declare denies nothing and it stays in the aggregate.
  const broken = skillTrifectaIssue([], claudeCodeDialect, {
    contractUnreadable: true,
  });
  assert.equal(broken?.fence, "none");
  assert.match(broken?.message ?? "", /not valid YAML/);
});

test("a fence that closes a WHOLE leg clears the finding (Rule of Two)", () => {
  // Untrusted-intake and exfiltration share their built-in suppliers, so one line
  // closes both and leaves only private-data read standing.
  assert.equal(
    skillTrifectaIssue(["WebFetch", "WebSearch", "Bash"], claudeCodeDialect),
    null,
  );
  // The other direction: closing private-data read alone is also enough.
  assert.equal(
    skillTrifectaIssue(["Read", "Grep", "Glob", "Bash"], claudeCodeDialect),
    null,
  );
});

test("a PARTIAL fence closes nothing and is never graded louder than no fence", () => {
  const partial = skillTrifectaIssue(["WebFetch"], claudeCodeDialect);
  assert.equal(partial?.fence, "ineffective");
  assert.match(partial?.message ?? "", /closes no lethal-trifecta leg/);
  // WebSearch and Bash still supply both network legs.
  assert.deepEqual(partial?.legs.untrusted, ["WebSearch", "Bash"]);
  // 🔴 Severity parity is load-bearing. An ineffective fence has capability ≤ no
  // fence, so grading it HARDER would repeat the non-monotonicity this detector
  // was already fixed for once (declaring a contract could only lower the score).
  const nothing = skillTrifectaIssue(null, claudeCodeDialect);
  assert.equal(partial?.severity, nothing?.severity);
});

test("a RESTRICTED deny does not remove the tool: `Bash(curl:*)` leaves the shell", () => {
  // The mirror of `bashGrantIsUnbounded` on the allow side. Denying one pattern
  // leaves every other command, so the shell keeps supplying all three legs.
  const legs = skillFenceLegs(
    ["WebFetch", "WebSearch", "Bash(curl:*)"],
    claudeCodeDialect,
  );
  assert.ok(legs.exfil.includes("Bash"));
  assert.notEqual(
    skillTrifectaIssue(
      ["WebFetch", "WebSearch", "Bash(curl:*)"],
      claudeCodeDialect,
    ),
    null,
  );
});

test("an unreadable block is not a fence, and the message says so", () => {
  // The salvage would read `WebFetch, WebSearch, Bash` and close two legs. A strict
  // loader reads no frontmatter at all, so the fence denies nothing — one-directional,
  // exactly as on the subagent path: a salvage may convict, never acquit.
  const f = skillTrifectaIssue(
    ["WebFetch", "WebSearch", "Bash"],
    claudeCodeDialect,
    {
      contractUnreadable: true,
    },
  );
  assert.equal(f?.fence, "none");
  assert.match(f?.message ?? "", /not valid YAML/);
});

test("the remedy names only tools THIS harness ships (no Codex `shell` in a CC message)", () => {
  // `FENCE_SUPPLIERS` carries every dialect's shell name so the check generalizes;
  // telling a Claude Code author to deny `shell` would be cry-wolf, and would make
  // the leg unclosable in practice.
  const f = skillTrifectaIssue(null, claudeCodeDialect);
  assert.doesNotMatch(f?.message ?? "", /shell/);
  assert.equal(f?.legs.private.includes("shell"), false);
});

// ─── the skill fence is a Claude Code MECHANISM, not a universal one ──────────
//
// 🔴 Applied to every harness, this reported every Codex skill as holding all
// three legs, scored it against Safety, and told the author to add a
// `disallowed-tools:` line — a key Codex does not read and our own compiler drops
// under its `skillFrontmatter: "minimal"` profile. The work gets done, the finding
// comes back, the score never moves. Both halves below: SILENT where the fence
// does not exist, and unchanged where it does.

test("a harness with no skill fence gets no skill-fence finding", () => {
  // Every input that fires on Claude Code, on a minimal-profile dialect.
  for (const declared of [null, [], ["WebFetch"]] as const) {
    assert.equal(
      skillTrifectaIssue(declared, codexDialect),
      null,
      JSON.stringify(declared),
    );
  }
  assert.equal(
    skillTrifectaIssue(["WebFetch"], codexDialect, {
      contractUnreadable: true,
    }),
    null,
  );
  assert.equal(dialectSupportsSkillFence(codexDialect), false);
});

test("…and the Claude Code path is untouched by that gate", () => {
  // The QUIET half. A gate that suppressed everything would pass the test above
  // and silently delete the headline Safety detector.
  assert.equal(dialectSupportsSkillFence(claudeCodeDialect), true);
  assert.equal(skillTrifectaIssue(null, claudeCodeDialect)?.fence, "none");
  assert.equal(skillTrifectaIssue([], claudeCodeDialect)?.fence, "ineffective");
  assert.equal(
    skillTrifectaIssue(["WebFetch"], claudeCodeDialect)?.fence,
    "ineffective",
  );
  // …and a fence that really closes a leg is still clean, on the same dialect.
  assert.equal(
    skillTrifectaIssue(["WebFetch", "WebSearch", "Bash"], claudeCodeDialect),
    null,
  );
});
