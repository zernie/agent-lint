import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { hasDriftAnchors, checkDrift } from "./drift.js";
import { writeSidecarManifest } from "./freshness.js";
import type { SidecarManifest } from "./freshness.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "vigiles-drift-"));
}

// ---------------------------------------------------------------------------
// hasDriftAnchors
// ---------------------------------------------------------------------------

describe("hasDriftAnchors", () => {
  it("returns false for empty directory", () => {
    const tmpDir = makeTmpDir();
    assert.equal(hasDriftAnchors(tmpDir), false);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns false for compiled output without anchors", () => {
    const tmpDir = makeTmpDir();
    const m: SidecarManifest = {
      specFile: "CLAUDE.md.spec.ts",
      target: "CLAUDE.md",
      compiledAt: new Date().toISOString(),
      files: {},
    };
    writeSidecarManifest(tmpDir, m);
    writeFileSync(
      join(tmpDir, "CLAUDE.md"),
      [
        "<!-- vigiles:sha256:abc compiled from CLAUDE.md.spec.ts -->",
        "",
        "# CLAUDE.md",
        "",
        "Some content.",
        "",
      ].join("\n"),
    );
    assert.equal(hasDriftAnchors(tmpDir), false);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns true when compiled output has drift frontmatter", () => {
    const tmpDir = makeTmpDir();
    const m: SidecarManifest = {
      specFile: "CLAUDE.md.spec.ts",
      target: "CLAUDE.md",
      compiledAt: new Date().toISOString(),
      files: {},
    };
    writeSidecarManifest(tmpDir, m);
    writeFileSync(
      join(tmpDir, "CLAUDE.md"),
      [
        "<!-- vigiles:sha256:abc compiled from CLAUDE.md.spec.ts -->",
        "---",
        "drift:",
        "  files:",
        "    - src/compile.ts@abc1234",
        "---",
        "",
        "# CLAUDE.md",
        "",
      ].join("\n"),
    );
    assert.equal(hasDriftAnchors(tmpDir), true);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("detects anchors in CLAUDE.md without sidecar manifest", () => {
    const tmpDir = makeTmpDir();
    writeFileSync(
      join(tmpDir, "CLAUDE.md"),
      [
        "---",
        "drift:",
        "  files:",
        "    - src/api.ts#handleRequest@def5678",
        "---",
        "",
        "# CLAUDE.md",
        "",
      ].join("\n"),
    );
    assert.equal(hasDriftAnchors(tmpDir), true);
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// checkDrift
// ---------------------------------------------------------------------------

describe("checkDrift", () => {
  it("returns ok when no anchors exist", () => {
    const tmpDir = makeTmpDir();
    const result = checkDrift(tmpDir);
    assert.equal(result.ok, true);
    assert.equal(result.hasAnchors, false);
    assert.equal(result.message, "No drift anchors found — skipping");
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns error with install instructions when anchors exist but drift not installed", () => {
    const tmpDir = makeTmpDir();
    writeFileSync(
      join(tmpDir, "CLAUDE.md"),
      [
        "---",
        "drift:",
        "  files:",
        "    - src/compile.ts@abc1234",
        "---",
        "",
        "# CLAUDE.md",
        "",
      ].join("\n"),
    );
    const result = checkDrift(tmpDir);
    assert.equal(result.ok, false);
    assert.equal(result.hasAnchors, true);
    assert.equal(result.installed, false);
    assert.ok(result.message.includes("brew install"));
    assert.ok(result.message.includes("fiberplane/drift"));
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
