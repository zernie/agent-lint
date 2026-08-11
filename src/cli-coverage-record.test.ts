/**
 * The composition root of the execution tier: `vigiles test` writing
 * `.vigiles/coverage.json` (cli.ts `recordRunCoverage`).
 *
 * Driven through the REAL built CLI, because the defect this file exists for was
 * not in the merge but in what the caller failed to TELL it. Reproduced
 * 2026-08-11 on the fixture below: a harness repointed from `hooks/a.sh` to
 * `hooks/b.sh` and re-run left records for both, and `vigiles lint` then printed
 * "2 MEASURED BY A RUN" — execution-tier coverage for a hook nothing executes.
 * The record never expired either: freshness is keyed to the SURFACE's text, and
 * rewriting the test does not touch the hook.
 *
 * Deterministic, model-free, offline → the free unit tier, like scan-cli.test.ts.
 */
import { test, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

import { makeTmpDir, cleanupTmpDir } from "./core/test-utils.js";

// __dirname is src/ when vitest resolves the .ts source → ".." is the repo root.
const CLI = resolve(__dirname, "..", "dist", "cli.js");
const RUN_HOOK = resolve(__dirname, "..", "dist", "run-hook.js");

let dir: string;

/** A harness whose only act is running one of the fixture's hooks. */
function harnessExercising(hook: string): string {
  return (
    `import { runHook } from ${JSON.stringify(RUN_HOOK)};\n` +
    `const r = runHook("sh ${hook}", { hook_event_name: "PreToolUse", ` +
    `tool_name: "Bash", tool_input: {} });\n` +
    `if (r.exitCode !== 0) process.exit(1);\n`
  );
}

function write(rel: string, body: string): void {
  const abs = join(dir, rel);
  mkdirSync(resolve(abs, ".."), { recursive: true });
  writeFileSync(abs, body);
}

/** Surface paths in the artifact, or `null` when no artifact was written. */
function recorded(): string[] | null {
  const file = join(dir, ".vigiles", "coverage.json");
  if (!existsSync(file)) return null;
  const doc = JSON.parse(readFileSync(file, "utf-8")) as {
    runs: { path: string }[];
  };
  return doc.runs.map((r) => r.path).sort();
}

function vigilesTest(...args: string[]): void {
  execFileSync("node", [CLI, "test", ...args], {
    cwd: dir,
    encoding: "utf-8",
    stdio: "pipe",
    timeout: 60000,
  });
}

beforeEach(() => {
  dir = makeTmpDir("cli-cov-record");
  write("hooks/a.sh", "#!/bin/sh\nexit 0\n");
  write("hooks/b.sh", "#!/bin/sh\nexit 0\n");
  write(
    ".claude/settings.json",
    JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: "sh hooks/a.sh" }],
          },
          {
            matcher: "Edit",
            hooks: [{ type: "command", command: "sh hooks/b.sh" }],
          },
        ],
      },
    }),
  );
});

afterEach(() => {
  cleanupTmpDir(dir);
});

test("a re-run that drops a surface withdraws the coverage it used to claim", () => {
  write("t.harness.mjs", harnessExercising("hooks/a.sh"));
  vigilesTest();
  assert.deepEqual(recorded(), ["hooks/a.sh"], "first run records what it ran");

  write("t.harness.mjs", harnessExercising("hooks/b.sh"));
  vigilesTest();
  assert.deepEqual(
    recorded(),
    ["hooks/b.sh"],
    "the abandoned surface must not stay 'measured by a run'",
  );
});

test("…and a harness emptied of everything withdraws all of it", () => {
  // No new records at all, so nothing overwrites the old key: the case a merge
  // can never reach on its own, and the one an author reaches by deleting code.
  write("t.harness.mjs", harnessExercising("hooks/a.sh"));
  vigilesTest();
  write("t.harness.mjs", "// nothing left to run\n");
  vigilesTest();
  assert.deepEqual(recorded(), []);
});

test("…but running ONE test by name leaves the other's records alone", () => {
  write("t.harness.mjs", harnessExercising("hooks/a.sh"));
  write("u.harness.mjs", harnessExercising("hooks/b.sh"));
  vigilesTest();
  assert.deepEqual(recorded(), ["hooks/a.sh", "hooks/b.sh"]);

  vigilesTest("t.harness.mjs");
  assert.deepEqual(
    recorded(),
    ["hooks/a.sh", "hooks/b.sh"],
    "naming one file must not erase the suite",
  );
});

test("a repo whose run exercises nothing still gets NO artifact", () => {
  // The invariant that survived the retraction change: absent artifact = today's
  // behaviour, exactly. Nothing to record and nothing to withdraw ⇒ no file, so
  // a fresh clone and somebody else's repo gain neither a file nor a nudge.
  write("t.harness.mjs", "// a unit test of a pure helper\n");
  vigilesTest();
  assert.equal(recorded(), null);
});
