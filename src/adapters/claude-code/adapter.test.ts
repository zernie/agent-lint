import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { claudeCodeAdapter } from "./adapter.js";
import {
  assertAdapterConformance,
  checkAdapterConformance,
} from "../../adapter-conformance.js";
import { detectAdapter, getAdapter } from "../../adapter-registry.js";
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

test("detect: a CLAUDE.md repo is recognized; an empty dir is not", () => {
  const dir = makeTmpDir("adapter-detect");
  try {
    assert.equal(claudeCodeAdapter.detect(dir), false);
    writeFileSync(join(dir, "CLAUDE.md"), "# rules\n");
    assert.equal(claudeCodeAdapter.detect(dir), true);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("detect: a .claude-plugin manifest is recognized", () => {
  const dir = makeTmpDir("adapter-detect2");
  try {
    mkdirSync(join(dir, ".claude-plugin"));
    writeFileSync(join(dir, ".claude-plugin", "plugin.json"), "{}");
    assert.equal(claudeCodeAdapter.detect(dir), true);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("detectAdapter falls back to Claude Code for an unmarked repo", () => {
  const dir = makeTmpDir("adapter-registry");
  try {
    assert.equal(detectAdapter(dir).name, "claude-code");
    writeFileSync(join(dir, "CLAUDE.md"), "# rules\n");
    assert.equal(detectAdapter(dir).name, "claude-code");
  } finally {
    cleanupTmpDir(dir);
  }
});

test("getAdapter looks up by name", () => {
  assert.equal(getAdapter("claude-code"), claudeCodeAdapter);
  assert.equal(getAdapter("nope"), undefined);
});
