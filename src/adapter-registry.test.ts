import { test } from "vitest";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  normalizeHarnessName,
  normalizeHarnessList,
  resolveHarnessSelection,
  type HarnessSelection,
} from "./adapter-registry.js";
import { makeTmpDir, cleanupTmpDir } from "./core/test-utils.js";

/** Narrow a selection to its `notice` variant (asserts the discriminant). */
function noticeOf(sel: HarnessSelection): string {
  assert.equal(sel.kind, "notice");
  // The union makes `notice` reachable only on the "notice" variant.
  return sel.kind === "notice" ? sel.notice : "";
}

test("normalizeHarnessName lowercases, trims, and aliases claude → claude-code", () => {
  assert.equal(normalizeHarnessName("claude"), "claude-code");
  assert.equal(normalizeHarnessName("  Claude "), "claude-code");
  assert.equal(normalizeHarnessName("Codex"), "codex");
  assert.equal(normalizeHarnessName("claude-code"), "claude-code");
});

test("normalizeHarnessList normalizes string | string[] | undefined", () => {
  assert.deepEqual(normalizeHarnessList(undefined), []);
  assert.deepEqual(normalizeHarnessList("codex"), ["codex"]);
  assert.deepEqual(normalizeHarnessList(["claude", "codex"]), [
    "claude-code",
    "codex",
  ]);
  assert.deepEqual(normalizeHarnessList(["", "  "]), []);
  // Idempotent — already-canonical input is unchanged (the parse-once guarantee).
  assert.deepEqual(normalizeHarnessList(["claude-code", "codex"]), [
    "claude-code",
    "codex",
  ]);
});

test("resolveHarnessSelection: --harness flag wins over config, kind=ok", () => {
  const dir = makeTmpDir();
  try {
    const sel = resolveHarnessSelection({
      root: dir,
      flag: "codex",
      configHarness: "claude-code",
    });
    assert.equal(sel.kind, "ok");
    assert.equal(sel.adapter.name, "codex");
  } finally {
    cleanupTmpDir(dir);
  }
});

test("resolveHarnessSelection: flag alias (claude) resolves to claude-code", () => {
  const dir = makeTmpDir();
  try {
    const sel = resolveHarnessSelection({ root: dir, flag: "claude" });
    assert.equal(sel.adapter.name, "claude-code");
  } finally {
    cleanupTmpDir(dir);
  }
});

test("resolveHarnessSelection: unknown flag throws (no silent fallback)", () => {
  const dir = makeTmpDir();
  try {
    assert.throws(
      () => resolveHarnessSelection({ root: dir, flag: "nope" }),
      /Unknown harness/,
    );
  } finally {
    cleanupTmpDir(dir);
  }
});

test("resolveHarnessSelection: single config harness used, kind=ok (alias ok)", () => {
  const dir = makeTmpDir();
  try {
    const sel = resolveHarnessSelection({ root: dir, configHarness: "claude" });
    assert.equal(sel.kind, "ok");
    assert.equal(sel.adapter.name, "claude-code");
  } finally {
    cleanupTmpDir(dir);
  }
});

test("resolveHarnessSelection: single-element array behaves like a string", () => {
  const dir = makeTmpDir();
  try {
    const sel = resolveHarnessSelection({
      root: dir,
      configHarness: ["codex"],
    });
    assert.equal(sel.kind, "ok");
    assert.equal(sel.adapter.name, "codex");
  } finally {
    cleanupTmpDir(dir);
  }
});

test("resolveHarnessSelection: multiple config harnesses → first + loud notice", () => {
  const dir = makeTmpDir();
  try {
    const sel = resolveHarnessSelection({
      root: dir,
      configHarness: ["claude-code", "codex"],
    });
    assert.equal(sel.adapter.name, "claude-code");
    const notice = noticeOf(sel);
    assert.match(notice, /claude-code, codex/);
    assert.match(notice, /--harness=/);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("resolveHarnessSelection: empty array falls through to auto-detect", () => {
  const dir = makeTmpDir();
  try {
    const sel = resolveHarnessSelection({ root: dir, configHarness: [] });
    assert.equal(sel.kind, "ok");
    assert.equal(sel.adapter.name, "claude-code"); // empty-repo default
  } finally {
    cleanupTmpDir(dir);
  }
});

test("resolveHarnessSelection: no config → auto-detect, kind=ok on an empty repo", () => {
  const dir = makeTmpDir();
  try {
    const sel = resolveHarnessSelection({ root: dir });
    assert.equal(sel.kind, "ok");
    assert.equal(sel.adapter.name, "claude-code"); // backwards-compatible default
  } finally {
    cleanupTmpDir(dir);
  }
});

test("resolveHarnessSelection: auto-detect a Codex-only repo (AGENTS.md)", () => {
  const dir = makeTmpDir();
  try {
    writeFileSync(join(dir, "AGENTS.md"), "# x\n");
    const sel = resolveHarnessSelection({ root: dir });
    assert.equal(sel.kind, "ok");
    assert.equal(sel.adapter.name, "codex");
  } finally {
    cleanupTmpDir(dir);
  }
});

test("resolveHarnessSelection: ambiguous repo (CLAUDE.md + AGENTS.md) warns", () => {
  const dir = makeTmpDir();
  try {
    writeFileSync(join(dir, "CLAUDE.md"), "# x\n");
    writeFileSync(join(dir, "AGENTS.md"), "# x\n");
    const sel = resolveHarnessSelection({ root: dir });
    const notice = noticeOf(sel);
    assert.match(notice, /matches/);
    assert.match(notice, /harness/);
  } finally {
    cleanupTmpDir(dir);
  }
});
