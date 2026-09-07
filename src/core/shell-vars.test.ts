/**
 * Shell-variable-read suite (vitest, unit tier — parses strings, runs nothing).
 *
 * The load-bearing cases are the two a regex gets wrong, since they are why this
 * module exists: a variable the command ASSIGNS before expanding, and a `$NAME`
 * inside SINGLE QUOTES, where the shell performs no expansion at all. Beside
 * them, the conservative direction is pinned in both places it shows: a parse
 * failure falls back to the regex and SAYS so, and an expansion with a default
 * is still reported as a read.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import { shellVarReads } from "./shell-vars.js";

test("a plain expansion is a read", () => {
  const r = shellVarReads('node "$CLAUDE_PLUGIN_ROOT"/hooks/guard.cjs');
  assert.deepEqual(r.reads, ["CLAUDE_PLUGIN_ROOT"]);
  assert.equal(r.parsed, true);
});

test("both spellings are the same name, reported once", () => {
  assert.deepEqual(shellVarReads('echo "$FOO ${FOO}"').reads, ["FOO"]);
});

test("a variable the command ASSIGNS is not a dependency", () => {
  // The shell sets GUARD before expanding it — the command is self-contained.
  assert.deepEqual(shellVarReads('GUARD=hooks/g.sh; "$GUARD"').reads, []);
  // Including the leading NAME=value prefix form.
  assert.deepEqual(shellVarReads('FOO=1 sh -c "echo $FOO"').reads, []);
});

test("an assignment covers a read that appears before it", () => {
  // Deliberately order-insensitive: a name the command sets ANYWHERE is one the
  // caller cannot fix by passing `env`, so naming it would be noise.
  assert.deepEqual(shellVarReads('echo "$X"; X=1').reads, []);
});

test("a `$NAME` in SINGLE quotes is not an expansion", () => {
  assert.deepEqual(shellVarReads("echo '$NOT_A_VAR'").reads, []);
  // …but the same name in double quotes still is.
  assert.deepEqual(shellVarReads('echo "$IS_A_VAR"').reads, ["IS_A_VAR"]);
});

test("positional and special parameters are never reads", () => {
  assert.deepEqual(shellVarReads('echo "$1" "$@" "$?" "$$"').reads, []);
});

test("an expansion with a default is STILL a read (conservative)", () => {
  // It always resolves, so this over-reports. The cost of that direction is one
  // unmeasured hook; the other direction measures a differently-configured one.
  assert.deepEqual(shellVarReads("echo ${FOO:-default}").reads, ["FOO"]);
});

test("a command the parser REJECTS falls back, and says so", () => {
  const r = shellVarReads('echo "$UNCLOSED');
  assert.equal(r.parsed, false);
  assert.deepEqual(r.reads, ["UNCLOSED"]);
});

test("no expansions at all", () => {
  const r = shellVarReads("echo hello");
  assert.deepEqual(r.reads, []);
  assert.equal(r.parsed, true);
});
