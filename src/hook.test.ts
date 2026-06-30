/**
 * Compiled-hooks E2E (vitest) — drives the REAL built CLI runtime the compiled
 * hooks block points at (`node dist/cli.js hook-runtime run-program <file>`) over
 * `runHook`, proving the whole loop works end to end with no model:
 *   - a Bash GATE denies `git push -f` (exit 2 + reason) and allows benign;
 *   - the AST matcher catches a compound bypass `cd x && git push -f`;
 *   - an INJECT hook emits `additionalContext` (the right field, never written);
 *   - a PROMPT-GATE denies a secret-bearing prompt; a STOP-GATE blocks stopping
 *     (and respects the loop guard);
 *   - an OBSERVE-mode gate records-not-blocks (exit 0 + a jsonl record);
 *   - a `needs:['git.branch']` gate decides on the real branch the runtime gathers;
 *   - `compile` REJECTS an out-of-vocabulary import (capability = API);
 *   - a stamped artifact that is then hand-edited is REFUSED at runtime (exit 2).
 *
 * The fixtures import the built `dist/hook.js` by absolute path, so this runs
 * after `npm run build` like the other CLI-driven suites.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  symlinkSync,
  existsSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runHook } from "./run-hook.js";
import { spawnSync } from "node:child_process";
import { makeTmpDir, cleanupTmpDir, initGitRepo } from "./core/test-utils.js";

const REPO_ROOT = resolve(__dirname, "..");
const CLI = resolve(REPO_ROOT, "dist", "cli.js");
const HOOK_DIST = pathToFileURL(resolve(REPO_ROOT, "dist", "hook.js")).href;

/** Write a .mjs hook fixture importing the built public API; return its path. */
function fixture(dir: string, name: string, body: string): string {
  const p = resolve(dir, name);
  writeFileSync(p, body.replaceAll("__HOOK__", HOOK_DIST));
  return p;
}

/**
 * Symlink `<dir>/node_modules/vigiles` → the repo, so a fixture importing the
 * CANONICAL `vigiles/hook` specifier both passes `checkHookImports` (capability
 * = API surface) AND resolves through the real package `exports` map. Real
 * users get this from `npm i vigiles`; the test recreates that resolution.
 */
function linkVigiles(dir: string): void {
  mkdirSync(resolve(dir, "node_modules"), { recursive: true });
  symlinkSync(REPO_ROOT, resolve(dir, "node_modules", "vigiles"));
}

const GATE = `import { defineHook, tool, deny, allow } from "__HOOK__";
export default defineHook({
  on: "PreToolUse",
  match: tool("Bash"),
  decide: (e) =>
    e.command.runs("git push", { force: true })
      ? deny("no force-push to a protected branch")
      : allow(),
});`;

test("hook-runtime run-program: a gate denies force-push (exit 2) and allows benign", () => {
  const dir = makeTmpDir();
  try {
    const f = fixture(dir, "guard.mjs", GATE);
    const denied = runHook(
      `node ${CLI} hook-runtime run-program ${f}`,
      {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "git push --force origin main" },
      },
      { cwd: dir },
    );
    assert.equal(denied.blocked, true);
    assert.equal(denied.exitCode, 2);
    assert.match(denied.stderr, /force-push/);

    const allowed = runHook(
      `node ${CLI} hook-runtime run-program ${f}`,
      {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "git status" },
      },
      { cwd: dir },
    );
    assert.equal(allowed.blocked, false);
    assert.equal(allowed.exitCode, 0);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("hook-runtime run-program: the AST matcher catches a compound-command bypass", () => {
  const dir = makeTmpDir();
  try {
    const f = fixture(dir, "guard.mjs", GATE);
    const r = runHook(
      `node ${CLI} hook-runtime run-program ${f}`,
      {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "cd repo && git commit -am wip && git push -f" },
      },
      { cwd: dir },
    );
    assert.equal(r.blocked, true);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("hook-runtime run-program: an inject hook emits additionalContext (the right field)", () => {
  const dir = makeTmpDir();
  try {
    const f = fixture(
      dir,
      "brief.mjs",
      `import { defineInject, inject } from "__HOOK__";
export default defineInject({
  on: "SessionStart",
  produce: (e) => inject("vigiles: session started (" + e.source + ")"),
});`,
    );
    const r = runHook(
      `node ${CLI} hook-runtime run-program ${f}`,
      { hook_event_name: "SessionStart", source: "startup" },
      { cwd: dir },
    );
    assert.equal(r.exitCode, 0);
    assert.ok(r.json, "inject hook must emit JSON on stdout");
    assert.equal(r.json?.hookSpecificOutput?.hookEventName, "SessionStart");
    assert.match(
      r.json?.hookSpecificOutput?.additionalContext ?? "",
      /session started \(startup\)/,
    );
  } finally {
    cleanupTmpDir(dir);
  }
});

test("compile (hook): an out-of-vocabulary import does NOT compile (exit 1)", () => {
  const dir = makeTmpDir();
  try {
    const f = fixture(
      dir,
      "evil.mjs",
      `import cp from "node:child_process";
import { defineHook, tool, allow } from "__HOOK__";
export default defineHook({ on: "PreToolUse", match: tool("Bash"),
  decide: () => { cp.execSync("id"); return allow(); } });`,
    );
    const r = spawnSync("node", [CLI, "compile", f], {
      cwd: dir,
      encoding: "utf-8",
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /capabilities outside `vigiles\/hook`/);
  } finally {
    cleanupTmpDir(dir);
  }
});

const GATE_PKG = `import { defineHook, tool, deny, allow } from "vigiles/hook";
export default defineHook({
  on: "PreToolUse",
  match: tool("Bash"),
  decide: (e) =>
    e.command.runs("git push", { force: true })
      ? deny("no force-push to a protected branch")
      : allow(),
});`;

test("compile (hook): a clean hook compiles, MERGES into settings.json, stamps, and the stamp gates a hand-edit", () => {
  const dir = makeTmpDir();
  try {
    linkVigiles(dir);
    writeFileSync(resolve(dir, "guard.mjs"), GATE_PKG);
    // `compile <hookfile>` folds hook compilation into the one verb: it writes
    // the stamp sidecar AND merges the block into the harness config.
    const c = spawnSync("node", [CLI, "compile", "guard.mjs"], {
      cwd: dir,
      encoding: "utf-8",
    });
    assert.equal(c.status, 0, c.stderr);
    assert.match(c.stdout, /role: bash-gate/);
    // The wiring is written, not printed: it lands in .claude/settings.json.
    const settings = readFileSync(
      resolve(dir, ".claude/settings.json"),
      "utf-8",
    );
    assert.match(settings, /hook-runtime run-program guard\.mjs/);

    // The compiled hook still enforces.
    const ok = runHook(
      `node ${CLI} hook-runtime run-program guard.mjs`,
      {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "git push -f" },
      },
      { cwd: dir },
    );
    assert.equal(ok.blocked, true);

    // Hand-edit the artifact AFTER compiling → the stamp no longer matches →
    // the runtime REFUSES it (fail closed, exit 2), even on a benign event.
    const edited = readFileSync(resolve(dir, "guard.mjs"), "utf-8").replace(
      'deny("no force-push to a protected branch")',
      "allow()",
    );
    writeFileSync(resolve(dir, "guard.mjs"), edited);
    const tampered = runHook(
      `node ${CLI} hook-runtime run-program guard.mjs`,
      {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "git status" },
      },
      { cwd: dir },
    );
    assert.equal(tampered.exitCode, 2);
    assert.match(tampered.stderr, /does not match its compiled stamp/);
  } finally {
    cleanupTmpDir(dir);
  }
});

test("compile --harness=codex (hook): merges TOML for a gate, warns LOUDLY on inject (the honest gap)", () => {
  const dir = makeTmpDir();
  try {
    linkVigiles(dir);
    writeFileSync(resolve(dir, "guard.mjs"), GATE_PKG);
    writeFileSync(
      resolve(dir, "brief.mjs"),
      `import { defineInject, inject } from "vigiles/hook";
export default defineInject({ on: "SessionStart", produce: (e) => inject("hi " + e.source) });`,
    );
    // A gate merges into the Codex TOML config with a regex matcher — no warning
    // (deny→exit 2 is cross-harness).
    const gate = spawnSync(
      "node",
      [CLI, "compile", "guard.mjs", "--harness=codex"],
      { cwd: dir, encoding: "utf-8" },
    );
    assert.equal(gate.status, 0, gate.stderr);
    const config = readFileSync(resolve(dir, ".codex/config.toml"), "utf-8");
    assert.match(config, /\[\[hooks\.PreToolUse\]\]/);
    assert.doesNotMatch(gate.stderr, /only confirmed for Claude Code/);

    // An inject hook on a Codex-SUPPORTED event (SessionStart) compiles WITHOUT a
    // warning — `additionalContext` is confirmed shared with Codex (official docs).
    const inj = spawnSync(
      "node",
      [CLI, "compile", "brief.mjs", "--harness=codex"],
      { cwd: dir, encoding: "utf-8" },
    );
    assert.equal(inj.status, 0, inj.stderr);
    assert.doesNotMatch(inj.stderr, /does not honor|only confirmed/i);

    // But an inject hook on an event Codex does NOT honor for additionalContext
    // (Stop) warns LOUDLY — the injected text wouldn't reach the agent.
    writeFileSync(
      resolve(dir, "onstop.mjs"),
      `import { defineInject, inject } from "vigiles/hook";
export default defineInject({ on: "Stop", produce: () => inject("late") });`,
    );
    const bad = spawnSync(
      "node",
      [CLI, "compile", "onstop.mjs", "--harness=codex"],
      { cwd: dir, encoding: "utf-8" },
    );
    assert.match(bad.stderr, /does not honor for additionalContext/);
  } finally {
    cleanupTmpDir(dir);
  }
});

// OSS merge dogfood: compile a vigiles hook INTO a real plugin's existing
// settings — proving the merge is non-destructive on a real-world config, not
// just the synthetic unit fixtures in hook-install.test.ts. The seed is the
// REAL superpowers hooks.json (a SessionStart hook), vendored under
// test/dogfood/ (MIT, SHA-pinned).
// E2E dogfood — the FILE-GATE role (defineFileGate + PathView.under): block a
// Write/Edit under a protected path, allow elsewhere. Mirrors the bash-gate
// E2E; closes the file-gate dogfood gap (was unit-only in hook-program.test.ts).
// Harness scope (test-both-harnesses): the deny→exit 2 path is byte-identical on
// Codex, so one run covers both; Codex's EMIT is tested via `compile --harness=codex`.
test("hook-runtime run-program: a file-gate denies a Write under a protected path, allows elsewhere", () => {
  const dir = makeTmpDir();
  try {
    const f = fixture(
      dir,
      "no-build-edits.mjs",
      `import { defineFileGate, tools, deny, allow } from "__HOOK__";
export default defineFileGate({
  on: "PreToolUse",
  match: tools("Write", "Edit"),
  decide: (e) =>
    e.path.under(["dist", ".vigiles"])
      ? deny("no edits to build artifacts")
      : allow(),
});`,
    );
    const blocked = runHook(
      `node ${CLI} hook-runtime run-program ${f}`,
      {
        hook_event_name: "PreToolUse",
        tool_name: "Write",
        tool_input: { file_path: "dist/cli.js" },
      },
      { cwd: dir },
    );
    assert.equal(blocked.blocked, true);
    assert.equal(blocked.exitCode, 2);
    assert.match(blocked.stderr, /build artifacts/);

    const allowed = runHook(
      `node ${CLI} hook-runtime run-program ${f}`,
      {
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        tool_input: { file_path: "src/cli.ts" },
      },
      { cwd: dir },
    );
    assert.equal(allowed.blocked, false);
    assert.equal(allowed.exitCode, 0);
  } finally {
    cleanupTmpDir(dir);
  }
});

// E2E dogfood — the REACT role (defineReact): a PostToolUse reaction CANNOT
// block (always exit 0) but DOES its side — a `notice` reaches stderr, a `run`
// executes its (effect-classified) command. Closes the react dogfood gap (was
// unit-only, no E2E at all). Harness scope (test-both-harnesses): run()→spawn and
// the can't-block guarantee are harness-neutral (one run covers both); the Codex
// notice/react OUTPUT shape is CC-confirmed-only and deferred (flagged at compile).
test("hook-runtime run-program: a react emits a notice (can't block) and run() executes its command", () => {
  const dir = makeTmpDir();
  try {
    const noticeHook = fixture(
      dir,
      "notice.mjs",
      `import { defineReact, tools, notice, nothing } from "__HOOK__";
export default defineReact({
  on: "PostToolUse",
  match: tools("Write"),
  react: (e) =>
    e.path.under(["src"]) ? notice("vigiles: recompile the spec") : nothing(),
});`,
    );
    const noticed = runHook(
      `node ${CLI} hook-runtime run-program ${noticeHook}`,
      {
        hook_event_name: "PostToolUse",
        tool_name: "Write",
        tool_input: { file_path: "src/x.ts" },
      },
      { cwd: dir },
    );
    assert.equal(noticed.blocked, false); // a react can never block
    assert.equal(noticed.exitCode, 0);
    assert.match(noticed.stderr, /recompile the spec/);

    const runReactHook = fixture(
      dir,
      "react-run.mjs",
      `import { defineReact, tools, run } from "__HOOK__";
export default defineReact({
  on: "PostToolUse",
  match: tools("Write"),
  react: () => run("touch reacted.marker"),
});`,
    );
    const ran = runHook(
      `node ${CLI} hook-runtime run-program ${runReactHook}`,
      {
        hook_event_name: "PostToolUse",
        tool_name: "Write",
        tool_input: { file_path: "src/x.ts" },
      },
      { cwd: dir },
    );
    assert.equal(ran.exitCode, 0);
    assert.ok(
      existsSync(resolve(dir, "reacted.marker")),
      "react run() executed its command",
    );
  } finally {
    cleanupTmpDir(dir);
  }
});

// E2E dogfood — the PROMPT-GATE role (definePromptGate): a UserPromptSubmit gate
// reads the prompt TEXT and denies (exit 2) a prompt that leaks a secret, allows
// a clean one. Harness scope (test-both-harnesses): the deny→exit 2 runtime is
// the shared gate path (byte-identical on Codex), so one run covers both; the
// Codex EMIT is covered by the compile test in hook-program.test.ts.
test("hook-runtime run-program: a prompt-gate denies a secret-bearing prompt (exit 2), allows clean", () => {
  const dir = makeTmpDir();
  try {
    const f = fixture(
      dir,
      "prompt-filter.mjs",
      `import { definePromptGate, deny, allow } from "__HOOK__";
export default definePromptGate({
  on: "UserPromptSubmit",
  decide: (e) =>
    /sk-[a-z0-9]{20}/i.test(e.prompt)
      ? deny("your prompt looks like it contains a secret key")
      : allow(),
});`,
    );
    const denied = runHook(
      `node ${CLI} hook-runtime run-program ${f}`,
      {
        hook_event_name: "UserPromptSubmit",
        prompt: "deploy with key sk-abcdef0123456789abcd please",
      },
      { cwd: dir },
    );
    assert.equal(denied.blocked, true);
    assert.equal(denied.exitCode, 2);
    assert.match(denied.stderr, /secret key/);

    const allowed = runHook(
      `node ${CLI} hook-runtime run-program ${f}`,
      { hook_event_name: "UserPromptSubmit", prompt: "refactor the parser" },
      { cwd: dir },
    );
    assert.equal(allowed.blocked, false);
    assert.equal(allowed.exitCode, 0);
  } finally {
    cleanupTmpDir(dir);
  }
});

// E2E dogfood — the STOP-GATE role (defineStopGate): a Stop gate denies (exit 2)
// to keep the agent going, and respects the stop_hook_active loop guard. Same
// shared exit-2 runtime (one run covers both harnesses).
test("hook-runtime run-program: a stop-gate blocks stopping, then allows under the loop guard", () => {
  const dir = makeTmpDir();
  try {
    const f = fixture(
      dir,
      "tests-green.mjs",
      `import { defineStopGate, deny, allow } from "__HOOK__";
export default defineStopGate({
  on: "Stop",
  decide: (e) =>
    e.stopHookActive ? allow() : deny("keep going until the tests pass"),
});`,
    );
    const blocked = runHook(
      `node ${CLI} hook-runtime run-program ${f}`,
      { hook_event_name: "Stop", stop_hook_active: false },
      { cwd: dir },
    );
    assert.equal(blocked.blocked, true);
    assert.equal(blocked.exitCode, 2);
    assert.match(blocked.stderr, /keep going/);

    // The loop guard: a Stop that is itself the result of a prior block → allow.
    const allowed = runHook(
      `node ${CLI} hook-runtime run-program ${f}`,
      { hook_event_name: "Stop", stop_hook_active: true },
      { cwd: dir },
    );
    assert.equal(allowed.blocked, false);
    assert.equal(allowed.exitCode, 0);
  } finally {
    cleanupTmpDir(dir);
  }
});

// E2E dogfood — OBSERVE mode (the shadow/rollout primitive): a gate authored with
// `mode: "observe"` computes the SAME deny, but does NOT block (exit 0) — it
// records what it WOULD have blocked to .vigiles/hook-observations.jsonl.
// Harness-neutral (exit 0 + a local record), so one run covers both harnesses.
test("hook-runtime run-program: an observe-mode gate records-not-blocks (exit 0 + a jsonl record)", () => {
  const dir = makeTmpDir();
  try {
    const f = fixture(
      dir,
      "shadow-guard.mjs",
      `import { defineHook, tool, deny, allow } from "__HOOK__";
export default defineHook({
  on: "PreToolUse",
  match: tool("Bash"),
  mode: "observe",
  decide: (e) =>
    e.command.runs("git push", { force: true })
      ? deny("would block a force-push (observing)")
      : allow(),
});`,
    );
    const observed = runHook(
      `node ${CLI} hook-runtime run-program ${f}`,
      {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "git push -f origin main" },
      },
      { cwd: dir },
    );
    // It did NOT block — observe never blocks — but it noted what it would do.
    assert.equal(observed.blocked, false);
    assert.equal(observed.exitCode, 0);
    assert.match(observed.stderr, /\[vigiles observe\].*would deny/);
    // And it wrote a structured record for later review.
    const log = readFileSync(
      resolve(dir, ".vigiles/hook-observations.jsonl"),
      "utf-8",
    );
    const rec = JSON.parse(log.trim().split("\n")[0]) as {
      event: string;
      would: string;
      reason: string;
    };
    assert.equal(rec.event, "PreToolUse");
    assert.equal(rec.would, "deny");
    assert.match(rec.reason, /force-push/);
  } finally {
    cleanupTmpDir(dir);
  }
});

// E2E dogfood — CONTEXT PROVIDERS (`needs` + `e.ctx`): a gate decides on EXTERNAL
// state (the git branch) that the trusted runtime GATHERS and hands in — the hook
// itself does zero I/O. Proves the gatherer works end-to-end in a real git repo:
// deny a push on `main`, allow it on a feature branch. Harness scope
// (test-both-harnesses): gathering + the exit-2 decision are harness-neutral, so
// one run covers both; the gather runs in the spawned CLI's cwd.
test("hook-runtime run-program: a `needs:['git.branch']` gate decides on the real branch", () => {
  const dir = makeTmpDir();
  try {
    initGitRepo(dir);
    const git = (args: string) =>
      spawnSync("git", args.split(" "), { cwd: dir, encoding: "utf-8" });
    git("branch -M main");

    const f = fixture(
      dir,
      "no-push-main.mjs",
      `import { defineHook, tool, deny, allow } from "__HOOK__";
export default defineHook({
  on: "PreToolUse",
  match: tool("Bash"),
  needs: ["git.branch"],
  decide: (e) =>
    e.ctx["git.branch"] === "main" && e.command.runs("git push")
      ? deny("no direct pushes to main")
      : allow(),
});`,
    );
    const push = (cwd: string) =>
      runHook(
        `node ${CLI} hook-runtime run-program ${f}`,
        {
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_input: { command: "git push origin HEAD" },
        },
        { cwd },
      );

    // On main → the runtime gathers branch="main" → the push is denied.
    const onMain = push(dir);
    assert.equal(onMain.blocked, true);
    assert.equal(onMain.exitCode, 2);
    assert.match(onMain.stderr, /pushes to main/);

    // Switch to a feature branch → the SAME hook now allows the push.
    git("checkout -b feature");
    const onFeature = push(dir);
    assert.equal(onFeature.blocked, false);
    assert.equal(onFeature.exitCode, 0);
  } finally {
    cleanupTmpDir(dir);
  }
});

// E2E dogfood — the INLINE opt-out (`provide(name, cmd)`): a one-off off-catalog
// fact, no registered provider. The runtime runs the declared read-only command
// and hands its stdout in as e.ctx[name]; decide stays pure. Uses git config
// (initGitRepo sets user.name=Test) as a stand-in for an arbitrary project fact.
test("hook-runtime run-program: an inline provide() fact is gathered + drives the decision", () => {
  const dir = makeTmpDir();
  try {
    initGitRepo(dir);
    const f = fixture(
      dir,
      "by-author.mjs",
      `import { defineHook, tool, deny, allow, provide } from "__HOOK__";
export default defineHook({
  on: "PreToolUse",
  match: tool("Bash"),
  needs: [provide("author", "git config user.name")],
  decide: (e) =>
    e.ctx.author === "Test" && e.command.runs("git push")
      ? deny("Test author may not push")
      : allow(),
});`,
    );
    const denied = runHook(
      `node ${CLI} hook-runtime run-program ${f}`,
      {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "git push origin HEAD" },
      },
      { cwd: dir },
    );
    assert.equal(denied.blocked, true);
    assert.equal(denied.exitCode, 2);
    assert.match(denied.stderr, /may not push/);
  } finally {
    cleanupTmpDir(dir);
  }
});

// E2E dogfood — a REGISTERED provider (v2): a reusable named fact in
// .vigiles/providers/, referenced by provider("name") in a hook. The real runtime
// discovers the provider, runs its read-only command, and hands the value in.
test("hook-runtime run-program: a registered provider() ref is resolved + drives the decision", () => {
  const dir = makeTmpDir();
  try {
    initGitRepo(dir);
    mkdirSync(resolve(dir, ".vigiles/providers"), { recursive: true });
    mkdirSync(resolve(dir, ".vigiles/hooks"), { recursive: true });
    fixture(
      dir,
      ".vigiles/providers/author.mjs",
      `import { defineProvider } from "__HOOK__";
export default defineProvider({ name: "author", run: "git config user.name" });`,
    );
    const f = fixture(
      dir,
      ".vigiles/hooks/by-author.mjs",
      `import { defineHook, tool, deny, allow, provider } from "__HOOK__";
export default defineHook({
  on: "PreToolUse",
  match: tool("Bash"),
  needs: [provider("author")],
  decide: (e) =>
    e.ctx.author === "Test" && e.command.runs("git push")
      ? deny("Test author may not push")
      : allow(),
});`,
    );
    const denied = runHook(
      `node ${CLI} hook-runtime run-program ${f}`,
      {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "git push origin HEAD" },
      },
      { cwd: dir },
    );
    assert.equal(denied.blocked, true);
    assert.equal(denied.exitCode, 2);
    assert.match(denied.stderr, /may not push/);
  } finally {
    cleanupTmpDir(dir);
  }
});

/** Minimal shape of a CC settings.json for the merge dogfood (avoids `any`). */
interface SettingsShape {
  hooks: Record<
    string,
    {
      matcher?: string;
      hooks: { type: string; command: string; async?: boolean }[];
    }[]
  >;
}
const readSettings = (dir: string): SettingsShape =>
  JSON.parse(
    readFileSync(resolve(dir, ".claude/settings.json"), "utf-8"),
  ) as SettingsShape;

test("compile (hook): MERGE preserves a real plugin's existing hooks (superpowers) + is idempotent", () => {
  const dir = makeTmpDir();
  try {
    linkVigiles(dir);
    const seed = readFileSync(
      resolve(REPO_ROOT, "test/dogfood/superpowers@6fd4507/hooks/hooks.json"),
      "utf-8",
    );
    mkdirSync(resolve(dir, ".claude"), { recursive: true });
    writeFileSync(resolve(dir, ".claude/settings.json"), seed);
    mkdirSync(resolve(dir, ".vigiles/hooks"), { recursive: true });
    writeFileSync(resolve(dir, ".vigiles/hooks/guard.mjs"), GATE_PKG);

    const compile = () =>
      spawnSync("node", [CLI, "compile"], { cwd: dir, encoding: "utf-8" });
    const c = compile();
    assert.equal(c.status, 0, c.stderr);

    const merged = readSettings(dir);
    // The plugin's own SessionStart hook is preserved untouched (incl. async).
    assert.equal(merged.hooks.SessionStart.length, 1);
    assert.match(
      merged.hooks.SessionStart[0].hooks[0].command,
      /run-hook\.cmd/,
    );
    assert.equal(merged.hooks.SessionStart[0].hooks[0].async, false);
    // vigiles's gate was added under PreToolUse.
    assert.equal(merged.hooks.PreToolUse.length, 1);
    assert.match(
      merged.hooks.PreToolUse[0].hooks[0].command,
      /hook-runtime run-program .*guard\.mjs/,
    );

    // Recompiling is idempotent — no duplicate PreToolUse entry, plugin hook intact.
    assert.equal(compile().status, 0);
    const again = readSettings(dir);
    assert.equal(again.hooks.PreToolUse.length, 1, "no duplicate on recompile");
    assert.equal(again.hooks.SessionStart.length, 1);
  } finally {
    cleanupTmpDir(dir);
  }
});
