/**
 * Hook-matcher detector suite (vitest) — the cross-referencing moat applied to
 * the MATCHER string in a hook registration. Asserts all three kinds
 * (tool-typo / mcp-form / mcp-undeclared), the FP-safety guards (wildcards /
 * alternation / no-declared-set / built-in allowlist / far unknowns), and
 * de-duplication. The dialect is injected — same one-detector-no-drift pattern
 * used by every other core detector.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import { hookMatcherIssues, type HookMatcherEntry } from "./hook-matcher.js";
import { claudeCodeDialect as d } from "../adapters/claude-code/dialect.js";

// ---------------------------------------------------------------------------
// tool-typo
// ---------------------------------------------------------------------------

test('tool-typo: "bash" → suggestion "Bash" (close typo, wrong casing)', () => {
  const entries: HookMatcherEntry[] = [
    { event: "PreToolUse", matcher: "bash" },
  ];
  const findings = hookMatcherIssues(entries, [], d);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "tool-typo");
  assert.equal(findings[0].matcher, "bash");
  assert.equal(findings[0].suggestion, "Bash");
  assert.match(findings[0].message, /Bash/);
  assert.match(findings[0].message, /never fires/);
});

test('tool-typo: "read" → suggestion "Read"', () => {
  const entries: HookMatcherEntry[] = [
    { event: "PreToolUse", matcher: "read" },
  ];
  const findings = hookMatcherIssues(entries, [], d);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "tool-typo");
  assert.equal(findings[0].suggestion, "Read");
});

test('exact built-in "Bash" → no finding', () => {
  const entries: HookMatcherEntry[] = [
    { event: "PreToolUse", matcher: "Bash" },
  ];
  const findings = hookMatcherIssues(entries, [], d);
  assert.deepEqual(findings, []);
});

test("far-unknown bare token (no close built-in) → no finding (FP-safe)", () => {
  // "frobnicate" is far from every built-in — likely a plugin tool, not a typo.
  const entries: HookMatcherEntry[] = [
    { event: "PreToolUse", matcher: "frobnicate" },
  ];
  const findings = hookMatcherIssues(entries, [], d);
  assert.deepEqual(findings, []);
});

// ---------------------------------------------------------------------------
// mcp-form: looks MCP-ish but wrong shape
// ---------------------------------------------------------------------------

test('mcp-form: "mcp_memory_*" (single underscore + glob) → flagged, recovers "memory"', () => {
  // The classic typo: single underscores + a trailing glob. The wildcard guard
  // intentionally does NOT skip an mcp-ish token, so this headline case IS caught.
  const entries: HookMatcherEntry[] = [
    { event: "PreToolUse", matcher: "mcp_memory_*" },
  ];
  const findings = hookMatcherIssues(entries, [], d);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "mcp-form");
  assert.equal(findings[0].matcher, "mcp_memory_*");
  assert.ok(findings[0].suggestion !== undefined);
  assert.match(findings[0].suggestion ?? "", /mcp__memory/);
});

test('mcp-form: "mcp_memory_search" (single underscore, no glob) → flagged', () => {
  const entries: HookMatcherEntry[] = [
    { event: "PreToolUse", matcher: "mcp_memory_search" },
  ];
  const findings = hookMatcherIssues(entries, [], d);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "mcp-form");
  assert.match(findings[0].suggestion ?? "", /mcp__memory/);
});

test('mcp-form: "mcp-memory-search" (hyphenated) → flagged, suggestion recovers server', () => {
  const entries: HookMatcherEntry[] = [
    { event: "PreToolUse", matcher: "mcp-memory-search" },
  ];
  const findings = hookMatcherIssues(entries, [], d);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "mcp-form");
  // Suggestion should contain "mcp__memory"
  assert.ok(findings[0].suggestion !== undefined);
  assert.match(findings[0].suggestion ?? "", /mcp__memory/);
});

// ---------------------------------------------------------------------------
// mcp-undeclared: correct form, server not in declared set
// ---------------------------------------------------------------------------

test('correctly-formed "mcp__memory__.*" with declaredServers=["memory"] → no finding', () => {
  const entries: HookMatcherEntry[] = [
    { event: "PreToolUse", matcher: "mcp__memory__.*" },
  ];
  const findings = hookMatcherIssues(entries, ["memory"], d);
  assert.deepEqual(findings, []);
});

test('mcp-undeclared: "mcp__ghost__search" with declaredServers=["memory"] → mcp-undeclared', () => {
  // A correctly-formed MCP matcher naming a server the plugin doesn't declare.
  const entries: HookMatcherEntry[] = [
    { event: "PreToolUse", matcher: "mcp__ghost__search" },
  ];
  const findings = hookMatcherIssues(entries, ["memory"], d);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "mcp-undeclared");
  assert.equal(findings[0].matcher, "mcp__ghost__search");
  assert.match(findings[0].message, /ghost/);
  assert.match(findings[0].message, /can't fire/);
});

test('mcp-undeclared: server-wide WILDCARD "mcp__ghost__.*" with declaredServers=["memory"] → flagged', () => {
  // The wildcard form's server is recovered by the fallback regex (mcpToolServer
  // only reads the concrete `mcp__server__tool` shape) — so a server-wide matcher
  // naming an undeclared server is still caught.
  const findings = hookMatcherIssues(
    [{ event: "PreToolUse", matcher: "mcp__ghost__.*" }],
    ["memory"],
    d,
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "mcp-undeclared");
  assert.match(findings[0].message, /ghost/);
});

test("GUARD 1: no declared set → no mcp-undeclared finding (reaches global servers)", () => {
  const entries: HookMatcherEntry[] = [
    { event: "PreToolUse", matcher: "mcp__ghost__search" },
  ];
  const findings = hookMatcherIssues(entries, [], d);
  // Without a declared set the detector is silent (can't know what's available).
  assert.deepEqual(findings, []);
});

test("GUARD 2: built-in MCP server (ide) is allowlisted even when not in declaredServers", () => {
  // claudeCodeDialect.knownMcpServers = ["ide"]
  const entries: HookMatcherEntry[] = [
    { event: "PreToolUse", matcher: "mcp__ide__getDiagnostics" },
  ];
  // declared set has something (non-empty) but not "ide"
  const findings = hookMatcherIssues(entries, ["memory"], d);
  assert.deepEqual(findings, []);
});

// ---------------------------------------------------------------------------
// FP-safety: wildcards / regex / alternation → all skipped
// ---------------------------------------------------------------------------

test('pure wildcard "*" → no finding (skip)', () => {
  assert.deepEqual(
    hookMatcherIssues([{ event: "PreToolUse", matcher: "*" }], [], d),
    [],
  );
});

test('".*" → no finding (skip)', () => {
  assert.deepEqual(
    hookMatcherIssues([{ event: "PreToolUse", matcher: ".*" }], [], d),
    [],
  );
});

test('"Edit|Write" (alternation) → no finding (skip)', () => {
  assert.deepEqual(
    hookMatcherIssues([{ event: "PreToolUse", matcher: "Edit|Write" }], [], d),
    [],
  );
});

test('"Bash.*" (trailing .*) → no finding (skip)', () => {
  assert.deepEqual(
    hookMatcherIssues([{ event: "PreToolUse", matcher: "Bash.*" }], [], d),
    [],
  );
});

// ---------------------------------------------------------------------------
// De-duplication
// ---------------------------------------------------------------------------

test("a repeated matcher across entries is reported only once", () => {
  const entries: HookMatcherEntry[] = [
    { event: "PreToolUse", matcher: "bash" },
    { event: "PostToolUse", matcher: "bash" },
  ];
  const findings = hookMatcherIssues(entries, [], d);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].matcher, "bash");
});

test("two different typos each produce their own finding (no cross-dedup)", () => {
  const entries: HookMatcherEntry[] = [
    { event: "PreToolUse", matcher: "bash" },
    { event: "PreToolUse", matcher: "read" },
  ];
  const findings = hookMatcherIssues(entries, [], d);
  assert.equal(findings.length, 2);
  const matchers = findings.map((f) => f.matcher).sort();
  assert.deepEqual(matchers, ["bash", "read"]);
});
