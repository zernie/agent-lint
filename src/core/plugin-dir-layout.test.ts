/**
 * Plugin manifest directory layout detector suite (vitest).
 *
 * Uses injected `existsSync`/`isDirectory` fakes — no real filesystem — so the
 * suite is pure, fast, and deterministic. Mirrors the injection pattern of
 * skill-resources.ts / description-overlap.test.ts.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import { pluginDirLayoutIssues } from "./plugin-dir-layout.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build fakes that treat `presentDirs` as existing directories. */
function makeFakes(presentDirs: string[]): {
  existsSync: (p: string) => boolean;
  isDirectory: (p: string) => boolean;
} {
  const set = new Set(presentDirs);
  return {
    existsSync: (p) => set.has(p),
    isDirectory: (p) => set.has(p),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("flags a single misplaced surface directory", () => {
  const fakes = makeFakes(["/repo/.claude-plugin/skills"]);
  const findings = pluginDirLayoutIssues(
    "/repo/.claude-plugin",
    ["skills", "agents", "commands", "hooks"],
    fakes,
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].dir, "skills");
  assert.match(findings[0].message, /\.claude-plugin/);
  assert.match(findings[0].message, /plugin root/);
});

test("flags multiple misplaced directories", () => {
  const fakes = makeFakes([
    "/repo/.claude-plugin/skills",
    "/repo/.claude-plugin/agents",
  ]);
  const findings = pluginDirLayoutIssues(
    "/repo/.claude-plugin",
    ["skills", "agents", "commands", "hooks"],
    fakes,
  );
  assert.equal(findings.length, 2);
  const dirs = findings.map((f) => f.dir).sort();
  assert.deepEqual(dirs, ["agents", "skills"]);
});

test("returns [] when only plugin.json is present (no surface dirs)", () => {
  // Only the manifest file exists, no surface directories nested inside.
  const fakes = makeFakes([]);
  const findings = pluginDirLayoutIssues(
    "/repo/.claude-plugin",
    ["skills", "agents", "commands", "hooks"],
    fakes,
  );
  assert.deepEqual(findings, []);
});

test("does NOT flag a path that exists as a file (not a directory)", () => {
  // Someone has a file named `commands` inside the manifest dir — not a surface dir.
  const existsSync = (p: string) => p === "/repo/.claude-plugin/commands";
  const isDirectory = (_p: string) => false; // it's a file, not a dir
  const findings = pluginDirLayoutIssues(
    "/repo/.claude-plugin",
    ["skills", "agents", "commands", "hooks"],
    { existsSync, isDirectory },
  );
  assert.deepEqual(findings, []);
});

test("returns [] when surfaceDirNames is empty", () => {
  const fakes = makeFakes(["/repo/.claude-plugin/skills"]);
  const findings = pluginDirLayoutIssues("/repo/.claude-plugin", [], fakes);
  assert.deepEqual(findings, []);
});

test("works with custom (non-Claude-Code) surface names", () => {
  // Proves the detector is harness-agnostic — not hard-coded to CC surface names.
  const fakes = makeFakes(["/repo/.my-plugin/prompts"]);
  const findings = pluginDirLayoutIssues(
    "/repo/.my-plugin",
    ["prompts", "tools"],
    fakes,
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].dir, "prompts");
  // Message names the actual manifest basename, not `.claude-plugin`.
  assert.match(findings[0].message, /\.my-plugin/);
  assert.doesNotMatch(findings[0].message, /\.claude-plugin/);
});
