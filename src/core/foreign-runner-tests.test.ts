import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  foreignRunnerTests,
  foreignRunnerTestWarning,
  collectingRunners,
  harnessSurfaceDirs,
  agentDrivingApi,
  type ForeignRunnerTest,
} from "./foreign-runner-tests.js";
import { claudeCodeLayout } from "../adapters/claude-code/layout.js";

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
  assert.equal(agentDrivingApi("obj.runEval();"), "runEval");
  // The finding carries WHICH api it saw, and the message quotes it back — the
  // claim is now about this file, not about the class.
  const found = findWith({
    ".claude/skills/foo/foo.test.mjs": `await measureTriggerRate({});`,
  });
  assert.equal(found[0].evidence, "measureTriggerRate");
  assert.match(foreignRunnerTestWarning(found[0]), /measureTriggerRate/);
});

test("evidence: an `*.eval.*` name stands alone — the paid tier is declared, not read", () => {
  // Our own convention says what tier this is, so no read is needed and an empty
  // body does not excuse it.
  const found = findWith({ ".claude/skills/foo/foo.eval.test.mjs": "" });
  assert.equal(found.length, 1);
  assert.equal(found[0].evidence, "eval-name");
  assert.match(foreignRunnerTestWarning(found[0]), /burns model budget/);
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
