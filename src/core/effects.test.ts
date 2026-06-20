/**
 * Effect-surface detector test suite (vitest) — the deterministic purity
 * analysis reused by compileAgent / scan / a future lint rule.
 *
 * Mirrors the shape of `tool-contract.test.ts`. The test file imports the
 * concrete Claude Code dialect (adapter) — test files are exempt from the
 * core ⊄ adapter import boundary; only `src/core/**` SOURCE files are.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  classifyToolEffect,
  effectSurface,
  pureContractViolations,
} from "./effects.js";
import type { ToolEffect, PurityLevel } from "./effects.js";
import { claudeCodeDialect as d } from "../adapters/claude-code/dialect.js";

// ---------------------------------------------------------------------------
// classifyToolEffect
// ---------------------------------------------------------------------------

test("a read-only built-in tool is classified read-only", () => {
  const effect: ToolEffect = classifyToolEffect("Read", d);
  assert.equal(effect, "read-only");
});

test("Grep and Glob are read-only", () => {
  assert.equal(classifyToolEffect("Grep", d), "read-only");
  assert.equal(classifyToolEffect("Glob", d), "read-only");
});

test("LS is read-only", () => {
  assert.equal(classifyToolEffect("LS", d), "read-only");
});

test("Write is side-effecting", () => {
  assert.equal(classifyToolEffect("Write", d), "side-effecting");
});

test("Bash is side-effecting (conservatively — undecidable at tool-name level)", () => {
  assert.equal(classifyToolEffect("Bash", d), "side-effecting");
});

test("Edit and MultiEdit are side-effecting", () => {
  assert.equal(classifyToolEffect("Edit", d), "side-effecting");
  assert.equal(classifyToolEffect("MultiEdit", d), "side-effecting");
});

test("WebFetch and WebSearch are side-effecting", () => {
  assert.equal(classifyToolEffect("WebFetch", d), "side-effecting");
  assert.equal(classifyToolEffect("WebSearch", d), "side-effecting");
});

test("Task and Skill are side-effecting", () => {
  assert.equal(classifyToolEffect("Task", d), "side-effecting");
  assert.equal(classifyToolEffect("Skill", d), "side-effecting");
});

test("TodoWrite is side-effecting", () => {
  assert.equal(classifyToolEffect("TodoWrite", d), "side-effecting");
});

test("NotebookEdit, BashOutput, KillBash are side-effecting", () => {
  assert.equal(classifyToolEffect("NotebookEdit", d), "side-effecting");
  assert.equal(classifyToolEffect("BashOutput", d), "side-effecting");
  assert.equal(classifyToolEffect("KillBash", d), "side-effecting");
});

test("a Tool(restriction) suffix is stripped before classifying — Bash(git:*) → side-effecting", () => {
  assert.equal(classifyToolEffect("Bash(git:*)", d), "side-effecting");
});

test("a restriction-stripped read-only tool is still read-only — Read(src/*) → read-only", () => {
  assert.equal(classifyToolEffect("Read(src/*)", d), "read-only");
});

test("an MCP tool is unknown-effect (can't classify from the name alone)", () => {
  assert.equal(classifyToolEffect("mcp__myserver__do_thing", d), "unknown");
});

test("a completely unrecognized tool is unknown", () => {
  const effect: ToolEffect = classifyToolEffect("FlyingUnicorn", d);
  assert.equal(effect, "unknown");
});

// ---------------------------------------------------------------------------
// effectSurface — bucketing and purity levels
// ---------------------------------------------------------------------------

test("only read-only tools → pure surface", () => {
  const surface = effectSurface(["Read", "Grep", "Glob"], d);
  assert.deepEqual([...surface.readOnly].sort(), ["Glob", "Grep", "Read"]);
  assert.deepEqual(surface.sideEffecting, []);
  assert.deepEqual(surface.unknown, []);
  const purity: PurityLevel = surface.purity;
  assert.equal(purity, "pure");
});

test("mix of read-only + side-effecting but no Bash → bounded", () => {
  const surface = effectSurface(["Read", "Write"], d);
  assert.deepEqual(surface.readOnly, ["Read"]);
  assert.deepEqual(surface.sideEffecting, ["Write"]);
  assert.deepEqual(surface.unknown, []);
  assert.equal(surface.purity, "bounded");
});

test("presence of Bash makes purity unrestricted", () => {
  const surface = effectSurface(["Read", "Bash"], d);
  assert.equal(surface.purity, "unrestricted");
  assert.ok(surface.sideEffecting.includes("Bash"));
});

test('a wildcard "*" makes purity unrestricted (inherits-all)', () => {
  const surface = effectSurface(["*"], d);
  assert.equal(surface.purity, "unrestricted");
  // wildcard does not appear in any named bucket
  assert.equal(surface.readOnly.length, 0);
  assert.equal(surface.sideEffecting.length, 0);
  assert.equal(surface.unknown.length, 0);
});

test('an empty-string "" wildcard also makes purity unrestricted', () => {
  const surface = effectSurface([""], d);
  assert.equal(surface.purity, "unrestricted");
});

test("an unknown-effect MCP tool makes purity unrestricted", () => {
  const surface = effectSurface(["Read", "mcp__srv__tool"], d);
  assert.equal(surface.purity, "unrestricted");
  assert.deepEqual(surface.unknown, ["mcp__srv__tool"]);
});

test("de-duplication: a tool listed twice appears once per bucket", () => {
  const surface = effectSurface(["Read", "Read", "Write", "Write"], d);
  assert.deepEqual(surface.readOnly, ["Read"]);
  assert.deepEqual(surface.sideEffecting, ["Write"]);
});

test("Bash(git:*) restriction form is de-duped to Bash in the side-effecting bucket", () => {
  const surface = effectSurface(["Bash", "Bash(git:*)"], d);
  assert.deepEqual(surface.sideEffecting, ["Bash"]);
  assert.equal(surface.purity, "unrestricted");
});

test("empty tools list → pure surface", () => {
  const surface = effectSurface([], d);
  assert.equal(surface.purity, "pure");
  assert.equal(surface.readOnly.length, 0);
  assert.equal(surface.sideEffecting.length, 0);
  assert.equal(surface.unknown.length, 0);
});

// ---------------------------------------------------------------------------
// pureContractViolations
// ---------------------------------------------------------------------------

test("a purely read-only contract has no violations", () => {
  const violations = pureContractViolations(["Read", "Grep", "Glob"], d);
  assert.deepEqual(violations, []);
});

test("Write in a pure contract is a violation with an actionable message", () => {
  const violations = pureContractViolations(["Read", "Write"], d);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].tool, "Write");
  assert.equal(violations[0].effect, "side-effecting");
  assert.match(violations[0].message, /"Write" is side-effecting/);
  assert.match(violations[0].message, /pure skill cannot declare it/);
});

test("Bash in a pure contract is a violation", () => {
  const violations = pureContractViolations(["Bash"], d);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].tool, "Bash");
  assert.equal(violations[0].effect, "side-effecting");
});

test("multiple side-effecting tools each produce a separate violation", () => {
  const violations = pureContractViolations(["Write", "WebFetch", "Task"], d);
  const tools = violations.map((v) => v.tool).sort();
  assert.deepEqual(tools, ["Task", "WebFetch", "Write"]);
});

test('a "*" wildcard contract is a violation (inherits-all)', () => {
  const violations = pureContractViolations(["*"], d);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].tool, "*");
  assert.match(violations[0].message, /inherits-all/);
  assert.match(violations[0].message, /pure contract/);
});

test('an "" (empty string) wildcard contract is a violation', () => {
  const violations = pureContractViolations([""], d);
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /inherits-all/);
});

test("an MCP tool in a pure contract is a violation (unknown effect)", () => {
  const violations = pureContractViolations(["Read", "mcp__srv__tool"], d);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].tool, "mcp__srv__tool");
  assert.equal(violations[0].effect, "unknown");
  assert.match(violations[0].message, /unknown effect class/);
});

test("de-duplication: a side-effecting tool listed twice produces one violation", () => {
  const violations = pureContractViolations(["Write", "Write"], d);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].tool, "Write");
});

test("a Bash(restriction) form is correctly flagged as side-effecting", () => {
  const violations = pureContractViolations(["Bash(git status:*)"], d);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].tool, "Bash");
  assert.equal(violations[0].effect, "side-effecting");
});
