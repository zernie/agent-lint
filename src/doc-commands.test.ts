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

test("a GLOBAL or STICKY filter matches the same lines a plain one does", () => {
  // `RegExp.test` advances `lastIndex` on /g and /y, so testing consecutive
  // matching lines with the same object alternates hit/miss. Measured before the
  // fix on the four lines below: /curl/ found 4, /curl/g found the 1st and the
  // 3rd, /curl/y the same — half the document silently left the set that
  // mustInclude/mustNotInclude then judge, so the rule passed over commands it
  // never saw. /curl/g is what a caller writes without thinking about it.
  const doc = [
    "```sh",
    "curl -g https://a",
    "curl -g https://b",
    "curl -g https://c",
    "curl -g https://d",
    "```",
  ].join("\n");
  const plain = commandsIn(doc, /curl/).map((c) => c.text);
  assert.equal(plain.length, 4, "control: a plain filter sees every line");
  for (const re of [/curl/g, /curl/y, /curl/gi]) {
    assert.deepEqual(
      commandsIn(doc, re).map((c) => c.text),
      plain,
      String(re),
    );
  }
});

test("…and the caller's own regex comes back untouched", () => {
  // Resetting `lastIndex` in place would fix the count and mutate an object the
  // caller may be using elsewhere. Nothing is reset because nothing is stateful.
  const re = /curl/g;
  re.lastIndex = 3;
  commandsIn(DOC, re);
  assert.equal(re.lastIndex, 3);
});

test("case-insensitivity and other flags still apply", () => {
  // Only the two positional flags are dropped; a filter that stopped honouring
  // `i` would be a different kind of silent under-match.
  const doc = ["```sh", "CURL -g https://a", "```"].join("\n");
  assert.equal(commandsIn(doc, /curl/i).length, 1);
  assert.equal(commandsIn(doc, /curl/).length, 0);
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
  const r = mustInclude(
    "--cacert",
    "this env's proxy needs the CA bundle",
  ).eval(commandsIn(broken, /curl/));
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

// ─── the fence grammar is CommonMark's, not "any line starting with ```" ──────
//
// 🔴 The old scanner toggled on any `^\s*```` line. A four-backtick block wrapping
// an ordinary ``` example — the standard way to SHOW a fence — closed at the inner
// delimiter, so the block was cut in half and the prose after it became the next
// "block". Both failure directions in one document: commands in the tail go
// unchecked, and paragraphs get judged as commands.

test("a four-backtick fence is not closed by the ``` example inside it", () => {
  const doc = [
    "# How to fence",
    "",
    "````md",
    "```sh",
    "curl -g --cacert $CA https://a",
    "curl --cacert $CA https://b",
    "```",
    "````",
    "",
    "Now run curl -X POST against the staging box by hand.",
  ].join("\n");
  const cmds = commandsIn(doc, /curl/);
  // FIRES: the second command lives PAST the inner ``` and was invisible before.
  assert.deepEqual(
    cmds.map((c) => c.text),
    ["curl -g --cacert $CA https://a", "curl --cacert $CA https://b"],
  );
  // …and it is judged, so the rule the document states is actually enforced.
  assert.equal(mustInclude("-g", "params glob").eval(cmds).pass, false);
  // QUIET: the trailing PROSE is not a command. The old split made it a block.
  assert.ok(!cmds.some((c) => c.text.startsWith("Now run")));
  // Line numbers still point at the real source lines.
  assert.deepEqual(
    cmds.map((c) => c.line),
    [5, 6],
  );
});

test("tilde fences are code too, and backticks inside one do not close it", () => {
  const doc = [
    "~~~sh",
    "curl -g https://a",
    "~~~",
    "",
    "~~~md",
    "```",
    "curl -g https://b",
    "```",
    "~~~",
  ].join("\n");
  assert.deepEqual(
    commandsIn(doc, /curl/).map((c) => c.text),
    ["curl -g https://a", "curl -g https://b"],
  );
});

test("the shapes the old scanner already handled still behave the same", () => {
  // The QUIET half of swapping in a parser: an unterminated final fence still
  // yields its commands (dropping them was the documented anti-behaviour), a
  // fence indented inside a list item is still code, and prose outside any fence
  // is still not a command.
  const unterminated = "```sh\ncurl -g https://a\n";
  assert.deepEqual(
    commandsIn(unterminated, /curl/).map((c) => c.text),
    ["curl -g https://a"],
  );
  const inList = ["- step one:", "", "  ```sh", "  curl -g https://a", "  ```"];
  assert.deepEqual(
    commandsIn(inList.join("\n"), /curl/).map((c) => c.text),
    ["curl -g https://a"],
  );
  assert.deepEqual(commandsIn("always pass `curl -g` here\n", /curl/), []);
});
