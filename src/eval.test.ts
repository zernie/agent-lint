/**
 * Tests for the eval aggregation/formatting + orchestration (deterministic, no
 * model). `runEval` itself spawns the real `claude` CLI (bench/ exercises that);
 * `runEvalWith` takes an injected runner, so the loop / `measure` context /
 * aggregation are tested here against canned stream-json — no model.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  aggregate,
  aggregateStats,
  aggregateUsage,
  parseUsage,
  formatEvalReport,
  runEvalWith,
  runPool,
  isRateLimited,
  measureTriggerRateWith,
  formatTriggerRateReport,
  measureWith,
  measureArmsWith,
  compareCheck,
  formatCheckReport,
  assertRates,
  checkReportToJUnit,
  type CheckReport,
  packageSkillsDir,
  stubSkillBody,
  promptDistance,
  checkPromptDiversity,
  assertPromptDiversity,
  type AgentRunArgs,
} from "./eval.js";
import {
  usedTool,
  outputContains,
  assertTriggerRate,
} from "./harness-assert.js";
import { tool, output, turns } from "./check.js";
import { makeTmpDir, cleanupTmpDir } from "./core/test-utils.js";

test("aggregateStats reports mean, sample std, se, and n", () => {
  const s = aggregateStats([{ x: 2 }, { x: 4 }, { x: 6 }]);
  assert.equal(s.x.mean, 4);
  assert.equal(s.x.n, 3);
  // sample std of [2,4,6] = 2
  assert.ok(Math.abs(s.x.std - 2) < 1e-9);
  assert.ok(Math.abs(s.x.se - 2 / Math.sqrt(3)) < 1e-9);
});

test("aggregateStats gives std 0 for a single observation", () => {
  const s = aggregateStats([{ x: 5 }]);
  assert.equal(s.x.std, 0);
  assert.equal(s.x.se, 0);
});

test("aggregateStats reports pass^k: 1 only when every trial succeeds", () => {
  // booleans: all true → passK 1; any false → 0
  const all = aggregateStats([{ ok: true }, { ok: true }]);
  assert.equal(all.ok.passK, 1);
  const some = aggregateStats([{ ok: true }, { ok: false }]);
  assert.equal(some.ok.passK, 0);
  // counts: a trial succeeds when > 0
  const counts = aggregateStats([{ marks: 2 }, { marks: 0 }]);
  assert.equal(counts.marks.passK, 0);
  assert.equal(aggregateStats([{ marks: 1 }, { marks: 3 }]).marks.passK, 1);
});

test("aggregate averages numbers and takes the true-fraction of booleans", () => {
  const agg = aggregate([
    { marks: 2, caught: true },
    { marks: 0, caught: false },
    { marks: 4, caught: true },
  ]);
  assert.equal(agg.marks, 2); // (2+0+4)/3
  assert.ok(Math.abs(agg.caught - 2 / 3) < 1e-9); // 2 of 3 true
});

test("aggregate tolerates missing keys across rows", () => {
  const agg = aggregate([{ a: 1 }, { b: true }]);
  assert.equal(agg.a, 1); // averaged over the 1 row that has it
  assert.equal(agg.b, 1);
});

test("runEvalWith drives arms × trials via an injected runner (no model)", async () => {
  // Canned stream-json: the `on` arm reports a Skill tool_use, a hook firing,
  // and a result with num_turns + answer; the `off` arm reports a bare result
  // (no tool / hook / num_turns / answer) — exercising both makeContext branches.
  const onStream = [
    JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "tool_use", id: "t1", name: "Skill", input: {} }],
      },
    }),
    JSON.stringify({
      type: "system",
      subtype: "hook_response",
      hook_name: "Stop",
      hook_event: "Stop",
      exit_code: 0,
      outcome: "success",
      output: "",
    }),
    JSON.stringify({ type: "result", result: "answer is on", num_turns: 2 }),
  ].join("\n");
  const offStream = JSON.stringify({ type: "result" }); // no num_turns/result

  const seen: AgentRunArgs[] = [];
  const fakeRunner = (
    a: AgentRunArgs,
  ): Promise<{ code: number; stdout: string }> => {
    seen.push(a);
    return Promise.resolve({
      code: 0,
      stdout: a.hasSettings ? onStream : offStream,
    });
  };

  const report = await runEvalWith(
    {
      fixture: { "a.txt": "hi" },
      arms: {
        off: {},
        on: {
          settings: {
            hooks: {
              Stop: [{ hooks: [{ type: "command", command: "true" }] }],
            },
          },
        },
      },
      task: "do it",
      trials: 2,
      spacingSec: 0,
      measure: (ctx) => ({
        used: usedTool(ctx, "Skill"),
        turns: ctx.turns,
        sawFile: ctx.file("a.txt") !== null,
        missing: ctx.file("nope.txt") === null,
        shOk: ctx.sh("echo hi") === "hi",
        // failing command WITH stdout → catch returns the partial stdout
        shPartial: ctx.sh("echo part; exit 1") === "part",
        // failing command WITHOUT stdout → catch returns ""
        shEmpty: ctx.sh("exit 7") === "",
        onArm: outputContains(ctx, "answer is on"),
      }),
    },
    fakeRunner,
  );

  assert.equal(seen.length, 4); // 2 arms × 2 trials
  assert.equal(report.arms.off?.runs, 2);
  assert.equal(report.arms.on?.runs, 2);
  // `on` arm: Skill used, 2 turns, answer present → all true (pass^k = 1)
  assert.equal(report.arms.on?.metrics.used, 1);
  assert.equal(report.arms.on?.metrics.turns, 2);
  assert.equal(report.arms.on?.stats.used?.passK, 1);
  // `off` arm: no Skill, 0 turns, no answer
  assert.equal(report.arms.off?.metrics.used, 0);
  assert.equal(report.arms.off?.metrics.turns, 0);
  // both arms: the fixture file is present, sh try/catch all hold
  assert.equal(report.arms.off?.metrics.sawFile, 1);
  assert.equal(report.arms.off?.metrics.shOk, 1);
  assert.equal(report.arms.off?.metrics.shPartial, 1);
  assert.equal(report.arms.off?.metrics.shEmpty, 1);
});

test("runEvalWith honors provided optionals (name/model/tools/timeout, arm.files)", async () => {
  const runner = (): Promise<{ code: number; stdout: string }> =>
    Promise.resolve({
      code: 0,
      stdout: JSON.stringify({ type: "result", result: "r", num_turns: 1 }),
    });
  const report = await runEvalWith(
    {
      name: "custom",
      fixture: { "base.txt": "b" },
      arms: { a: { files: { "extra.txt": "e" } } }, // arm.files spread branch
      task: "t",
      trials: 1,
      model: "sonnet",
      allowedTools: ["Read"],
      timeoutMs: 1000,
      spacingSec: 0,
      measure: (ctx) => ({
        both: ctx.file("base.txt") !== null && ctx.file("extra.txt") !== null,
      }),
    },
    runner,
  );
  assert.equal(report.name, "custom"); // spec.name provided
  assert.equal(report.arms.a?.metrics.both, 1);
});

test("measureTriggerRateWith aggregates per-prompt and overall trigger rate", async () => {
  const skillStream =
    JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "tool_use", id: "t1", name: "Skill", input: {} }],
      },
    }) +
    "\n" +
    JSON.stringify({ type: "result", num_turns: 1 });
  const plainStream = JSON.stringify({ type: "result", num_turns: 1 });

  const seen: AgentRunArgs[] = [];
  const runner = (
    a: AgentRunArgs,
  ): Promise<{ code: number; stdout: string }> => {
    seen.push(a);
    // prompts containing "fire" trigger the Skill; the rest don't
    return Promise.resolve({
      code: 0,
      stdout: a.task.includes("fire") ? skillStream : plainStream,
    });
  };

  const report = await measureTriggerRateWith(
    {
      pluginDir: "/some/plugin",
      prompts: ["fire one", "ignore this", "fire two"],
      minPrompts: 1,
      minDistance: 0,
      fired: (t) => usedTool(t, "Skill"),
      trials: 2,
      spacingSec: 0,
    },
    runner,
  );

  assert.equal(report.n, 6); // 3 prompts × 2 trials
  assert.equal(seen.length, 6);
  assert.equal(seen[0]?.pluginDir, "/some/plugin"); // pluginDir forwarded
  assert.ok(Math.abs(report.rate - 4 / 6) < 1e-9); // 2 firing prompts × 2 trials
  const fireOne = report.perPrompt.find((p) => p.prompt === "fire one");
  assert.equal(fireOne?.fired, 2);
  assert.equal(fireOne?.rate, 1);
  const ignore = report.perPrompt.find((p) => p.prompt === "ignore this");
  assert.equal(ignore?.fired, 0);
  assert.equal(ignore?.rate, 0);
  assert.ok(formatTriggerRateReport(report).includes("trigger-rate: 67%"));
});

test("promptDistance (NCD) is 0 for identical, larger for different, normalized", () => {
  assert.equal(promptDistance("same text", "same text"), 0);
  assert.equal(promptDistance("SAME  text", "same text"), 0); // normalized
  // a one-word-swap template is closer than two unrelated sentences
  const near = promptDistance(
    "Update the architecture section of CLAUDE.md.",
    "Update the testing section of CLAUDE.md.",
  );
  const far = promptDistance(
    "Add a dark-mode toggle to the settings page.",
    "Why is this regex throwing an exception?",
  );
  assert.ok(near < far);
  assert.ok(near < 0.3, `template pair should be < 0.3, got ${String(near)}`);
});

test("checkPromptDiversity flags too-few and too-similar sets", () => {
  // Too few (default min 10)
  const few = checkPromptDiversity(["a", "b", "c"]);
  assert.ok(few.some((i) => i.kind === "too-few"));

  // Near-duplicate pair (override min so only the NCD distance is tested)
  const dup = checkPromptDiversity(
    [
      "Write a test for my hook.",
      "Write a test for my hook!",
      "Totally different prompt here.",
    ],
    { minPrompts: 1 },
  );
  assert.ok(dup.some((i) => i.kind === "too-similar"));

  // A genuinely varied set of 10 distinct prompts passes clean.
  const varied = [
    "Add a dark-mode toggle to the settings page.",
    "Why is this regex throwing an exception?",
    "Rename the chargeCard function across the billing module.",
    "Write a unit test for the pagination helper.",
    "Refactor the auth middleware to use async/await.",
    "Document the public API in the README.",
    "Investigate the memory leak in the worker pool.",
    "Set up a GitHub Action that runs the linter on push.",
    "Convert these CommonJS modules to ESM.",
    "Optimize the SQL query behind the dashboard.",
  ];
  assert.deepEqual(checkPromptDiversity(varied), []);
});

test("assertPromptDiversity throws with an actionable message", () => {
  assert.throws(() => {
    assertPromptDiversity(["one", "two"]);
  }, /at least 10/);
});

test("measureTriggerRateWith rejects a too-small prompt set by default (no model run)", async () => {
  let calls = 0;
  const runner = (): Promise<{ code: number; stdout: string }> => {
    calls++;
    return Promise.resolve({ code: 0, stdout: "" });
  };
  await assert.rejects(
    measureTriggerRateWith(
      { pluginDir: "/p", prompts: ["just one"], fired: () => true },
      runner,
    ),
    /not eval-ready|at least 10/,
  );
  assert.equal(calls, 0, "must reject before any model run");
});

test("measureWith scores a check vocabulary across trials (rate ± se, pass^k)", async () => {
  const stream =
    JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "tool_use", id: "t1", name: "Bash", input: {} }],
      },
    }) +
    "\n" +
    JSON.stringify({ type: "result", result: "all done", num_turns: 1 });

  const runner = (): Promise<{ code: number; stdout: string }> =>
    Promise.resolve({ code: 0, stdout: stream });

  const report = await measureWith(
    {
      task: "do the thing",
      checks: [tool("Bash"), output("done"), tool("Read")],
      trials: 3,
      spacingSec: 0,
    },
    runner,
  );
  assert.equal(report.n, 3);
  const [bash, out, read] = report.perCheck;
  assert.equal(bash.check.kind, "tool");
  assert.equal(bash.rate, 1); // Bash used every trial
  assert.equal(bash.passK, 1);
  assert.equal(out.rate, 1); // "done" in output every trial
  assert.equal(read.rate, 0); // Read never used
  assert.equal(read.passK, 0);
  assert.ok(formatCheckReport(report).includes("measured 3 run(s)"));
});

test("measureWith stubSkillBodies packages a stubbed plugin and cleans it up", async () => {
  const dir = makeTmpDir("measure-stub");
  const skills = join(dir, "skills");
  mkdirSync(join(skills, "foo"), { recursive: true });
  mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(dir, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "myplug", version: "0.0.0" }),
  );
  writeFileSync(
    join(skills, "foo", "SKILL.md"),
    "---\nname: foo\ndescription: does foo\n---\n\n# Procedure\nrun the expensive thing\n",
  );

  const seen: AgentRunArgs[] = [];
  let seenBody = "";
  const runner = (
    a: AgentRunArgs,
  ): Promise<{ code: number; stdout: string }> => {
    seen.push(a);
    if (a.pluginDir)
      seenBody = readFileSync(
        join(a.pluginDir, "skills", "foo", "SKILL.md"),
        "utf-8",
      );
    return Promise.resolve({
      code: 0,
      stdout: JSON.stringify({ type: "result", num_turns: 1 }),
    });
  };

  const report = await measureWith(
    {
      task: "do foo",
      pluginDir: dir,
      stubSkillBodies: true,
      checks: [turns({ min: 1 })],
      trials: 1,
      spacingSec: 0,
    },
    runner,
  );
  assert.equal(report.n, 1);
  // The run saw a STUBBED throwaway plugin (body gone, name preserved), removed after.
  assert.ok(seenBody.includes("description: does foo"), "frontmatter kept");
  assert.ok(!seenBody.includes("run the expensive thing"), "body stubbed");
  const used = seen[0]?.pluginDir;
  assert.ok(used && used !== dir, "a packaged plugin dir was used");
  assert.ok(!existsSync(used), "the throwaway plugin dir is removed afterward");
  cleanupTmpDir(dir);
});

test("measureWith stubSkillBodies without pluginDir throws", async () => {
  await assert.rejects(
    measureWith(
      {
        task: "x",
        stubSkillBodies: true,
        checks: [turns({ min: 1 })],
        trials: 1,
      },
      () => Promise.resolve({ code: 0, stdout: "" }),
    ),
    /requires `pluginDir`/,
  );
});

test("measureArmsWith scores checks per arm; compareCheck reads significance", async () => {
  const skillStream =
    JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "tool_use", id: "t1", name: "Skill", input: {} }],
      },
    }) +
    "\n" +
    JSON.stringify({ type: "result", num_turns: 1 });
  const plain = JSON.stringify({ type: "result", num_turns: 1 });

  // `gated` arm (hasSettings) always fires the Skill; `vanilla` never does.
  const runner = (a: AgentRunArgs): Promise<{ code: number; stdout: string }> =>
    Promise.resolve({ code: 0, stdout: a.hasSettings ? skillStream : plain });

  const report = await measureArmsWith(
    {
      task: "do it",
      arms: {
        vanilla: {},
        gated: { settings: { hooks: {} } },
      },
      checks: [tool("Skill")],
      trials: 4,
      spacingSec: 0,
    },
    runner,
  );
  assert.equal(report.arms.gated.perCheck[0].rate, 1); // fires every trial
  assert.equal(report.arms.vanilla.perCheck[0].rate, 0); // never
  const cmp = compareCheck(report, "vanilla", "gated", 0);
  assert.equal(cmp.delta, 1); // gated − vanilla
  assert.equal(cmp.significant, true); // a clean 0 → 1 separation
  assert.throws(() => compareCheck(report, "nope", "gated", 0));
});

test("measureArmsWith stubSkillBodies stubs each arm's pluginDir (and cleans up)", async () => {
  const dir = makeTmpDir("arms-stub");
  // Two arms, each a plugin dir with the same skill but a different description.
  const make = (suffix: string): string => {
    const p = join(dir, suffix);
    mkdirSync(join(p, ".claude-plugin"), { recursive: true });
    mkdirSync(join(p, "skills", "foo"), { recursive: true });
    writeFileSync(
      join(p, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "myplug", version: "0.0.0" }),
    );
    writeFileSync(
      join(p, "skills", "foo", "SKILL.md"),
      `---\nname: foo\ndescription: variant ${suffix}\n---\n\n# Procedure\nrun the expensive thing ${suffix}\n`,
    );
    return p;
  };
  const armA = make("a");
  const armB = make("b");

  const bodies: Record<string, string> = {};
  const usedDirs: string[] = [];
  const runner = (
    a: AgentRunArgs,
  ): Promise<{ code: number; stdout: string }> => {
    if (a.pluginDir) {
      usedDirs.push(a.pluginDir);
      bodies[a.pluginDir] = readFileSync(
        join(a.pluginDir, "skills", "foo", "SKILL.md"),
        "utf-8",
      );
    }
    return Promise.resolve({
      code: 0,
      stdout: JSON.stringify({ type: "result", num_turns: 1 }),
    });
  };

  await measureArmsWith(
    {
      task: "do foo",
      arms: { a: { pluginDir: armA }, b: { pluginDir: armB } },
      stubSkillBodies: true,
      checks: [tool("Skill")],
      trials: 1,
      spacingSec: 0,
    },
    runner,
  );
  // Each arm ran against a STUBBED throwaway (body gone, description kept), not
  // the original dir, and the throwaways were removed afterward.
  for (const md of Object.values(bodies)) {
    assert.ok(md.includes("description: variant"), "description kept");
    assert.ok(!md.includes("run the expensive thing"), "body stubbed");
  }
  for (const used of usedDirs) {
    assert.ok(used !== armA && used !== armB, "a packaged dir was used");
    assert.ok(!existsSync(used), "throwaway removed afterward");
  }
  cleanupTmpDir(dir);
});

test("assertRates + checkReportToJUnit gate and serialize a CheckReport", () => {
  const report: CheckReport = {
    n: 10,
    perCheck: [
      {
        check: { kind: "tool", name: "Bash" },
        rate: 0.9,
        se: 0.1,
        passK: 0,
        n: 10,
      },
      {
        check: { kind: "skill", id: "vig:x" },
        rate: 0.4,
        se: 0.16,
        passK: 0,
        n: 10,
      },
    ],
  };
  // gate: skill at 0.4 is below 0.8 → throws naming it
  assert.throws(() => {
    assertRates(report, { min: 0.8 });
  }, /skill\(vig:x\): 40%/);
  assertRates(report, { min: 0.3 }); // both above → no throw

  const xml = checkReportToJUnit(report, { min: 0.8, name: "demo" });
  assert.match(xml, /<testsuite name="demo" tests="2" failures="1">/);
  assert.match(
    xml,
    /<testcase classname="vigiles.checks" name="tool\(Bash\)">/,
  );
  assert.match(xml, /name="skill\(vig:x\)">[\s\S]*<failure message="rate 40%/);
});

test("packageSkillsDir builds a --plugin-dir from loose .claude/skills", () => {
  const dir = makeTmpDir("pkg-skills");
  const skills = join(dir, ".claude", "skills");
  mkdirSync(join(skills, "foo", "references"), { recursive: true });
  writeFileSync(
    join(skills, "foo", "SKILL.md"),
    "---\nname: foo\ndescription: does foo\n---\nbody\n",
  );
  writeFileSync(join(skills, "foo", "references", "extra.md"), "ref\n");
  // a non-skill dir (no SKILL.md) is skipped
  mkdirSync(join(skills, "notaskill"), { recursive: true });

  const pluginDir = packageSkillsDir(skills);
  assert.ok(existsSync(join(pluginDir, ".claude-plugin", "plugin.json")));
  assert.ok(existsSync(join(pluginDir, "skills", "foo", "SKILL.md")));
  // recursive copy brings references/ along
  assert.ok(
    existsSync(join(pluginDir, "skills", "foo", "references", "extra.md")),
  );
  assert.ok(!existsSync(join(pluginDir, "skills", "notaskill")));
  const manifest = JSON.parse(
    readFileSync(join(pluginDir, ".claude-plugin", "plugin.json"), "utf-8"),
  ) as { name: string };
  assert.ok(manifest.name.length > 0);
  cleanupTmpDir(dir);
});

test("stubSkillBody keeps frontmatter, drops the body", () => {
  const out = stubSkillBody(
    "---\nname: foo\ndescription: does foo\ndisable-model-invocation: false\n---\n\n# Big procedure\nStep 1: read files\nStep 2: run commands\n",
  );
  // Frontmatter (the trigger surface) survives verbatim.
  assert.ok(/^---\nname: foo\ndescription: does foo/.test(out));
  // The expensive body is gone.
  assert.ok(!out.includes("Step 1: read files"));
  assert.ok(out.includes("trigger-test stub"));
  // No frontmatter → still produces a stub (no crash).
  assert.ok(stubSkillBody("just a body, no frontmatter").includes("stub"));
});

test("packageSkillsDir { stub } writes frontmatter-only skills (no body, no references)", () => {
  const dir = makeTmpDir("pkg-stub");
  const skills = join(dir, "skills");
  mkdirSync(join(skills, "foo", "references"), { recursive: true });
  writeFileSync(
    join(skills, "foo", "SKILL.md"),
    "---\nname: foo\ndescription: does foo\n---\n\n# Procedure\nrun the whole thing\n",
  );
  writeFileSync(join(skills, "foo", "references", "big.md"), "x".repeat(5000));

  const pkg = packageSkillsDir(skills, { stub: true, name: "vigiles" });
  const md = readFileSync(join(pkg, "skills", "foo", "SKILL.md"), "utf-8");
  assert.ok(md.includes("description: does foo")); // trigger surface kept
  assert.ok(!md.includes("run the whole thing")); // body stripped
  // references/ are not copied in stub mode (the body won't run).
  assert.ok(!existsSync(join(pkg, "skills", "foo", "references")));
  // plugin name preserved so `<name>:<skill>` still matches.
  const manifest = JSON.parse(
    readFileSync(join(pkg, ".claude-plugin", "plugin.json"), "utf-8"),
  ) as { name: string };
  assert.equal(manifest.name, "vigiles");
  cleanupTmpDir(dir);
});

test("packageSkillsDir throws when the dir has no <name>/SKILL.md", () => {
  const dir = makeTmpDir("pkg-empty");
  mkdirSync(join(dir, "skills"), { recursive: true });
  assert.throws(() => packageSkillsDir(join(dir, "skills")), /No .*SKILL\.md/);
  cleanupTmpDir(dir);
});

test("measureTriggerRateWith accepts skillsDir, packaging it into a plugin dir", async () => {
  const dir = makeTmpDir("trigger-skillsdir");
  const skills = join(dir, ".claude", "skills");
  mkdirSync(join(skills, "foo"), { recursive: true });
  writeFileSync(
    join(skills, "foo", "SKILL.md"),
    "---\nname: foo\ndescription: does foo\n---\nbody\n",
  );

  const seen: AgentRunArgs[] = [];
  const runner = (
    a: AgentRunArgs,
  ): Promise<{ code: number; stdout: string }> => {
    seen.push(a);
    return Promise.resolve({
      code: 0,
      stdout: JSON.stringify({ type: "result", num_turns: 1 }),
    });
  };

  const report = await measureTriggerRateWith(
    {
      skillsDir: skills,
      prompts: ["do foo"],
      minPrompts: 1,
      minDistance: 0,
      fired: () => true,
      spacingSec: 0,
    },
    runner,
  );
  assert.equal(report.n, 1);
  // The runner saw a real packaged plugin dir (not the loose skills dir), and
  // it was cleaned up after the run.
  const used = seen[0]?.pluginDir;
  assert.ok(used && used !== skills, "a packaged plugin dir was used");
  assert.ok(!existsSync(used), "the throwaway plugin dir is removed afterward");
  cleanupTmpDir(dir);
});

test("measureTriggerRateWith stubSkillBodies strips the body in the packaged plugin", async () => {
  const dir = makeTmpDir("trigger-stub");
  const skills = join(dir, ".claude", "skills");
  mkdirSync(join(skills, "foo"), { recursive: true });
  writeFileSync(
    join(skills, "foo", "SKILL.md"),
    "---\nname: foo\ndescription: does foo\n---\n\n# Procedure\nrun the expensive thing\n",
  );

  let seenBody = "";
  const runner = (
    a: AgentRunArgs,
  ): Promise<{ code: number; stdout: string }> => {
    // Read the packaged skill DURING the run (before cleanup).
    if (a.pluginDir)
      seenBody = readFileSync(
        join(a.pluginDir, "skills", "foo", "SKILL.md"),
        "utf-8",
      );
    return Promise.resolve({
      code: 0,
      stdout: JSON.stringify({ type: "result", num_turns: 1 }),
    });
  };

  await measureTriggerRateWith(
    {
      skillsDir: skills,
      stubSkillBodies: true,
      prompts: ["do foo"],
      minPrompts: 1,
      fired: () => true,
      spacingSec: 0,
    },
    runner,
  );
  assert.ok(seenBody.includes("description: does foo"), "frontmatter kept");
  assert.ok(!seenBody.includes("run the expensive thing"), "body stubbed");
  cleanupTmpDir(dir);
});

test("measureTriggerRateWith rejects both/neither pluginDir and skillsDir", async () => {
  const runner = (): Promise<{ code: number; stdout: string }> =>
    Promise.resolve({ code: 0, stdout: "" });
  await assert.rejects(
    measureTriggerRateWith(
      {
        pluginDir: "/p",
        skillsDir: "/s",
        prompts: ["x"],
        fired: () => true,
        minPrompts: 1,
        minDistance: 0,
      },
      runner,
    ),
    /not both/,
  );
  await assert.rejects(
    measureTriggerRateWith(
      { prompts: ["x"], fired: () => true, minPrompts: 1 },
      runner,
    ),
    /provide `pluginDir` or `skillsDir`/,
  );
});

test("measureTriggerRateWith adds precision when irrelevant prompts are given", async () => {
  const skillStream =
    JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "tool_use", id: "t1", name: "Skill", input: {} }],
      },
    }) +
    "\n" +
    JSON.stringify({ type: "result", num_turns: 1 });
  const plain = JSON.stringify({ type: "result", num_turns: 1 });
  // fires whenever the task mentions "fire"
  const runner = (a: AgentRunArgs): Promise<{ code: number; stdout: string }> =>
    Promise.resolve({
      code: 0,
      stdout: a.task.includes("fire") ? skillStream : plain,
    });

  const report = await measureTriggerRateWith(
    {
      pluginDir: "/p",
      prompts: ["fire one", "fire two"], // both should fire → recall 1.0
      minPrompts: 1,
      minDistance: 0,
      irrelevantPrompts: ["calm down", "fire wrongly"], // one wrongly fires
      fired: (t) => usedTool(t, "Skill"),
      spacingSec: 0,
    },
    runner,
  );

  assert.equal(report.rate, 1); // recall: both relevant fired
  assert.equal(report.n, 2);
  assert.equal(report.falsePositiveRate, 0.5); // 1 of 2 irrelevant fired
  assert.ok(Math.abs((report.precision ?? 0) - 2 / 3) < 1e-9); // 2 right / 3 fired
  assert.equal(report.perIrrelevant?.length, 2);
  const out = formatTriggerRateReport(report);
  assert.ok(out.includes("false-positive: 50%"));
  assert.ok(out.includes("precision: 67%"));
  assert.ok(out.includes("[irrelevant]"));
});

test("measureTriggerRateWith: precision is undefined when nothing fires at all", async () => {
  const plain = JSON.stringify({ type: "result", num_turns: 1 });
  const runner = (): Promise<{ code: number; stdout: string }> =>
    Promise.resolve({ code: 0, stdout: plain });

  const report = await measureTriggerRateWith(
    {
      pluginDir: "/p",
      prompts: ["quiet"],
      minPrompts: 1,
      minDistance: 0,
      irrelevantPrompts: ["silent"],
      fired: (t) => usedTool(t, "Skill"),
      spacingSec: 0,
    },
    runner,
  );
  assert.equal(report.rate, 0);
  assert.equal(report.falsePositiveRate, 0);
  assert.equal(report.precision, undefined);
  assert.ok(formatTriggerRateReport(report).includes("precision: n/a"));
});

test("parseUsage pulls cost/latency/tokens from the result event", () => {
  const stdout = JSON.stringify({
    type: "result",
    total_cost_usd: 0.02,
    duration_ms: 900,
    usage: { input_tokens: 120, output_tokens: 30 },
  });
  const u = parseUsage(stdout);
  assert.equal(u.costUsd, 0.02);
  assert.equal(u.durationMs, 900);
  assert.equal(u.inputTokens, 120);
  assert.equal(u.outputTokens, 30);
});

test("parseUsage is all-zero when no result/usage is present", () => {
  const u = parseUsage("");
  assert.equal(u.costUsd, 0);
  assert.equal(u.durationMs, 0);
  assert.equal(u.inputTokens, 0);
  assert.equal(u.outputTokens, 0);
});

test("aggregateUsage totals and averages cost/latency/tokens", () => {
  const u = aggregateUsage([
    { costUsd: 0.01, durationMs: 1000, inputTokens: 100, outputTokens: 50 },
    { costUsd: 0.03, durationMs: 2000, inputTokens: 200, outputTokens: 150 },
  ]);
  assert.ok(Math.abs(u.totalCostUsd - 0.04) < 1e-9);
  assert.ok(Math.abs(u.meanCostUsd - 0.02) < 1e-9);
  assert.equal(u.meanDurationMs, 1500);
  assert.equal(u.totalInputTokens, 300);
  assert.equal(u.totalOutputTokens, 200);
});

test("aggregateUsage is all-zero for no runs", () => {
  const u = aggregateUsage([]);
  assert.equal(u.totalCostUsd, 0);
  assert.equal(u.meanCostUsd, 0);
  assert.equal(u.meanDurationMs, 0);
});

test("runEvalWith record/replay cache: replays without re-calling the model", async () => {
  const cacheDir = makeTmpDir("eval-cache");
  const resultStream = JSON.stringify({
    type: "result",
    num_turns: 1,
    result: "done",
    total_cost_usd: 0.01,
    duration_ms: 1200,
    usage: { input_tokens: 100, output_tokens: 50 },
  });
  let calls = 0;
  const recordingRunner = (
    a: AgentRunArgs,
  ): Promise<{ code: number; stdout: string }> => {
    calls++;
    writeFileSync(join(a.cwd, "OUT.txt"), "agent output"); // a side-effect to snapshot
    return Promise.resolve({ code: 0, stdout: resultStream });
  };
  const spec = {
    fixture: { "in.txt": "x" },
    arms: { only: {} },
    task: "do it",
    trials: 2,
    spacingSec: 0,
    cacheDir,
    measure: (ctx: { file: (p: string) => string | null }) => ({
      created: ctx.file("OUT.txt") !== null,
    }),
  };
  try {
    const r1 = await runEvalWith(
      { ...spec, cache: "readwrite" as const },
      recordingRunner,
    );
    assert.equal(calls, 2); // model called for both trials
    assert.equal(r1.arms.only?.metrics.created, 1);
    assert.ok(Math.abs(r1.totalCostUsd - 0.02) < 1e-9); // 2 × $0.01
    assert.equal(r1.arms.only?.usage.totalInputTokens, 200);

    // second run, read-only, with a runner that throws if called → must replay
    const boom = (): Promise<{ code: number; stdout: string }> => {
      throw new Error("runner should not be called on a cache hit");
    };
    const r2 = await runEvalWith({ ...spec, cache: "read" as const }, boom);
    assert.equal(r2.arms.only?.metrics.created, 1); // OUT.txt restored → measure sees it
    assert.ok(Math.abs(r2.totalCostUsd - 0.02) < 1e-9); // replayed usage
  } finally {
    cleanupTmpDir(cacheDir);
  }
});

test("runPool maps with bounded concurrency, preserving order", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const worker = async (n: number): Promise<number> => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return n * 2;
  };
  const out = await runPool([1, 2, 3, 4, 5], 2, worker);
  assert.deepEqual(out, [2, 4, 6, 8, 10]); // order preserved
  assert.equal(maxInFlight, 2); // never exceeded, did reach the limit
});

test("isRateLimited detects rate-limit / overload in either stream", () => {
  assert.ok(
    isRateLimited({ code: 1, stdout: "", stderr: "Error: 429 happened" }),
  );
  assert.ok(isRateLimited({ code: 1, stdout: "overloaded_error" }));
  assert.ok(isRateLimited({ code: 1, stdout: "rate limit exceeded" }));
  assert.ok(!isRateLimited({ code: 0, stdout: "all good" }));
});

test("runEvalWith retries a rate-limited run, then succeeds", async () => {
  let calls = 0;
  const runner = (): Promise<{ code: number; stdout: string }> => {
    calls++;
    const stdout =
      calls === 1
        ? "rate limit exceeded"
        : JSON.stringify({ type: "result", num_turns: 1, result: "ok" });
    return Promise.resolve({ code: 0, stdout });
  };
  const report = await runEvalWith(
    {
      arms: { only: {} },
      task: "t",
      trials: 1,
      spacingSec: 0,
      retryBackoffMs: 0,
      measure: (ctx) => ({ turns: ctx.turns }),
    },
    runner,
  );
  assert.equal(calls, 2); // retried once
  assert.equal(report.arms.only?.metrics.turns, 1);
});

test("runEvalWith gives up after rateLimitRetries=0 (no retry)", async () => {
  let calls = 0;
  const runner = (): Promise<{ code: number; stdout: string }> => {
    calls++;
    return Promise.resolve({ code: 0, stdout: "rate limit" });
  };
  await runEvalWith(
    {
      arms: { only: {} },
      task: "t",
      trials: 1,
      spacingSec: 0,
      rateLimitRetries: 0,
      retryBackoffMs: 0,
      measure: () => ({ ok: true }),
    },
    runner,
  );
  assert.equal(calls, 1); // gave up immediately
});

test("runEvalWith honors concurrency and inter-run spacing", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const stream = JSON.stringify({ type: "result", num_turns: 1, result: "ok" });
  const runner = async (): Promise<{ code: number; stdout: string }> => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return { code: 0, stdout: stream };
  };
  await runEvalWith(
    {
      arms: { a: {}, b: {} },
      task: "t",
      trials: 3,
      spacingSec: 0.001, // > 0 → exercises the spacing path
      concurrency: 3,
      measure: () => ({ ok: true }),
    },
    runner,
  );
  assert.equal(maxInFlight, 3); // 6 units, 3 in flight at once
});

test("runEvalWith aborts when maxCostUsd is exceeded", async () => {
  const stream = JSON.stringify({
    type: "result",
    num_turns: 1,
    result: "ok",
    total_cost_usd: 0.1,
  });
  let calls = 0;
  const runner = (): Promise<{ code: number; stdout: string }> => {
    calls++;
    return Promise.resolve({ code: 0, stdout: stream });
  };
  const report = await runEvalWith(
    {
      arms: { only: {} },
      task: "t",
      trials: 5,
      spacingSec: 0,
      maxCostUsd: 0.15, // exceeded after 2 trials ($0.20)
      measure: () => ({ ok: true }),
    },
    runner,
  );
  assert.equal(report.aborted, true);
  assert.equal(calls, 2); // stopped early
  assert.equal(report.arms.only?.runs, 2); // only completed trials counted
  assert.ok(Math.abs(report.totalCostUsd - 0.2) < 1e-9);
});

test("assertTriggerRate gates on the minimum rate", () => {
  const report = { rate: 0.5, n: 4, perPrompt: [] };
  assert.doesNotThrow(() => {
    assertTriggerRate(report, { min: 0.5 });
  });
  assert.throws(() => {
    assertTriggerRate(report, { min: 0.8 });
  });
});

test("assertTriggerRate gates precision: false-positive rate and minPrecision", () => {
  const report = {
    rate: 1,
    n: 2,
    perPrompt: [],
    falsePositiveRate: 0.5,
    precision: 0.667,
    perIrrelevant: [],
  };
  // within both thresholds → ok
  assert.doesNotThrow(() => {
    assertTriggerRate(report, { maxFalsePositive: 0.5, minPrecision: 0.6 });
  });
  // too many false positives → throws
  assert.throws(() => {
    assertTriggerRate(report, { maxFalsePositive: 0.2 });
  }, /false-positive/);
  // precision too low → throws
  assert.throws(() => {
    assertTriggerRate(report, { minPrecision: 0.9 });
  }, /precision/);
  // precision undefined (nothing fired) reads as n/a and fails a minPrecision gate
  assert.throws(() => {
    assertTriggerRate(
      {
        rate: 0,
        n: 2,
        perPrompt: [],
        falsePositiveRate: 0,
        precision: undefined,
      },
      { minPrecision: 0.5 },
    );
  }, /n\/a/);
});

const NO_USAGE = {
  totalCostUsd: 0,
  meanCostUsd: 0,
  meanDurationMs: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
} as const;

test("formatEvalReport renders one line per arm", () => {
  const out = formatEvalReport({
    name: "demo",
    trials: 6,
    totalCostUsd: 0,
    aborted: false,
    arms: {
      vanilla: { runs: 6, metrics: { caught: 0 }, stats: {}, usage: NO_USAGE },
      gated: { runs: 6, metrics: { caught: 0.5 }, stats: {}, usage: NO_USAGE },
    },
  });
  assert.match(out, /demo \(6 trials\/arm\)/);
  assert.match(out, /vanilla\s+caught=0\.00/);
  assert.match(out, /gated\s+caught=0\.50/);
});

test("formatEvalReport shows ± se and pass^k when stats are present", () => {
  const out = formatEvalReport({
    name: "demo",
    trials: 3,
    totalCostUsd: 0,
    aborted: false,
    arms: {
      gated: {
        runs: 3,
        metrics: { caught: 0.5 },
        stats: { caught: { mean: 0.5, std: 0.5, se: 0.25, n: 3, passK: 0 } },
        usage: NO_USAGE,
      },
    },
  });
  assert.match(out, /caught=0\.50±0\.25/);
  assert.match(out, /pass\^k=0/);
});

test("formatEvalReport surfaces cost/latency/tokens when usage is present", () => {
  const out = formatEvalReport({
    name: "demo",
    trials: 2,
    totalCostUsd: 0.05,
    aborted: false,
    arms: {
      gated: {
        runs: 2,
        metrics: { caught: 1 },
        stats: {},
        usage: {
          totalCostUsd: 0.05,
          meanCostUsd: 0.025,
          meanDurationMs: 1500,
          totalInputTokens: 2000,
          totalOutputTokens: 1400,
        },
      },
    },
  });
  assert.match(out, /\$0\.0500 total/);
  assert.match(out, /\$0\.0500 · 1\.5s\/run · 3\.4k tok/);
});
