/**
 * Coverage proof: drive the ported community skills deterministically with a
 * scripted model and assert their control flow. If these (esp. pr-review-loop)
 * run and assert cleanly, the generator form + skill-test cover the deep tail.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { runSkill, scriptModel } from "./skill-test.js";
import { compileGenerator } from "./compile-generator.js";
import { prReviewLoop, tdd, subagentDriven } from "./community-skills.js";

const rounds = (r: { acts: readonly { prose: string }[] }, needle: string) =>
  r.acts.filter((a) => a.prose.includes(needle)).length;

test("pr-review-loop: bounded rounds with a quality-weighted exit", () => {
  const r = runSkill(prReviewLoop, {
    model: scriptModel({
      "next p1/p2 finding": ["finding-A", "done", "done"],
      "run ci": "pass",
      actionable: ["yes", "no"], // round 1: more; round 2: clean → exit
    }),
  });
  assert.equal(r.ok, true);
  assert.equal(rounds(r, "Collect"), 2);
  assert.equal(r.gates.at(-1)?.terminal, true);
});

test("pr-review-loop: hits the 7-round ceiling when feedback never clears", () => {
  const r = runSkill(prReviewLoop, {
    model: scriptModel({
      "next p1/p2 finding": "done",
      "run ci": "pass",
      actionable: "yes", // always more → only the ceiling stops it
    }),
  });
  assert.equal(r.ok, true);
  assert.equal(rounds(r, "Collect"), 7);
});

test("tdd: one red-green-refactor cycle per behavior", () => {
  const r = runSkill(tdd, {
    model: scriptModel({ "next behavior": ["feat-1", "feat-2", "done"] }),
  });
  assert.equal(r.ok, true);
  assert.equal(rounds(r, "RED"), 2); // two behaviors
  // each behavior ran two gates (green + refactor); plus the terminal result
  assert.equal(r.gates.length, 2 * 2 + 1);
});

test("subagent-driven: per-task nested bounded review loops", () => {
  const r = runSkill(subagentDriven, {
    model: scriptModel({
      "next task": ["task-1", "done"],
      "review the spec": "yes",
      "quality review": ["no", "yes"], // first quality review fails, retry passes
    }),
  });
  assert.equal(r.ok, true);
  assert.equal(rounds(r, "quality review"), 2); // retried once
});

test("the pr-review-loop generator (real source) compiles to nested markdown", () => {
  // Compile the actual .ts source — prReviewLoop is the first generator in it.
  const src = readFileSync("src/community-skills.ts", "utf-8");
  const { markdown, errors } = compileGenerator(src, {
    basePath: process.cwd(),
  });
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.ok(markdown.includes("### Repeat"), "loops render as Repeat sections");
  assert.ok(markdown.includes("Collect all review comments"));
  assert.match(markdown, /## Result/);
  assert.match(markdown, /<!-- vigiles:result "true" -->/);
});
