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
  packageSkillsDir,
  type AgentRunArgs,
} from "./eval.js";
import {
  usedTool,
  outputContains,
  assertTriggerRate,
} from "./harness-assert.js";
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

test("measureTriggerRateWith rejects both/neither pluginDir and skillsDir", async () => {
  const runner = (): Promise<{ code: number; stdout: string }> =>
    Promise.resolve({ code: 0, stdout: "" });
  await assert.rejects(
    measureTriggerRateWith(
      { pluginDir: "/p", skillsDir: "/s", prompts: ["x"], fired: () => true },
      runner,
    ),
    /not both/,
  );
  await assert.rejects(
    measureTriggerRateWith({ prompts: ["x"], fired: () => true }, runner),
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
