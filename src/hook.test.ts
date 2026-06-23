/**
 * Compiled-hooks E2E (vitest) — drives the REAL built CLI runtime the compiled
 * hooks block points at (`node dist/cli.js hook-runtime run-program <file>`) over
 * `runHook`, proving the whole loop works end to end with no model:
 *   - a Bash GATE denies `git push -f` (exit 2 + reason) and allows benign;
 *   - the AST matcher catches a compound bypass `cd x && git push -f`;
 *   - an INJECT hook emits `additionalContext` (the right field, never written);
 *   - `compile` REJECTS an out-of-vocabulary import (capability = API);
 *   - a stamped artifact that is then hand-edited is REFUSED at runtime (exit 2).
 *
 * The fixtures import the built `dist/hook.js` by absolute path, so this runs
 * after `npm run build` like the other CLI-driven suites.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdirSync, symlinkSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runHook } from "./run-hook.js";
import { spawnSync } from "node:child_process";
import { makeTmpDir, cleanupTmpDir } from "./core/test-utils.js";

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

    // An inject hook still merges, but the inject OUTPUT shape is unconfirmed
    // on Codex — so it warns loudly instead of silently shipping a maybe-no-op.
    const inj = spawnSync(
      "node",
      [CLI, "compile", "brief.mjs", "--harness=codex"],
      { cwd: dir, encoding: "utf-8" },
    );
    assert.equal(inj.status, 0, inj.stderr);
    assert.match(inj.stderr, /inject output is only confirmed for Claude Code/);
  } finally {
    cleanupTmpDir(dir);
  }
});
