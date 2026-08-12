/**
 * The shared symlink policy for recursive walks (`entryKind`).
 *
 * Both halves per shape: a symlinked DIRECTORY is refused (the cycle/escape case),
 * and everything else classifies exactly as a plain `statSync` walk would — a fix
 * that simply returned `"skip"` for everything would pass the first assertion
 * alone and silently empty every report built on these walks.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { entryKind } from "./fs-walk.js";
import { makeTmpDir, cleanupTmpDir } from "./core/test-utils.js";

test("a symlinked directory is refused; a symlinked file is not", () => {
  const dir = makeTmpDir("fs-walk");
  mkdirSync(join(dir, "real"), { recursive: true });
  writeFileSync(join(dir, "real", "a.md"), "a\n");
  symlinkSync(join(dir, "real"), join(dir, "linkdir"), "dir");
  symlinkSync(join(dir, "real", "a.md"), join(dir, "linkfile"), "file");
  symlinkSync(join(dir, "nowhere"), join(dir, "dangling"), "file");

  // FIRES: the one entry that can cycle or leave the checkout.
  assert.equal(entryKind(join(dir, "linkdir")), "skip");
  // QUIET: everything else is classified as before.
  assert.equal(entryKind(join(dir, "real")), "dir");
  assert.equal(entryKind(join(dir, "real", "a.md")), "file");
  assert.equal(entryKind(join(dir, "linkfile")), "file");
  // Unreadable is skipped, not thrown — a walk feeding a report must survive it.
  assert.equal(entryKind(join(dir, "dangling")), "skip");
  assert.equal(entryKind(join(dir, "does-not-exist")), "skip");
  cleanupTmpDir(dir);
});
