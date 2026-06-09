/**
 * Tests for the deterministic harness-test API: the real `claude` CLI runs the
 * real hooks/settings against a scripted mock model, so the outcome is
 * reproducible. Skipped cleanly when `claude` is not on PATH.
 *
 * Edit/Write tool-event hooks DO fire in this tier (`--allowedTools` allowlists
 * the edit tools past the permission prompt) — see the Edit/Write regression
 * tests below. An earlier claude version gated them headlessly; the tests lock in
 * that they work on current CLIs (verified on 2.1.169) and catch a re-gate.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runHarnessTest,
  scriptModel,
  claudeAvailable,
} from "./harness-test.js";

const maybe = claudeAvailable() ? test : test.skip;

// Regression: a PostToolUse hook fires on an Edit/Write tool use. This is the
// deterministic-tier capability a stale comment once said was impossible; the
// 2026-06-09 spike showed it firing 3/3, so we lock it in.
maybe("a PostToolUse hook fires on an Edit/Write tool use", async () => {
  const r = await runHarnessTest({
    settings: {
      hooks: {
        PostToolUse: [
          {
            matcher: "Write|Edit",
            hooks: [
              {
                // `{cwd}` is substituted with the sandbox dir (hooks may run
                // elsewhere); the marker proves the hook fired.
                type: "command",
                command: "echo FIRED >> {cwd}/hook.log",
              },
            ],
          },
        ],
      },
    },
    model: scriptModel([
      { tool: "Write", input: { file_path: "hello.txt", content: "banana" } },
      { text: "done" },
    ]),
    // No custom `prompt`: a non-default prompt makes the mocked turn no-op here,
    // so the scripted Write never runs. The default ("go") is reliable (5/5).
    timeoutMs: 90000,
  });
  try {
    assert.equal(r.file("hello.txt"), "banana", "the Write tool ran");
    assert.match(
      r.file("hook.log") ?? "",
      /FIRED/,
      "the Write|Edit PostToolUse hook fired",
    );
  } finally {
    r.cleanup();
  }
});

// Regression: a PreToolUse hook can BLOCK an Edit (exit 2) so the edit never
// applies — the governance shape, on the edit tools, in the deterministic tier.
// The mock must Read the file before editing (Claude Code requires a prior read,
// else the Edit never attempts and the hook never fires); the marker proves the
// hook actually ran, so "file unchanged" can't pass trivially via a no-op.
maybe("a PreToolUse hook blocks an Edit tool use", async () => {
  const r = await runHarnessTest({
    files: { "note.txt": "old" },
    settings: {
      hooks: {
        PreToolUse: [
          {
            matcher: "Edit",
            hooks: [
              {
                type: "command",
                command: "echo BLOCKED >> {cwd}/pre.log; exit 2",
              },
            ],
          },
        ],
      },
    },
    model: scriptModel([
      { tool: "Read", input: { file_path: "note.txt" } },
      {
        tool: "Edit",
        input: { file_path: "note.txt", old_string: "old", new_string: "new" },
      },
      { text: "done" },
    ]),
    timeoutMs: 90000,
  });
  try {
    assert.match(
      r.file("pre.log") ?? "",
      /BLOCKED/,
      "the PreToolUse Edit hook actually fired",
    );
    assert.equal(
      r.file("note.txt"),
      "old",
      "the PreToolUse hook blocked the edit (file unchanged)",
    );
  } finally {
    r.cleanup();
  }
});

maybe("a blocking Stop hook forces the agent to keep working", async () => {
  // The Stop hook blocks completion until a DONE file exists; the scripted
  // agent creates it on the second turn, so the run must take >1 turn.
  const r = await runHarnessTest({
    settings: {
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: "command",
                command: "test -f DONE || { echo 'not done yet' >&2; exit 2; }",
              },
            ],
          },
        ],
      },
    },
    model: scriptModel([
      { text: "I think I'm done" }, // tries to stop → blocked (no DONE)
      { tool: "Bash", input: { command: "touch DONE" } }, // then creates DONE
      { text: "now actually done" },
    ]),
    prompt: "finish the task",
    timeoutMs: 90000,
  });
  try {
    let numTurns = 0;
    try {
      numTurns =
        (JSON.parse(r.stdout) as { num_turns?: number }).num_turns ?? 0;
    } catch {
      /* ignore */
    }
    assert.ok(r.file("DONE") !== null, "agent eventually created DONE");
    assert.ok(
      numTurns > 1,
      `Stop hook should force >1 turn, got ${String(numTurns)}`,
    );
  } finally {
    r.cleanup();
  }
});
