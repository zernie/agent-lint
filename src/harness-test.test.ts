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
import { test } from "vitest";
import assert from "node:assert/strict";
import { join } from "node:path";

test("runHarness steers a real-model run to measure() (no claude needed)", async () => {
  // The harness scope is deterministic (mock); a real-model run is
  // non-deterministic, so a single one can't be asserted — runHarness says so.
  await assert.rejects(
    runHarness({ model: [], prompt: "go" }, { model: "real" }),
    /measure\(\)/,
  );
});

import {
  runHarnessTest,
  runHarness,
  scriptModel,
  claudeAvailable,
  parseToolCalls,
  parseOutput,
  parseHooks,
  buildClaudeArgs,
} from "./harness-test.js";
import {
  assertToolUsed,
  assertToolNotUsed,
  assertSkillResolved,
  assertToolUsedWith,
  assertToolSequence,
  assertToolCount,
  assertToolCalls,
} from "./harness-assert.js";

const maybe = claudeAvailable() ? test : test.skip;

// Pure: the shared claude argv (no model, no claude). Covers the transcript /
// pluginDir / settings / default-tools branches.
test("buildClaudeArgs: transcript, pluginDir, settings, and tool defaults", () => {
  const base = buildClaudeArgs({ model: scriptModel([]) }, false);
  assert.deepEqual(base.slice(0, 2), ["-p", "go"]); // default prompt
  assert.ok(base.includes("json") && !base.includes("stream-json"));
  assert.ok(!base.includes("--plugin-dir") && !base.includes("--settings"));
  // default allowed tools come last
  assert.deepEqual(base.slice(-5), [
    "--allowedTools",
    "Read",
    "Edit",
    "Write",
    "Bash",
  ]);

  const full = buildClaudeArgs(
    {
      model: scriptModel([]),
      prompt: "do it",
      transcript: true,
      pluginDir: "examples/harness/fixture-skill-plugin",
      allowedTools: ["Bash"],
    },
    true,
  );
  assert.deepEqual(full.slice(0, 2), ["-p", "do it"]);
  assert.ok(full.includes("stream-json") && full.includes("--verbose"));
  assert.ok(full.includes("--plugin-dir") && full.includes("--settings"));
  assert.deepEqual(full.slice(-2), ["--allowedTools", "Bash"]);
});

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
    transcript: true, // capture the stream so r.hooks records the firing
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
    // The marker IS the verification here: the hook wrote it, so it ran. We do
    // NOT also assert via the stream (`assertHookFired`) because Claude Code does
    // not emit `hook_response` stream events for Edit/Write tool hooks in headless
    // mode — see CLAUDE.md ("NOT Edit/Write tool events (headless-gated)"). It
    // works headed (local) but not in CI, so the stream check is unreliable for
    // these tools; the marker (a real file the hook wrote) is the honest signal.
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
    transcript: true, // capture the stream so r.hooks records the block decision
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
    // Verification = the marker (BLOCKED was written, so the hook ran) + the
    // effect (file unchanged, so it actually blocked). We do NOT also assert via
    // the stream (`assertHookFired`): Claude Code doesn't emit `hook_response`
    // stream events for Edit tool hooks headless (CLAUDE.md: "Edit/Write …
    // headless-gated"), so it's reliable headed/local but empty in CI. The marker
    // proves firing without depending on the headless-gated stream.
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

// Skill-wiring: a plugin installed natively via `--plugin-dir` registers its
// skills, so a scripted `Skill` tool_use RESOLVES (the skill body is injected) —
// deterministic, no real model. This is the wiring tier for skills; whether the
// model *chooses* a skill is the eval tier. (File-materialization does NOT
// register skills — only --plugin-dir does — see research/harness-testing-coverage-matrix.md.)
maybe(
  "a plugin skill installed via --plugin-dir resolves through the Skill tool",
  async () => {
    // __dirname is dist/ at runtime; the fixture lives at the repo root.
    const pluginDir = join(
      __dirname,
      "../examples/harness/fixture-skill-plugin",
    );
    const r = await runHarnessTest({
      pluginDir,
      sandbox: false, // in-repo fixture we authored → trusted, run direct
      allowedTools: ["Read", "Edit", "Write", "Bash", "Skill"],
      transcript: true, // populate r.toolCalls
      model: scriptModel([
        { tool: "Skill", input: { skill: "demo:greet" } },
        { text: "ok" },
      ]),
      timeoutMs: 90000,
    });
    try {
      // The action invariant — vs the brittle `r.stdout.includes(MARKER)` this
      // replaces. assertSkillResolved checks a non-error Skill tool_use by name.
      assertToolUsed(r, "Skill");
      assertSkillResolved(r, "demo:greet");
      assertToolNotUsed(r, /^mcp__/); // safety negative: no MCP tool was used
    } finally {
      r.cleanup();
    }
  },
);

// Grounded in REAL vendored plugins — the payoff of toolCalls: you can assert a
// real plugin's skill activates with NO marker injected into it (marker-grep only
// works on fixtures you control). Both skills resolve via --plugin-dir.
for (const [label, dir, skill] of [
  [
    "obra/superpowers",
    "../examples/harness/vendor/superpowers@6fd4507",
    "superpowers:test-driven-development",
  ],
  [
    "wshobson/agents",
    "../examples/harness/vendor/wshobson-accessibility@cf6059d",
    "accessibility-compliance:wcag-audit-patterns",
  ],
] as const) {
  maybe(`a real ${label} skill resolves via --plugin-dir`, async () => {
    const r = await runHarnessTest({
      pluginDir: join(__dirname, dir),
      sandbox: false, // pinned vendored plugin we audited → trusted, run direct
      allowedTools: ["Read", "Edit", "Write", "Bash", "Skill"],
      transcript: true,
      model: scriptModel([{ tool: "Skill", input: { skill } }, { text: "ok" }]),
      timeoutMs: 120000,
    });
    try {
      assertSkillResolved(r, skill); // no marker needed — it's a real plugin
    } finally {
      r.cleanup();
    }
  });
}

// Sequence / budget invariants over a REAL run: the agent reads then edits, and
// we assert the workflow — ordering ("Read before Edit", the rule Claude enforces),
// a budget ("≤ 1 Edit, 0 Writes"), and a custom invariant.
maybe("tool-call sequence + budget invariants hold on a real run", async () => {
  const r = await runHarnessTest({
    files: { "note.txt": "old" },
    allowedTools: ["Read", "Edit", "Write", "Bash"],
    transcript: true,
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
    assertToolSequence(r, ["Read", "Edit"]); // ordering
    assertToolCount(r, "Edit", { max: 1 }); // budget
    assertToolCount(r, "Write", { exactly: 0 });
    // tool-ARGUMENT invariant: the Edit targeted the right file (not just "an Edit ran")
    assertToolUsedWith(
      r,
      "Edit",
      (i) => (i as { file_path?: string }).file_path === "note.txt",
    );
    assert.equal(typeof r.output, "string"); // unified Trace: final answer captured
    assertToolCalls(
      r,
      (calls) => {
        // every Edit was preceded by a Read
        let read = false;
        for (const c of calls) {
          if (c.name === "Read") read = true;
          if (c.name === "Edit" && !read) return false;
        }
        return true;
      },
      "an Edit happened before any Read",
    );
  } finally {
    r.cleanup();
  }
});

test("parseToolCalls: pairs tool_use with tool_result from a stream-json transcript", () => {
  const stream = [
    JSON.stringify({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "Skill",
            input: { skill: "x:y" },
          },
        ],
      },
    }),
    JSON.stringify({
      type: "user",
      message: {
        content: [{ type: "tool_result", tool_use_id: "t1", content: "ran" }],
      },
    }),
    "not json — ignored",
    JSON.stringify({ type: "result", result: "done" }),
  ].join("\n");
  const calls = parseToolCalls(stream);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.name, "Skill");
  assert.equal(calls[0]?.resultText, "ran");
  assert.equal(calls[0]?.isError, false);
  assert.equal(parseToolCalls("{not stream json}").length, 0);
});

test("parseToolCalls: covers id / content-shape / error / no-result branches", () => {
  const stream = [
    "", // blank line skipped
    "not json — ignored", // parse error skipped
    JSON.stringify({ type: "x", message: { content: "notarray" } }), // content not an array
    JSON.stringify({
      type: "a",
      message: {
        content: [
          { type: "text", text: "prose" }, // neither tool_use nor tool_result
          { type: "tool_use", id: "u1", name: "A", input: {} },
          { type: "tool_use", input: {} }, // tool_use with no name → skipped
          { type: "tool_use", name: "NoId", input: {} }, // tool_use with no id
          { type: "tool_use", id: "u3", name: "C", input: {} },
        ],
      },
    }),
    JSON.stringify({
      type: "u",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "u1",
            content: "plain",
            is_error: true,
          },
          { type: "tool_result", content: ["x", { text: "y" }, { z: 1 }] }, // no id; array w/ string + text + no-text
          { type: "tool_result", tool_use_id: "u3", content: 42 }, // non-string, non-array content
        ],
      },
    }),
  ].join("\n");
  const calls = parseToolCalls(stream);
  assert.equal(calls.length, 3); // A, NoId, C (the no-name tool_use is skipped)
  const a = calls.find((c) => c.name === "A");
  assert.equal(a?.resultText, "plain"); // string content
  assert.equal(a?.isError, true);
  // The no-id tool_use and the no-id tool_result both key on "" and so pair up;
  // the array content ["x", {text:"y"}, {no text}] joins to "xy".
  const noid = calls.find((c) => c.name === "NoId");
  assert.equal(noid?.resultText, "xy");
  assert.equal(noid?.isError, false);
  const c = calls.find((c) => c.name === "C");
  assert.equal(c?.resultText, ""); // non-string/array content (42) → ""
});

test("parseOutput: returns the final answer from the terminal result event", () => {
  const stream = [
    "", // blank line → skipped
    JSON.stringify({ type: "assistant", message: { content: [] } }),
    "not json — ignored",
    JSON.stringify({
      type: "result",
      subtype: "success",
      result: "the answer",
    }),
  ].join("\n");
  assert.equal(parseOutput(stream), "the answer");
  // a result event whose `result` is non-string → ""
  assert.equal(parseOutput(JSON.stringify({ type: "result", result: 42 })), "");
  // single-object `--output-format json` carries the same {type:"result"} shape
  assert.equal(
    parseOutput(JSON.stringify({ type: "result", result: "x" })),
    "x",
  );
  assert.equal(parseOutput("no result event here"), "");
});

test("parseHooks: records hook firing + block decision from stream events", () => {
  const stream = [
    JSON.stringify({
      type: "system",
      subtype: "hook_response",
      hook_name: "PostToolUse:Bash",
      hook_event: "PostToolUse",
      exit_code: 0,
      outcome: "success",
      output: "POST_OK\n",
    }),
    JSON.stringify({
      type: "system",
      subtype: "hook_response",
      hook_name: "PreToolUse:Edit",
      hook_event: "PreToolUse",
      exit_code: 2,
      outcome: "error",
      output: "BLOCKED\n",
    }),
    JSON.stringify({ type: "assistant", message: { content: [] } }), // ignored
  ].join("\n");
  const hooks = parseHooks(stream);
  assert.equal(hooks.length, 2);
  assert.equal(hooks[0]?.name, "PostToolUse:Bash");
  assert.equal(hooks[0]?.blocked, false);
  assert.equal(hooks[1]?.event, "PreToolUse");
  assert.equal(hooks[1]?.exitCode, 2);
  assert.equal(hooks[1]?.blocked, true);
  assert.equal(parseHooks("{not stream json}").length, 0);
});

test("parseHooks: defensive field coercion + the block decision branches", () => {
  const stream = [
    // outcome success but a non-zero exit → blocked via the exit-code arm
    JSON.stringify({
      type: "system",
      subtype: "hook_response",
      hook_name: "Stop",
      hook_event: "Stop",
      exit_code: 1,
      outcome: "success",
      output: "x",
    }),
    // malformed: non-number exit_code, missing name/event/output → coerced
    JSON.stringify({
      type: "system",
      subtype: "hook_response",
      exit_code: "nope",
    }),
    // a non-hook_response system event → skipped
    JSON.stringify({ type: "system", subtype: "init" }),
  ].join("\n");
  const hooks = parseHooks(stream);
  assert.equal(hooks.length, 2);
  assert.equal(hooks[0]?.blocked, true); // success + exit 1 → blocked
  assert.equal(hooks[1]?.exitCode, undefined); // non-number → undefined
  assert.equal(hooks[1]?.name, ""); // missing → ""
  assert.equal(hooks[1]?.event, ""); // missing → ""
  assert.equal(hooks[1]?.output, ""); // missing → ""
  assert.equal(hooks[1]?.blocked, false); // not error, no numeric exit
});
