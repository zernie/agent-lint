import { test } from "vitest";
import assert from "node:assert/strict";

import { claudeCodeRuntime, mockModelEnv } from "./runtime.js";
import type { HarnessRuntime } from "../../core/runtime.js";

test("claudeCodeRuntime spawns claude and reaches the Anthropic mock", () => {
  assert.equal(claudeCodeRuntime.agentBinary, "claude");
  assert.equal(claudeCodeRuntime.modelBaseUrlEnv, "ANTHROPIC_BASE_URL");
  assert.equal(claudeCodeRuntime.modelApiKeyEnv, "ANTHROPIC_API_KEY");
});

test("claudeCodeRuntime.wireMock is env-only (no argv flags)", () => {
  const wired = claudeCodeRuntime.wireMock("http://127.0.0.1:9999");
  assert.deepEqual(wired.args, []);
  assert.equal(wired.env.ANTHROPIC_BASE_URL, "http://127.0.0.1:9999");
  assert.equal(wired.env.ANTHROPIC_API_KEY, "sk-vigiles-mock");
});

test("claudeCodeRuntime.versionKey reduces to major.minor (patches don't churn)", () => {
  assert.equal(claudeCodeRuntime.versionKey("2.1.179 (Claude Code)"), "2.1");
  assert.equal(claudeCodeRuntime.versionKey("2.1.180 (Claude Code)"), "2.1"); // patch → same key
  assert.equal(claudeCodeRuntime.versionKey("2.2.0"), "2.2"); // minor → different
  assert.equal(claudeCodeRuntime.versionKey("1.0.96"), "1.0");
  assert.equal(claudeCodeRuntime.versionKey("nonsense"), "nonsense"); // fallback
});

test("mockModelEnv layers the mock URL + dummy key over the base env", () => {
  const env = mockModelEnv(claudeCodeRuntime, "http://127.0.0.1:9999", {
    PATH: "/usr/bin",
  });
  assert.equal(env.PATH, "/usr/bin"); // base preserved
  assert.equal(env.ANTHROPIC_BASE_URL, "http://127.0.0.1:9999");
  assert.equal(env.ANTHROPIC_API_KEY, "sk-vigiles-mock");
});

test("an alternate runtime maps the URL onto its own env var — the Codex seam", () => {
  const codexRuntime: HarnessRuntime = {
    name: "codex-ish",
    agentBinary: "codex",
    modelBaseUrlEnv: "OPENAI_BASE_URL",
    modelApiKeyEnv: "OPENAI_API_KEY",
    mockApiKey: "sk-mock",
    wireMock: (baseUrl) => ({
      args: [],
      env: { OPENAI_BASE_URL: baseUrl, OPENAI_API_KEY: "sk-mock" },
    }),
    // A harness whose version string carries no stable behavior boundary opts
    // out of version partitioning (the Codex shape — see codexRuntime).
    versionKey: () => "",
  };
  const env = mockModelEnv(codexRuntime, "http://127.0.0.1:1", {});
  assert.equal(env.OPENAI_BASE_URL, "http://127.0.0.1:1");
  assert.equal(env.OPENAI_API_KEY, "sk-mock");
  // The Claude Code vars are NOT set under the codex runtime.
  assert.equal(env.ANTHROPIC_BASE_URL, undefined);
  assert.equal(codexRuntime.versionKey("0.143.0"), ""); // no partitioning
});
