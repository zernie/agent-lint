/**
 * Dogfood the shipped refs-hook through the repo's OWN unit tier (`runHook`):
 * pipe a real PostToolUse event at the built `vigiles refs-hook` and assert it
 * nudges by default, blocks under `unmarked-refs: "error"`, and no-ops on a
 * clean / non-instruction file. `skills-dogfood.test.ts` proves the hook script
 * EXISTS; this proves it FIRES correctly — "test your harness, don't trust it."
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { runHook } from "../../run-hook.js";
import { makeTmpDir, cleanupTmpDir } from "../../core/test-utils.js";

const CLI = resolve(process.cwd(), "dist", "cli.js");
const REFS_HOOK = `node ${CLI} hook-runtime refs`;
const EDIT = (file: string) => ({
  hook_event_name: "PostToolUse" as const,
  tool_name: "Edit",
  tool_input: { file_path: file },
});

test("refs-hook nudges (non-blocking) on an unmarked code ref by default", () => {
  const dir = makeTmpDir("refs-hook");
  try {
    writeFileSync(
      join(dir, "CLAUDE.md"),
      "Enforce `eslint/no-console` here.\n",
    );
    const r = runHook(REFS_HOOK, EDIT("CLAUDE.md"), { cwd: dir });
    assert.equal(r.blocked, false, "warn must not block");
    assert.equal(r.exitCode, 0);
    const ctx = r.json?.hookSpecificOutput?.additionalContext ?? "";
    assert.match(ctx, /eslint\/no-console/);
    assert.match(ctx, /unmarked linter-rule/);
  } finally {
    cleanupTmpDir(dir);
  }
});

test('refs-hook blocks (exit 2) when unmarked-refs is "error"', () => {
  const dir = makeTmpDir("refs-hook");
  try {
    writeFileSync(
      join(dir, "CLAUDE.md"),
      "Enforce `eslint/no-console` here.\n",
    );
    writeFileSync(
      join(dir, ".vigilesrc.json"),
      JSON.stringify({ rules: { "unmarked-refs": "error" } }),
    );
    const r = runHook(REFS_HOOK, EDIT("CLAUDE.md"), { cwd: dir });
    assert.equal(r.blocked, true, "error must block");
    assert.equal(r.exitCode, 2);
    assert.match(r.stderr, /eslint\/no-console/);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("refs-hook is silent when the rule is off", () => {
  const dir = makeTmpDir("refs-hook");
  try {
    writeFileSync(
      join(dir, "CLAUDE.md"),
      "Enforce `eslint/no-console` here.\n",
    );
    writeFileSync(
      join(dir, ".vigilesrc.json"),
      JSON.stringify({ rules: { "unmarked-refs": false } }),
    );
    const r = runHook(REFS_HOOK, EDIT("CLAUDE.md"), { cwd: dir });
    assert.equal(r.blocked, false);
    assert.equal(r.exitCode, 0);
    assert.equal(r.stdout.trim(), "");
  } finally {
    cleanupTmpDir(dir);
  }
});

test("refs-hook ignores a clean instruction file and non-instruction files", () => {
  const dir = makeTmpDir("refs-hook");
  try {
    writeFileSync(join(dir, "CLAUDE.md"), "Run the build before committing.\n");
    writeFileSync(join(dir, "notes.md"), "Enforce `eslint/no-console` here.\n");

    const clean = runHook(REFS_HOOK, EDIT("CLAUDE.md"), { cwd: dir });
    assert.equal(clean.exitCode, 0);
    assert.equal(clean.stdout.trim(), "");

    const nonInstruction = runHook(REFS_HOOK, EDIT("notes.md"), { cwd: dir });
    assert.equal(nonInstruction.exitCode, 0);
    assert.equal(nonInstruction.stdout.trim(), "");
  } finally {
    cleanupTmpDir(dir);
  }
});
