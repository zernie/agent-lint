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

// ---------------------------------------------------------------------------
// A WORD IS NOT A POSITION. Both halves per shape: a command that only READS a
// script names nothing, and the real command lines this repo's own harnesses
// run still name their hook.
// ---------------------------------------------------------------------------

test("a script the command READS is data, not an execution", () => {
  // The regression this replaces: any script-looking token anywhere in the
  // command (or anywhere in the env) minted an execution-tier coverage record.
  // A passing harness that copies, cats or greps a hook painted that hook
  // COVERED BY A RUN — with a fresh timestamp, so it never expired.
  assert.deepEqual(commandRefs("cat hooks/pre-edit.sh"), []);
  assert.deepEqual(commandRefs("cp hooks/pre-edit.sh /tmp/copy.sh"), []);
  assert.deepEqual(commandRefs("grep -n deny hooks/pre-edit.sh"), []);
  assert.deepEqual(commandRefs("shasum -a 256 .claude/hooks/guard.mjs"), []);
  // …and the same word in the same place, with a head that DOES execute it.
  assert.deepEqual(commandRefs("bash hooks/pre-edit.sh"), [
    "hooks/pre-edit.sh",
  ]);
});

test("an interpreter's script gets ONE operand — the rest is that script's own argv", () => {
  // `node lint.mjs hooks/x.sh` runs the linter and READS the hook. Attributing
  // the trailing path would be the same substitution in a smaller size.
  assert.deepEqual(commandRefs("node lint.mjs hooks/x.sh"), ["lint.mjs"]);
  assert.deepEqual(commandRefs("node --experimental-strip-types run.ts"), [
    "run.ts",
  ]);
  // …and the word has to BE a script, not merely contain one. `sh -c '…'` hands
  // the interpreter a whole program as ONE word; a substring match would pull
  // `x.sh` out of it and the basename rung would resolve that to a real hook —
  // the same false positive, one level in. The shell grammar does not open that
  // string, so neither do we.
  assert.deepEqual(commandRefs("sh -c 'bash hooks/x.sh'"), []);
  assert.deepEqual(commandRefs("node -e 'import(\"./hooks/x.mjs\")'"), []);
});

test("an option's VALUE is not the entry script — value-taking interpreter flags are parsed", () => {
  // 🔴 Reproduced 2026-08-12. "The first non-flag operand" is not the script when
  // an option consumed it. `--loader tsx` selected `tsx`, which is not a script
  // path, so the hook that DID run recorded NOTHING; `--require setup.js` selected
  // the preload and stopped, so the entry never appeared. Both are silent — a
  // passing test that earns no coverage reads exactly like one that ran nothing.
  assert.deepEqual(commandRefs("node --loader tsx hooks/pre-edit.ts"), [
    "hooks/pre-edit.ts",
  ]);
  assert.deepEqual(commandRefs("node --require setup.js app.js"), ["app.js"]);
  assert.deepEqual(commandRefs("node -r ./setup.js hooks/x.mjs"), [
    "hooks/x.mjs",
  ]);
  assert.deepEqual(commandRefs("node --import tsx/esm hooks/x.ts"), [
    "hooks/x.ts",
  ]);
  assert.deepEqual(commandRefs("python3 -W ignore hooks/pre-edit.py"), [
    "hooks/pre-edit.py",
  ]);
  assert.deepEqual(commandRefs("bash -o pipefail hooks/x.sh"), ["hooks/x.sh"]);
  // The `=` spelling never needed the table — it is one word starting with `-`.
  assert.deepEqual(commandRefs("node --loader=tsx hooks/pre-edit.ts"), [
    "hooks/pre-edit.ts",
  ]);
});

test("…and reading the option grammar does not slide a DATA operand into the script slot", () => {
  // The QUIET half, and the property the round before this one bought: knowing
  // more about options must not let the check name a file the command only READS.
  //
  // `-m` runs a MODULE, so the following path is that module's argument.
  assert.deepEqual(commandRefs("python3 -m pytest hooks/x.py"), []);
  // `-c`/`-e` carry the program as text; there is no file operand to name.
  assert.deepEqual(commandRefs("python3 -c 'print(1)' hooks/x.py"), []);
  assert.deepEqual(commandRefs("node --check app.js"), []);
  // `ruby -S` is deliberately NOT in the value table: consuming `rake` would let
  // rake's own argument be selected as the executed script.
  assert.deepEqual(commandRefs("ruby -S rake hooks/x.rb"), []);
  // A non-interpreter head is untouched by any of this.
  assert.deepEqual(commandRefs("cat --require setup.js hooks/pre-edit.sh"), []);
  // And the entry still takes exactly one operand.
  assert.deepEqual(commandRefs("node --require setup.js lint.mjs hooks/x.sh"), [
    "lint.mjs",
  ]);
});

test("the option grammar is PER INTERPRETER — one spelling, two languages, two answers", () => {
  // 🔴 Reproduced 2026-08-12 against the real binaries, because the shared table
  // asserted these agree and they do not:
  //
  //   python3 -I /tmp/probe.py   → prints, exit 0   (`-I` = isolated mode,
  //                                                  consumes NOTHING)
  //   ruby -I /tmp -e 'puts 1'   → prints, exit 0   (`-I` = load path,
  //                                                  consumes a DIRECTORY)
  //
  // FIRES: with `-I` in one shared value table, python's hook path was eaten as
  // `-I`'s value, no operand was left, and a passing run earned no execution
  // coverage at all — the exact silent loss the table exists to prevent.
  assert.deepEqual(commandRefs("python3 -I hooks/x.py"), ["hooks/x.py"]);
  // `-E` is the same disagreement again: python ignores the environment and
  // consumes nothing, ruby sets an encoding and consumes a value.
  assert.deepEqual(commandRefs("python3 -E hooks/x.py"), ["hooks/x.py"]);
  // `-p`/`-n` wrap the script in a read-print loop in ruby and perl, and the
  // operand really is executed. The shared table had to pick one meaning and
  // picked node's, so this used to attribute nothing.
  assert.deepEqual(commandRefs("ruby -p hooks/x.rb"), ["hooks/x.rb"]);

  // QUIET: the OTHER family's reading of the same spellings is unchanged, so the
  // split is a split and not a blanket "stop consuming values".
  assert.deepEqual(commandRefs("ruby -I lib hooks/x.rb"), ["hooks/x.rb"]);
  assert.deepEqual(commandRefs("ruby -E UTF-8 hooks/x.rb"), ["hooks/x.rb"]);
  // perl consumes `-I`'s value like ruby. Probed with a `.sh` operand on purpose:
  // SCRIPT_RE carries no `.pl`, so a perl-named file can never be attributed and
  // the grammar is only observable through an extension the set does recognise.
  assert.deepEqual(commandRefs("perl -I lib hooks/x.sh"), ["hooks/x.sh"]);
  // node's `-p` still carries an expression, so there is no script operand…
  assert.deepEqual(commandRefs("node -p 'process.version' hooks/x.mjs"), []);
  // …and perl's `-E` carries the PROGRAM, the opposite conclusion from ruby's.
  assert.deepEqual(commandRefs("perl -E 'say 1' hooks/x.sh"), []);
  // A family's own value-takers keep working (the round-before's fix, per family).
  assert.deepEqual(commandRefs("python3 -W ignore hooks/x.py"), ["hooks/x.py"]);
  assert.deepEqual(commandRefs("node --loader tsx hooks/x.ts"), ["hooks/x.ts"]);
  assert.deepEqual(commandRefs("bash -o pipefail hooks/x.sh"), ["hooks/x.sh"]);
});

test("bash's own invocation grammar: `-O` takes a value, and parse-only flags run nothing", () => {
  // 🔴 FIRES: `-O shopt_option` is a bash invocation option (its `--help` says so
  // on the same line as `-c command`). Without it `extglob` was selected as the
  // entry, failed SCRIPT_RE, and the hook that DID run was attributed to nothing
  // — silence, the same shape the per-family split was written to stop.
  assert.deepEqual(commandRefs("bash -O extglob hooks/pre-edit.sh"), [
    "hooks/pre-edit.sh",
  ]);
  assert.deepEqual(commandRefs("bash +O extglob hooks/pre-edit.sh"), [
    "hooks/pre-edit.sh",
  ]);

  // FIRES (the other direction, found by enumerating the same `--help`): these
  // PARSE the operand and never run it — verified against bash 5.2.21, none of
  // them produced the script's output. Attributing them is a FALSE GRANT, the
  // expensive direction, and the exact rule node's `--check` already follows.
  for (const flag of [
    "-n",
    "-D",
    "--dump-strings",
    "--dump-po-strings",
    "--pretty-print",
  ]) {
    assert.deepEqual(
      commandRefs(`bash ${flag} hooks/pre-edit.sh`),
      [],
      `bash ${flag} does not execute the script`,
    );
  }

  // QUIET: the rest of the grammar is unchanged — the standalone flags still fall
  // through to the generic skip and the script is still found. A table entry that
  // over-consumed would pass the assertions above and lose these.
  assert.deepEqual(commandRefs("bash -e hooks/pre-edit.sh"), [
    "hooks/pre-edit.sh",
  ]);
  assert.deepEqual(commandRefs("bash --norc --noprofile hooks/x.sh"), [
    "hooks/x.sh",
  ]);
  assert.deepEqual(commandRefs("bash -o pipefail hooks/x.sh"), ["hooks/x.sh"]);

  // ⚠️ THE WHOLE-WORD LIMIT, asserted rather than described — this expectation was
  // written the other way first and the test corrected it. Matching is per WORD,
  // so a BUNDLED short form is invisible to every table here: `-euo` is skipped as
  // one flag and `pipefail` (the `-o` value it carries) is then taken as the entry
  // and rejected, so a very ordinary hook invocation attributes NOTHING.
  assert.deepEqual(commandRefs("bash -euo pipefail hooks/x.sh"), []);
  // The same limit points the other way for a bundled parse-only flag, and that
  // one is a false GRANT: `-en` is skipped whole, so the script that bash only
  // syntax-checked is attributed as executed.
  assert.deepEqual(commandRefs("bash -en hooks/x.sh"), ["hooks/x.sh"]);
  // Pre-existing and NOT introduced here: the unbundled spellings, which are what
  // the tables are about, are right in both directions.
  assert.deepEqual(commandRefs("bash -e -u -o pipefail hooks/x.sh"), [
    "hooks/x.sh",
  ]);
  assert.deepEqual(commandRefs("bash -e -n hooks/x.sh"), []);
  // …and `-O` is bash's alone: it must not leak into the other families, where
  // the same letter means nothing of the kind.
  assert.deepEqual(commandRefs("node -O hooks/x.mjs"), ["hooks/x.mjs"]);
  assert.deepEqual(commandRefs("python3 -O hooks/x.py"), ["hooks/x.py"]);
});

test("the env is EXPANDED into the command, not scanned alongside it", () => {
  // The documented idiom still works…
  assert.deepEqual(commandRefs('"$GUARD"', { GUARD: "/repo/hooks/guard.sh" }), [
    "/repo/hooks/guard.sh",
  ]);
  assert.deepEqual(commandRefs("bash ${HOOK} --x", { HOOK: "hooks/a.sh" }), [
    "hooks/a.sh",
  ]);
  // …and an env entry the command never mentions attributes nothing. Passing a
  // fixture path or a temp dir to a run is not running it.
  assert.deepEqual(
    commandRefs("node runner.mjs", { FIXTURE: "hooks/pre-edit.sh" }),
    ["runner.mjs"],
  );
});

test("attribution is AST-backed, so nesting and wrappers do not hide the program", () => {
  assert.deepEqual(commandRefs("cd /repo && bash hooks/x.sh"), ["hooks/x.sh"]);
  assert.deepEqual(commandRefs("env FOO=1 bash hooks/x.sh"), ["hooks/x.sh"]);
  assert.deepEqual(commandRefs("./hooks/x.sh --flag"), ["./hooks/x.sh"]);
  assert.deepEqual(commandRefs("/abs/hooks/x.mjs"), ["/abs/hooks/x.mjs"]);
  // A word the parser cannot reconstruct HOLDS ITS SLOT rather than vanishing.
  // Dropping it would slide the next word into head position, so `$(cat cmd)
  // hooks/x.sh` — an unknown program handed the hook as an ARGUMENT — would read
  // as the hook executing itself.
  assert.deepEqual(commandRefs("$(cat cmd) hooks/x.sh"), []);
});

test("quiet on real input: the command lines this repo's harnesses actually run", () => {
  // Taken verbatim from the shapes in use — the `compiled()` / `sh()` helpers in
  // a real hooks harness, the line `hook-install` emits, and the
  // `$CLAUDE_PROJECT_DIR` spelling a settings.json uses. Every one must still
  // name its hook, or the fix for the false positive would have cost the tier
  // its actual measurements.
  assert.deepEqual(
    commandRefs(
      'node "/r/node_modules/vigiles/dist/cli.js" hook-runtime run-program "/r/.claude/hooks/paper-edit-guard.hook.ts"',
    ),
    [
      "/r/node_modules/vigiles/dist/cli.js",
      "/r/.claude/hooks/paper-edit-guard.hook.ts",
    ],
  );
  assert.deepEqual(
    commandRefs('bash "/r/.claude/hooks/calendar-heartbeat.sh"'),
    ["/r/.claude/hooks/calendar-heartbeat.sh"],
  );
  assert.deepEqual(commandRefs('node "/r/.claude/hooks/paper-lint.mjs" pre'), [
    "/r/.claude/hooks/paper-lint.mjs",
  ]);
  assert.deepEqual(
    commandRefs("npx vigiles hook-runtime run-program .vigiles/hooks/g.mjs"),
    [".vigiles/hooks/g.mjs"],
  );
  // Unexpanded harness token: kept as written, because the runner resolves it by
  // SUFFIX against a real discovered surface.
  assert.deepEqual(
    commandRefs('bash "$CLAUDE_PROJECT_DIR/.claude/hooks/x.sh"'),
    ["$CLAUDE_PROJECT_DIR/.claude/hooks/x.sh"],
  );
});

test("a third-party runner SHIM is an accepted false negative, and our own runner is not", () => {
  // Measured on a vendored plugin in `test/dogfood`: `node "$ROOT"/scripts/run.cjs
  // "$ROOT"/scripts/keyword-detector.mjs` — the shim really does execute the
  // second path, and nothing in the command line says so. Guessing that a
  // program's argv names programs is exactly what produced the `cat` bug, so the
  // shim's own operand is left to the name-based tier.
  assert.deepEqual(
    commandRefs('node "$R"/scripts/run.cjs "$R"/scripts/keyword-detector.mjs', {
      R: "/plug",
    }),
    ["/plug/scripts/run.cjs"],
  );
  // The one runner whose contract we own is the exception, and it is named:
  // `hook-runtime run-program <hook>` is emitted by our own installer.
  assert.deepEqual(
    commandRefs("node cli.js hook-runtime run-program .claude/hooks/x.hook.ts"),
    ["cli.js", ".claude/hooks/x.hook.ts"],
  );
});
