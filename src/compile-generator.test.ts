/**
 * Tests for the generator → SKILL.md compiler: parsing a generator's source and
 * rendering steps / gates / branches / loops to markdown, plus verifying the
 * gate references it carries.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  compileGenerator,
  compileGeneratorSkill,
} from "./compile-generator.js";

const SRC = `
import { skill, act, checkpoint, finish, cmd } from "vigiles";
export default skill(function* () {
  yield act("Detect the project language");
  const lang = yield act("Classify the task");
  if (lang === "python") {
    yield checkpoint(cmd("pytest"));
  } else {
    yield checkpoint(cmd("npm test"));
  }
  for (const f of failures) {
    yield act("Fix the failing test");
  }
  yield finish(cmd("npm run build"));
});
`;

test("compileGenerator renders steps, gates, branches and loops to markdown", () => {
  const { markdown, errors } = compileGenerator(SRC, {
    basePath: process.cwd(),
  });
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.match(markdown, /Detect the project language/);
  assert.ok(markdown.includes('### If lang === "python"'));
  assert.ok(markdown.includes("### Otherwise"));
  assert.ok(markdown.includes("### Repeat (for each item in failures)"));
  assert.match(markdown, /<!-- vigiles:gate "pytest" -->/);
  assert.match(markdown, /<!-- vigiles:gate "npm test" -->/);
  assert.match(markdown, /## Result/);
  assert.match(markdown, /<!-- vigiles:result "npm run build" -->/);
});

test("compileGenerator verifies gate references (catches a missing script)", () => {
  const bad = `
    import { skill, checkpoint, cmd } from "vigiles";
    export default skill(function* () {
      yield checkpoint(cmd("npm run does-not-exist"));
    });
  `;
  const { errors } = compileGenerator(bad, { basePath: process.cwd() });
  assert.ok(errors.some((e) => e.type === "stale-command"));
});

test("compileGenerator catches a missing file gate", () => {
  const bad = `
    import { skill, finish, file } from "vigiles";
    export default skill(function* () {
      yield finish(file("does/not/exist.txt"));
    });
  `;
  const { errors } = compileGenerator(bad, { basePath: process.cwd() });
  assert.ok(errors.some((e) => e.type === "stale-file"));
});

test("compileGenerator prepends frontmatter when provided", () => {
  const src = `
    import { skill, finish, cmd } from "vigiles";
    export default skill(function* () { yield finish(cmd("npm test")); });
  `;
  const { markdown } = compileGenerator(src, {
    basePath: process.cwd(),
    frontmatter: "---\nname: demo\n---",
  });
  assert.ok(markdown.startsWith("---\nname: demo\n---"));
  assert.match(markdown, /## Result/);
});

test("compileGenerator reports when there is no generator", () => {
  const { errors } = compileGenerator("export const x = 1;");
  assert.ok(errors.some((e) => /No generator/.test(e.message)));
});

const GEN_SKILL = `
import { genSkill, act, finish } from "vigiles/skill";
import { cmd } from "vigiles/spec";
export default genSkill(
  { name: "ship-pr", description: "Open a PR once tests pass", disableModelInvocation: true },
  function* () {
    yield act("Make the change");
    yield finish(cmd("npm test"));
  },
);
`;

test("compileGeneratorSkill renders frontmatter + body + integrity hash", () => {
  const { markdown, errors } = compileGeneratorSkill(GEN_SKILL, {
    basePath: process.cwd(),
    specFile: "skills/x/SKILL.md.spec.ts",
  });
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.match(markdown, /^<!-- vigiles:sha256:[a-f0-9]+ compiled from/);
  assert.match(markdown, /name: ship-pr/);
  assert.match(markdown, /description: Open a PR once tests pass/);
  assert.match(markdown, /disable-model-invocation: true/);
  assert.match(markdown, /Make the change/);
  assert.match(markdown, /<!-- vigiles:result "npm test" -->/);
});

test("compileGeneratorSkill verifies gate refs and errors clearly without genSkill", () => {
  const bad = compileGeneratorSkill(
    GEN_SKILL.replace('cmd("npm test")', 'cmd("npm run nope")'),
    { basePath: process.cwd() },
  );
  assert.ok(bad.errors.some((e) => e.type === "stale-command"));

  const none = compileGeneratorSkill("export default 1;");
  assert.ok(none.errors.some((e) => /genSkill/.test(e.message)));
});
