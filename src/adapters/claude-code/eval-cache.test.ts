/**
 * Tests for the eval record/replay cache (src/eval-cache.ts) — the pure key,
 * record I/O, and filesystem snapshot/restore. Model-free.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  cacheKey,
  readCache,
  writeCache,
  snapshotDir,
  restoreDir,
  type CacheKeyInput,
} from "./eval-cache.js";
import { makeTmpDir, cleanupTmpDir } from "../../core/test-utils.js";

const baseKey: CacheKeyInput = {
  task: "do it",
  model: "haiku",
  tools: ["Read", "Edit"],
  files: { "a.txt": "x" },
  settings: { hooks: {} },
  trialIndex: 0,
};

test("cacheKey is stable and order-independent for object inputs", () => {
  const k1 = cacheKey(baseKey);
  // same logical input, object keys in a different order → same key
  const k2 = cacheKey({
    trialIndex: 0,
    settings: { hooks: {} },
    files: { "a.txt": "x" },
    tools: ["Read", "Edit"],
    model: "haiku",
    task: "do it",
  });
  assert.equal(k1, k2);
});

test("cacheKey changes when any model-affecting input changes", () => {
  const base = cacheKey(baseKey);
  assert.notEqual(base, cacheKey({ ...baseKey, trialIndex: 1 }));
  assert.notEqual(base, cacheKey({ ...baseKey, task: "other" }));
  assert.notEqual(base, cacheKey({ ...baseKey, files: { "a.txt": "y" } }));
  // tool order is significant (arrays keep order)
  assert.notEqual(base, cacheKey({ ...baseKey, tools: ["Edit", "Read"] }));
});

test("readCache returns null on miss and on malformed records", () => {
  const dir = makeTmpDir("cache");
  try {
    const key = cacheKey(baseKey);
    assert.equal(readCache(dir, key), null); // miss
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${key}.json`), "{ not json");
    assert.equal(readCache(dir, key), null); // malformed
  } finally {
    cleanupTmpDir(dir);
  }
});

test("writeCache then readCache round-trips a record", () => {
  const dir = makeTmpDir("cache");
  try {
    const key = cacheKey(baseKey);
    const record = {
      out: { code: 0, stdout: "stream" },
      files: { "OUT.txt": "result" },
    };
    writeCache(dir, key, record);
    const got = readCache(dir, key);
    assert.deepEqual(got, record);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("snapshotDir captures nested text files; restoreDir rebuilds them", () => {
  const src = makeTmpDir("snap-src");
  const dst = makeTmpDir("snap-dst");
  try {
    mkdirSync(join(src, "sub"), { recursive: true });
    writeFileSync(join(src, "top.txt"), "top");
    writeFileSync(join(src, "sub", "deep.txt"), "deep");
    // node_modules is skipped
    mkdirSync(join(src, "node_modules"), { recursive: true });
    writeFileSync(join(src, "node_modules", "skip.txt"), "skip");

    const snap = snapshotDir(src);
    assert.equal(snap["top.txt"], "top");
    assert.equal(snap[join("sub", "deep.txt")], "deep");
    assert.ok(
      !(join("node_modules", "skip.txt") in snap),
      "node_modules skipped",
    );

    restoreDir(dst, snap);
    assert.ok(existsSync(join(dst, "top.txt")));
    assert.ok(existsSync(join(dst, "sub", "deep.txt")));
  } finally {
    cleanupTmpDir(src);
    cleanupTmpDir(dst);
  }
});
