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

  // The unbundled spellings, which are what the whole-word tables are about, are
  // right in both directions. (Bundled clusters are the next test.)
  assert.deepEqual(commandRefs("bash -e -u -o pipefail hooks/x.sh"), [
    "hooks/x.sh",
  ]);
  assert.deepEqual(commandRefs("bash -e -n hooks/x.sh"), []);
  // …and `-O` is bash's alone: it must not leak into the other families, where
  // the same letter means nothing of the kind.
  assert.deepEqual(commandRefs("node -O hooks/x.mjs"), ["hooks/x.mjs"]);
  assert.deepEqual(commandRefs("python3 -O hooks/x.py"), ["hooks/x.py"]);
});

test("a `run` SUBCOMMAND is not the script — bun and deno put a verb first", () => {
  // 🔴 FIRES: bun and deno share the node OPTION grammar but have a verb grammar
  // node does not. `run` was selected as the entry, failed SCRIPT_RE, and a hook
  // that really executed attributed nothing — silence, the same shape the
  // per-family split was written to stop.
  assert.deepEqual(commandRefs("bun run hooks/pre-edit.ts"), [
    "hooks/pre-edit.ts",
  ]);
  assert.deepEqual(commandRefs("deno run hooks/pre-edit.ts"), [
    "hooks/pre-edit.ts",
  ]);
  // With the family's own flags still read on either side of the verb.
  assert.deepEqual(commandRefs("bun run --bun hooks/x.mjs"), ["hooks/x.mjs"]);
  assert.deepEqual(commandRefs("deno run --allow-all hooks/x.ts"), [
    "hooks/x.ts",
  ]);
  assert.deepEqual(commandRefs("/usr/local/bin/bun run hooks/x.mjs"), [
    "hooks/x.mjs",
  ]);

  // QUIET: the verb is consumed only in FIRST position and only for these two
  // heads, so nothing else shifts.
  assert.deepEqual(commandRefs("bun hooks/x.mjs"), ["hooks/x.mjs"]);
  assert.deepEqual(commandRefs("deno hooks/x.ts"), ["hooks/x.ts"]);
  // `run` after the entry is the SCRIPT's own argument, not a verb.
  assert.deepEqual(commandRefs("bun hooks/x.mjs run"), ["hooks/x.mjs"]);
  // node has no `run` subcommand — `node run x.mjs` would run a file named
  // `run`, so consuming it there would attribute a file the command never named.
  assert.deepEqual(commandRefs("node run hooks/x.mjs"), []);
  // A package.json script name is not a file, so it still attributes nothing.
  assert.deepEqual(commandRefs("bun run build"), []);
  // ⚠️ The other verbs are deliberately unmodelled, and cost SILENCE: `deno check`
  // reads a file without running it, so crediting it would be a false grant.
  assert.deepEqual(commandRefs("deno check hooks/x.ts"), []);
  assert.deepEqual(commandRefs("bun test hooks/x.ts"), []);
});

test("a BUNDLED short-option cluster is attributed only when every letter is known", () => {
  // 🔴 FIRES. `-en` and `-nc` carry bash's `n` — "Read commands but do not
  // execute them" — but neither is a whole word in any table, so the generic `-`
  // skip walked past it and the path became the entry. A harness that
  // syntax-checks a hook recorded execution coverage for a hook nothing ran:
  // a FALSE GRANT, the expensive direction.
  assert.deepEqual(commandRefs("bash -en hooks/pre.sh"), []);
  assert.deepEqual(commandRefs("bash -nc hooks/pre.sh"), []);
  assert.deepEqual(commandRefs("sh -vn hooks/pre.sh"), []);
  // `D` dumps translatable strings and implies `-n` — same class, same answer.
  assert.deepEqual(commandRefs("bash -eD hooks/pre.sh"), []);

  // QUIET: a cluster whose letters are ALL accounted for still attributes, so
  // this is a model and not a blanket refusal. `-euo pipefail` is the single
  // most common way a hook is launched, and it used to attribute NOTHING
  // (`pipefail`, the value `-o` carries, was taken for the script and rejected).
  assert.deepEqual(commandRefs("bash -euo pipefail hooks/x.sh"), [
    "hooks/x.sh",
  ]);
  assert.deepEqual(commandRefs("bash -ex hooks/x.sh"), ["hooks/x.sh"]);
  assert.deepEqual(commandRefs("bash -eu hooks/x.sh"), ["hooks/x.sh"]);

  // …and an UNKNOWN letter abstains rather than guessing: it might be another
  // `n`. One lost warning beats one false claim that a hook was tested.
  assert.deepEqual(commandRefs("bash -eZ hooks/x.sh"), []);

  // ⚠️ Only shells are modelled — bash publishes its complete invocation letter
  // set, the others do not. A bundle under any other family abstains, which is a
  // deliberate loss of a warning, not a false grant.
  assert.deepEqual(commandRefs("python3 -EsI hooks/x.py"), []);
  // The unbundled spelling of the same command still works everywhere.
  assert.deepEqual(commandRefs("python3 -E -s -I hooks/x.py"), ["hooks/x.py"]);
});

test("`run-program` is a command SHAPE, not a word that may appear anywhere", () => {
  // 🔴 FIRES. The verb was searched across the whole argv, so any command that
  // merely PRINTED it attributed the following path — `echo` ran, the hook did
  // not. The same substitution the `cat hooks/x.sh` bug was, reached through the
  // one runner whose contract we own.
  assert.deepEqual(commandRefs("echo run-program hooks/pre.sh"), []);
  assert.deepEqual(
    commandRefs("echo hook-runtime run-program hooks/pre.sh"),
    [],
  );
  assert.deepEqual(
    commandRefs("cat hook-runtime run-program hooks/pre.sh"),
    [],
  );
  // The words in the right order but owned by something else.
  assert.deepEqual(
    commandRefs("node -e 'x' hook-runtime run-program hooks/pre.sh"),
    [],
  );

  // QUIET: every shape our installer and our own tests actually emit.
  assert.deepEqual(
    commandRefs("npx vigiles hook-runtime run-program .vigiles/hooks/g.mjs"),
    [".vigiles/hooks/g.mjs"],
  );
  assert.deepEqual(
    commandRefs("vigiles hook-runtime run-program .vigiles/hooks/g.mjs"),
    [".vigiles/hooks/g.mjs"],
  );
  assert.deepEqual(
    commandRefs(
      "./node_modules/.bin/vigiles hook-runtime run-program .vigiles/hooks/g.mjs",
    ),
    [".vigiles/hooks/g.mjs"],
  );
  // Driven through node, which is how this repo's own harnesses run it: the CLI
  // is the entry, and the hook is attributed relative to it.
  assert.deepEqual(
    commandRefs("node cli.js hook-runtime run-program .claude/hooks/x.hook.ts"),
    ["cli.js", ".claude/hooks/x.hook.ts"],
  );
  assert.deepEqual(
    commandRefs("node /abs/dist/cli.js hook-runtime run-program g.mjs"),
    ["/abs/dist/cli.js", "g.mjs"],
  );
});

test("only leaves that UNCONDITIONALLY run are attributed — a syntactic leaf is not a command", () => {
  // 🔴 FIRES. `leafArgvSource` walked every CallExpr in the tree, so a branch the
  // shell never takes was reported as an executed program. The probe is persisted
  // for a passing script, so the hook got fresh execution coverage without ever
  // running — a FALSE GRANT, and the same shape as attributing a data operand,
  // one level up in the grammar.
  assert.deepEqual(commandRefs("false && bash hooks/pre.sh"), []);
  assert.deepEqual(commandRefs("true || bash hooks/pre.sh"), []);
  // The whole conditional/deferred family, not just the two reported: whether a
  // body ran is a runtime fact this parse cannot have.
  assert.deepEqual(commandRefs("if false; then bash hooks/x.sh; fi"), []);
  assert.deepEqual(commandRefs("while true; do bash hooks/x.sh; done"), []);
  assert.deepEqual(commandRefs("for i in 1; do bash hooks/x.sh; done"), []);
  assert.deepEqual(commandRefs("case $x in y) bash hooks/x.sh;; esac"), []);
  // A function BODY does not run where it is written.
  assert.deepEqual(commandRefs("f() { bash hooks/x.sh; }"), []);

  // QUIET: everything that DOES certainly run is still attributed. A fix that
  // simply stopped descending would pass every assertion above and silently
  // empty the execution tier.
  assert.deepEqual(commandRefs("bash hooks/a.sh"), ["hooks/a.sh"]);
  assert.deepEqual(commandRefs("bash hooks/a.sh; bash hooks/b.sh"), [
    "hooks/a.sh",
    "hooks/b.sh",
  ]);
  // The LEFT of a short-circuit always runs.
  assert.deepEqual(commandRefs("bash hooks/a.sh && bash hooks/b.sh"), [
    "hooks/a.sh",
  ]);
  // A pipeline runs BOTH sides — it does not short-circuit.
  assert.deepEqual(commandRefs("bash hooks/a.sh | grep x"), ["hooks/a.sh"]);
  assert.deepEqual(commandRefs("grep x | bash hooks/a.sh"), ["hooks/a.sh"]);
  // Subshells, blocks and background all execute.
  assert.deepEqual(commandRefs("( bash hooks/a.sh )"), ["hooks/a.sh"]);
  assert.deepEqual(commandRefs("{ bash hooks/a.sh; }"), ["hooks/a.sh"]);
  assert.deepEqual(commandRefs("bash hooks/a.sh &"), ["hooks/a.sh"]);
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
  // ⚠️ `cd /repo && …` used to appear here as an attributed shape. It is now the
  // measured COST of only crediting leaves that unconditionally run — the hook
  // sits on the right of `&&`. `runHook(cmd, event, { cwd })` is the replacement,
  // and it is what this repo's own examples already use. See the short-circuit
  // test below for why the whole category had to go.
  assert.deepEqual(commandRefs("cd /repo && bash hooks/x.sh"), []);
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
