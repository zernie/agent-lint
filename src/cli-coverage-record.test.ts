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

test("…and the retraction survives being spelled `./t.harness.mjs`", () => {
  // 🔴 Measured 2026-08-12, the same fixture as the test above with ONE change:
  // the second run names the file with a `./`. That used to be a different key,
  // so nothing was withdrawn and `lint` printed "1 MEASURED BY A RUN" for a hook
  // an emptied harness no longer touches — with no expiry, since freshness is
  // keyed to the SURFACE's text and rewriting the test does not change it.
  write("t.harness.mjs", harnessExercising("hooks/a.sh"));
  vigilesTest();
  assert.deepEqual(recorded(), ["hooks/a.sh"]);

  write("t.harness.mjs", "// nothing left to run\n");
  vigilesTest("./t.harness.mjs");
  assert.deepEqual(
    recorded(),
    [],
    "a spelling of the same file must retract the same record",
  );
});

test("…and being spelled as an ABSOLUTE path", () => {
  write("t.harness.mjs", harnessExercising("hooks/a.sh"));
  vigilesTest();
  write("t.harness.mjs", "// nothing left to run\n");
  vigilesTest(join(dir, "t.harness.mjs"));
  assert.deepEqual(recorded(), []);
});

test("one script run under two spellings holds ONE record", () => {
  // The other half of the same split: without a canonical key the artifact grows
  // an entry per spelling, so `by` stops identifying the script that ran.
  write("t.harness.mjs", harnessExercising("hooks/a.sh"));
  vigilesTest("./t.harness.mjs");
  vigilesTest();
  const file = join(dir, ".vigiles", "coverage.json");
  const doc = JSON.parse(readFileSync(file, "utf-8")) as {
    runs: { path: string; by: string }[];
  };
  assert.equal(doc.runs.length, 1, JSON.stringify(doc.runs));
});

test("a repo whose run exercises nothing still gets NO artifact", () => {
  // The invariant that survived the retraction change: absent artifact = today's
  // behaviour, exactly. Nothing to record and nothing to withdraw ⇒ no file, so
  // a fresh clone and somebody else's repo gain neither a file nor a nudge.
  write("t.harness.mjs", "// a unit test of a pure helper\n");
  vigilesTest();
  assert.equal(recorded(), null);
});

// ─── discovery must use the harness this repo actually targets ─────────────────
//
// 🔴 Reproduced 2026-08-12. `resolveRecords` called `findUntestedSurfaces` with a
// path alone, so discovery fell back to the Claude Code layout whatever the repo
// was. Since resolution matches each probe against the DISCOVERED surfaces, the
// wrong layout does not error — it discovers a different set, and every probe that
// fails to match is silently dropped. `vigiles lint` never had the bug: it threads
// `adapter.layout` into the same function.
//
// The direction demonstrated here is the observable one in the free tier: a repo
// that targets Codex must stop being credited for a `.claude/settings.json` hook,
// which is not a surface of its harness at all. (The mirror direction — a Codex
// skill earning execution coverage — is only reachable through a transcript, i.e.
// the model tier, since a skill probe comes from what FIRED, not from a command
// line. Hook discovery under the Codex layout is JSON-only and does not read
// `config.toml`: a separate, documented layout-port gap, not this fix.)
test("a repo that targets Codex is not credited for a Claude Code hook", () => {
  write("t.harness.mjs", harnessExercising("hooks/a.sh"));
  vigilesTest();
  assert.deepEqual(
    recorded(),
    ["hooks/a.sh"],
    "precondition: as a Claude Code repo, the run records the hook",
  );

  // One file turns it into a Codex repo. Nothing else changes.
  write(".codex/config.toml", "[mcp_servers]\n");
  write("t.harness.mjs", harnessExercising("hooks/a.sh"));
  vigilesTest();
  assert.deepEqual(
    recorded(),
    [],
    "the recorder must discover with the ACTIVE layout, not the default one",
  );
});

// 🔴 Reproduced 2026-08-12, the round after the layout fix above. `--harness=` is
// a SHARED flag (`cli-flag-check.ts`) and `resolveHarnessSelection` ranks it ABOVE
// config and auto-detection — but `resolveRecords` called `harnessLayoutFor(cwd,
// loadConfig())` and never handed it the flag, so the one input whose whole job is
// to override the other two was dropped exactly where the override matters. Same
// silent empty set as before: probes matched against another layout's surfaces
// resolve to nothing and are discarded, and nothing errors.
test("`--harness=` overrides an auto-detected Claude Code repo for the recorder too", () => {
  write("t.harness.mjs", harnessExercising("hooks/a.sh"));
  vigilesTest();
  assert.deepEqual(
    recorded(),
    ["hooks/a.sh"],
    "precondition: nothing on disk says Codex — this repo auto-detects as Claude Code",
  );

  // Same repo, same run, ONE flag. Under the Codex layout a `.claude/settings.json`
  // hook is not a surface at all, so the probe resolves to nothing and the record
  // is withdrawn.
  vigilesTest("--harness=codex");
  assert.deepEqual(
    recorded(),
    [],
    "the flag outranks auto-detection, so discovery must run under the Codex layout",
  );
});

test("…and the flag is not assumed: the default and an explicit `claude-code` still record", () => {
  // The QUIET half. Without it, the check above passes on any change that merely
  // stops recording — a threading fix that mis-read the flag would look identical.
  write("t.harness.mjs", harnessExercising("hooks/a.sh"));
  vigilesTest();
  assert.deepEqual(recorded(), ["hooks/a.sh"], "no flag: unchanged behaviour");

  vigilesTest("--harness=claude-code");
  assert.deepEqual(
    recorded(),
    ["hooks/a.sh"],
    "naming the harness this repo already is must change nothing",
  );
});
