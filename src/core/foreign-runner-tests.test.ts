import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  foreignRunnerTests,
  foreignRunnerTestWarning,
  collectingRunners,
  harnessSurfaceDirs,
  agentDrivingApi,
  stripNonCode,
  type ForeignRunnerTest,
} from "./foreign-runner-tests.js";
import { claudeCodeLayout } from "../adapters/claude-code/layout.js";
// The two exported `scriptModel`s, imported so the premise of dropping the name
// from AGENT_DRIVING_APIS is a checked fact and not a comment: both are pure.
import { scriptModel as scriptTurns } from "../mock-model.js";
import { scriptModel as scriptAnswers } from "../skill-test.js";

const LAYOUT = claudeCodeLayout;

/** A body that DOES drive an agent — the default for the name/location tests,
 *  which are about names and locations, not about evidence. */
const DRIVES = `import { runHarnessTest } from "vigiles/testing";\nawait runHarnessTest({});\n`;

const find = (...paths: string[]): readonly ForeignRunnerTest[] =>
  foreignRunnerTests(
    () => paths,
    LAYOUT,
    () => DRIVES,
  );

/** Same, with per-path bodies — for the evidence half. */
const findWith = (
  bodies: Record<string, string | undefined>,
): readonly ForeignRunnerTest[] =>
  foreignRunnerTests(
    () => Object.keys(bodies),
    LAYOUT,
    (p) => bodies[p],
  );

/** The single finding for `path` — fails loudly if the check found none. */
function only(...paths: string[]): ForeignRunnerTest {
  const found = find(...paths);
  assert.equal(found.length, 1, `expected exactly one finding for ${paths[0]}`);
  const [first] = found;
  if (first === undefined) throw new Error("unreachable");
  return first;
}

test("fires: a harness test named `*.test.mjs` is collected by BOTH runners", () => {
  // The measured case — `npx vitest run` on a fixture holding only this file
  // reported `Test Files 1 passed (1)`, i.e. it descended into `.claude/`.
  const found = only(".claude/skills/foo/foo.test.mjs");
  assert.equal(found.reason, "suffix");
  assert.deepEqual([...found.runners], ["vitest", "jest"]);
  // The published-plugin shape (no `.claude/` prefix) is the same finding.
  assert.equal(find("skills/foo/foo.test.mjs").length, 1);
  // Hooks and agents are surfaces too — a hook test reads like a unit test, so
  // it is the one most likely to be given a `*.test.*` name.
  assert.equal(find(".claude/hooks/guard.test.ts").length, 1);
  assert.equal(find(".claude/agents/bar.spec.js").length, 1);
});

test("fires: `__tests__/` catches jest by LOCATION, whatever the file is called", () => {
  // This is the trap the suffix rule cannot see: jest's second default glob
  // takes every js/ts file under such a dir, so a name with no `test` in it at
  // all is still collected.
  const found = only(".claude/skills/foo/__tests__/whatever.mjs");
  assert.equal(found.reason, "tests-dir");
  // jest only — vitest requires the name suffix and ignores the directory.
  assert.deepEqual([...found.runners], ["jest"]);
  assert.match(foreignRunnerTestWarning(found), /jest/);
  // A non-js file in there is not collected by anything.
  assert.deepEqual(find(".claude/skills/foo/__tests__/fixture.json"), []);
  // `__tests__` must be a DIRECTORY on the path, not the file's own name.
  assert.deepEqual(find(".claude/skills/foo/__tests__"), []);
});

test("silent: the clean corpus — our own suffixes match no third-party default", () => {
  // The whole point of `*.harness.mjs` / `*.eval.mjs`: neither runner's default
  // globs match them. If this ever fires, the convention has stopped protecting
  // anyone and every harness in the wild is being run by strangers' CI.
  assert.deepEqual(
    find(
      ".claude/skills/foo/foo.harness.mjs",
      ".claude/skills/foo/foo.eval.mjs",
      ".claude/skills/foo/SKILL.md",
      ".claude/hooks/hooks.harness.mjs",
      ".claude/skills/foo/scripts/helper.mjs",
      "CLAUDE.md",
    ),
    [],
  );
});

test("scope: an ordinary project test outside the harness dirs is nobody's business", () => {
  // `src/foo.test.ts` is exactly what vitest SHOULD run. Flagging it would make
  // the warning noise on every repo that has tests, and it would be wrong.
  assert.deepEqual(
    find("src/foo.test.ts", "test/e2e.spec.js", "foo.test.mjs"),
    [],
  );
  // ...and the same name one dir over, inside a surface, IS a finding.
  assert.equal(find("skills/foo/foo.test.ts").length, 1);
});

test("collectingRunners: faithful to the two DEFAULT globs, including where they differ", () => {
  // Every extension in `?(c|m)[jt]s?(x)`.
  for (const ext of ["js", "jsx", "ts", "tsx", "cjs", "mjs", "cts", "mts"]) {
    assert.deepEqual(collectingRunners(`a/foo.test.${ext}`), [
      "vitest",
      "jest",
    ]);
  }
  // jest's prefix `?(*.)` is OPTIONAL, vitest's `*.` is not — a BARE `test.mjs`
  // is collected by jest alone. Getting this wrong would name the wrong tool in
  // the message, sending the author to configure a runner that never ran it.
  assert.deepEqual(collectingRunners("a/test.mjs"), ["jest"]);
  assert.deepEqual(collectingRunners("a/spec.ts"), ["jest"]);
  // `+(spec|test)` is one-or-more repetitions.
  assert.deepEqual(collectingRunners("a/foo.testspec.ts"), ["jest"]);
  // Not collected: our suffixes, the typecheck-only `-d` glob (plain runs skip
  // it), a non-js extension, and `test` merely appearing in the stem.
  for (const p of [
    "a/foo.harness.mjs",
    "a/foo.eval.mjs",
    "a/foo.test-d.ts",
    "a/foo.test.json",
    "a/foo.test.md",
    "a/testing.mjs",
    "a/latest.mjs",
    "a/SKILL.md",
  ]) {
    assert.equal(collectingRunners(p), undefined, p);
  }
});

test("the message names the FILE, the RUNNER and the CONSEQUENCE — and bills the eval tier", () => {
  const msg = foreignRunnerTestWarning(only(".claude/skills/foo/foo.test.mjs"));
  assert.match(msg, /\.claude\/skills\/foo\/foo\.test\.mjs/); // which file
  assert.match(msg, /vitest and jest/); // which runner
  assert.match(msg, /COLLECTS AND EXECUTES/); // what happens
  assert.match(msg, /spawns an agent/); // why it costs
  assert.match(msg, /harness\.mjs/); // the fix is a rename

  // An eval file wearing a foreign name is the expensive case: it drives the
  // REAL model, so the message must say money, not just "runs unexpectedly".
  const paidMsg = foreignRunnerTestWarning(
    only(".claude/skills/foo/__tests__/foo.eval.mjs"),
  );
  assert.equal(msg.includes("runHarnessTest"), true); // the evidence it read
  assert.match(paidMsg, /REAL model/);
  assert.match(paidMsg, /burns model budget/);
  // The free tier must NOT claim a model bill.
  assert.doesNotMatch(msg, /burns model budget/);
});

test("silent: a REAL offline unit test under a surface dir is not accused", () => {
  // 🔴 The regression this gate exists for. `.claude/skills/verify-citations/
  // scripts/verify-cites.test.mjs` in the author's own repo is an offline test of
  // a pure reducer — no model, no network, no vigiles import — and the name+
  // location rule reported it and told him to rename it, which would have taken a
  // working test out of that repo's vitest run.
  //
  // Real bytes, not a fixture written to pass: this repo's own
  // `core/test-file-ext.test.ts`, which is exactly that shape (pure function in,
  // value out), read off disk and placed at the surface path Codex named.
  const pure = readFileSync(join(__dirname, "test-file-ext.test.ts"), "utf-8");
  assert.equal(agentDrivingApi(pure), undefined);
  assert.deepEqual(
    findWith({ ".claude/skills/foo/scripts/parser.test.ts": pure }),
    [],
  );
  // Same for the `__tests__/` half — jest collects by location, but a pure file
  // parked there is still not driving anything.
  assert.deepEqual(findWith({ "skills/foo/__tests__/parser.ts": pure }), []);
  // Unreadable / absent content is NOT evidence either: no read, no accusation.
  assert.deepEqual(
    findWith({ ".claude/skills/foo/foo.test.mjs": undefined }),
    [],
  );
});

test("fires: a REAL harness file, if it were named `*.test.*`, still costs money", () => {
  // The other half on real bytes — one of this repo's shipped example harnesses,
  // which genuinely calls `runHarnessTest`. Renaming THAT one is sound advice.
  const real = readFileSync(
    join(
      __dirname,
      "..",
      "..",
      "examples",
      "harness",
      "effect-boundary.harness.mjs",
    ),
    "utf-8",
  );
  assert.ok(agentDrivingApi(real) !== undefined);
  const found = findWith({ ".claude/skills/foo/foo.test.mjs": real });
  assert.equal(found.length, 1);
  assert.match(foreignRunnerTestWarning(found[0]), /spawns an agent/);
});

test("evidence: only the AGENT-driving tiers count, and the message quotes the one it found", () => {
  // `runHook` is the no-capability tier — a hook process, no binary, no model, no
  // bill. Collecting one is collecting an ordinary test, so it must stay silent;
  // otherwise the harmful "rename it" advice just moves down a tier.
  assert.equal(
    agentDrivingApi(
      `import { runHook } from "vigiles/unit";\nawait runHook({});`,
    ),
    undefined,
  );
  assert.deepEqual(
    findWith({
      ".claude/skills/foo/foo.test.mjs": `import { runHook } from "vigiles/unit";`,
    }),
    [],
  );
  // Identifier boundaries: a longer name that merely CONTAINS one is not a call.
  assert.equal(agentDrivingApi("const myRunEvaluator = 1;"), undefined);
  assert.equal(agentDrivingApi("$runEval"), undefined);
  // 🔴 A DOTTED name is somebody's PROPERTY, and this used to be a finding. The
  // allowance existed for `v.runEval()` after `import * as v from
  // "vigiles/testing"` — MEASURED across this repo, a 43-harness consumer repo and
  // five vendored third-party plugin repos, that shape occurs in exactly two
  // places: this gate's own comment and this gate's own test. Nothing real uses
  // it, while `mock.runEval()` / `deps.runEval()` / `this.runEval()` are ordinary.
  // Cost of dropping it: a genuine namespace-import user loses ONE warning, and
  // the money guard still refuses the spawn at runtime.
  assert.equal(agentDrivingApi("obj.runEval();"), undefined);
  // The finding carries WHICH api it saw, and the message quotes it back — the
  // claim is now about this file, not about the class.
  const found = findWith({
    ".claude/skills/foo/foo.test.mjs": `await measureTriggerRate({});`,
  });
  assert.equal(found[0].evidence, "measureTriggerRate");
  assert.match(foreignRunnerTestWarning(found[0]), /measureTriggerRate/);
});

test("evidence: a name the file BINDS ITSELF is not our API", () => {
  // 🔴 The sixth finding from this file, and the dual of the import rule the
  // round-14 measurement rejected: a declaration needs no module graph, it is
  // right there in the text. `const runEval = vi.fn(); runEval();` was read as a
  // real-model invocation and its author told to rename a working unit test.
  const bound: Record<string, string> = {
    "the reported shape": "const runEval = vi.fn();\nrunEval();",
    let: "let measureArms = jest.fn();\nmeasureArms({});",
    "function declaration": "function runEval() { return 1; }\nrunEval();",
    class: "class runEval {}\nnew runEval();",
    "aliased import": 'import { fake as runEval } from "./f.js";\nrunEval({});',
    "default import": 'import runEval from "./f.js";\nrunEval({});',
    destructured: "const { runEval } = deps;\nrunEval({});",
  };
  for (const [why, body] of Object.entries(bound)) {
    assert.equal(agentDrivingApi(body), undefined, why);
    assert.deepEqual(findWith({ ".claude/skills/foo/foo.test.mjs": body }), [], why); // prettier-ignore
  }

  // QUIET — a fix that suppressed on any MENTION would pass every line above and
  // silence the gate entirely. `import { runEval } from "vigiles/testing"` binds
  // OUR name to OUR export and is exactly the case this gate exists for.
  assert.equal(
    agentDrivingApi('import { runEval } from "vigiles/testing";\nawait runEval({});'), // prettier-ignore
    "runEval",
  );
  assert.equal(
    agentDrivingApi('import { runHarnessTest } from "vigiles/testing";\nrunHarnessTest({});'), // prettier-ignore
    "runHarnessTest",
  );
  // …and a file that declares a FAKE under another name and calls the real thing
  // is still a finding — binding `Fake` is not binding `runEval`.
  assert.equal(agentDrivingApi("class Fake { runEval() {} }\nrunEval({});"), "runEval"); // prettier-ignore

  // ⚠️ WHAT IT MISSES, run rather than asserted: a PARAMETER is a binding this
  // module cannot see without scope analysis, so the name still reads as ours.
  // One warning, against six rounds of telling authors to break their tests.
  assert.equal(agentDrivingApi("function f(runEval) { runEval({}); }"), "runEval"); // prettier-ignore
});

test("evidence: `scriptModel` is not a spawn — building a scripted model is not driving an agent", () => {
  // 🔴 It was on the list, justified as "exists only to be handed to one of
  // them" — an argument about INTENT inside a list whose whole warrant is that
  // the CALL spawns an agent. The premise is CHECKED here rather than asserted:
  // both exported implementations are pure, so calling either reaches no process.
  assert.deepEqual(scriptTurns([{ text: "hi" }]), [{ text: "hi" }]);
  assert.equal(typeof scriptAnswers(["hi"]), "function");

  // QUIET: a surface-local `*.test.mjs` that only constructs or unit-tests a
  // scripted model earns no finding. This repo's own `mock-model.test.ts` is
  // that shape, and the advice it used to draw ("rename it out of your runner's
  // collection") would have removed a working offline test from its suite.
  assert.equal(
    agentDrivingApi(
      `import { scriptModel } from "vigiles/claude-code";\n` +
        `const turns = scriptModel([{ text: "ok" }]);\n` +
        `assert.equal(turns.length, 1);\n`,
    ),
    undefined,
  );
  assert.deepEqual(
    findWith({
      ".claude/skills/foo/foo.test.mjs": `const t = scriptModel([{ text: "ok" }]);`,
    }),
    [],
  );

  // FIRES: the case the finding is actually about is untouched — a file that
  // scripts a model AND runs it names the runner, and the runner is the honest
  // evidence. Dropping `scriptModel` therefore costs no recall here.
  const found = findWith({
    ".claude/skills/foo/foo.test.mjs":
      `const turns = scriptModel([{ text: "ok" }]);\n` +
      `await runHarnessTest({ model: turns });\n`,
  });
  assert.equal(found.length, 1);
  assert.equal(
    found[0].evidence,
    "runHarnessTest",
    "the spawn is the evidence, not the helper that built its argument",
  );
});

test("evidence: a bodiless TYPE MEMBER is not a call — `):` abstains", () => {
  // 🔴 MEASURED against the built module before the fix: both of these returned
  // an API name, so a pure type-level test was told to rename itself out of its
  // own vitest run. `returnTypeThenBody` stopped at the `;` and "no body" was
  // read as proof of a CALL, which is backwards for the commonest TS shape there
  // is. (This exact case had been written into a report as a deliberate miss
  // "toward silence" — it was never silent. Hence assertions, not prose.)
  assert.equal(
    agentDrivingApi("interface Runner { runEval(o: Opts): void; }"),
    undefined,
  );
  assert.equal(
    agentDrivingApi(
      "interface Runner { runEval(o: Opts): void; }\nexport type X = Runner;",
    ),
    undefined,
  );
  assert.equal(
    agentDrivingApi("type R = { measureTriggerRate(o: O): Promise<number>; };"),
    undefined,
  );
  // A whole type-level test file earns no finding, however it is named.
  assert.deepEqual(
    findWith({
      ".claude/skills/foo/types.test.ts":
        'import type { Opts } from "vigiles/testing";\n' +
        "interface Runner { runEval(o: Opts): void; }\n" +
        "export type X = Runner;\n",
    }),
    [],
  );

  // QUIET half — the definition shapes that already abstained still do, and a
  // real call still fires. A fix that simply returned false everywhere would
  // pass the assertions above and silence the entire gate.
  assert.equal(
    agentDrivingApi("declare function runEval(o: Opts): void;"),
    undefined,
  );
  assert.equal(agentDrivingApi("function runEval(o: O): void {}"), undefined);
  assert.equal(agentDrivingApi("await runEval({});"), "runEval");
  // A dotted call is a property read — see the namespace measurement above.
  assert.equal(agentDrivingApi("await v.measureTriggerRate({});"), undefined);
  // …and the undotted call it was standing in for still fires.
  assert.equal(
    agentDrivingApi("await measureTriggerRate({});"),
    "measureTriggerRate",
  );
  assert.equal(
    agentDrivingApi("if (await runEval({})) {\n  done();\n}\n"),
    "runEval",
  );

  // ⚠️ WHAT ABSTAINING COSTS, run rather than asserted — a ternary whose colon is
  // not a return type. One lost warning, versus telling an author to break a
  // working test.
  assert.equal(agentDrivingApi("const r = flag ? runEval({}) : 0;"), undefined);
  // The other two documented misses, likewise executed and pinned.
  assert.equal(agentDrivingApi("runEval(("), undefined);
  assert.equal(agentDrivingApi("runEval(x)\n{ y }"), undefined);
});

test("evidence: a TYPE BODY is blanked, so a bodiless member is not a call", () => {
  // 🔴 The class the `):` fix did not close. `runEval(o);` inside an interface and
  // `runEval({});` in a function are LEXICALLY IDENTICAL, so no rule over the
  // tokens around the match can separate them — the discriminator is WHERE the
  // match sits. A type body is a delimited region, and blanking those is what
  // `stripNonCode` already does for comments and strings, so this is one more
  // region kind in the same lexer: no parser, no dependency, byte-parity intact.
  //
  // Each of these returned an API name before the fix.
  for (const src of [
    "interface R { runEval(o); }",
    "interface Runner { runEval(o: Opts): void; }",
    "type R = { runEval(o); };",
    "type R = { runEval(o), other: 1 };",
    'declare module "x" { interface I { runEval(o); } }',
    "declare global { interface G { runEval(o); } }",
    // A generic head carries braces of its own, so the search repeats past them.
    "interface X<T extends { a: 1 }> { runEval(o); }",
    "type R = { measureTriggerRate(o: O): Promise<number>; };",
  ]) {
    assert.equal(agentDrivingApi(src), undefined, src);
  }

  // 🔴 QUIET HALF, AND THE ONE THAT MATTERS: a brace-blanker that swallowed real
  // code would be worse than the false positives it fixes. Every one of these is
  // a genuine call sitting inside braces a naive blanker could have eaten.
  for (const src of [
    "await runEval({});",
    "const s = `${runEval(x)}`;",
    "const s = `a${`b${runEval(x)}`}c`;",
    "class F { run() { return runEval({}); } }",
    "class F { run = () => runEval({}); }",
    "const o = { run: () => runEval({}) };",
    "const o = { run() { return runEval({}); } };",
    "try { await runEval({}); } catch {}",
    "it('x', async () => { await runEval({}); });",
    // …and a call that FOLLOWS a type declaration, where the blanker must stop
    // at the body's closing brace and not run on.
    "interface R { a: 1 }\nawait runEval({});",
    "type A = { a: 1 };\nawait runEval({});",
    "type A = { a: 1 };\nawait runEval({});\ntype B = { b: 2 };",
    "interface X<T extends { a: 1 }> { m(): T }\nawait runEval({});",
    "interface R { runEval(o): void }\nconst x: R = null;\nawait runEval({});",
  ]) {
    assert.notEqual(agentDrivingApi(src), undefined, src);
  }

  // 🔴 THE OVERSHOOT GUARD. Semicolon-less code must not send the body search
  // into the next function: without the newline bound, each of these loses a real
  // call, which is the worse direction.
  for (const src of [
    "type A = string\nfunction f() { runEval({}); }",
    "declare const x: T\nfunction f() { runEval({}); }",
    "interface R { a: 1 }\nfunction f() { runEval({}) }",
    "type A =\n  | 'a'\n  | 'b'\nawait runEval({});",
    // `type` is not a reserved word, so a variable or property named `type` must
    // not open a "type body" — these object literals HOLD the call, so blanking
    // one loses it outright.
    "const type = { run: () => runEval({}) };",
    "obj.type = { run: () => runEval({}) };",
    // …and a PROPERTY named after a keyword, which only the `.` lookbehind stops.
    "obj.interface = { run: () => runEval({}) };",
    "const type = { a: 1 };\nawait runEval({});",
    "obj.type = { a: 1 };\nawait runEval({});",
    // A truncated file blanks nothing rather than swallowing the rest.
    "interface R { a: 1\nawait runEval({});",
  ]) {
    assert.notEqual(agentDrivingApi(src), undefined, src);
  }

  // ⚠️ WHAT IS STILL OPEN, executed and pinned: a class overload signature. A
  // class body cannot be blanked — the true positives above include a call inside
  // one — and telling an overload from an expression statement needs to know the
  // enclosing brace is a class body.
  assert.equal(
    agentDrivingApi("class C { runEval(o: A); runEval(o: B) { return 1; } }"),
    "runEval",
  );
});

test("evidence: an eval NAME stands alone — but only a name eval discovery collects", () => {
  // Our own convention says what tier this is, so no read is needed and an empty
  // body does not excuse it — for a name `vigiles eval` would actually run.
  // Reachable through jest's `__tests__/` rule, which takes files by LOCATION —
  // and, once the name check matches eval DISCOVERY, only through it: a name
  // `vigiles eval` collects (`*.eval.<ext>`) is by construction not a name a
  // suffix-based runner collects (`*.test.*` / `*.spec.*`). Measured below.
  const found = findWith({ ".claude/skills/foo/__tests__/bar.eval.mjs": "" });
  assert.equal(found.length, 1);
  assert.equal(found[0].evidence, "eval-name");
  assert.equal(found[0].reason, "tests-dir");
  assert.match(foreignRunnerTestWarning(found[0]), /burns model budget/);
  // A bare `*.eval.mjs` outside `__tests__/` is not collected by anyone, so it is
  // not a finding at all — the name alone was never the trigger.
  assert.deepEqual(findWith({ ".claude/skills/foo/foo.eval.mjs": "" }), []);

  // 🔴 …and NOT for a name that merely CONTAINS `.eval.`. The check was an infix,
  // so an ordinary surface-local unit test called `parser.eval.test.ts` was
  // declared to burn model budget while not matching
  // `**/*.eval.{ts,mts,cts,js,mjs,cjs}` — the glob that decides what `vigiles
  // eval` runs. A name vigiles will never collect as an eval cannot be an eval by
  // name; the CONTENT gate answers for it instead.
  assert.deepEqual(
    findWith({
      ".claude/skills/foo/parser.eval.test.ts": "export const x = 1;",
    }),
    [],
  );
  assert.deepEqual(
    findWith({ ".claude/skills/foo/foo.eval.test.mjs": "" }),
    [],
  );
  // The content gate still catches one that really does drive an agent…
  const driven = findWith({
    ".claude/skills/foo/parser.eval.test.ts": "await runEval({});",
  });
  assert.equal(driven.length, 1);
  assert.equal(driven[0].evidence, "runEval");
  // …and every extension eval discovery accepts is still evidence by name.
  for (const ext of ["ts", "mts", "cts", "js", "mjs", "cjs"]) {
    assert.equal(
      findWith({ [`.claude/skills/foo/__tests__/b.eval.${ext}`]: "" })[0]
        ?.evidence,
      "eval-name",
      ext,
    );
  }
});

test("harnessSurfaceDirs is layout-driven, in both the plugin and the user shape", () => {
  const dirs = harnessSurfaceDirs(LAYOUT);
  for (const d of ["skills", "agents", "commands", "hooks"]) {
    assert.ok(dirs.includes(d), d);
    assert.ok(dirs.includes(`.claude/${d}`), `.claude/${d}`);
  }
  // `materializeRoot` and `userSurfaceRoot` are both `.claude` here — deduped,
  // or every finding under it would be reported twice.
  assert.equal(new Set(dirs).size, dirs.length);
});

test("findings are sorted, because the parity gate compares reports byte for byte", () => {
  const found = find(
    ".claude/skills/z/z.test.mjs",
    ".claude/skills/a/a.test.mjs",
  );
  assert.deepEqual(
    found.map((f) => f.path),
    [".claude/skills/a/a.test.mjs", ".claude/skills/z/z.test.mjs"],
  );
});

// ---------------------------------------------------------------------------
// A NAME IS NOT A CALL — the gate's evidence must be a call site, not a
// substring. Both halves per shape: the mention stays SILENT, the call FIRES.
// ---------------------------------------------------------------------------

test("evidence: a MENTION is not a call — import, comment, string, mock all stay silent", () => {
  // The regression this replaces: the gate searched for the bare identifier, so
  // every one of these was reported as an agent-spawning call AND told to rename
  // a working test. A `*.test.*` name under a surface dir is the trigger, so each
  // of these bodies is one edit away from the harmful advice.
  const mentions: Record<string, string> = {
    "a named import of the API, to test a wrapper around it":
      'import { runEval } from "vigiles/testing";\nexport const wrap = 1;\n',
    "a line comment forbidding it":
      "// never call runEval in this file\nconst a = 1;\n",
    "a block comment": "/* runEval is banned here */\nconst a = 1;\n",
    "a string fixture": 'const expected = "runEval";\n',
    "template TEXT, which is data": "const label = `runEval(x)`;\n",
    "a mocked property, which is a definition and not a call":
      'vi.mock("vigiles/testing", () => ({ runEval: fake }));\n',
    "a type-only reference": "let f: typeof runEval;\n",
  };
  for (const [why, body] of Object.entries(mentions)) {
    assert.equal(agentDrivingApi(body), undefined, why);
    assert.deepEqual(
      findWith({ ".claude/skills/foo/foo.test.mjs": body }),
      [],
      why,
    );
  }
});

test("evidence: a real CALL fires, through every spelling that is still a call", () => {
  const calls: Record<string, string> = {
    "a plain awaited call":
      'import { runEval } from "vigiles/testing";\nawait runEval({});\n',
    "whitespace before the paren": "runEval ({});\n",
    "inside a template INTERPOLATION, which is code":
      "const s = `${runEval({})}`;\n",
    "after the regex that used to swallow it":
      'const t = s.replace(/[.`"\']/g, "");\nawait measureTriggerRate({});\n',
  };
  for (const [why, body] of Object.entries(calls)) {
    assert.notEqual(agentDrivingApi(body), undefined, why);
    assert.equal(
      findWith({ ".claude/skills/foo/foo.test.mjs": body }).length,
      1,
      why,
    );
  }
});

// ---------------------------------------------------------------------------
// A DEFINITION IS NOT A CALL — the round after "a name is not a call". Stripping
// comments and strings left `name(` matching a DECLARATION of the same name, so
// a surface-local test that merely defines a helper or a fake was told to rename
// itself. Both halves per shape: the definition stays SILENT, the call FIRES.
// ---------------------------------------------------------------------------

test("evidence: a DEFINITION of the same name is not a call — declarations stay silent", () => {
  const definitions: Record<string, string> = {
    "a plain function declaration":
      "function runEval() {}\nexport default 1;\n",
    "an exported async function declaration":
      "export async function runEval(opts) { return opts; }\n",
    "a class method of a local fake":
      "class Fake { runEval() { return null; } }\nnew Fake().go();\n",
    "a TS class method with a return type":
      "class Fake { runEval(): void {} }\nexport const f = new Fake();\n",
    "a TS class method returning an object type":
      "class Fake { runEval(): { ok: boolean } { return { ok: true }; } }\n",
    "an object-literal shorthand method":
      "const stub = { runEval() { return 0; } };\nexport default stub;\n",
    "a generator method, whose `*` we deliberately do not read":
      "class Fake { *runEval() { yield 1; } }\n",
    "a bodiless TS overload signature":
      "declare function runEval(o: Opts): Promise<void>;\n",
    "an abstract member, which also has no body":
      "abstract class Base { abstract runEval(o: Opts): void; }\n",
    "a getter that happens to carry the name":
      "class Fake { get runEval() { return 1; } }\n",
  };
  for (const [why, body] of Object.entries(definitions)) {
    assert.equal(agentDrivingApi(body), undefined, why);
    assert.deepEqual(
      findWith({ ".claude/skills/foo/foo.test.ts": body }),
      [],
      why,
    );
  }
});

test("evidence: a call still fires next to a definition, and through the shapes a `)`-follow could break", () => {
  const calls: Record<string, string> = {
    // The case that must not be over-corrected: the file defines a fake AND
    // drives the real thing. Silence here would be the opposite regression.
    "a fake defined and the real API called anyway":
      'import { runEval } from "vigiles/testing";\n' +
      "class Fake { runEval() {} }\nawait runEval({});\n",
    "a call whose result opens a block-bodied callback":
      "runEval({}).then((r) => {\n  console.log(r);\n});\n",
    "a call inside a condition, so its `)` is followed by `)` then `{`":
      "if (await runEval({})) {\n  done();\n}\n",
    "a call as the last expression in the file, with nothing after its `)`":
      "runEval({})",
    "a property read named `get`, which ASI puts before a real call":
      "const g = obj.get\nrunEval({});\n",
  };
  for (const [why, body] of Object.entries(calls)) {
    assert.notEqual(agentDrivingApi(body), undefined, why);
    assert.equal(
      findWith({ ".claude/skills/foo/foo.test.ts": body }).length,
      1,
      why,
    );
  }
});

test("stripNonCode lexes regex literals — measured, not assumed, on this repo's own sources", () => {
  // 🔴 The first draft called regex literals "too rare to bother with" and the
  // first real file checked disproved it: a `.replace(/[.`"']/g, "")` in the
  // author's corpus opened a template literal that ran to end-of-file and blanked
  // a real `measureTriggerRate({` fifty lines below — a silent false NEGATIVE.
  //
  // The quiet half on real input: every .ts source in this repo, plus a canary
  // call appended. If the lexer ends in a string/comment/template state that it
  // should have closed, the canary disappears and the assert names the file.
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return /\.[cm]?[jt]sx?$/.test(e.name) ? [p] : [];
    });
  // `src/` for TS and `site/src/` for TSX — JSX is in on purpose: `</span>` puts
  // a `/` in expression position, which is the shape that needs the same-line
  // guard on a regex candidate. Six real files here depend on it.
  const files = [
    ...readdirSync(join(__dirname, ".."), { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".ts"))
      .map((e) => join(__dirname, "..", e.name)),
    ...walk(join(__dirname, "..", "..", "site", "src")),
  ];
  assert.ok(
    files.length > 50,
    "expected this repo's sources to be the real corpus",
  );
  // Blanking preserves length and position, so an untouched tail is proof the
  // lexer closed everything it opened. (Asserting on `agentDrivingApi` instead
  // would be a weaker test AND a wrong one: several of these files call an
  // agent-driving API of their own, and the FIRST match would be that one.)
  const canary = "\nrunEval(1);\n";
  for (const file of files) {
    const stripped = stripNonCode(readFileSync(file, "utf-8") + canary);
    assert.equal(
      stripped.slice(-canary.length),
      canary,
      `lexer ended unbalanced on ${file} — the canary call was swallowed`,
    );
  }
});

test("stripNonCode: a `/` that divides is not a regex, so it cannot eat the code after it", () => {
  // The disambiguation, both ways. A value before `/` means division; if a
  // candidate finds no closing `/` before the newline it is division after all,
  // which is what stops a misread from swallowing a file.
  assert.equal(agentDrivingApi("const r = a / b;\nrunEval(1);\n"), "runEval");
  assert.equal(
    agentDrivingApi("const r = arr[0] / 2;\nrunEval(1);\n"),
    "runEval",
  );
  assert.equal(
    agentDrivingApi("const r = f(x) / 2;\nrunEval(1);\n"),
    "runEval",
  );
  // …and the keyword case, where the previous character IS an identifier char
  // but the position is expression-start.
  assert.equal(
    agentDrivingApi('function f() { return /["`]/.test(x); }\nrunEval(1);\n'),
    "runEval",
  );
  // Two divisions on ONE line: here the same-line guard cannot rescue a misread,
  // because there IS a second `/` to close on — only "a value cannot be followed
  // by a regex" gets it right. Asserted on the stripped text, since the damage
  // is a blanked middle rather than a swallowed tail.
  assert.equal(
    stripNonCode("const r = xs[0] / a / b;"),
    "const r = xs[0] / a / b;",
  );
  assert.equal(
    stripNonCode("const r = f(x) / a / b;"),
    "const r = f(x) / a / b;",
  );
  // A `/` INSIDE a character class does not close the regex. Real line, from
  // `src/instruction-sources.ts`: without class tracking the literal ends at the
  // first inner slash and the rest of the line is lexed as something else.
  const split = String.raw`const segs = relPath.split(/[/\\]/).slice(0, -1);`;
  assert.equal(
    stripNonCode(split),
    `const segs = relPath.split(${" ".repeat(7)}).slice(0, -1);`,
  );
});
