/**
 * Tests for the R2 tool-stub helper (`src/tool-stub.ts`): the fake binaries it
 * writes are actually executable, print the exact canned stdout/stderr, and exit
 * the canned code — including content full of shell metacharacters, proving the
 * base64 escaping round-trips faithfully.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { writeToolStubs, stubBinDir, renderToolStub } from "./tool-stub.js";
import { makeTmpDir, cleanupTmpDir } from "./core/test-utils.js";

test("writeToolStubs writes an executable that prints canned stdout and exits 0", () => {
  const dir = makeTmpDir();
  try {
    writeToolStubs(dir, [{ name: "gh", stdout: "PR #42 merged\n" }]);
    const file = join(dir, "gh");
    assert.ok(existsSync(file));
    // 0o111 = any execute bit set.
    assert.ok((statSync(file).mode & 0o111) !== 0, "stub is executable");
    const r = spawnSync(file, [], { encoding: "utf-8" });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "PR #42 merged\n");
    assert.equal(r.stderr, "");
  } finally {
    cleanupTmpDir(dir);
  }
});

test("writeToolStubs honors stderr and a non-zero exit code", () => {
  const dir = makeTmpDir();
  try {
    writeToolStubs(dir, [
      { name: "psql", stderr: "FATAL: role does not exist\n", exitCode: 2 },
    ]);
    const r = spawnSync(join(dir, "psql"), [], { encoding: "utf-8" });
    assert.equal(r.status, 2);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "FATAL: role does not exist\n");
  } finally {
    cleanupTmpDir(dir);
  }
});

test("shell-special content round-trips faithfully (proves the escaping)", () => {
  const dir = makeTmpDir();
  try {
    // Quotes, $, backticks, semicolons, newlines, and a base64-ish payload — all
    // shell metacharacters that naive interpolation would mangle or inject.
    const nasty =
      `'single' "double" $HOME \`whoami\`; rm -rf /\n` +
      `line2 with $(echo pwned) & | > < * ? {a,b} [c-d]\n`;
    writeToolStubs(dir, [{ name: "git", stdout: nasty }]);
    const r = spawnSync(join(dir, "git"), ["status"], { encoding: "utf-8" });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, nasty, "stdout round-trips byte-for-byte");
    // No injection happened — the dangerous substrings are inert data.
    assert.ok(!existsSync("/PWNED"));
  } finally {
    cleanupTmpDir(dir);
  }
});

test("empty stdout stub prints nothing and exits 0", () => {
  const dir = makeTmpDir();
  try {
    writeToolStubs(dir, [{ name: "noop" }]);
    const r = spawnSync(join(dir, "noop"), [], { encoding: "utf-8" });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "");
  } finally {
    cleanupTmpDir(dir);
  }
});

test("argv is ignored in the MVP — every invocation returns the same result", () => {
  const dir = makeTmpDir();
  try {
    writeToolStubs(dir, [{ name: "redis-cli", stdout: "PONG" }]);
    const a = spawnSync(join(dir, "redis-cli"), ["PING"], {
      encoding: "utf-8",
    });
    const b = spawnSync(join(dir, "redis-cli"), ["GET", "x"], {
      encoding: "utf-8",
    });
    assert.equal(a.stdout, "PONG");
    assert.equal(b.stdout, "PONG");
  } finally {
    cleanupTmpDir(dir);
  }
});

test("stubBinDir returns a fresh dir containing every stub", () => {
  const parent = makeTmpDir();
  try {
    const bin = stubBinDir(
      [
        { name: "gh", stdout: "x" },
        { name: "z3", stdout: "sat" },
      ],
      parent,
    );
    assert.ok(bin.startsWith(parent), "bin dir lives under parentDir");
    assert.ok(existsSync(join(bin, "gh")));
    assert.ok(existsSync(join(bin, "z3")));
    // Two calls give distinct dirs (mkdtemp), so concurrent trials don't collide.
    const bin2 = stubBinDir([{ name: "gh" }], parent);
    assert.notEqual(bin, bin2);
  } finally {
    cleanupTmpDir(parent);
  }
});

test("renderToolStub starts with a POSIX shebang and ends with exit", () => {
  const script = renderToolStub({ name: "gh", stdout: "hi", exitCode: 3 });
  assert.ok(script.startsWith("#!/bin/sh\n"));
  assert.ok(script.trimEnd().endsWith("exit 3"));
});
