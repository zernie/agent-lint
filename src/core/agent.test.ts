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

import {
  agent,
  skill,
  instructions,
  effect,
  file,
  cmd,
  enforce,
  guidance,
} from "./spec.js";
import { compileAgent, compileSkill, adoptDiff } from "./compile.js";
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

test("compileAgent renders color + disallowedTools (deny-side, no allowlist)", () => {
  // disallowedTools is the inherit-all-minus-a-few form — used INSTEAD of a `tools`
  // allowlist (with an allowlist it would be redundant), so no `tools` here.
  const { markdown, errors } = compileAgent(
    agent({
      name: "broad-worker",
      description: "Does most things but never shells out.",
      model: "opus",
      color: "pink",
      disallowedTools: ["Bash"], // subtract from inherit-all
      body: "Work, but no Bash.",
    }),
    { specFile: "agents/broad-worker.md.spec.ts", dialect: claudeCodeDialect },
  );
  assert.deepEqual(errors, []);
  assert.match(markdown, /\ncolor: pink\n/);
  assert.match(markdown, /\ndisallowedTools: Bash\n/);
});

test("compileAgent flags a disallowedTools entry that's a close typo (blocks nothing)", () => {
  const { errors } = compileAgent(
    agent({
      name: "x",
      description: "y",
      tools: ["Read"],
      disallowedTools: ["Wrte"], // typo of Write → would block nothing
      body: "b",
    }),
    { specFile: "agents/x.md.spec.ts", dialect: claudeCodeDialect },
  );
  assert.ok(
    errors.some((e) => /Wrte/.test(e.message) && /Write/.test(e.message)),
  );
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

// ---------------------------------------------------------------------------
// purity floor contract — compileAgent
// ---------------------------------------------------------------------------

test('purity: "pure" agent with read-only tools compiles clean', () => {
  const { errors } = compileAgent(
    agent({
      name: "analyzer",
      description: "Analyze code without mutating.",
      purity: "pure",
      tools: ["Read", "Grep", "Glob"],
      body: "Analyze only.",
    }),
    { specFile: "agents/analyzer.md.spec.ts", dialect: claudeCodeDialect },
  );
  assert.deepEqual(errors, []);
});

test('purity: "pure" agent with a side-effecting tool errors, naming the tool', () => {
  const { errors } = compileAgent(
    agent({
      name: "bad",
      description: "Tries to write.",
      purity: "pure",
      tools: ["Read", "Write"],
      body: "b",
    }),
    { specFile: "agents/bad.md.spec.ts", dialect: claudeCodeDialect },
  );
  const pureErrors = errors.filter((e) => e.type === "purity-violation");
  assert.equal(pureErrors.length, 1);
  assert.match(pureErrors[0].message, /"Write"/);
  assert.match(pureErrors[0].message, /side-effecting/);
});

test('purity: "pure" agent with Bash errors', () => {
  const { errors } = compileAgent(
    agent({
      name: "bad",
      description: "Runs bash.",
      purity: "pure",
      tools: ["Read", "Bash"],
      body: "b",
    }),
    { specFile: "agents/bad.md.spec.ts", dialect: claudeCodeDialect },
  );
  const pureErrors = errors.filter((e) => e.type === "purity-violation");
  assert.ok(pureErrors.length > 0);
  assert.match(pureErrors[0].message, /"Bash"/);
});

test('purity: "pure" agent with an unknown/MCP tool errors', () => {
  const { errors } = compileAgent(
    agent({
      name: "bad",
      description: "Uses MCP.",
      purity: "pure",
      tools: ["Read", "mcp__github__issue_write"],
      body: "b",
    }),
    { specFile: "agents/bad.md.spec.ts", dialect: claudeCodeDialect },
  );
  const pureErrors = errors.filter((e) => e.type === "purity-violation");
  assert.ok(pureErrors.length > 0);
  assert.match(pureErrors[0].message, /unknown effect class/);
});

test('purity: "pure" agent with wildcard tools errors', () => {
  const { errors } = compileAgent(
    agent({
      name: "bad",
      description: "Inherits all.",
      purity: "pure",
      tools: ["*"],
      body: "b",
    }),
    { specFile: "agents/bad.md.spec.ts", dialect: claudeCodeDialect },
  );
  const pureErrors = errors.filter((e) => e.type === "purity-violation");
  assert.ok(pureErrors.length > 0);
  assert.match(pureErrors[0].message, /inherits-all/);
});

test('purity: "pure" agent with NO tools list errors (absent = inherits-all)', () => {
  const { errors } = compileAgent(
    agent({
      name: "bad",
      description: "Pure but no tools — inherits everything.",
      purity: "pure",
      body: "b",
    }),
    { specFile: "agents/bad.md.spec.ts", dialect: claudeCodeDialect },
  );
  const pureErrors = errors.filter((e) => e.type === "purity-violation");
  assert.ok(pureErrors.length > 0);
  assert.match(pureErrors[0].message, /inherits-all/);
});

test('purity: "bounded" allows decidable side-effecting tools AND Bash (runtime-gated)', () => {
  // Write/Edit are fine in a bounded unit — effects confined to the boundary.
  const ok = compileAgent(
    agent({
      name: "editor",
      description: "Edits within a boundary.",
      purity: "bounded",
      tools: ["Read", "Write", "Edit"],
      body: "b",
    }),
    { specFile: "agents/editor.md.spec.ts", dialect: claudeCodeDialect },
  );
  assert.deepEqual(
    ok.errors.filter((e) => e.type === "purity-violation"),
    [],
  );

  // Bash is decidable at the COMMAND level (isReadOnlyBash), so a bounded unit
  // may declare it — the runtime `decidePurityGate` confines it (read-only Bash
  // allowed, mutating Bash denied), not compile.
  const withBash = compileAgent(
    agent({
      name: "editor2",
      description: "Observes via Bash.",
      purity: "bounded",
      tools: ["Read", "Write", "Bash"],
      body: "b",
    }),
    { specFile: "agents/editor2.md.spec.ts", dialect: claudeCodeDialect },
  );
  assert.deepEqual(
    withBash.errors.filter((e) => e.type === "purity-violation"),
    [],
  );

  // But MCP / unknown-effect tools stay barred at the bounded floor.
  const bad = compileAgent(
    agent({
      name: "editor3",
      description: "Tries an MCP tool.",
      purity: "bounded",
      tools: ["Read", "mcp__srv__tool"],
      body: "b",
    }),
    { specFile: "agents/editor3.md.spec.ts", dialect: claudeCodeDialect },
  );
  const boundedErrors = bad.errors.filter((e) => e.type === "purity-violation");
  assert.ok(boundedErrors.length > 0);
});

test("compileAgent emits a vigiles:purity marker the runtime gate reads", () => {
  const { markdown } = compileAgent(
    agent({
      name: "editor",
      description: "Edits within a boundary.",
      purity: "bounded",
      tools: ["Read", "Write"],
      body: "b",
    }),
    { specFile: "agents/editor.md.spec.ts", dialect: claudeCodeDialect },
  );
  assert.match(markdown, /<!--\s*vigiles:purity:bounded\s*-->/);

  // dangerously-unrestricted maps to the neutral runtime level `unrestricted`.
  const loud = compileAgent(
    agent({
      name: "writer",
      description: "Writes.",
      purity: "dangerously-unrestricted",
      tools: ["Read", "Write", "Bash"],
      body: "b",
    }),
    { specFile: "agents/writer.md.spec.ts", dialect: claudeCodeDialect },
  );
  assert.match(loud.markdown, /<!--\s*vigiles:purity:unrestricted\s*-->/);

  // no purity declared → no marker.
  const plain = compileAgent(
    agent({ name: "plain", description: "No floor.", body: "b" }),
    { specFile: "agents/plain.md.spec.ts", dialect: claudeCodeDialect },
  );
  assert.doesNotMatch(plain.markdown, /vigiles:purity/);
});

test('purity: "dangerously-unrestricted" / omitted + side-effecting tools compiles (no enforcement)', () => {
  // omitted
  const omitted = compileAgent(
    agent({
      name: "writer",
      description: "Writes files.",
      tools: ["Read", "Write", "Bash"],
      body: "b",
    }),
    { specFile: "agents/writer.md.spec.ts", dialect: claudeCodeDialect },
  );
  assert.deepEqual(
    omitted.errors.filter((e) => e.type === "purity-violation"),
    [],
  );

  // explicit escape hatch
  const escaped = compileAgent(
    agent({
      name: "writer2",
      description: "Writes files.",
      purity: "dangerously-unrestricted",
      tools: ["Read", "Write", "Bash"],
      body: "b",
    }),
    { specFile: "agents/writer2.md.spec.ts", dialect: claudeCodeDialect },
  );
  assert.deepEqual(
    escaped.errors.filter((e) => e.type === "purity-violation"),
    [],
  );
});

// ---------------------------------------------------------------------------
// purity floor contract — compileSkill
// ---------------------------------------------------------------------------

test('purity: "pure" skill with read-only tools compiles clean', () => {
  const { errors } = compileSkill(
    skill({
      name: "review",
      description: "Review code.",
      purity: "pure",
      tools: ["Read", "Grep"],
      body: "Review.",
    }),
    { specFile: "SKILL.md.spec.ts", dialect: claudeCodeDialect },
  );
  assert.deepEqual(
    errors.filter((e) => e.type === "purity-violation"),
    [],
  );
});

test('purity: "pure" skill with a side-effecting tool errors', () => {
  const { errors } = compileSkill(
    skill({
      name: "bad",
      description: "Writes stuff.",
      purity: "pure",
      tools: ["Read", "Write"],
      body: "b",
    }),
    { specFile: "SKILL.md.spec.ts", dialect: claudeCodeDialect },
  );
  const pureErrors = errors.filter((e) => e.type === "purity-violation");
  assert.equal(pureErrors.length, 1);
  assert.match(pureErrors[0].message, /"Write"/);
});

test('purity: "pure" skill with no tools declared errors (absent = inherits-all)', () => {
  const { errors } = compileSkill(
    skill({
      name: "noop",
      description: "Claims pure but inherits all tools.",
      purity: "pure",
      body: "Just think.",
    }),
    { specFile: "SKILL.md.spec.ts", dialect: claudeCodeDialect },
  );
  const pureErrors = errors.filter((e) => e.type === "purity-violation");
  assert.ok(pureErrors.length > 0);
  assert.match(pureErrors[0].message, /inherits-all/);
});

test('purity: "pure" skill with wildcard tools errors', () => {
  const { errors } = compileSkill(
    skill({
      name: "bad",
      description: "Wildcard.",
      purity: "pure",
      tools: ["*"],
      body: "b",
    }),
    { specFile: "SKILL.md.spec.ts", dialect: claudeCodeDialect },
  );
  const pureErrors = errors.filter((e) => e.type === "purity-violation");
  assert.ok(pureErrors.length > 0);
  assert.match(pureErrors[0].message, /inherits-all/);
});

test("effect() body compiles to <!-- vigiles:effect --> markers in a skill", () => {
  const { markdown } = compileSkill(
    skill({
      name: "release",
      description: "Cut a release.",
      body: instructions`
        ## Prepare (pure)
        Read ${file("package.json")} first.

        ## Apply
        ${effect`
          Side effects allowed ONLY here:
          - write the changelog
          - tag the version
        `}
      `,
    }),
    { basePath: process.cwd() },
  );
  assert.ok(
    markdown.includes("<!-- vigiles:effect -->"),
    "should include effect open marker",
  );
  assert.ok(
    markdown.includes("<!-- /vigiles:effect -->"),
    "should include effect close marker",
  );
  assert.ok(
    markdown.includes("`package.json`"),
    "should still render outer file ref",
  );
});

test("effect() with a bad inner file ref reports stale-file error", () => {
  const { errors } = compileSkill(
    skill({
      name: "release",
      description: "Cut a release.",
      body: instructions`
        ${effect`write ${file("nonexistent-xyz.md")}`}
      `,
    }),
    { basePath: process.cwd() },
  );
  const stale = errors.filter((e) => e.type === "stale-file");
  assert.ok(
    stale.length > 0,
    "should report stale-file for bad ref inside effect()",
  );
});
