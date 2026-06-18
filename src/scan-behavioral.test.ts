/**
 * `scan --trigger` behavioral-column test suite. Builds a tiny real plugin dir
 * (so the stub-bodies path works) and drives `probePluginTriggersWith` with an
 * injected fake runner — no model. Asserts: only model-invocable+described skills
 * are probed, missing prompts → unmeasured, recall/precision aggregate, a thin
 * prompt set is reported per-skill (not a crash), and the formatter.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  probePluginTriggersWith,
  formatBehavioralReport,
  type BehavioralReport,
} from "./scan-behavioral.js";
import type { AgentRunArgs } from "./eval.js";
import { makeTmpDir, cleanupTmpDir } from "./core/test-utils.js";

function write(dir: string, rel: string, content: string): void {
  const abs = join(dir, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

function plugin(): string {
  const dir = makeTmpDir("scan-behavioral");
  write(
    dir,
    ".claude-plugin/plugin.json",
    JSON.stringify({ name: "myplugin" }),
  );
  write(
    dir,
    "skills/foo/SKILL.md",
    "---\nname: foo\ndescription: A model-invocable skill that does foo things across cases\n---\n# foo\nbody\n",
  );
  // user-invoked → NOT a behavioral candidate
  write(
    dir,
    "skills/bar/SKILL.md",
    "---\nname: bar\ndescription: A user-invoked skill that does bar things across cases\ndisable-model-invocation: true\n---\n# bar\n",
  );
  // model-invocable but no prompts supplied → unmeasured
  write(
    dir,
    "skills/baz/SKILL.md",
    "---\nname: baz\ndescription: A model-invocable skill that does baz things across cases\n---\n# baz\n",
  );
  return dir;
}

// Fires the Skill tool for "myplugin:foo" iff the task contains "fire".
const fakeRunner = (
  a: AgentRunArgs,
): Promise<{ code: number; stdout: string }> => {
  const stdout = a.task.includes("fire")
    ? JSON.stringify({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "Skill",
              input: { skill: "myplugin:foo" },
            },
          ],
        },
      }) +
      "\n" +
      JSON.stringify({ type: "result", num_turns: 1 })
    : JSON.stringify({ type: "result", num_turns: 1 });
  return Promise.resolve({ code: 0, stdout });
};

test("probePluginTriggersWith probes only model-invocable described skills", async () => {
  const dir = plugin();
  const report = await probePluginTriggersWith(
    dir,
    {
      foo: {
        prompts: ["fire one", "fire two", "fire three"],
        irrelevant: ["calm alpha", "calm beta"],
      },
    },
    fakeRunner,
    { minPrompts: 1, minDistance: 0 },
  );

  const byName = Object.fromEntries(report.results.map((r) => [r.skill, r]));
  // foo: every relevant prompt fires, no irrelevant fires
  assert.equal(byName.foo.measured, true);
  assert.equal(byName.foo.recall, 1);
  assert.equal(byName.foo.falsePositiveRate, 0);
  assert.equal(byName.foo.precision, 1);
  // baz: a candidate but no prompts supplied → unmeasured
  assert.equal(byName.baz.measured, false);
  assert.match(byName.baz.note ?? "", /no prompts/);
  // bar: user-invoked → not a candidate at all
  assert.equal(byName.bar, undefined);
  cleanupTmpDir(dir);
});

test("probePluginTriggersWith reports a thin prompt set per-skill, not a crash", async () => {
  const dir = plugin();
  // Only 1 prompt but minPrompts defaults to 10 → the diversity gate throws;
  // it must be caught and surfaced as an unmeasured note, not bubble up.
  const report = await probePluginTriggersWith(
    dir,
    { foo: { prompts: ["fire once"] } },
    fakeRunner,
  );
  const foo = report.results.find((r) => r.skill === "foo");
  assert.equal(foo?.measured, false);
  assert.match(foo?.note ?? "", /at least|prompt/i);
  cleanupTmpDir(dir);
});

test("formatBehavioralReport renders measured, unmeasured, and unavailable", () => {
  const measured: BehavioralReport = {
    available: true,
    results: [
      { skill: "foo", measured: true, recall: 0.3, precision: 1, n: 10 },
      { skill: "baz", measured: false, note: "no prompts supplied" },
    ],
  };
  const text = formatBehavioralReport(measured);
  assert.match(text, /⚠ foo — recall 30%/); // < 0.6 → ⚠
  assert.match(text, /precision 100%/);
  assert.match(text, /· baz — unmeasured \(no prompts supplied\)/);

  assert.match(
    formatBehavioralReport({ available: false, results: [] }),
    /unavailable/,
  );
});
