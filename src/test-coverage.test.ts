/**
 * Untested-surface detector test suite.
 *
 * Pure, filesystem-driven: build a tiny fake plugin in a tmp dir and assert the
 * two coverage detectors (colocation + content-reference), the user-invoked
 * exemption, the ignore-marker opt-out, hook-script discovery, and the report
 * formatting. No model, no network.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  findUntestedSurfaces,
  formatUntestedReport,
  suggestedTestPath,
} from "./test-coverage.js";
import { makeTmpDir, cleanupTmpDir } from "./core/test-utils.js";

function write(dir: string, rel: string, content: string): void {
  const abs = join(dir, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

function skill(name: string, extra = ""): string {
  return `---\nname: ${name}\ndescription: A skill that does ${name} things for tests\n${extra}---\n\n# ${name}\n`;
}

test("skill is covered by a colocated eval", () => {
  const dir = makeTmpDir("tc-coloc");
  write(dir, "skills/foo/SKILL.md", skill("foo"));
  write(dir, "skills/foo/foo.eval.mjs", "// trigger eval\n");
  const r = findUntestedSurfaces({ basePath: dir });
  assert.equal(r.untested.length, 0);
  assert.deepEqual(
    r.covered.map((s) => s.name),
    ["foo"],
  );
  cleanupTmpDir(dir);
});

test("loose skill under .claude/skills is covered by its colocated eval", () => {
  // Regression: the suggested eval lives under a DOT dir, so a globstar test
  // glob without `dot:true` never found it and the surface looked untested
  // even after the user added exactly the file the warning recommended.
  const dir = makeTmpDir("tc-dotdir");
  write(dir, ".claude/skills/foo/SKILL.md", skill("foo"));
  const before = findUntestedSurfaces({ basePath: dir });
  assert.equal(before.untested.length, 1, "skill is found and flagged first");
  assert.equal(
    suggestedTestPath(before.untested[0]),
    ".claude/skills/foo/foo.eval.mjs",
  );

  // Add exactly the suggested colocated eval — it must now count as covered.
  write(dir, ".claude/skills/foo/foo.eval.mjs", "// trigger eval\n");
  const after = findUntestedSurfaces({ basePath: dir });
  assert.equal(after.untested.length, 0);
  assert.deepEqual(
    after.covered.map((s) => s.name),
    ["foo"],
  );
  cleanupTmpDir(dir);
});

test("skill is covered by a content-reference anywhere (namespace token)", () => {
  const dir = makeTmpDir("tc-ref");
  write(dir, "skills/foo/SKILL.md", skill("foo"));
  // a test elsewhere that names the skill via its namespaced id
  write(dir, "test/foo.eval.mjs", 'skillResolved(t, "myplugin:foo");\n');
  const r = findUntestedSurfaces({ basePath: dir });
  assert.equal(r.untested.length, 0);
  cleanupTmpDir(dir);
});

test("skill with no test is flagged", () => {
  const dir = makeTmpDir("tc-untested");
  write(dir, "skills/foo/SKILL.md", skill("foo"));
  const r = findUntestedSurfaces({ basePath: dir });
  assert.equal(r.untested.length, 1);
  assert.equal(r.untested[0].name, "foo");
  cleanupTmpDir(dir);
});

test("a command-only (disable-model-invocation) skill is NOT exempt — it still needs a test", () => {
  const dir = makeTmpDir("tc-userinvoked");
  write(
    dir,
    "skills/cmd/SKILL.md",
    skill("cmd", "disable-model-invocation: true\n"),
  );
  const r = findUntestedSurfaces({ basePath: dir });
  // Invocation mode no longer exempts anything: the command-only skill is held
  // to the requirement like any other and flagged when it has no test.
  assert.equal(r.total, 1);
  assert.equal(r.exempt, 0);
  assert.equal(r.untested.length, 1);
  assert.equal(r.untested[0].name, "cmd");
  cleanupTmpDir(dir);
});

test("vigiles:ignore-test marker is the only exemption (and is counted)", () => {
  const dir = makeTmpDir("tc-ignore");
  write(
    dir,
    "skills/foo/SKILL.md",
    skill("foo") + "\n<!-- vigiles:ignore-test -->\n",
  );
  const r = findUntestedSurfaces({ basePath: dir });
  assert.equal(r.total, 0); // nothing held to the requirement
  assert.equal(r.exempt, 1); // the explicit opt-out is visible, not silent
  assert.equal(r.untested.length, 0);
  cleanupTmpDir(dir);
});

test("agent is covered by a name-prefixed sibling, flagged otherwise", () => {
  const dir = makeTmpDir("tc-agent");
  write(dir, "agents/planner.md", "---\nname: planner\n---\nbody\n");
  write(dir, "agents/reviewer.md", "---\nname: reviewer\n---\nbody\n");
  write(dir, "agents/planner.harness.mjs", "// planner test\n");
  const r = findUntestedSurfaces({ basePath: dir });
  assert.deepEqual(
    r.covered.map((s) => s.name),
    ["planner"],
  );
  assert.deepEqual(
    r.untested.map((s) => s.name),
    ["reviewer"],
  );
  cleanupTmpDir(dir);
});

test("hook scripts are discovered from plugin.json and matched by path", () => {
  const dir = makeTmpDir("tc-hooks");
  write(dir, "hooks/pre-edit.sh", "#!/usr/bin/env bash\n");
  write(dir, "hooks/post-edit.sh", "#!/usr/bin/env bash\n");
  write(
    dir,
    ".claude-plugin/plugin.json",
    JSON.stringify({
      name: "p",
      hooks: {
        PreToolUse: [
          {
            matcher: "Edit",
            hooks: [
              {
                type: "command",
                command: "bash ${CLAUDE_PLUGIN_ROOT}/hooks/pre-edit.sh",
              },
            ],
          },
        ],
        PostToolUse: [
          {
            matcher: "Edit",
            hooks: [
              {
                type: "command",
                command: "bash ${CLAUDE_PLUGIN_ROOT}/hooks/post-edit.sh",
              },
            ],
          },
        ],
      },
    }),
  );
  // a unit test that drives only pre-edit by path
  write(dir, "src/hooks.test.ts", 'runHook("hooks/pre-edit.sh", {});\n');
  const r = findUntestedSurfaces({ basePath: dir });
  assert.equal(r.total, 2);
  assert.deepEqual(
    r.covered.map((s) => s.name),
    ["pre-edit"],
  );
  assert.deepEqual(
    r.untested.map((s) => s.name),
    ["post-edit"],
  );
  cleanupTmpDir(dir);
});

test("per-surface kind toggles disable scanning", () => {
  const dir = makeTmpDir("tc-toggle");
  write(dir, "skills/foo/SKILL.md", skill("foo"));
  const r = findUntestedSurfaces({ basePath: dir, skills: false });
  assert.equal(r.total, 0);
  cleanupTmpDir(dir);
});

test("formatUntestedReport: clean vs flagged, suggestedTestPath", () => {
  const dir = makeTmpDir("tc-fmt");
  write(dir, "skills/foo/SKILL.md", skill("foo"));
  const flagged = findUntestedSurfaces({ basePath: dir });
  const text = formatUntestedReport(flagged);
  assert.ok(text.includes("1 surface(s) with no test"));
  assert.ok(text.includes("skills/foo/foo.eval.mjs"));
  assert.equal(
    suggestedTestPath(flagged.untested[0]),
    "skills/foo/foo.eval.mjs",
  );

  write(dir, "skills/foo/foo.eval.mjs", "// covered\n");
  const clean = findUntestedSurfaces({ basePath: dir });
  assert.ok(formatUntestedReport(clean).startsWith("✓"));
  cleanupTmpDir(dir);
});
