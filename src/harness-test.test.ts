/**
 * Tests for the deterministic harness-test API: the real `claude` CLI runs the
 * real hooks/settings against a scripted mock model, so the outcome is
 * reproducible. Skipped cleanly when `claude` is not on PATH.
 *
 * (Note: the simple mock drives the Bash tool and Stop hooks; the Edit/Write
 * tools are gated in headless mode and don't fire via the mock — drive file
 * actions through Bash, or use the real-model eval tier for Edit/Write hooks.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runHarnessTest,
  scriptModel,
  claudeAvailable,
} from "./harness-test.js";

const maybe = claudeAvailable() ? test : test.skip;

// Tool execution via the mock (PostToolUse on a Bash/Edit/Write tool) is
// environment-sensitive — under heavy nested-CLI load the managed endpoint can
// return a 1-turn no-op, and the Edit/Write tools are gated in headless mode.
// Stop-hook enforcement (below) is the reliable deterministic path; for
// tool-event hooks, prefer the real-model eval tier.
test.skip("a PostToolUse hook fires on the agent's tool use", async () => {
  const r = await runHarnessTest({
    settings: {
      hooks: {
        PostToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command",
                // Side effect we can assert on: the hook ran. `{cwd}` is
                // substituted with the working dir (hooks run elsewhere).
                command: "echo HOOK_FIRED >> {cwd}/hook.log",
              },
            ],
          },
        ],
      },
    },
    model: scriptModel([
      { tool: "Bash", input: { command: "touch ran.marker" } },
      { text: "done" },
    ]),
    prompt: "run the bash tool",
    timeoutMs: 90000,
  });
  try {
    assert.ok(r.file("ran.marker") !== null, "the agent's Bash tool ran");
    assert.match(r.file("hook.log") ?? "", /HOOK_FIRED/);
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
