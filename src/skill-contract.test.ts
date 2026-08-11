/**
 * `skillContract` + `onlyTools` — the declaration-to-checks wiring.
 *
 * Pure and filesystem-driven: write a tiny skill into a tmp dir, read its
 * contract back, and evaluate the checks against synthesized traces. No model,
 * no `claude`, no network — this is the free tier.
 *
 * The cases that matter are the ones where a naive implementation PASSES:
 * an undeclared skill, a skill whose frontmatter doesn't parse, and a trace that
 * recorded nothing. Each of those must FAIL, because in each of them the check
 * inspected nothing.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { onlyTools } from "./check.js";
import { skillContract } from "./skill-contract.js";
import type { Trace } from "./harness-test.js";
import { makeTmpDir, cleanupTmpDir } from "./core/test-utils.js";

/** A minimal Trace carrying just the tool calls a check reads. */
function trace(names: string[]): Trace {
  return {
    toolCalls: names.map((name) => ({ name, input: {}, output: "" })),
    hooks: [],
    output: "",
    modelRequests: [],
    turns: 1,
    file: () => null,
  } as unknown as Trace;
}

function writeSkill(dir: string, name: string, frontmatter: string): string {
  const skillDir = join(dir, "skills", name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\nname: ${name}\n${frontmatter}---\n\n# ${name}\n`,
  );
  return skillDir;
}

// --- onlyTools ------------------------------------------------------------

test("onlyTools passes when every call is declared, and names EVERY offender", () => {
  const allow = onlyTools(["Read", "Write"]);
  assert.equal(allow.eval(trace(["Read", "Write", "Read"])).pass, true);

  const bad = allow.eval(trace(["Read", "Bash", "WebFetch", "Bash"]));
  assert.equal(bad.pass, false);
  // Both offenders reported, deduped — not just the first.
  assert.match(bad.message, /Bash/);
  assert.match(bad.message, /WebFetch/);
  assert.equal(bad.message.match(/Bash/g)?.length, 1);
});

test("onlyTools FAILS on a trace that recorded nothing (we didn't look != it was clean)", () => {
  // The `assertWroteOnly` discipline: an uncaptured run is indistinguishable
  // from a tool-free one, so passing it would assert nothing.
  const r = onlyTools(["Read"]).eval(trace([]));
  assert.equal(r.pass, false);
  assert.match(r.message, /recorded no tool calls/);
  assert.match(r.message, /transcript: true/);
});

// --- skillContract --------------------------------------------------------

test("skillContract reads allowed-tools and builds a surface that catches an undeclared call", () => {
  const dir = makeTmpDir("sc-declared");
  writeFileSync(
    join(dir, "plugin.json"),
    JSON.stringify({ name: "myplug", version: "1.0.0" }),
  );
  const skillDir = writeSkill(dir, "foo", "allowed-tools: Read, Write\n");

  const c = skillContract(skillDir);
  assert.equal(c.name, "foo");
  assert.equal(c.id, "myplug:foo"); // namespaced from the enclosing manifest
  assert.deepEqual([...c.declared], ["Read", "Write"]);
  assert.equal(c.undeclared, false);
  assert.equal(c.malformed, false);

  const surface = c.surface[0];
  assert.equal(surface.eval(trace(["Skill", "Read", "Write"])).pass, true);

  // The real defect this reproduces: a skill that declares MCP tools but needs
  // ToolSearch to reach them, and never says so.
  const bad = surface.eval(trace(["Skill", "Read", "ToolSearch"]));
  assert.equal(bad.pass, false);
  assert.match(bad.message, /ToolSearch/);
  cleanupTmpDir(dir);
});

test("skillContract exempts the Skill activation call itself", () => {
  // The call that LOADS the skill under test is the harness's mechanism, not a
  // capability the skill exercised — counting it would fail every contract on
  // every run.
  const dir = makeTmpDir("sc-activation");
  const skillDir = writeSkill(dir, "foo", "allowed-tools: Read\n");
  assert.equal(
    skillContract(skillDir).surface[0].eval(trace(["Skill", "Read"])).pass,
    true,
  );
  cleanupTmpDir(dir);
});

test("skillContract: an UNDECLARED skill is a finding, not an empty contract", () => {
  const dir = makeTmpDir("sc-undeclared");
  const skillDir = writeSkill(dir, "foo", "");
  const c = skillContract(skillDir);

  assert.equal(c.undeclared, true);
  assert.deepEqual([...c.declared], []);
  // Must NOT pass vacuously: nothing was claimed, so there is no surface for the
  // run to stay inside, and "no violations" would present that as the cleanest.
  const r = c.surface[0].eval(trace(["Bash"]));
  assert.equal(r.pass, false);
  assert.match(r.message, /no declared surface for a run to stay inside/);
  // …and it must NOT promise enforcement. `allowed-tools:` pre-approves; it does
  // not fence (measured 2026-08-11 — see src/core/lethal-trifecta.ts). A passing
  // contract tests author DISCIPLINE, not that the skill COULD NOT have gone wider.
  assert.match(r.message, /pre-approves, every tool stays callable/);
  cleanupTmpDir(dir);
});

test("skillContract: MALFORMED frontmatter is unverifiable, not unrestricted", () => {
  // Observed live (2026-08-10): one unquoted `: ` inside a description silently
  // voided a skill's whole tool contract. A declaration that does not parse is
  // not an enforcement — and it must not read as "declares nothing", either.
  const dir = makeTmpDir("sc-malformed");
  const skillDir = join(dir, "skills", "foo");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\nname: foo\nallowed-tools: Read\ndescription: broken here: like this\n  and: [unclosed\n---\n\n# foo\n`,
  );

  const c = skillContract(skillDir);
  assert.equal(c.malformed, true);
  const r = c.surface[0].eval(trace(["Read"]));
  assert.equal(r.pass, false);
  assert.match(r.message, /not valid YAML/);
  cleanupTmpDir(dir);
});

test("skillContract: activation asserts the real namespaced id", () => {
  const dir = makeTmpDir("sc-activation-id");
  mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(dir, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "vigiles" }),
  );
  const skillDir = writeSkill(dir, "test-harness", "allowed-tools: Read\n");

  const c = skillContract(skillDir);
  assert.equal(c.id, "vigiles:test-harness");

  // `skill()` matches on the Skill call's `skill` input, so synthesize that.
  const t = {
    toolCalls: [
      { name: "Skill", input: { skill: "vigiles:test-harness" }, output: "" },
    ],
    hooks: [],
    output: "",
    modelRequests: [],
    turns: 1,
    file: () => null,
  } as unknown as Trace;
  assert.equal(c.activation.eval(t).pass, true);

  // An explicit override wins over the manifest.
  assert.equal(
    skillContract(skillDir, { plugin: "other" }).id,
    "other:test-harness",
  );
  cleanupTmpDir(dir);
});

test("skillContract falls back to the directory name with no plugin manifest", () => {
  const dir = makeTmpDir("sc-bare");
  const skillDir = join(dir, "skills", "bare");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), `# no frontmatter at all\n`);

  const c = skillContract(skillDir);
  assert.equal(c.name, "bare");
  assert.equal(c.id, "bare"); // unnamespaced — nothing to namespace it with
  assert.equal(c.undeclared, true);
  cleanupTmpDir(dir);
});
