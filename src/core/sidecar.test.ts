import { describe, it, beforeAll as before, afterAll as after } from "vitest";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";

import {
  computePerFileHashes,
  writeSidecarManifest,
  readSidecarManifest,
  iterateSidecars,
  sidecarPath,
} from "./sidecar.js";
import type { SidecarManifest } from "./sidecar.js";
import { makeTmpDir, cleanupTmpDir } from "./test-utils.js";

describe("computePerFileHashes", () => {
  let tmpDir: string;

  before(() => {
    tmpDir = makeTmpDir();
    writeFileSync(join(tmpDir, "a.txt"), "alpha");
    writeFileSync(join(tmpDir, "b.txt"), "beta");
  });

  after(() => {
    cleanupTmpDir(tmpDir);
  });

  it("computes a hash for each file present", () => {
    const hashes = computePerFileHashes(["a.txt", "b.txt"], tmpDir);
    assert.match(hashes["a.txt"], /^[a-f0-9]{16}$/);
    assert.match(hashes["b.txt"], /^[a-f0-9]{16}$/);
    assert.notEqual(hashes["a.txt"], hashes["b.txt"]);
  });

  it("marks missing files as MISSING", () => {
    const hashes = computePerFileHashes(["a.txt", "missing.txt"], tmpDir);
    assert.equal(hashes["missing.txt"], "MISSING");
  });

  it("is deterministic for identical content", () => {
    writeFileSync(join(tmpDir, "c.txt"), "alpha");
    const hashes = computePerFileHashes(["a.txt", "c.txt"], tmpDir);
    assert.equal(hashes["a.txt"], hashes["c.txt"]);
  });
});

describe("sidecar manifests", () => {
  let tmpDir: string;

  before(() => {
    tmpDir = makeTmpDir();
  });

  after(() => {
    cleanupTmpDir(tmpDir);
  });

  it("sidecarPath uses .vigiles/<target>.inputs.json", () => {
    const p = sidecarPath(tmpDir, "CLAUDE.md");
    assert.ok(p.endsWith(".vigiles/CLAUDE.md.inputs.json"));
  });

  it("write then read round-trips", () => {
    const m: SidecarManifest = {
      specFile: "CLAUDE.md.spec.ts",
      target: "CLAUDE.md",
      compiledAt: new Date().toISOString(),
      files: { "CLAUDE.md.spec.ts": "abc123" },
    };
    writeSidecarManifest(tmpDir, m);
    const read = readSidecarManifest(tmpDir, "CLAUDE.md");
    assert.deepEqual(read, m);
  });

  it("returns null when manifest is missing", () => {
    assert.equal(readSidecarManifest(tmpDir, "DoesNotExist.md"), null);
  });

  it("returns null when manifest is malformed JSON", () => {
    mkdirSync(join(tmpDir, ".vigiles"), { recursive: true });
    writeFileSync(join(tmpDir, ".vigiles", "BAD.md.inputs.json"), "not json");
    assert.equal(readSidecarManifest(tmpDir, "BAD.md"), null);
  });
});

describe("iterateSidecars", () => {
  let tmpDir: string;

  before(() => {
    tmpDir = makeTmpDir();
    writeSidecarManifest(tmpDir, {
      specFile: "A.md.spec.ts",
      target: "A.md",
      compiledAt: new Date().toISOString(),
      files: { "A.md.spec.ts": "aaaa" },
    });
    writeSidecarManifest(tmpDir, {
      specFile: "B.md.spec.ts",
      target: "B.md",
      compiledAt: new Date().toISOString(),
      files: { "B.md.spec.ts": "bbbb" },
    });
  });

  after(() => {
    cleanupTmpDir(tmpDir);
  });

  it("calls fn once per manifest", () => {
    const seen: string[] = [];
    iterateSidecars(tmpDir, (target) => seen.push(target));
    assert.deepEqual(seen.sort(), ["A.md", "B.md"]);
  });

  it("does nothing when .vigiles/ does not exist", () => {
    const empty = makeTmpDir();
    let count = 0;
    iterateSidecars(empty, () => count++);
    assert.equal(count, 0);
    cleanupTmpDir(empty);
  });
});

/**
 * The walk classified entries with a bare `statSync().isDirectory()`, which
 * FOLLOWS a symlink — third instance of that class in this repo, and the reason
 * `entryOf` exists. Both halves per shape: the symlinked DIRECTORY is refused,
 * and everything else still resolves exactly as before. A fix that skipped every
 * symlink, or every entry, would pass the first half alone and silently stop the
 * audit from seeing manifests it used to see.
 */
describe("iterateSidecars and symlinks", () => {
  it("does not descend into a directory symlink inside .vigiles/", () => {
    const tmp = makeTmpDir("sidecar-symlink-dir");
    writeSidecarManifest(tmp, {
      specFile: "Real.md.spec.ts",
      target: "Real.md",
      compiledAt: new Date().toISOString(),
      files: {},
    });
    // A tree OUTSIDE .vigiles/ holding something that looks like a manifest.
    const outside = join(tmp, "outside");
    mkdirSync(outside, { recursive: true });
    writeFileSync(
      join(outside, "Foreign.md.inputs.json"),
      JSON.stringify({
        specFile: "Foreign.md.spec.ts",
        target: "Foreign.md",
        compiledAt: new Date().toISOString(),
        files: {},
      }),
    );
    symlinkSync(outside, join(tmp, ".vigiles", "linked"), "dir");

    const seen: string[] = [];
    iterateSidecars(tmp, (target) => seen.push(target));
    // FIRES: following the link pulled a foreign tree's manifests into the audit
    // under a reconstructed target name (`linked/Foreign.md`).
    assert.deepEqual(seen, ["Real.md"]);
    cleanupTmpDir(tmp);
  });

  it("reports a manifest once under a symlink cycle, not once per lap", () => {
    const tmp = makeTmpDir("sidecar-symlink-cycle");
    writeSidecarManifest(tmp, {
      specFile: "Real.md.spec.ts",
      target: "Real.md",
      compiledAt: new Date().toISOString(),
      files: {},
    });
    // `.vigiles/loop -> .vigiles`: statSync says "directory" on every lap.
    symlinkSync(join(tmp, ".vigiles"), join(tmp, ".vigiles", "loop"), "dir");

    const seen: string[] = [];
    // FIRES: reverting the fix reported this ONE manifest 41 times — `Real.md`,
    // `loop/Real.md`, `loop/loop/Real.md` … until the kernel's link limit ended
    // it. Note it did NOT throw the way the loader's uncaught walk did: the
    // `catch` inside walk() swallowed the ELOOP, so the only visible symptom was
    // a multiplied audit. So the assertion is on the LIST, not on "it didn't
    // throw" — the no-throw half stays green under the defect and would prove
    // nothing. (A throw still fails this test: it escapes the call below.)
    iterateSidecars(tmp, (target) => seen.push(target));
    assert.deepEqual(seen, ["Real.md"]);
    cleanupTmpDir(tmp);
  });

  it("still finds nested sidecars and follows a symlinked manifest FILE", () => {
    const tmp = makeTmpDir("sidecar-symlink-quiet");
    writeSidecarManifest(tmp, {
      specFile: "CLAUDE.md.spec.ts",
      target: "CLAUDE.md",
      compiledAt: new Date().toISOString(),
      files: {},
    });
    // The nested case the recursion exists for, in a real directory.
    writeSidecarManifest(tmp, {
      specFile: "copilot.spec.ts",
      target: ".github/copilot-instructions.md",
      compiledAt: new Date().toISOString(),
      files: {},
    });
    // A symlink to a manifest FILE cannot recurse and is a real manifest, so it
    // is read like any other — dropping it would lose findings.
    symlinkSync(
      sidecarPath(tmp, "CLAUDE.md"),
      sidecarPath(tmp, "Linked.md"),
      "file",
    );

    const seen: string[] = [];
    iterateSidecars(tmp, (target) => seen.push(target));
    assert.deepEqual(seen.sort(), [
      ".github/copilot-instructions.md",
      "CLAUDE.md",
      "Linked.md",
    ]);
    cleanupTmpDir(tmp);
  });
});

describe("checkIntegrity", () => {
  it("treats files without hash as intact (hand-written)", async () => {
    const { checkIntegrity } = await import("./integrity.js");
    const result = checkIntegrity("# Hand-written file\n");
    assert.equal(result.intact, true);
  });

  it("detects valid hash", async () => {
    const { checkIntegrity } = await import("./integrity.js");
    const { addHash } = await import("./compile.js");
    const content = addHash("# Content\n", "test.spec.ts");
    const result = checkIntegrity(content);
    assert.equal(result.intact, true);
  });

  it("detects tampering", async () => {
    const { checkIntegrity } = await import("./integrity.js");
    const { addHash } = await import("./compile.js");
    const content = addHash("# Original\n", "test.spec.ts");
    const tampered = content.replace("# Original", "# Tampered");
    const result = checkIntegrity(tampered);
    assert.equal(result.intact, false);
  });
});
