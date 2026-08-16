/**
 * Tests for the gated skill pipeline: typed inputs → argument-hint, gated
 * steps → vigiles:gate markers, and the result postcondition gate. Gate
 * references are verified against the project at compile time.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import { experimental_skill, cmd, file } from "../../core/spec.js";
import { compileSkill } from "../../core/compile.js";

const opts = { specFile: "SKILL.md.spec.ts" };

test("typed inputs compile to argument-hint and an Arguments section", () => {
  const spec = experimental_skill({
    name: "ship-pr",
    description: "Run checks and open a PR",
    inputs: [
      experimental_skill.input("branch", "the branch to open the PR from"),
      experimental_skill.input("title", "PR title", { required: false }),
    ],
    steps: [experimental_skill.step("Open the pull request.")],
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
  const spec = experimental_skill({
    name: "ship-pr",
    description: "Run checks and open a PR once they pass",
    steps: [
      experimental_skill.step("Run the linter and fix any reported issues.", {
        gate: cmd("npm run lint"),
      }),
      experimental_skill.step("Run the test suite; fix failures until green.", {
        gate: cmd("npm test"),
        retry: 3,
      }),
      experimental_skill.step("Open the pull request."),
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
  const spec = experimental_skill({
    name: "x",
    description: "...",
    steps: [
      experimental_skill.step("do a thing", {
        gate: cmd("npm run does-not-exist"),
      }),
    ],
  });
  const { errors } = compileSkill(spec, opts);
  assert.ok(
    errors.some((e) => e.type === "stale-command"),
    "expected a stale-command error for the missing script",
  );
});

test("a file gate referencing a missing path is a compile error", () => {
  const spec = experimental_skill({
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

test("a knowledge body composes with gated steps (both render, body first)", () => {
  const spec = experimental_skill({
    name: "docx",
    description: "...",
    body: "## Reference\n\nImportant domain knowledge here.",
    steps: [experimental_skill.step("do it", { gate: cmd("npm test") })],
    result: cmd("npm test"),
  });
  const { markdown, errors } = compileSkill(spec, opts);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.match(markdown, /## Reference/);
  assert.match(markdown, /Important domain knowledge/);
  assert.match(markdown, /## Steps/);
  assert.ok(markdown.indexOf("## Reference") < markdown.indexOf("## Steps"));
});

test("a large inline code block warns (non-blocking), nudging extraction to a file", () => {
  const big = "```bash\n" + Array(25).fill("echo line").join("\n") + "\n```";
  const { errors, warnings } = compileSkill(
    experimental_skill({ name: "x", description: "...", body: big }),
    opts,
  );
  // It's a WARNING, not an error — adoption must still compile.
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.ok(
    warnings.some(
      (e) =>
        e.type === "inline-code-too-long" &&
        /extracting it to a file/.test(e.message),
    ),
    "expected a too-long inline code block warning",
  );
});

test("small code blocks pass; maxInlineCodeLines:0 disables the check", () => {
  const small = "```bash\necho a\necho b\n```";
  const smallRes = compileSkill(
    experimental_skill({ name: "x", description: "...", body: small }),
    opts,
  );
  assert.equal(smallRes.errors.length, 0);
  assert.equal(smallRes.warnings.length, 0, JSON.stringify(smallRes.warnings));
  // A big block normally warns; maxInlineCodeLines:0 turns the check off entirely.
  const big = "```bash\n" + Array(50).fill("echo x").join("\n") + "\n```";
  const offRes = compileSkill(
    experimental_skill({
      name: "x",
      description: "...",
      body: big,
      maxInlineCodeLines: 0,
    }),
    opts,
  );
  assert.equal(offRes.errors.length, 0);
  assert.equal(offRes.warnings.length, 0, JSON.stringify(offRes.warnings));
});

test("a script-runner gate verifies the referenced script file exists", () => {
  const okRes = compileSkill(
    experimental_skill({
      name: "x",
      description: "...",
      steps: [
        experimental_skill.step("run it", {
          gate: cmd("python src/core/compile.ts"),
        }),
      ],
    }),
    opts,
  );
  assert.equal(okRes.errors.length, 0, JSON.stringify(okRes.errors));

  const badRes = compileSkill(
    experimental_skill({
      name: "x",
      description: "...",
      steps: [
        experimental_skill.step("run it", {
          gate: cmd("python scripts/nope.py out.x"),
        }),
      ],
    }),
    opts,
  );
  assert.ok(
    badRes.errors.some(
      (e) =>
        e.type === "stale-command" && e.message.includes("scripts/nope.py"),
    ),
    "expected a stale-command error for the missing script",
  );
});
