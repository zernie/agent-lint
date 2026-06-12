/**
 * Tests for the hook unit tier (src/run-hook.ts) — run a hook process directly
 * against a synthesized event, no `claude` CLI, no model. Covers the pure
 * decision logic and real (tiny shell) hooks across exit codes / JSON output /
 * stdin passthrough / env injection.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";

import {
  assertNoEgress,
  assertEgressOnly,
  assertWroteOnly,
} from "./harness-assert.js";
import {
  runHook,
  runHookWith,
  parseHookOutput,
  decideHook,
  type HookOutput,
  type RunHookDeps,
  type HookSpawnResult,
} from "./run-hook.js";
import { sandboxAvailable } from "./sandbox.js";

test("parseHookOutput parses a JSON decision and ignores plain text", () => {
  assert.deepEqual(parseHookOutput('{"decision":"block","reason":"no"}'), {
    decision: "block",
    reason: "no",
  });
  assert.equal(parseHookOutput("just a log line"), null);
  assert.equal(parseHookOutput("  not json {x"), null);
  // starts with "{" but invalid JSON → JSON.parse throws → caught → null
  assert.equal(parseHookOutput('{"unterminated": '), null);
});

test("decideHook: exit 2 blocks regardless of stdout", () => {
  const r = decideHook(2, null);
  assert.equal(r.blocked, true);
});

test("decideHook: legacy decision:block blocks on exit 0", () => {
  const json: HookOutput = { decision: "block" };
  const r = decideHook(0, json);
  assert.equal(r.blocked, true);
  assert.equal(r.decision, "block");
});

test("decideHook: permissionDecision:deny blocks and wins over legacy", () => {
  const json: HookOutput = {
    decision: "approve",
    hookSpecificOutput: { permissionDecision: "deny" },
  };
  const r = decideHook(0, json);
  assert.equal(r.blocked, true);
  assert.equal(r.decision, "deny"); // structured field preferred
});

test("decideHook: clean exit 0 with no JSON allows", () => {
  const r = decideHook(0, null);
  assert.equal(r.blocked, false);
  assert.equal(r.decision, undefined);
});

test("runHook: a guard that exits 2 reports blocked", () => {
  const r = runHook("exit 2", {
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
  });
  assert.equal(r.exitCode, 2);
  assert.equal(r.blocked, true);
});

test("runHook: a clean exit 0 is not blocked", () => {
  const r = runHook("exit 0", { hook_event_name: "Stop" });
  assert.equal(r.exitCode, 0);
  assert.equal(r.blocked, false);
});

test("runHook: a hook can read the event from stdin", () => {
  // Real-world shape: the hook inspects tool_input from the piped JSON and
  // blocks on a forbidden flag — the Edit/Write events the mock tier can't reach
  // are just as testable here.
  const guard = `node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      const i=JSON.parse(s);
      if(String(i.tool_input&&i.tool_input.command).includes("--no-verify"))process.exit(2);
    });'`;
  const blocked = runHook(guard, {
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "git commit --no-verify" },
  });
  assert.equal(blocked.blocked, true);
  const ok = runHook(guard, {
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "git commit -m ok" },
  });
  assert.equal(ok.blocked, false);
});

test("runHook: a JSON permission decision on stdout is parsed", () => {
  const cmd = `printf '%s' '{"hookSpecificOutput":{"permissionDecision":"deny","permissionDecisionReason":"nope"}}'`;
  const r = runHook(cmd, { hook_event_name: "PreToolUse" });
  assert.equal(r.blocked, true);
  assert.equal(r.decision, "deny");
  assert.equal(r.json?.hookSpecificOutput?.permissionDecisionReason, "nope");
});

test("runHook: env is injected so command strings with $VARS resolve", () => {
  const r = runHook('test "$VIGILES_FLAG" = "1" && exit 2 || exit 0', {
    hook_event_name: "PreToolUse",
  });
  assert.equal(r.blocked, false); // unset → exit 0
  const r2 = runHook(
    'test "$VIGILES_FLAG" = "1" && exit 2 || exit 0',
    {
      hook_event_name: "PreToolUse",
    },
    { env: { VIGILES_FLAG: "1" } },
  );
  assert.equal(r2.blocked, true);
});

test("runHook: governs MCP tools by name (no server needed)", () => {
  // The dominant real MCP test: a PreToolUse hook that blocks a destructive MCP
  // tool but allows read-only ones. The hook only sees the tool *name*
  // (`mcp__<server>__<tool>`), so this needs no running MCP server, no model —
  // the governance the unit tier already covers. Shape: a "deny merge" guard
  // over the github MCP server.
  const guard = `node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      const i=JSON.parse(s);
      if(/^mcp__github__(merge_pull_request|delete_)/.test(i.tool_name||""))process.exit(2);
    });'`;
  const merge = runHook(guard, {
    hook_event_name: "PreToolUse",
    tool_name: "mcp__github__merge_pull_request",
    tool_input: { pull_number: 42 },
  });
  assert.equal(merge.blocked, true, "destructive github-MCP tool is blocked");
  const read = runHook(guard, {
    hook_event_name: "PreToolUse",
    tool_name: "mcp__github__get_issue",
    tool_input: { issue_number: 1 },
  });
  assert.equal(read.blocked, false, "read-only github-MCP tool is allowed");
});

// --- the sandbox seam (runHookWith with fake spawners) ---------------------

const spawnRes = (o: Partial<HookSpawnResult> = {}): HookSpawnResult => ({
  status: 0,
  signal: null,
  stdout: "",
  stderr: "",
  ...o,
});

test("runHookWith routes direct vs sandbox by policy, refuses when unavailable", () => {
  let used = "";
  const deps = (available: boolean): RunHookDeps => ({
    available,
    direct: () => {
      used = "direct";
      return spawnRes({ stdout: '{"decision":"approve"}' });
    },
    sandboxed: () => {
      used = "sandbox";
      return spawnRes({ status: 2 });
    },
  });

  // default (no sandbox) → direct, regardless of availability
  const r1 = runHookWith("x", { hook_event_name: "Stop" }, {}, deps(true));
  assert.equal(used, "direct");
  assert.equal(r1.decision, "approve");

  // sandbox:"auto" + available → confined
  used = "";
  const r2 = runHookWith("x", {}, { sandbox: "auto" }, deps(true));
  assert.equal(used, "sandbox");
  assert.equal(r2.blocked, true); // exit 2

  // sandbox:"auto" + unavailable → refuse rather than run unconfined
  assert.throws(
    () => runHookWith("x", {}, { sandbox: "auto" }, deps(false)),
    /sandbox|bwrap/,
  );
});

test("runHookWith: trusted:false confines by default, refuses without bwrap", () => {
  let used = "";
  const deps = (available: boolean): RunHookDeps => ({
    available,
    direct: () => {
      used = "direct";
      return spawnRes();
    },
    sandboxed: () => {
      used = "sandbox";
      return spawnRes();
    },
  });

  // untrusted + no explicit sandbox + available → confined by default
  runHookWith("x", {}, { trusted: false }, deps(true));
  assert.equal(used, "sandbox");

  // untrusted + no explicit sandbox + unavailable → refuse, not run unconfined
  assert.throws(
    () => runHookWith("x", {}, { trusted: false }, deps(false)),
    /sandbox|bwrap/,
  );

  // recordEgress also forces confinement (the recorder lives in the netns)
  used = "";
  runHookWith("x", {}, { recordEgress: true }, deps(true));
  assert.equal(used, "sandbox");

  // untrusted but explicit opt-out → direct (you vouch for it / outer container)
  used = "";
  runHookWith("x", {}, { trusted: false, sandbox: false }, deps(true));
  assert.equal(used, "direct");

  // trusted (default) → direct even where a sandbox is available
  used = "";
  runHookWith("x", {}, {}, deps(true));
  assert.equal(used, "direct");
});

test("runHookWith maps a signal kill to exit 1", () => {
  const deps: RunHookDeps = {
    available: true,
    direct: () => spawnRes({ status: null, signal: "SIGKILL" }),
    sandboxed: () => spawnRes(),
  };
  assert.equal(runHookWith("x", {}, {}, deps).exitCode, 1);
});

// --- real bwrap confinement (skipped where bwrap is absent) ----------------

test.skipIf(!sandboxAvailable())(
  "sandbox: clears host env but adds opts.env back, runs confined",
  () => {
    process.env.VIG_FAKE_SECRET = "leaked";
    try {
      // $VIG_FAKE_SECRET must be empty under --clearenv; $GUARD is added back.
      const r = runHook(
        'printf "%s|%s" "$VIG_FAKE_SECRET" "$GUARD"',
        { hook_event_name: "Stop" },
        { sandbox: "auto", env: { GUARD: "ok" } },
      );
      assert.equal(r.exitCode, 0);
      assert.equal(r.stdout, "|ok");
    } finally {
      delete process.env.VIG_FAKE_SECRET;
    }
  },
);

// --- recordEgress: record + block a hook's network (needs real bwrap) -------

// Capturing Node's global fetch() needs NODE_USE_ENV_PROXY, which only takes
// effect on Node 22+. Proxy-honoring tools (curl/npm/pip) work on every version;
// this gate is only for the fetch-based session-start test below.
const nodeMajor = Number(process.versions.node.split(".")[0]);

test.skipIf(!sandboxAvailable() || nodeMajor < 22)(
  "dogfood: oh-my-claudecode's session-start hook update-checks ONLY the npm registry",
  () => {
    // A REAL, useful finding about a popular plugin: OMC's SessionStart hook
    // fetch()es registry.npmjs.org for an update check on every session start.
    // recordEgress captures it (Node fetch via NODE_USE_ENV_PROXY) and blocks it;
    // assertEgressOnly proves it phones the npm registry and nowhere else.
    const root = join(
      process.cwd(),
      "examples/harness/vendor/oh-my-claudecode@deee3a4",
    );
    // session-start only runs its full logic in a real workspace (a .git /
    // .omc-workspace marker), so give it a throwaway one as the confined cwd.
    const ws = mkdtempSync(join(tmpdir(), "omc-ws-"));
    writeFileSync(join(ws, ".omc-workspace"), "");
    const state = mkdtempSync(join(tmpdir(), "omc-state-"));
    const r = runHook(
      `node "${root}/scripts/run.cjs" "${root}/scripts/session-start.mjs"`,
      { hook_event_name: "SessionStart", source: "startup" },
      {
        recordEgress: true,
        cwd: ws,
        env: { CLAUDE_PLUGIN_ROOT: root, OMC_STATE_DIR: state },
        timeoutMs: 30000,
      },
    );
    assert.ok(
      r.egress.some((e) => e.host === "registry.npmjs.org"),
      `expected the update check to reach the npm registry; got ${JSON.stringify(r.egress)}`,
    );
    assertEgressOnly(r, ["registry.npmjs.org"]); // …and nowhere else
  },
);

test.skipIf(!sandboxAvailable())(
  "dogfood: the real oh-my-claudecode keyword-detector hook phones home to nothing",
  () => {
    // Run a REAL third-party plugin hook (vendored, pinned) under recordEgress
    // and assert it makes zero network egress — the kind of supply-chain check
    // this capability exists for.
    const root = join(
      process.cwd(),
      "examples/harness/vendor/oh-my-claudecode@deee3a4",
    );
    const r = runHook(
      `node "${root}/scripts/run.cjs" "${root}/scripts/keyword-detector.mjs"`,
      {
        hook_event_name: "UserPromptSubmit",
        prompt: "please ultrawork on this",
      },
      {
        recordEgress: true,
        env: { CLAUDE_PLUGIN_ROOT: root },
        timeoutMs: 30000,
      },
    );
    // it still does its job (injects routing) …
    assert.match(
      r.json?.hookSpecificOutput?.additionalContext ?? "",
      /ULTRAWORK/,
    );
    // … and it reached out to nothing.
    assertNoEgress(r);
  },
);

test.skipIf(!sandboxAvailable())(
  "dogfood: oh-my-claudecode keyword-detector writes ONLY its own state cache",
  () => {
    // Confine the real hook and record what it touches on disk: it should write
    // its keyword-state cache under .omc/ and nothing else.
    const root = join(
      process.cwd(),
      "examples/harness/vendor/oh-my-claudecode@deee3a4",
    );
    const r = runHook(
      `node "${root}/scripts/run.cjs" "${root}/scripts/keyword-detector.mjs"`,
      {
        hook_event_name: "UserPromptSubmit",
        prompt: "please ultrawork on this",
      },
      { sandbox: "auto", env: { CLAUDE_PLUGIN_ROOT: root }, timeoutMs: 30000 },
    );
    assert.ok(r.filesWritten.length > 0, "it writes its state cache");
    assertWroteOnly(r, [/^\.omc\//]); // …and only under .omc/
  },
);
