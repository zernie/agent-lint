/**
 * `brokenSkillRefs` — the near-miss rule, and the four ways a naive version
 * turns into noise. Pure: synthesized skills, no filesystem, no model.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import { brokenSkillRefs, formatSkillRefIssue } from "./skill-refs.js";

const s = (name: string, content: string) => ({
  name,
  path: `.claude/skills/${name}/SKILL.md`,
  content,
});

test("a renamed sibling is caught, and the intended target is named", () => {
  const issues = brokenSkillRefs([
    s("orchestrator", "First run `verify-citation`, then stop."),
    s("verify-citations", "…"),
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.missing, "verify-citation");
  assert.equal(issues[0]?.didYouMean, "verify-citations");
  assert.match(formatSkillRefIssue(issues[0]!), /no such skill exists/);
});

test("ordinary hyphenated prose does NOT fire — the whole reason for near-miss", () => {
  // `node-fetch` and `pull-request` are nowhere near the skill names. A rule that
  // flagged every backticked kebab token would fire on both, and a checker that
  // fires on clean input is muted within a day.
  const issues = brokenSkillRefs([
    s("draft-paper", "Install `node-fetch` and open a `pull-request` in `claude-code`."),
    s("verify-citations", "…"),
  ]);
  assert.deepEqual(issues, []);
});

test("a reference to a skill that DOES exist is not an issue", () => {
  const issues = brokenSkillRefs([
    s("a", "compose with `verify-citations`"),
    s("verify-citations", "…"),
  ]);
  assert.deepEqual(issues, []);
});

test("a skill naming ITSELF is normal and never reported", () => {
  // Every skill quotes its own id — in its header, its run command, its examples.
  const issues = brokenSkillRefs([s("draft-paper", "run `draft-paper` like so")]);
  assert.deepEqual(issues, []);
});

test("the same broken name twice in one file reports once", () => {
  const issues = brokenSkillRefs([
    s("a", "`find-venu` … later `find-venu` again"),
    s("find-venue", "…"),
  ]);
  assert.equal(issues.length, 1);
});

test("a single word in backticks is never a reference", () => {
  // `true`, `--force`, `null` — a skill id has at least one hyphen, and single
  // tokens in backticks are overwhelmingly flags and fields.
  const issues = brokenSkillRefs([
    s("a", "pass `true` or `null` to `render`"),
    s("render-paper", "…"),
  ]);
  assert.deepEqual(issues, []);
});

test("the near-miss is measured against OTHER skills, not the referrer itself", () => {
  // `draft-papers` is one edit from `draft-paper` — but that IS the referrer, and
  // a skill that mistypes its own name should not be told "did you mean yourself".
  // It must match the other skill, or nothing.
  const issues = brokenSkillRefs([
    s("draft-paper", "see `draft-papers`"),
  ]);
  assert.deepEqual(issues, []);
});
