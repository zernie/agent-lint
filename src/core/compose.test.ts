import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { detectSyncTools, composeCollisions } from "./compose.js";
import { makeTmpDir, cleanupTmpDir } from "./test-utils.js";

function withRepo(fn: (dir: string) => void): void {
  const dir = makeTmpDir("compose");
  try {
    fn(dir);
  } finally {
    cleanupTmpDir(dir);
  }
}

test("detectSyncTools: empty repo detects nothing", () => {
  withRepo((dir) => {
    assert.deepEqual(detectSyncTools(dir), []);
  });
});

test("detectSyncTools: .ruler/ dir → ruler with .ruler/AGENTS.md source slot", () => {
  withRepo((dir) => {
    mkdirSync(join(dir, ".ruler"));
    const tools = detectSyncTools(dir);
    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, "ruler");
    assert.equal(tools[0].sourceSlot, join(".ruler", "AGENTS.md"));
  });
});

test("detectSyncTools: a bare ruler.toml also keys ruler", () => {
  withRepo((dir) => {
    writeFileSync(join(dir, "ruler.toml"), "[agents]\n");
    const tools = detectSyncTools(dir);
    assert.deepEqual(
      tools.map((t) => t.name),
      ["ruler"],
    );
  });
});

test("detectSyncTools: .rulesync/ dir → rulesync with rules source slot", () => {
  withRepo((dir) => {
    mkdirSync(join(dir, ".rulesync"));
    const tools = detectSyncTools(dir);
    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, "rulesync");
    assert.equal(tools[0].sourceSlot, join(".rulesync", "rules", "vigiles.md"));
  });
});

test("detectSyncTools: both tools present are both detected", () => {
  withRepo((dir) => {
    mkdirSync(join(dir, ".ruler"));
    mkdirSync(join(dir, ".rulesync"));
    const names = detectSyncTools(dir)
      .map((t) => t.name)
      .sort();
    assert.deepEqual(names, ["ruler", "rulesync"]);
  });
});

test("composeCollisions: CLAUDE.md target collides with Ruler output", () => {
  withRepo((dir) => {
    mkdirSync(join(dir, ".ruler"));
    const collisions = composeCollisions(dir, ["CLAUDE.md"]);
    assert.equal(collisions.length, 1);
    assert.equal(collisions[0].tool, "ruler");
    assert.equal(collisions[0].target, "CLAUDE.md");
    assert.equal(collisions[0].redirectTo, join(".ruler", "AGENTS.md"));
    assert.match(collisions[0].reason, /integrity hash/);
  });
});

test("composeCollisions: a path-qualified target matches by filename", () => {
  withRepo((dir) => {
    mkdirSync(join(dir, ".ruler"));
    const collisions = composeCollisions(dir, ["docs/CLAUDE.md"]);
    assert.equal(collisions.length, 1);
    assert.equal(collisions[0].target, "docs/CLAUDE.md");
  });
});

test("composeCollisions: no sync tool → no collisions even on CLAUDE.md", () => {
  withRepo((dir) => {
    assert.deepEqual(composeCollisions(dir, ["CLAUDE.md", "AGENTS.md"]), []);
  });
});

test("composeCollisions: a non-overlapping target does not collide", () => {
  withRepo((dir) => {
    mkdirSync(join(dir, ".ruler"));
    assert.deepEqual(composeCollisions(dir, ["INSTRUCTIONS.txt"]), []);
  });
});

test("composeCollisions: both tools each collide on AGENTS.md", () => {
  withRepo((dir) => {
    mkdirSync(join(dir, ".ruler"));
    mkdirSync(join(dir, ".rulesync"));
    const collisions = composeCollisions(dir, ["AGENTS.md"]);
    assert.deepEqual(collisions.map((c) => c.tool).sort(), [
      "ruler",
      "rulesync",
    ]);
  });
});
