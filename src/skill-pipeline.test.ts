/**
 * Tests for the gated skill pipeline: typed inputs → argument-hint, gated
 * steps → vigiles:gate markers, and the result postcondition gate. Gate
 * references are verified against the project at compile time.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { skill, step, input, cmd, file } from "./spec.js";
import { compileSkill } from "./compile.js";

const opts = { specFile: "SKILL.md.spec.ts" };

test("typed inputs compile to argument-hint and an Arguments section", () => {
  const spec = skill({
    name: "ship-pr",
    description: "Run checks and open a PR",
    inputs: [
      input("branch", "the branch to open the PR from"),
      input("title", "PR title", { required: false }),
    ],
    steps: [step("Open the pull request.")],
  });
  const { markdown, errors } = compileSkill(spec, opts);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.match(markdown, /argument-hint: <branch> \[<title>\]/);
  assert.match(markdown, /## Arguments/);
  assert.match(
    markdown,
    /- `\$1` \*\*branch\*\* — the branch to open the PR from/,
  );
  assert.match(markdown, /- `\$2` \*\*title\*\* _\(optional\)_ — PR title/);
});

test("gated steps render gate markers + retry; result renders a result marker", () => {
  const spec = skill({
    name: "ship-pr",
    description: "Run checks and open a PR once they pass",
    steps: [
      step("Run the linter and fix any reported issues.", {
        gate: cmd("npm run lint"),
      }),
      step("Run the test suite; fix failures until green.", {
        gate: cmd("npm test"),
        retry: 3,
      }),
      step("Open the pull request."),
    ],
    result: cmd("npm test"),
  });
  const { markdown, errors } = compileSkill(spec, opts);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.match(markdown, /<!-- vigiles:gate "npm run lint" -->/);
  assert.match(markdown, /<!-- vigiles:gate "npm test" retry:3 -->/);
  assert.match(markdown, /## Result/);
  assert.match(markdown, /<!-- vigiles:result "npm test" -->/);
});

test("a step gate referencing a missing npm script is a compile error", () => {
  const spec = skill({
    name: "x",
    description: "...",
    steps: [step("do a thing", { gate: cmd("npm run does-not-exist") })],
  });
  const { errors } = compileSkill(spec, opts);
  assert.ok(
    errors.some((e) => e.type === "stale-command"),
    "expected a stale-command error for the missing script",
  );
});

test("a file gate referencing a missing path is a compile error", () => {
  const spec = skill({
    name: "x",
    description: "...",
    result: file("does/not/exist.txt"),
  });
  const { errors } = compileSkill(spec, opts);
  assert.ok(
    errors.some((e) => e.type === "stale-file"),
    "expected a stale-file error for the missing result file",
  );
});
