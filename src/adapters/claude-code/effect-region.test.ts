/**
 * Tests for effect-boundary state helpers (effect-region.ts).
 * Model-free. No CLI, no hooks.
 */
import { describe, it, afterEach } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  setEffectActive,
  clearEffectActive,
  readEffectActive,
  hasEffectBoundary,
} from "./effect-region.js";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "vigiles-effect-test-"));
}

describe("setEffectActive / readEffectActive / clearEffectActive", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("reads false before any write", () => {
    dir = makeTmpDir();
    assert.equal(readEffectActive(dir), false);
  });

  it("reads true after setEffectActive", () => {
    dir = makeTmpDir();
    setEffectActive(dir);
    assert.equal(readEffectActive(dir), true);
  });

  it("reads false after clearEffectActive", () => {
    dir = makeTmpDir();
    setEffectActive(dir);
    clearEffectActive(dir);
    assert.equal(readEffectActive(dir), false);
  });

  it("clearEffectActive is idempotent when file absent", () => {
    dir = makeTmpDir();
    // No error thrown when file doesn't exist
    assert.doesNotThrow(() => {
      clearEffectActive(dir);
    });
    assert.equal(readEffectActive(dir), false);
  });

  it("setEffectActive creates the .vigiles/ directory if missing", () => {
    dir = makeTmpDir();
    // No .vigiles/ pre-created — setEffectActive must make it
    setEffectActive(dir);
    assert.equal(readEffectActive(dir), true);
  });

  it("tolerates a malformed effect-active.json (returns false)", () => {
    dir = makeTmpDir();
    const vigilesDir = join(dir, ".vigiles");
    mkdirSync(vigilesDir, { recursive: true });
    writeFileSync(join(vigilesDir, "effect-active.json"), "not-json!!");
    assert.equal(readEffectActive(dir), false);
  });

  it("returns false when file exists but active !== true", () => {
    dir = makeTmpDir();
    const vigilesDir = join(dir, ".vigiles");
    mkdirSync(vigilesDir, { recursive: true });
    writeFileSync(
      join(vigilesDir, "effect-active.json"),
      JSON.stringify({ active: false }),
    );
    assert.equal(readEffectActive(dir), false);
  });
});

describe("hasEffectBoundary", () => {
  it("returns true when markdown contains the open marker", () => {
    const md = `# Header\n\n<!-- vigiles:effect -->\n\nSome content.\n\n<!-- /vigiles:effect -->\n`;
    assert.equal(hasEffectBoundary(md), true);
  });

  it("returns false when marker is absent", () => {
    const md = `# Header\n\nJust plain prose.\n`;
    assert.equal(hasEffectBoundary(md), false);
  });

  it("returns false for an empty string", () => {
    assert.equal(hasEffectBoundary(""), false);
  });
});
