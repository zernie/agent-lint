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
  };
  const env = mockModelEnv(codexRuntime, "http://127.0.0.1:1", {});
  assert.equal(env.OPENAI_BASE_URL, "http://127.0.0.1:1");
  assert.equal(env.OPENAI_API_KEY, "sk-mock");
  // The Claude Code vars are NOT set under the codex runtime.
  assert.equal(env.ANTHROPIC_BASE_URL, undefined);
});
