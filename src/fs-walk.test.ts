/**
 * The shared symlink policy for recursive walks (`entryOf`).
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

import { entryOf } from "./fs-walk.js";
import { makeTmpDir, cleanupTmpDir } from "./core/test-utils.js";

test("a symlinked directory is refused; a symlinked file is not", () => {
  const dir = makeTmpDir("fs-walk");
  mkdirSync(join(dir, "real"), { recursive: true });
  writeFileSync(join(dir, "real", "a.md"), "a\n");
  symlinkSync(join(dir, "real"), join(dir, "linkdir"), "dir");
  symlinkSync(join(dir, "real", "a.md"), join(dir, "linkfile"), "file");
  symlinkSync(join(dir, "nowhere"), join(dir, "dangling"), "file");

  // FIRES: the one entry that can cycle or leave the checkout.
  assert.equal(entryOf(join(dir, "linkdir")).kind, "skip");
  // QUIET: everything else is classified as before.
  assert.equal(entryOf(join(dir, "real")).kind, "dir");
  assert.equal(entryOf(join(dir, "real", "a.md")).kind, "file");
  assert.equal(entryOf(join(dir, "linkfile")).kind, "file");
  // Unreadable is skipped, not thrown — a walk feeding a report must survive it.
  assert.equal(entryOf(join(dir, "dangling")).kind, "skip");
  assert.equal(entryOf(join(dir, "does-not-exist")).kind, "skip");
  cleanupTmpDir(dir);
});

test("the size comes back with the classification, so nobody stats twice", () => {
  // The loader needs "is this a file" AND "is it under the cap". Asking twice gave
  // the second question its own unreachable failure path — dead code that only the
  // 100% coverage gate ever noticed. One syscall answers both, and a non-file
  // reports 0 rather than something a size comparison could accidentally accept.
  const dir = makeTmpDir("fs-walk-size");
  mkdirSync(join(dir, "d"), { recursive: true });
  writeFileSync(join(dir, "f.md"), "12345");
  symlinkSync(join(dir, "f.md"), join(dir, "linkfile"), "file");

  assert.equal(entryOf(join(dir, "f.md")).size, 5);
  assert.equal(entryOf(join(dir, "linkfile")).size, 5, "the TARGET's size");
  assert.equal(entryOf(join(dir, "d")).size, 0);
  assert.equal(entryOf(join(dir, "does-not-exist")).size, 0);
  cleanupTmpDir(dir);
});
