/**
 * Unit tests for applyConfigFlags — the CLI flag → config bridge that keeps
 * the GitHub Action's inputs mapped to real CLI flags.
 */

import { test } from "vitest";
import assert from "node:assert/strict";

import { applyConfigFlags } from "./cli-flags.js";
import type { VigilesConfig } from "./core/types.js";

const base: VigilesConfig = {
  rules: {},
} as VigilesConfig;

test("--max-rules=N sets a positive integer maxRules", () => {
  const c = applyConfigFlags(base, ["audit", "--max-rules=7"]);
  assert.equal(c.maxRules, 7);
});

test("--catalog-only sets catalogOnly true", () => {
  const c = applyConfigFlags(base, ["audit", "--catalog-only"]);
  assert.equal(c.catalogOnly, true);
});

test("both flags compose", () => {
  const c = applyConfigFlags(base, [
    "compile",
    "--max-rules=3",
    "--catalog-only",
  ]);
  assert.equal(c.maxRules, 3);
  assert.equal(c.catalogOnly, true);
});

test("absent flags leave config untouched", () => {
  const c = applyConfigFlags({ ...base, maxRules: 99 }, ["audit"]);
  assert.equal(c.maxRules, 99);
  assert.equal(c.catalogOnly, undefined);
});

test("invalid --max-rules values are ignored (no override)", () => {
  for (const bad of [
    "--max-rules=0",
    "--max-rules=-2",
    "--max-rules=abc",
    "--max-rules=1.5",
  ]) {
    const c = applyConfigFlags({ ...base, maxRules: 42 }, ["audit", bad]);
    assert.equal(c.maxRules, 42, `${bad} should not override`);
  }
});

test("input config is not mutated", () => {
  const input: VigilesConfig = { ...base, maxRules: 5 };
  applyConfigFlags(input, ["audit", "--max-rules=10", "--catalog-only"]);
  assert.equal(input.maxRules, 5);
  assert.equal(input.catalogOnly, undefined);
});
