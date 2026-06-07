/**
 * Tests for the skill runtime: parsing vigiles:gate / vigiles:result markers
 * out of a compiled SKILL.md and executing the gate ladder with short-circuit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  parseSkillGates,
  runGate,
  runSkillGates,
  detectProjectCommand,
  setActiveSkill,
  clearActiveSkill,
  readActiveSkill,
  evaluateStopHook,
} from "./skill-runtime.js";

const SAMPLE = `# skill

### Step 1
do a thing
<!-- vigiles:gate "true" -->

### Step 2
do another
<!-- vigiles:gate "false" retry:2 -->

## Result
<!-- vigiles:result "true" -->
`;

test("parseSkillGates extracts step gates (with retry) and the result gate", () => {
  const g = parseSkillGates(SAMPLE);
  assert.equal(g.steps.length, 2);
  assert.deepEqual(g.steps[0], {
    step: 1,
    gate: { kind: "cmd", command: "true", retry: 1 },
  });
  assert.deepEqual(g.steps[1], {
    step: 2,
    gate: { kind: "cmd", command: "false", retry: 2 },
  });
  assert.deepEqual(g.result, { kind: "cmd", command: "true", retry: 1 });
});

test("parseSkillGates parses file gates", () => {
  const g = parseSkillGates(
    "### Step 1\n<!-- vigiles:gate file:package.json -->\n",
  );
  assert.deepEqual(g.steps[0].gate, {
    kind: "file",
    path: "package.json",
    retry: 1,
  });
});

test("runGate: command exit 0 passes, non-zero fails", () => {
  assert.equal(
    runGate({ kind: "cmd", command: "true", retry: 1 }, process.cwd()).ok,
    true,
  );
  assert.equal(
    runGate({ kind: "cmd", command: "false", retry: 1 }, process.cwd()).ok,
    false,
  );
});

test("runGate: file existence", () => {
  assert.equal(
    runGate({ kind: "file", path: "package.json", retry: 1 }, process.cwd()).ok,
    true,
  );
  assert.equal(
    runGate({ kind: "file", path: "nope.nonexistent", retry: 1 }, process.cwd())
      .ok,
    false,
  );
});

test("runSkillGates short-circuits at the first failing gate", () => {
  const report = runSkillGates(parseSkillGates(SAMPLE), process.cwd());
  assert.equal(report.ok, false);
  assert.equal(report.blockedAt, 2);
  // step 1 ran (passed), step 2 ran (failed), result NOT reached.
  assert.equal(report.results.length, 2);
  assert.equal(report.results[0].ok, true);
  assert.equal(report.results[1].ok, false);
});

test("runSkillGates runs the result gate when all steps pass", () => {
  const md = `### Step 1
<!-- vigiles:gate "true" -->

## Result
<!-- vigiles:result "true" -->
`;
  const report = runSkillGates(parseSkillGates(md), process.cwd());
  assert.equal(report.ok, true);
  assert.equal(report.blockedAt, null);
  assert.equal(report.results.length, 2);
  assert.equal(report.results[1].at, "result");
});

// --- Project-role gates (cross-repo portability) ---

test("parseSkillGates parses role gates", () => {
  const g = parseSkillGates(
    `### Step 1\n<!-- vigiles:gate role:test retry:2 -->\n\n## Result\n<!-- vigiles:result role:build -->\n`,
  );
  assert.deepEqual(g.steps[0].gate, { kind: "role", role: "test", retry: 2 });
  assert.deepEqual(g.result, { kind: "role", role: "build", retry: 1 });
});

test("detectProjectCommand resolves a role to the host ecosystem's command", () => {
  const js = mkdtempSync(join(tmpdir(), "vigiles-js-"));
  writeFileSync(
    join(js, "package.json"),
    JSON.stringify({ scripts: { test: "vitest", build: "tsc" } }),
  );
  assert.equal(detectProjectCommand("test", js), "npm test");
  assert.equal(detectProjectCommand("build", js), "npm run build");
  assert.equal(detectProjectCommand("lint", js), null); // no lint script
  rmSync(js, { recursive: true, force: true });

  const py = mkdtempSync(join(tmpdir(), "vigiles-py-"));
  writeFileSync(join(py, "pyproject.toml"), "[tool.pytest.ini_options]\n");
  assert.equal(detectProjectCommand("test", py), "pytest");
  rmSync(py, { recursive: true, force: true });

  const rs = mkdtempSync(join(tmpdir(), "vigiles-rs-"));
  writeFileSync(join(rs, "Cargo.toml"), "[package]\n");
  assert.equal(detectProjectCommand("test", rs), "cargo test");
  rmSync(rs, { recursive: true, force: true });

  const empty = mkdtempSync(join(tmpdir(), "vigiles-empty-"));
  assert.equal(detectProjectCommand("test", empty), null);
  rmSync(empty, { recursive: true, force: true });
});

test("runGate role fails (not silently passes) when no command is detected", () => {
  const empty = mkdtempSync(join(tmpdir(), "vigiles-norole-"));
  const r = runGate({ kind: "role", role: "test", retry: 1 }, empty);
  assert.equal(r.ok, false);
  assert.match(r.output, /No test command detected/);
  rmSync(empty, { recursive: true, force: true });
});

// --- Stop-hook enforcement ---

function tmpSkill(resultGate: string): string {
  const dir = mkdtempSync(join(tmpdir(), "vigiles-skill-"));
  writeFileSync(
    join(dir, "SKILL.md"),
    `### Step 1\n<!-- vigiles:gate "true" -->\n\n## Result\n<!-- vigiles:result "${resultGate}" -->\n`,
  );
  return dir;
}

test("active-skill marker roundtrips and clears", () => {
  const dir = mkdtempSync(join(tmpdir(), "vigiles-active-"));
  assert.equal(readActiveSkill(dir), null);
  setActiveSkill(dir, "SKILL.md");
  assert.equal(readActiveSkill(dir), "SKILL.md");
  clearActiveSkill(dir);
  assert.equal(readActiveSkill(dir), null);
  assert.equal(existsSync(join(dir, ".vigiles/active-skill.json")), false);
  rmSync(dir, { recursive: true, force: true });
});

test("evaluateStopHook allows when no skill is active", () => {
  const dir = mkdtempSync(join(tmpdir(), "vigiles-hook-"));
  const d = evaluateStopHook(dir);
  assert.equal(d.allow, true);
  rmSync(dir, { recursive: true, force: true });
});

test("evaluateStopHook allows when the result gate passes", () => {
  const dir = tmpSkill("true");
  setActiveSkill(dir, "SKILL.md");
  const d = evaluateStopHook(dir);
  assert.equal(d.allow, true);
  assert.match(d.message, /result gate .* passed/);
  rmSync(dir, { recursive: true, force: true });
});

test("evaluateStopHook blocks when the result gate fails", () => {
  const dir = tmpSkill("false");
  setActiveSkill(dir, "SKILL.md");
  const d = evaluateStopHook(dir);
  assert.equal(d.allow, false);
  assert.match(d.message, /is not done: result gate `false` failed/);
  rmSync(dir, { recursive: true, force: true });
});
