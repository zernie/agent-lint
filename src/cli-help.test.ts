/**
 * The top-level help, asserted as a CONTRACT rather than eyeballed.
 *
 * Two of these assertions exist because the old help failed them. It described `audit`
 * with "NOT a CI step — use `vigiles lint` in CI" — a sentence that says what a command
 * ISN'T, which is a description admitting it failed; deleting that sentence was the
 * checkable success criterion of the 2026-08-18 rewrite, and this test is what keeps it
 * deleted. And the module docblock listed four of the eight verbs, having quietly stopped
 * growing — so the coverage assertion below reads the RENDERED output, not a constant,
 * because a constant is the thing that drifted.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const help = execFileSync("node", ["dist/cli.js", "--help"], {
  encoding: "utf-8",
});

test("every user-facing verb appears in the grouped help exactly once", () => {
  for (const verb of [
    "init",
    "compile",
    "eject",
    "audit",
    "lint",
    "test",
    "eval",
    "generate",
  ]) {
    const hits = help
      .split("\n")
      .filter((l) => l.trimStart().startsWith(`vigiles ${verb} `));
    assert.equal(
      hits.length,
      1,
      `expected exactly one help line for \`${verb}\`, got ${hits.length}`,
    );
  }
});

test("the four checkers are grouped by whether they READ or RUN", () => {
  const read = help.indexOf("Check your harness");
  const run = help.indexOf("Run your harness");
  assert.ok(
    read > 0 && run > read,
    "both group headings must be present, read before run",
  );
  const between = (a: number, b: number, verb: string) => {
    const at = help.indexOf(`vigiles ${verb} `, a);
    assert.ok(at > a && at < b, `\`${verb}\` must sit inside its own group`);
  };
  between(read, run, "audit");
  between(read, run, "lint");
  between(run, help.length, "test");
  between(run, help.length, "eval");
});

test("no command is described by what it is NOT", () => {
  assert.doesNotMatch(
    help,
    /NOT a CI step/,
    "a help line that must disclaim what a command isn't is a description that failed — " +
      "state the consequence positively instead (audit: 'fails nothing')",
  );
});

test("per-verb flag detail stays OUT of the top-level list", () => {
  assert.doesNotMatch(
    help,
    /--no-html/,
    "flag detail belongs in `vigiles <verb> --help`",
  );
  assert.match(help, /Flags live in `vigiles <command> --help`/);
});
