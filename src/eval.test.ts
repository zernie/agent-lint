/**
 * Tests for the eval aggregation/formatting + orchestration (deterministic, no
 * model). `runEval` itself spawns the real `claude` CLI (bench/ exercises that);
 * `runEvalWith` takes an injected runner, so the loop / `measure` context /
 * aggregation are tested here against canned stream-json — no model.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  aggregate,
  aggregateStats,
  formatEvalReport,
  runEvalWith,
  measureTriggerRateWith,
  formatTriggerRateReport,
  type AgentRunArgs,
} from "./eval.js";
import {
  usedTool,
  outputContains,
  assertTriggerRate,
} from "./harness-assert.js";

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

test("assertTriggerRate gates on the minimum rate", () => {
  const report = { rate: 0.5, n: 4, perPrompt: [] };
  assert.doesNotThrow(() => {
    assertTriggerRate(report, { min: 0.5 });
  });
  assert.throws(() => {
    assertTriggerRate(report, { min: 0.8 });
  });
});

test("formatEvalReport renders one line per arm", () => {
  const out = formatEvalReport({
    name: "demo",
    trials: 6,
    arms: {
      vanilla: { runs: 6, metrics: { caught: 0 }, stats: {} },
      gated: { runs: 6, metrics: { caught: 0.5 }, stats: {} },
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
    arms: {
      gated: {
        runs: 3,
        metrics: { caught: 0.5 },
        stats: { caught: { mean: 0.5, std: 0.5, se: 0.25, n: 3, passK: 0 } },
      },
    },
  });
  assert.match(out, /caught=0\.50±0\.25/);
  assert.match(out, /pass\^k=0/);
});
