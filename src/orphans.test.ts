import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { findOrphanDocs, formatOrphanReport } from "./orphans.js";
import { makeTmpDir, cleanupTmpDir } from "./test-utils.js";

describe("findOrphanDocs()", () => {
  it("flags docs not referenced anywhere", () => {
    const dir = makeTmpDir("orphans");
    try {
      mkdirSync(join(dir, "docs"), { recursive: true });
      mkdirSync(join(dir, "research"), { recursive: true });
      writeFileSync(join(dir, "docs/referenced.md"), "# ref");
      writeFileSync(join(dir, "docs/orphan.md"), "# orphan");
      writeFileSync(join(dir, "research/stale.md"), "# stale");
      writeFileSync(
        join(dir, "README.md"),
        "See [docs](docs/referenced.md) for more.",
      );

      const report = findOrphanDocs({ basePath: dir });
      assert.deepEqual(
        [...report.orphans].sort(),
        ["docs/orphan.md", "research/stale.md"],
      );
      assert.deepEqual([...report.referencedDocs], ["docs/referenced.md"]);
      assert.equal(report.totalDocs, 3);
    } finally {
      cleanupTmpDir(dir);
    }
  });

  it("recognizes backtick path references", () => {
    const dir = makeTmpDir("orphans-tick");
    try {
      mkdirSync(join(dir, "docs"), { recursive: true });
      writeFileSync(join(dir, "docs/foo.md"), "# foo");
      writeFileSync(join(dir, "CLAUDE.md"), "See `docs/foo.md` for details.");

      const report = findOrphanDocs({ basePath: dir });
      assert.deepEqual([...report.orphans], []);
      assert.deepEqual([...report.referencedDocs], ["docs/foo.md"]);
    } finally {
      cleanupTmpDir(dir);
    }
  });

  it("does not count a doc as referenced by itself", () => {
    const dir = makeTmpDir("orphans-self");
    try {
      mkdirSync(join(dir, "docs"), { recursive: true });
      writeFileSync(
        join(dir, "docs/lonely.md"),
        "See [me](docs/lonely.md) for details.",
      );

      const report = findOrphanDocs({ basePath: dir });
      assert.deepEqual([...report.orphans], ["docs/lonely.md"]);
    } finally {
      cleanupTmpDir(dir);
    }
  });

  it("honors custom docRoots", () => {
    const dir = makeTmpDir("orphans-roots");
    try {
      mkdirSync(join(dir, "guides"), { recursive: true });
      mkdirSync(join(dir, "docs"), { recursive: true });
      writeFileSync(join(dir, "guides/lost.md"), "# lost");
      writeFileSync(join(dir, "docs/ignored.md"), "# not scanned");
      writeFileSync(join(dir, "README.md"), "hello");

      const report = findOrphanDocs({ basePath: dir, docRoots: ["guides"] });
      assert.deepEqual([...report.orphans], ["guides/lost.md"]);
      assert.equal(report.totalDocs, 1);
    } finally {
      cleanupTmpDir(dir);
    }
  });

  it("ignores node_modules, dist, and .vigiles", () => {
    const dir = makeTmpDir("orphans-ignore");
    try {
      mkdirSync(join(dir, "docs"), { recursive: true });
      mkdirSync(join(dir, "node_modules/pkg"), { recursive: true });
      mkdirSync(join(dir, "dist"), { recursive: true });
      writeFileSync(join(dir, "docs/target.md"), "# target");
      // Only nested noise references the doc — should not save it
      writeFileSync(
        join(dir, "node_modules/pkg/README.md"),
        "[t](docs/target.md)",
      );
      writeFileSync(join(dir, "dist/CLAUDE.md"), "[t](docs/target.md)");

      const report = findOrphanDocs({ basePath: dir });
      assert.deepEqual([...report.orphans], ["docs/target.md"]);
    } finally {
      cleanupTmpDir(dir);
    }
  });
});

describe("formatOrphanReport()", () => {
  it("reports a clean state succinctly", () => {
    const out = formatOrphanReport({
      docRoots: ["docs"],
      totalDocs: 3,
      referencedDocs: ["docs/a.md", "docs/b.md", "docs/c.md"],
      orphans: [],
    });
    assert.match(out, /no orphan docs/);
  });

  it("lists orphans when present", () => {
    const out = formatOrphanReport({
      docRoots: ["docs"],
      totalDocs: 2,
      referencedDocs: ["docs/a.md"],
      orphans: ["docs/b.md"],
    });
    assert.match(out, /1 orphan/);
    assert.match(out, /docs\/b\.md/);
  });
});
