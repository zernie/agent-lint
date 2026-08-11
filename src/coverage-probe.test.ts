/**
 * Attribution derivation — what a run went by, taken from the run itself.
 *
 * Both halves per behaviour: it FIRES on the thing it is supposed to name, and
 * it stays QUIET on the shapes that would be a guess (a bare word, an errored
 * skill call). An attribution tier that over-names is worse than none: it would
 * manufacture the very "surface X is covered" claim this replaces.
 */
import { test, beforeEach } from "vitest";
import assert from "node:assert/strict";

import { commandRefs, probeCommand, traceRefs } from "./coverage-probe.js";
import { resetCheckCount, surfacesRecorded } from "./check-count.js";

beforeEach(() => {
  resetCheckCount();
});

test("a command line's program files are the refs", () => {
  assert.deepEqual(commandRefs("bash hooks/pre-edit.sh"), [
    "hooks/pre-edit.sh",
  ]);
  assert.deepEqual(
    commandRefs("node cli.js hook-runtime run-program .claude/hooks/x.hook.ts"),
    ["cli.js", ".claude/hooks/x.hook.ts"],
  );
});

test("the env is scanned, because the documented runHook idiom puts the path there", () => {
  // `runHook('"$GUARD"', event, { env: { GUARD: guardPath } })` is the shape the
  // docs teach. Reading the command string alone would attribute NOTHING for it.
  assert.deepEqual(commandRefs('"$GUARD"', { GUARD: "/repo/hooks/guard.sh" }), [
    "/repo/hooks/guard.sh",
  ]);
});

test("a command with no program file names nothing", () => {
  // "exit 0" and "true" are real hook tests. Naming a surface for them would be
  // inventing one.
  assert.deepEqual(commandRefs("exit 0"), []);
  assert.deepEqual(commandRefs("echo hello", { HOME: "/home/x" }), []);
});

test("a transcript attributes the skills that RESOLVED", () => {
  const refs = traceRefs({
    toolCalls: [
      { name: "Skill", input: { skill: "myplug:alpha" }, isError: false },
      { name: "Read", input: { file_path: "x" }, isError: false },
    ],
  });
  assert.deepEqual(refs, [{ how: "fired", ref: "myplug:alpha" }]);
});

test("an ERRORED skill call attributes nothing", () => {
  // The tool was reached and the skill was not. Counting it would make "this
  // skill is broken" indistinguishable from "this skill ran".
  const refs = traceRefs({
    toolCalls: [
      { name: "Skill", input: { skill: "myplug:alpha" }, isError: true },
    ],
  });
  assert.deepEqual(refs, []);
});

test("what was INSTALLED is not what RAN — only the firing skill is named", () => {
  // The load-bearing choice. A trigger-rate run installs competing skills on
  // purpose (`installSet`); crediting the install set credits a skill for LOSING
  // selection. The transcript names one.
  const refs = traceRefs({
    toolCalls: [
      { name: "Skill", input: { skill: "plug:winner" }, isError: false },
    ],
  });
  assert.deepEqual(
    refs.map((r) => r.ref),
    ["plug:winner"],
  );
});

test("probes are deduped — forty firings of one hook name it once", () => {
  probeCommand("bash hooks/guard.sh");
  probeCommand("bash hooks/guard.sh");
  probeCommand("bash hooks/guard.sh");
  assert.deepEqual(surfacesRecorded(), [
    { how: "command", ref: "hooks/guard.sh" },
  ]);
});
