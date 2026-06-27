/**
 * `audit --trigger` behavioral-column test suite. Builds a tiny real plugin dir
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
  buildSelectionReport,
  measurePluginSelectionWith,
  measurePluginSelection,
  formatSelectionReport,
  type BehavioralReport,
  type HarnessProbe,
} from "./scan-behavioral.js";
import { parseClaudeRun, type AgentRunArgs } from "./eval.js";
import { skillResolved } from "./harness-assert.js";
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

// A Claude-shaped probe wrapping the fake runner (no real binary).
const fakeProbe: HarnessProbe = {
  evalDriver: { runner: fakeRunner, parse: parseClaudeRun },
  firedFor: (name) => (t) => skillResolved(t, `myplugin:${name}`),
  stub: false,
  available: () => true,
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
    fakeProbe,
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
    fakeProbe,
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

// ─── Selection-collision matrix ──────────────────────────────────────────────

test("buildSelectionReport folds runs into recall + collision (pure)", () => {
  // foo's first prompt also fired baz (a collision); foo's second fired foo only.
  const r = buildSelectionReport(
    ["foo", "baz"],
    [
      { intended: "foo", firedBare: ["foo", "baz"] },
      { intended: "foo", firedBare: ["foo"] },
      { intended: "baz", firedBare: ["baz"] },
      { intended: "baz", firedBare: ["baz"] },
    ],
  );
  const byName = Object.fromEntries(r.perSkill.map((s) => [s.skill, s]));
  assert.equal(byName.foo.recall, 1); // fired foo on both its prompts
  assert.equal(byName.foo.collisionRate, 0.5); // baz hijacked 1 of 2
  assert.equal(byName.foo.collidesWith[0].skill, "baz");
  assert.equal(byName.foo.collidesWith[0].rate, 0.5);
  assert.equal(byName.baz.recall, 1);
  assert.equal(byName.baz.collisionRate, 0); // no sibling fired on baz's prompts
  assert.equal(byName.baz.collidesWith.length, 0);
  assert.equal(r.collisionRate, 0.25); // 1 collision run of 4
  assert.equal(r.n, 4);
});

// Fires myplugin:<name> for each plugin skill named in the task ("foo"/"baz").
const multiRunner = (
  a: AgentRunArgs,
): Promise<{ code: number; stdout: string }> => {
  const fired = ["foo", "baz"].filter((s) => a.task.includes(s));
  const content = fired.map((name, i) => ({
    type: "tool_use",
    id: `t${i}`,
    name: "Skill",
    input: { skill: `myplugin:${name}` },
  }));
  const stdout =
    JSON.stringify({ type: "assistant", message: { content } }) +
    "\n" +
    JSON.stringify({ type: "result", num_turns: 1 });
  return Promise.resolve({ code: 0, stdout });
};

const multiProbe: HarnessProbe = {
  evalDriver: { runner: multiRunner, parse: parseClaudeRun },
  firedFor: (name) => (t) => skillResolved(t, `myplugin:${name}`),
  stub: false,
  available: () => true,
};

test("measurePluginSelectionWith catches a sibling hijack (fake driver)", async () => {
  const dir = plugin();
  const r = await measurePluginSelectionWith(
    dir,
    {
      // foo's first prompt names baz too → baz wrongly fires (collision)
      foo: { prompts: ["fix the foo and the baz", "just the foo"] },
      baz: { prompts: ["only the baz here", "baz alone"] },
    },
    multiProbe,
  );
  const byName = Object.fromEntries(r.perSkill.map((s) => [s.skill, s]));
  assert.equal(byName.foo.recall, 1);
  assert.equal(byName.foo.collisionRate, 0.5);
  assert.equal(byName.foo.collidesWith[0].skill, "baz");
  assert.equal(byName.baz.collisionRate, 0);
  assert.equal(r.collisionRate, 0.25);
  assert.match(
    formatSelectionReport(r),
    /⚠ foo.*collision 50%.*top collider: baz/s,
  );
  cleanupTmpDir(dir);
});

// A plugin WITH a SessionStart hook (the priming surface a stubbed run drops).
function hookedPlugin(): string {
  const dir = makeTmpDir("scan-hooked");
  write(
    dir,
    ".claude-plugin/plugin.json",
    JSON.stringify({ name: "myplugin" }),
  );
  write(
    dir,
    "hooks/hooks.json",
    JSON.stringify({
      hooks: {
        SessionStart: [
          {
            matcher: "startup",
            hooks: [{ type: "command", command: "echo hi" }],
          },
        ],
      },
    }),
  );
  write(
    dir,
    "skills/foo/SKILL.md",
    "---\nname: foo\ndescription: A model-invocable skill that does foo things across cases\n---\n# foo\n",
  );
  write(
    dir,
    "skills/baz/SKILL.md",
    "---\nname: baz\ndescription: A model-invocable skill that does baz things across cases\n---\n# baz\n",
  );
  return dir;
}

// A stubbing probe whose runner NEVER fires a skill (recall collapses to 0).
const silentRunner = (): Promise<{ code: number; stdout: string }> =>
  Promise.resolve({
    code: 0,
    stdout: JSON.stringify({ type: "result", num_turns: 1 }),
  });
const silentStubProbe: HarnessProbe = {
  evalDriver: { runner: silentRunner, parse: parseClaudeRun },
  firedFor: (name) => (t) => skillResolved(t, `myplugin:${name}`),
  stub: true,
  available: () => true,
};

test("selection: stubbed 0% on a SessionStart-hooked plugin is labeled an artifact", async () => {
  const dir = hookedPlugin();
  const r = await measurePluginSelectionWith(
    dir,
    {
      foo: { prompts: ["a foo", "b foo"] },
      baz: { prompts: ["a baz", "b baz"] },
    },
    silentStubProbe,
  );
  assert.ok(r.perSkill.every((s) => s.recall === 0)); // nothing fired
  assert.match(r.note ?? "", /hook-primed/); // not presented as a clean 0%
  assert.match(formatSelectionReport(r), /hook-primed/);
  cleanupTmpDir(dir);
});

test("selection: stubbed 0% on a NON-hooked plugin stays a real result (no false label)", async () => {
  const dir = plugin(); // no SessionStart hook
  const r = await measurePluginSelectionWith(
    dir,
    {
      foo: { prompts: ["a foo", "b foo"] },
      baz: { prompts: ["a baz", "b baz"] },
    },
    silentStubProbe,
  );
  assert.ok(r.perSkill.every((s) => s.recall === 0));
  assert.equal(r.note, undefined); // genuine 0%, not masked by the hook label
  cleanupTmpDir(dir);
});

test("trigger: stubbed all-zero on a hooked plugin relabels as unmeasured", async () => {
  const dir = hookedPlugin();
  const rep = await probePluginTriggersWith(
    dir,
    { foo: { prompts: ["a foo", "b foo"] } }, // baz → no prompts (unmeasured)
    silentStubProbe,
    { minPrompts: 1, minDistance: 0 },
  );
  const foo = rep.results.find((r) => r.skill === "foo");
  assert.equal(foo?.measured, false); // 0% recall artifact → not a real measurement
  assert.match(foo?.note ?? "", /hook-primed/);
  cleanupTmpDir(dir);
});

test("measurePluginSelectionWith needs ≥2 model-invocable skills", async () => {
  const dir = makeTmpDir("scan-selection-one");
  write(dir, ".claude-plugin/plugin.json", JSON.stringify({ name: "p" }));
  write(
    dir,
    "skills/solo/SKILL.md",
    "---\nname: solo\ndescription: The only model-invocable skill in this plugin\n---\nbody\n",
  );
  const r = await measurePluginSelectionWith(dir, {}, multiProbe);
  assert.equal(r.n, 0);
  assert.match(r.note ?? "", /≥2|two/);
  assert.match(formatSelectionReport(r), /≥2|two/);
  cleanupTmpDir(dir);
});

test("measurePluginSelection reports n/a for a non-Claude harness", async () => {
  const r = await measurePluginSelection(
    "/nonexistent",
    {},
    {
      harness: "codex",
    },
  );
  assert.equal(r.available, false);
  assert.match(r.note ?? "", /Claude Code only/);
  assert.match(formatSelectionReport(r), /unavailable/);
});
