import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { claudeCodeAdapter } from "./adapter.js";
import {
  assertAdapterConformance,
  assertAdapterLoadsHooks,
  checkAdapterConformance,
} from "../../adapter-conformance.js";
import {
  detectAdapter,
  detectAdapterResult,
  resolveAdapter,
  getAdapter,
} from "../../adapter-registry.js";
import type { HarnessAdapter } from "../../core/adapter.js";
import { makeTmpDir, cleanupTmpDir } from "../../core/test-utils.js";

test("claudeCodeAdapter bundles all five ports + a detect", () => {
  assert.equal(claudeCodeAdapter.name, "claude-code");
  assert.equal(claudeCodeAdapter.dialect.name, "claude-code");
  assert.equal(claudeCodeAdapter.layout.name, "claude-code");
  assert.equal(claudeCodeAdapter.runtime.agentBinary, "claude");
  assert.equal(claudeCodeAdapter.hookProtocol.blockExitCode, 2);
  assert.equal(claudeCodeAdapter.modelMock.modelEndpoint, "/v1/messages");
});

test("claudeCodeAdapter passes the conformance kit", () => {
  assertAdapterConformance(claudeCodeAdapter); // throws on failure
});

test("claudeCodeAdapter passes behavioural settings-load conformance", () => {
  assertAdapterLoadsHooks(claudeCodeAdapter); // round-trips a real settings file
});

test("conformance kit catches a broken adapter", () => {
  const broken: HarnessAdapter = {
    ...claudeCodeAdapter,
    name: "",
    dialect: { ...claudeCodeAdapter.dialect, builtinAgentTools: [] },
  };
  const r = checkAdapterConformance(broken);
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((m) => m.includes("name is empty")));
  assert.ok(r.failures.some((m) => m.includes("builtinAgentTools")));
});

test("detect: specificity score — empty 0, CLAUDE.md 1, manifest 3", () => {
  const dir = makeTmpDir("adapter-detect");
  try {
    assert.equal(claudeCodeAdapter.detect(dir), 0);
    writeFileSync(join(dir, "CLAUDE.md"), "# rules\n");
    assert.equal(claudeCodeAdapter.detect(dir), 1); // weak signal
    mkdirSync(join(dir, ".claude-plugin"));
    writeFileSync(join(dir, ".claude-plugin", "plugin.json"), "{}");
    assert.equal(claudeCodeAdapter.detect(dir), 3); // strong signal wins
  } finally {
    cleanupTmpDir(dir);
  }
});

test("detectAdapterResult falls back to Claude Code for an unmarked repo", () => {
  const dir = makeTmpDir("adapter-registry");
  try {
    const r = detectAdapterResult(dir);
    assert.equal(r.adapter.name, "claude-code");
    assert.equal(r.fallback, true);
    assert.deepEqual(r.ambiguousWith, []);
    writeFileSync(join(dir, "CLAUDE.md"), "# rules\n");
    const r2 = detectAdapterResult(dir);
    assert.equal(r2.adapter.name, "claude-code");
    assert.equal(r2.fallback, false);
    assert.equal(detectAdapter(dir).name, "claude-code");
  } finally {
    cleanupTmpDir(dir);
  }
});

test("resolveAdapter: --harness override wins, unknown throws", () => {
  const dir = makeTmpDir("adapter-resolve");
  try {
    assert.equal(resolveAdapter(dir).name, "claude-code"); // auto-detect
    assert.equal(resolveAdapter(dir, "claude-code"), claudeCodeAdapter);
    assert.throws(() => resolveAdapter(dir, "codex"), /Unknown harness/);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("getAdapter looks up by name", () => {
  assert.equal(getAdapter("claude-code"), claudeCodeAdapter);
  assert.equal(getAdapter("nope"), undefined);
});
