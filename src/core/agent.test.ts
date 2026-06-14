/**
 * Tests for subagent spec compilation (src/spec.ts `agent()` + src/compile.ts
 * `compileAgent`). A subagent is a delegated worker with a contract — a tool
 * "rail" and rules — so compilation verifies the tool list and the body's
 * references, and emits frontmatter + an integrity hash. Model-free.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { agent, instructions, file, cmd, enforce, guidance } from "./spec.js";
import { compileAgent, adoptDiff } from "./compile.js";
import { claudeCodeDialect } from "../adapters/claude-code/dialect.js";
import { makeTmpDir, cleanupTmpDir } from "./test-utils.js";

test("agent() sets the spec type", () => {
  const a = agent({ name: "reviewer", description: "Review a diff." });
  assert.equal(a._specType, "agent");
  assert.equal(a.name, "reviewer");
});

test("compileAgent renders frontmatter (name/description/model/tools) + hash", () => {
  const { markdown, errors } = compileAgent(
    agent({
      name: "reviewer",
      description: "Review a diff for correctness.",
      model: "sonnet",
      tools: ["Read", "Grep", "Bash"],
      body: "You are a careful code reviewer.",
    }),
    { specFile: "agents/reviewer.md.spec.ts", dialect: claudeCodeDialect },
  );
  assert.deepEqual(errors, []);
  assert.match(markdown, /^<!-- vigiles:sha256:[a-f0-9]+ compiled from/);
  assert.match(markdown, /\nname: reviewer\n/);
  assert.match(markdown, /\ndescription: Review a diff for correctness\.\n/);
  assert.match(markdown, /\nmodel: sonnet\n/);
  assert.match(markdown, /\ntools: Read, Grep, Bash\n/);
  assert.match(markdown, /You are a careful code reviewer\./);
});

test("compileAgent: minimal agent omits model/tools and has no rules section", () => {
  const { markdown, errors } = compileAgent(
    agent({ name: "echo", description: "Echo things.", body: "Just echo." }),
    { specFile: "agents/echo.md.spec.ts", dialect: claudeCodeDialect },
  );
  assert.deepEqual(errors, []);
  assert.doesNotMatch(markdown, /\nmodel:/);
  assert.doesNotMatch(markdown, /\ntools:/);
  assert.doesNotMatch(markdown, /## Rules/);
});

test("compileAgent accepts built-in and MCP tools, flags unknown with a hint", () => {
  const ok = compileAgent(
    agent({
      name: "a",
      description: "d",
      tools: ["Read", "Task", "Skill", "mcp__github__issue_write"],
      body: "b",
    }),
    { specFile: "a.md.spec.ts", dialect: claudeCodeDialect },
  );
  assert.deepEqual(ok.errors, []);

  // a near-miss → "did you mean", and a far token → no hint
  const bad = compileAgent(
    agent({
      name: "a",
      description: "d",
      tools: ["Reed", "xyzzy123"],
      body: "b",
    }),
    { specFile: "a.md.spec.ts", dialect: claudeCodeDialect },
  );
  assert.equal(bad.errors.length, 2);
  const reed = bad.errors.find((e) => e.message.includes('"Reed"'));
  assert.ok(reed && reed.type === "unknown-tool");
  assert.match(reed.message, /Did you mean "Read"\?/);
  const far = bad.errors.find((e) => e.message.includes('"xyzzy123"'));
  assert.ok(far && !/Did you mean/.test(far.message)); // no close match → no hint
});

test("compileAgent flags tools that are never available to a subagent", () => {
  const { errors } = compileAgent(
    agent({
      name: "a",
      description: "d",
      tools: ["Read", "Agent", "ExitPlanMode"], // last two never reach a subagent
      body: "b",
    }),
    { specFile: "a.md.spec.ts", dialect: claudeCodeDialect },
  );
  assert.equal(errors.length, 2);
  assert.ok(
    errors.every((e) => /never available to a subagent/.test(e.message)),
  );
});

test("compileAgent verifies body references against the filesystem", () => {
  const dir = makeTmpDir("agent");
  try {
    writeFileSync(join(dir, "real.ts"), "export const x = 1;\n");
    const ok = compileAgent(
      agent({
        name: "a",
        description: "d",
        body: instructions`Read ${file("real.ts")}.`,
      }),
      { basePath: dir, specFile: "a.md.spec.ts", dialect: claudeCodeDialect },
    );
    assert.deepEqual(ok.errors, []);

    const stale = compileAgent(
      agent({
        name: "a",
        description: "d",
        body: instructions`Read ${file("missing.ts")} and run ${cmd("npm run nope")}.`,
      }),
      { basePath: dir, specFile: "a.md.spec.ts", dialect: claudeCodeDialect },
    );
    assert.ok(stale.errors.some((e) => e.type === "stale-file"));
  } finally {
    cleanupTmpDir(dir);
  }
});

test("compileAgent renders a Rules section the worker must follow", () => {
  const { markdown, errors } = compileAgent(
    agent({
      name: "a",
      description: "d",
      rules: {
        "no-floating": enforce(
          "@typescript-eslint/no-floating-promises",
          "Await promises.",
        ),
        "research-first": guidance("Check the docs before guessing."),
      },
    }),
    { specFile: "a.md.spec.ts", dialect: claudeCodeDialect },
  );
  assert.deepEqual(errors, []);
  assert.match(markdown, /## Rules/);
  assert.match(
    markdown,
    /\*\*Enforced by:\*\* `@typescript-eslint\/no-floating-promises`/,
  );
  assert.match(
    markdown,
    /\*\*Guidance only\*\* — Check the docs before guessing\./,
  );
});

test("compileAgent flags a bad spec filename", () => {
  const notSpec = compileAgent(agent({ name: "a", description: "d" }), {
    specFile: "agents/reviewer.md",
    dialect: claudeCodeDialect,
  });
  assert.ok(notSpec.errors.some((e) => e.type === "spec-name-mismatch"));

  const notMd = compileAgent(agent({ name: "a", description: "d" }), {
    specFile: "reviewer.spec.ts",
    dialect: claudeCodeDialect,
  });
  assert.ok(notMd.errors.some((e) => e.type === "spec-name-mismatch"));
});

test("dogfood: a real OSS subagent as a spec, with the tool rail it shipped WITHOUT", () => {
  // Reproduces the shape of wshobson's real `ui-visual-validator` subagent
  // (examples/harness/vendor/wshobson-accessibility@.../agents/ui-visual-validator.md):
  // model: sonnet, a multi-`##`-section role contract, and — critically — it
  // ships with NO `tools:` line, so it inherits EVERY tool (the #1 footgun). A
  // spec ADDS the least-privilege rail (read + run visual tests; never Edit/Write),
  // which compile verifies. This is the value-add over the hand-written original.
  const reviewer = agent({
    name: "ui-visual-validator",
    description:
      "Rigorous visual validation expert. Use PROACTIVELY to verify UI modifications achieved their goals.",
    model: "sonnet",
    tools: ["Read", "Grep", "Glob", "Bash"], // the rail the original omits
    body: "You are an experienced UI visual validation expert.",
    sections: {
      Purpose:
        "Verify UI modifications, design-system compliance, and accessibility through systematic visual analysis.",
      "Core Principles": [
        "- Default assumption: the goal has NOT been achieved until proven.\n",
        "- Base judgments solely on visual evidence, never code hints.",
      ],
      "Forbidden Behaviors":
        "- Assuming code changes automatically produce visual results.\n- Accepting 'looks different' as 'looks correct'.",
    },
  });

  const { markdown, errors } = compileAgent(reviewer, {
    specFile: "agents/ui-visual-validator.md.spec.ts",
    dialect: claudeCodeDialect,
  });

  assert.deepEqual(errors, []); // real content compiles clean; tools verified
  assert.match(markdown, /\nname: ui-visual-validator\n/);
  assert.match(markdown, /\nmodel: sonnet\n/);
  assert.match(markdown, /\ntools: Read, Grep, Glob, Bash\n/); // the added rail
  assert.doesNotMatch(markdown, /\btools:.*Edit/); // least-privilege: no Edit/Write
  assert.match(markdown, /## Purpose/);
  assert.match(markdown, /## Forbidden Behaviors/);
  assert.match(
    markdown,
    /You are an experienced UI visual validation expert\./,
  );
});

test("compileAgent rejects a section that clashes with the rules field", () => {
  const { errors } = compileAgent(
    agent({
      name: "a",
      description: "d",
      sections: { rules: "this should be the rules field" },
    }),
    { specFile: "a.md.spec.ts", dialect: claudeCodeDialect },
  );
  assert.ok(errors.some((e) => e.type === "reserved-section-key"));
});

test("compileAgent verifies refs inside sections", () => {
  const dir = makeTmpDir("agent-sections");
  try {
    const { errors } = compileAgent(
      agent({
        name: "a",
        description: "d",
        sections: {
          Workflow: instructions`First read ${file("missing.ts")}.`, // stale file
        },
      }),
      { basePath: dir, specFile: "a.md.spec.ts", dialect: claudeCodeDialect },
    );
    assert.ok(errors.some((e) => e.type === "stale-file"));
  } finally {
    cleanupTmpDir(dir);
  }
});

test("adoptDiff round-trips a compiled agent (valid hash, no changes)", () => {
  const dir = makeTmpDir("agent-adopt");
  try {
    const spec = agent({
      name: "reviewer",
      description: "Review a diff.",
      tools: ["Read", "Grep"],
      body: "Review carefully.",
    });
    const { markdown } = compileAgent(spec, {
      basePath: dir,
      specFile: "agents/reviewer.md.spec.ts",
      dialect: claudeCodeDialect,
    });
    writeFileSync(join(dir, "agents-reviewer.md"), markdown);
    const res = adoptDiff("agents-reviewer.md", spec, dir, claudeCodeDialect);
    assert.equal(res.changed, false);
    assert.equal(res.hasHash, true);
  } finally {
    cleanupTmpDir(dir);
  }
});
