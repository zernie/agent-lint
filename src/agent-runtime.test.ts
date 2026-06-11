/**
 * Tests for the agent runtime (src/agent-runtime.ts) — the PreToolUse
 * tool-contract rail. A subagent's `tools:` frontmatter is documentation, not a
 * runtime boundary (Claude Code #54898); this hook turns it into enforcement by
 * blocking any tool outside the active agent's compiled allowlist. Model-free:
 * the decision logic is pure and the runtime ops are plain filesystem.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import { agent } from "./spec.js";
import { compileAgent } from "./compile.js";
import {
  parseAgentTools,
  decidePreToolUse,
  setActiveAgent,
  readActiveAgent,
  clearActiveAgent,
  evaluatePreToolUse,
} from "./agent-runtime.js";
import { makeTmpDir, cleanupTmpDir } from "./test-utils.js";
import { runHook } from "./run-hook.js";
import { writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// parseAgentTools — read the contract back out of compiled markdown
// ---------------------------------------------------------------------------

test("parseAgentTools reads the tools list from compiled frontmatter", () => {
  const { markdown } = compileAgent(
    agent({
      name: "reviewer",
      description: "Review a diff.",
      tools: ["Read", "Grep", "Bash"],
      body: "b",
    }),
    { specFile: "a.md.spec.ts" },
  );
  assert.deepEqual(parseAgentTools(markdown), ["Read", "Grep", "Bash"]);
});

test("parseAgentTools returns null when no tools: line (inherit-all)", () => {
  const { markdown } = compileAgent(
    agent({ name: "a", description: "d", body: "b" }),
    { specFile: "a.md.spec.ts" },
  );
  assert.equal(parseAgentTools(markdown), null);
});

test("parseAgentTools returns [] for an empty tools list", () => {
  // Hand-built frontmatter: a `tools:` line with nothing after it.
  const md = [
    "---",
    "",
    "name: a",
    "description: d",
    "tools:",
    "",
    "---",
    "",
    "body",
  ].join("\n");
  assert.deepEqual(parseAgentTools(md), []);
});

test("parseAgentTools returns null when there is no frontmatter", () => {
  assert.equal(parseAgentTools("# just a heading\n\ntools: Read\n"), null);
});

test("parseAgentTools ignores a `tools:` line in the body, only reads frontmatter", () => {
  const md = [
    "---",
    "name: a",
    "description: d",
    "tools: Read",
    "---",
    "",
    "Here the prose mentions tools: Write, Edit which must be ignored.",
  ].join("\n");
  assert.deepEqual(parseAgentTools(md), ["Read"]);
});

// ---------------------------------------------------------------------------
// decidePreToolUse — the pure rail
// ---------------------------------------------------------------------------

test("decidePreToolUse allows a tool inside the contract", () => {
  const d = decidePreToolUse(["Read", "Grep"], "Read");
  assert.equal(d.allow, true);
  assert.equal(d.message, "");
});

test("decidePreToolUse blocks a tool outside the contract, naming the allowlist", () => {
  const d = decidePreToolUse(["Read", "Grep"], "Write");
  assert.equal(d.allow, false);
  assert.match(d.message, /"Write" is not in this subagent's allowed-tools/);
  assert.match(d.message, /Read, Grep/);
});

test("decidePreToolUse with null allowlist imposes no restriction (inherit-all)", () => {
  assert.equal(decidePreToolUse(null, "Bash").allow, true);
});

test("decidePreToolUse with an empty allowlist denies everything", () => {
  const d = decidePreToolUse([], "Read");
  assert.equal(d.allow, false);
  assert.match(d.message, /\(none\)/);
});

test("decidePreToolUse matches MCP tools exactly", () => {
  const allowed = ["Read", "mcp__github__issue_write"];
  assert.equal(
    decidePreToolUse(allowed, "mcp__github__issue_write").allow,
    true,
  );
  assert.equal(
    decidePreToolUse(allowed, "mcp__github__delete_file").allow,
    false,
  );
});

// ---------------------------------------------------------------------------
// active-agent tracking
// ---------------------------------------------------------------------------

test("setActiveAgent / readActiveAgent / clearActiveAgent round-trip", () => {
  const dir = makeTmpDir("agent-active");
  try {
    assert.equal(readActiveAgent(dir), null);
    setActiveAgent(dir, "agents/reviewer.md");
    assert.equal(readActiveAgent(dir), "agents/reviewer.md");
    clearActiveAgent(dir);
    assert.equal(readActiveAgent(dir), null);
    // clearing again is a no-op, not an error
    clearActiveAgent(dir);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("readActiveAgent tolerates a malformed marker file", () => {
  const dir = makeTmpDir("agent-active-bad");
  try {
    setActiveAgent(dir, "x"); // creates .vigiles/active-agent.json
    writeFileSync(join(dir, ".vigiles", "active-agent.json"), "{ not json");
    assert.equal(readActiveAgent(dir), null);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("readActiveAgent returns null when the marker lacks a string agent field", () => {
  const dir = makeTmpDir("agent-active-shape");
  try {
    setActiveAgent(dir, "x");
    writeFileSync(
      join(dir, ".vigiles", "active-agent.json"),
      JSON.stringify({ agent: 42 }),
    );
    assert.equal(readActiveAgent(dir), null);
  } finally {
    cleanupTmpDir(dir);
  }
});

// ---------------------------------------------------------------------------
// evaluatePreToolUse — the wired hook decision against the compiled .md
// ---------------------------------------------------------------------------

test("evaluatePreToolUse blocks an out-of-contract tool for the active agent", () => {
  const dir = makeTmpDir("agent-eval");
  try {
    const { markdown } = compileAgent(
      agent({
        name: "reviewer",
        description: "Review a diff.",
        tools: ["Read", "Grep"], // no Write/Edit/Bash
        body: "b",
      }),
      { basePath: dir, specFile: "agents/reviewer.md.spec.ts" },
    );
    writeFileSync(join(dir, "reviewer.md"), markdown);
    setActiveAgent(dir, "reviewer.md");

    assert.equal(evaluatePreToolUse(dir, "Read").allow, true);
    const blocked = evaluatePreToolUse(dir, "Write");
    assert.equal(blocked.allow, false);
    assert.match(blocked.message, /allowed-tools contract/);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("evaluatePreToolUse allows anything when no agent is active", () => {
  const dir = makeTmpDir("agent-eval-none");
  try {
    assert.equal(evaluatePreToolUse(dir, "Bash").allow, true);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("evaluatePreToolUse allows when the active agent's .md is missing", () => {
  const dir = makeTmpDir("agent-eval-missing");
  try {
    setActiveAgent(dir, "agents/ghost.md");
    assert.equal(evaluatePreToolUse(dir, "Write").allow, true);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("evaluatePreToolUse allows everything for an inherit-all agent", () => {
  const dir = makeTmpDir("agent-eval-inherit");
  try {
    const { markdown } = compileAgent(
      agent({ name: "open", description: "d", body: "b" }), // no tools: line
      { basePath: dir, specFile: "agents/open.md.spec.ts" },
    );
    writeFileSync(join(dir, "open.md"), markdown);
    setActiveAgent(dir, "open.md");
    assert.equal(evaluatePreToolUse(dir, "Bash").allow, true);
  } finally {
    cleanupTmpDir(dir);
  }
});

// ---------------------------------------------------------------------------
// The differentiator's invariant: hook ⇄ allowlist agree
// ---------------------------------------------------------------------------

test("the rail the hook enforces is exactly the declared contract (round-trip)", () => {
  // The whole point of #54898: the `tools:` field documents intent but doesn't
  // enforce it. vigiles compiles ONE source (spec.tools) into BOTH the
  // frontmatter (intent) AND the list the PreToolUse hook reads (enforcement),
  // so the two cannot drift. Prove it: compile → parse the frontmatter the hook
  // will read → it equals the declared tools, and the hook allows exactly those.
  const declared = ["Read", "Grep", "Glob", "Bash"];
  const { markdown } = compileAgent(
    agent({
      name: "ui-visual-validator",
      description: "Validate UI visually.",
      tools: declared,
      body: "b",
    }),
    { specFile: "agents/ui-visual-validator.md.spec.ts" },
  );

  const enforced = parseAgentTools(markdown);
  assert.deepEqual(enforced, declared); // hook reads exactly what was declared

  for (const t of declared) {
    assert.equal(decidePreToolUse(enforced, t).allow, true);
  }
  for (const t of ["Write", "Edit", "Task", "WebFetch"]) {
    assert.equal(decidePreToolUse(enforced, t).allow, false); // the least-privilege rail
  }
});

// ---------------------------------------------------------------------------
// agent-hook (CLI): the real PreToolUse rail process
//
// Tool-event hooks are best proven at the cheap unit tier (CLAUDE.md: runHook
// is "the only tier that reaches every event incl. ... PreToolUse"): pipe a
// real synthesized PreToolUse event to the BUILT CLI hook and assert the
// block/allow decision — deterministic, no model, no flaky live tool call.
// Requires the build (npm test / coverage build it first), like src/cli.test.ts.
// ---------------------------------------------------------------------------

const CLI = resolve(__dirname, "..", "dist", "cli.js");

/** Set up a temp project with a compiled agent and mark it active. */
function projectWithActiveAgent(tools: string[]): string {
  const dir = makeTmpDir("agent-hook-cli");
  const { markdown } = compileAgent(
    agent({
      name: "reader",
      description: "read-only worker",
      tools,
      body: "b",
    }),
    { basePath: dir, specFile: "agents/reader.md.spec.ts" },
  );
  writeFileSync(join(dir, "reader.md"), markdown);
  setActiveAgent(dir, "reader.md");
  return dir;
}

test("agent-hook CLI blocks (exit 2) an out-of-contract tool", () => {
  const dir = projectWithActiveAgent(["Read", "Grep"]);
  try {
    const r = runHook(
      `node ${CLI} agent-hook`,
      {
        hook_event_name: "PreToolUse",
        tool_name: "Write",
        tool_input: { file_path: "x.ts" },
      },
      { cwd: dir },
    );
    assert.equal(r.blocked, true);
    assert.equal(r.exitCode, 2);
    assert.match(r.stderr, /allowed-tools contract/);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("agent-hook CLI allows (exit 0) an in-contract tool", () => {
  const dir = projectWithActiveAgent(["Read", "Grep"]);
  try {
    const r = runHook(
      `node ${CLI} agent-hook`,
      {
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: { file_path: "x.ts" },
      },
      { cwd: dir },
    );
    assert.equal(r.blocked, false);
    assert.equal(r.exitCode, 0);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("agent-hook CLI allows when no agent is active", () => {
  const dir = makeTmpDir("agent-hook-none");
  try {
    const r = runHook(
      `node ${CLI} agent-hook`,
      {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "rm -rf /" },
      },
      { cwd: dir },
    );
    assert.equal(r.blocked, false);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("agent-hook CLI allows on a malformed/empty event (no tool name)", () => {
  const dir = projectWithActiveAgent(["Read"]);
  try {
    const r = runHook(`node ${CLI} agent-hook`, {}, { cwd: dir });
    assert.equal(r.blocked, false);
    assert.equal(r.exitCode, 0);
  } finally {
    cleanupTmpDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Grounded in a REAL vendored subagent (not a synthetic fixture)
//
// wshobson's ui-visual-validator is pinned under examples/harness/vendor/. It
// is the documented footgun in the wild: a "rigorous visual validator" that
// "bases judgments solely on visual evidence" yet ships with NO `tools:` line —
// so it inherits EVERY tool, including Edit/Write it has no business holding.
// These assertions check the rail against that actual file, not a hand-built
// one. __dirname is src/ (unit run) or dist/ (built) — both one level under the
// repo root, so the relative vendor path resolves either way (matches
// src/vendor.test.ts).
// ---------------------------------------------------------------------------

const REAL_AGENT = join(
  __dirname,
  "../examples/harness/vendor/wshobson-accessibility@cf6059d/agents/ui-visual-validator.md",
);

test("real vendored subagent ships no tools: line — the rail correctly reports it inherits all", () => {
  const md = readFileSync(REAL_AGENT, "utf-8");
  // The wild footgun: no contract at all → parseAgentTools returns null →
  // decidePreToolUse imposes no restriction. The rail honestly reports "there
  // is no rail here yet" rather than inventing one — which is exactly why the
  // omitted-tools authoring warning is the next roadmap item.
  assert.equal(parseAgentTools(md), null);
  assert.equal(decidePreToolUse(parseAgentTools(md), "Write").allow, true);
});

test("the spec form ADDS the rail the real subagent omits, and it parses + enforces", () => {
  // Reconstruct the real agent AS a spec with the least-privilege contract its
  // hand-written original lacks (read + run visual tests; never Edit/Write),
  // compile it, then prove the SAME PreToolUse rail the hook reads now blocks
  // the tools the original silently held. This is the differentiator on a real
  // subagent: compile turns the missing contract into an enforced one.
  const md = readFileSync(REAL_AGENT, "utf-8");
  const nameLine = /^name:\s*(.+)$/m.exec(md);
  const descLine = /^description:\s*(.+)$/m.exec(md);
  assert.ok(nameLine && descLine); // sanity: we're reading the real frontmatter

  const { markdown, errors } = compileAgent(
    agent({
      name: nameLine[1].trim(),
      description: descLine[1].trim(),
      model: "sonnet",
      tools: ["Read", "Grep", "Glob", "Bash"], // the rail the original omits
      body: "You are an experienced UI visual validation expert.",
    }),
    { specFile: "agents/ui-visual-validator.md.spec.ts" },
  );
  assert.deepEqual(errors, []);

  const enforced = parseAgentTools(markdown);
  assert.deepEqual(enforced, ["Read", "Grep", "Glob", "Bash"]);
  assert.equal(decidePreToolUse(enforced, "Bash").allow, true);
  // the tools the wild original inherited but a visual validator must not hold:
  assert.equal(decidePreToolUse(enforced, "Write").allow, false);
  assert.equal(decidePreToolUse(enforced, "Edit").allow, false);
});
