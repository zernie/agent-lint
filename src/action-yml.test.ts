/**
 * Structural guard for the shipped GitHub Action (action.yml).
 *
 * Locks in the production-grade contract from the `prod-grade-gha-cli` rule so
 * a regression (reverting to a node20 entry, the deprecated ::set-output, a
 * dropped output, or an input that no longer maps to a CLI flag) fails here.
 */

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";

const actionPath = resolve(__dirname, "..", "action.yml");
const raw = readFileSync(actionPath, "utf-8");
const action = load(raw) as {
  inputs: Record<string, { default?: string; description?: string }>;
  outputs?: Record<string, { value?: string }>;
  runs: { using?: string; main?: string; steps?: unknown[] };
};

describe("action.yml — production-grade GitHub Action contract", () => {
  it("is a composite action over the CLI, not a node20 entry at an uncommitted dist/", () => {
    assert.equal(action.runs.using, "composite");
    assert.equal(
      action.runs.main,
      undefined,
      "must not point at dist/action.js",
    );
    assert.ok(Array.isArray(action.runs.steps) && action.runs.steps.length > 0);
  });

  it("never uses the deprecated ::set-output", () => {
    assert.ok(
      !raw.includes("::set-output"),
      "outputs must be written via $GITHUB_OUTPUT",
    );
  });

  it("declares the `valid` output, wired to a step output", () => {
    assert.ok(action.outputs?.["valid"], "missing outputs.valid");
    assert.match(
      action.outputs?.["valid"]?.value ?? "",
      /steps\.[\w-]+\.outputs\.valid/,
    );
    assert.ok(
      raw.includes("$GITHUB_OUTPUT"),
      "valid must be set via $GITHUB_OUTPUT",
    );
  });

  it("maps every functional input to a real CLI flag or command position", () => {
    // command/paths are positional; max-rules/catalog-only must reach the CLI.
    for (const input of [
      "command",
      "paths",
      "version",
      "max-rules",
      "catalog-only",
    ]) {
      assert.ok(action.inputs[input], `missing input: ${input}`);
    }
    assert.ok(
      raw.includes("--max-rules="),
      "max-rules must map to --max-rules",
    );
    assert.ok(
      raw.includes("--catalog-only"),
      "catalog-only must map to --catalog-only",
    );
  });

  it("supports `version: local` so the repo can dogfood it via uses: ./", () => {
    assert.ok(
      raw.includes('"local"') || raw.includes("== local"),
      "must branch on version=local to run the action's own build",
    );
    assert.ok(raw.includes("dist/cli.js"), "local path must run the built CLI");
  });

  it("reuses the published npm package for non-local versions", () => {
    assert.ok(
      raw.includes('npx --yes "vigiles@'),
      "must run npx vigiles@<version>",
    );
  });

  it("writes a job summary and posts a sticky PR comment", () => {
    for (const input of ["comment", "github-token"]) {
      assert.ok(action.inputs[input], `missing input: ${input}`);
    }
    assert.ok(raw.includes("$GITHUB_STEP_SUMMARY"), "must write a job summary");
    assert.ok(
      raw.includes("<!-- vigiles-action -->"),
      "must use a marker for a sticky (update-in-place) comment",
    );
    assert.ok(
      raw.includes("pull_request"),
      "comment must be gated to pull_request events",
    );
    // Update-or-create: both API calls present.
    assert.ok(raw.includes("-X PATCH") && raw.includes("-X POST"));
  });
});
