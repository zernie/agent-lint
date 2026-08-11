/**
 * `commandsIn` / `mustInclude` / `mustNotInclude` — and the three ways a naive
 * version of this turns into noise or into a check that can never fail.
 *
 * Pure: strings in, results out. No filesystem, no shell, nothing executed.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import { commandsIn, mustInclude, mustNotInclude } from "./doc-commands.js";

const DOC = [
  "# Recipe",
  "",
  "**Gotcha:** always use `curl -g`, or bracketed params glob silently.",
  "",
  "```bash",
  "# fetch the node",
  "curl -g -s --cacert $CA https://api.example.com/v2/nodes/",
  "curl -g --cacert $CA -X PUT --data-binary @file https://api.example.com/up",
  "```",
].join("\n");

test("prose that STATES the rule is not read as a command", () => {
  // The warning line contains `curl -g` — reading it as a command would make a
  // well-documented rule report itself, and a checker that fires on clean input
  // is muted within a day.
  const cmds = commandsIn(DOC, /curl/);
  assert.equal(cmds.length, 2);
  assert.ok(cmds.every((c) => c.text.startsWith("curl")));
});

test("a commented-out line is not a command", () => {
  assert.ok(!commandsIn(DOC, /fetch/).some((c) => c.text.startsWith("#")));
});

test("holding rule passes and says how many it held over", () => {
  const r = mustInclude("--cacert", "the proxy needs it").eval(
    commandsIn(DOC, /curl/),
  );
  assert.equal(r.pass, true);
  assert.match(r.message, /all 2 command/);
});

test("a violation names the line, the text and the CONSEQUENCE", () => {
  const broken = DOC.replace("curl -g -s --cacert $CA", "curl -s $CA");
  const r = mustInclude("--cacert", "this env's proxy needs the CA bundle").eval(
    commandsIn(broken, /curl/),
  );
  assert.equal(r.pass, false);
  assert.match(r.message, /1 of 2/);
  assert.match(r.message, /line 7/); // points at the file, not just "somewhere"
  assert.match(r.message, /proxy needs the CA bundle/); // the why, not just the what
});

test("an EMPTY match FAILS — a rule over zero commands is not a passing rule", () => {
  // The most dangerous state: the filter stops matching (block renamed, commands
  // moved) and the check goes green forever while verifying nothing.
  const r = mustInclude("-g", "why").eval(commandsIn(DOC, /psql/));
  assert.equal(r.pass, false);
  assert.match(r.message, /checked against nothing/);
});

test("mustNotInclude bans, and is vacuity-guarded the same way", () => {
  const withInsecure = DOC.replace("curl -g -s", "curl -g -k -s");
  const banned = mustNotInclude("-k", "disables TLS verification");
  assert.equal(banned.eval(commandsIn(withInsecure, /curl/)).pass, false);
  assert.equal(banned.eval(commandsIn(DOC, /curl/)).pass, true);
  assert.equal(banned.eval([]).pass, false);
});

test("an unterminated fence still yields its commands", () => {
  // Dropping them silently would hide every command in a file whose last fence
  // was mistyped — a formatting slip must not disable the check.
  const md = "```bash\ncurl -g https://x\n";
  assert.equal(commandsIn(md, /curl/).length, 1);
});
