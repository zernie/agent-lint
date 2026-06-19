/**
 * Dogfood the shipped SHELL WRAPPER `hooks/refs-nudge.sh` through the repo's OWN
 * unit tier (`runHook`). The sibling `refs-hook.test.ts` drives the CLI
 * (`vigiles refs-hook`) directly; this proves the wrapper's own logic — its
 * not-a-node-project guard and its exit-2-only propagation (it swallows every
 * non-block status so a transient failure never disrupts an edit). The wrapper
 * calls `npx vigiles`, so each test points it at a local `node_modules/.bin`
 * shim → the built `dist/cli.js`, keeping the run offline and deterministic.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";

import { runHook } from "../../run-hook.js";
import { makeTmpDir, cleanupTmpDir } from "../../core/test-utils.js";

const CLI = resolve(process.cwd(), "dist", "cli.js");
// The actual shipped wrapper script (named here so the untested-surface detector
// credits `hooks/refs-nudge.sh` as covered).
const WRAPPER = resolve(process.cwd(), "hooks", "refs-nudge.sh");

const EDIT = (file: string) => ({
  hook_event_name: "PostToolUse" as const,
  tool_name: "Edit",
  tool_input: { file_path: file },
});

/** A tmp dir that looks like a node project whose local `vigiles` is our build. */
function nodeProject(name: string): string {
  const dir = makeTmpDir(name);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "t" }));
  const bin = join(dir, "node_modules", ".bin");
  mkdirSync(bin, { recursive: true });
  const shim = join(bin, "vigiles");
  writeFileSync(shim, `#!/usr/bin/env bash\nexec node ${CLI} "$@"\n`);
  chmodSync(shim, 0o755);
  return dir;
}

test("wrapper nudges (non-blocking, exit 0) on an unmarked ref by default", () => {
  const dir = nodeProject("refs-nudge");
  try {
    writeFileSync(
      join(dir, "CLAUDE.md"),
      "Enforce `eslint/no-console` here.\n",
    );
    const r = runHook(WRAPPER, EDIT("CLAUDE.md"), {
      cwd: dir,
      timeoutMs: 30000,
    });
    assert.equal(r.blocked, false, "a warn-level nudge must not block");
    assert.equal(r.exitCode, 0);
    const ctx = r.json?.hookSpecificOutput?.additionalContext ?? "";
    assert.match(ctx, /eslint\/no-console/);
  } finally {
    cleanupTmpDir(dir);
  }
});

test('wrapper PROPAGATES exit 2 when unmarked-refs is "error"', () => {
  const dir = nodeProject("refs-nudge");
  try {
    writeFileSync(
      join(dir, "CLAUDE.md"),
      "Enforce `eslint/no-console` here.\n",
    );
    writeFileSync(
      join(dir, ".vigilesrc.json"),
      JSON.stringify({ rules: { "unmarked-refs": "error" } }),
    );
    const r = runHook(WRAPPER, EDIT("CLAUDE.md"), {
      cwd: dir,
      timeoutMs: 30000,
    });
    assert.equal(r.blocked, true, "the wrapper must propagate the block");
    assert.equal(r.exitCode, 2);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("wrapper no-ops (exit 0) when the dir is not a node project", () => {
  // No package.json → the guard fires before npx; never disrupts the edit.
  const dir = makeTmpDir("refs-nudge-bare");
  try {
    writeFileSync(
      join(dir, "CLAUDE.md"),
      "Enforce `eslint/no-console` here.\n",
    );
    const r = runHook(WRAPPER, EDIT("CLAUDE.md"), {
      cwd: dir,
      timeoutMs: 30000,
    });
    assert.equal(r.blocked, false);
    assert.equal(r.exitCode, 0);
    assert.equal(r.stdout.trim(), "");
  } finally {
    cleanupTmpDir(dir);
  }
});
