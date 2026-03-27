import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installSkills } from "./install-skills.mjs";

describe("installSkills", () => {
  let tmpDir;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "agent-lint-skills-"));
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should copy skills to target directory", () => {
    installSkills(tmpDir);
    const dest = join(tmpDir, ".claude", "skills");
    assert.ok(existsSync(dest));
  });

  it("should install audit-feedback-loop skill", () => {
    const skillFile = join(
      tmpDir,
      ".claude",
      "skills",
      "audit-feedback-loop",
      "SKILL.md",
    );
    assert.ok(existsSync(skillFile));
    const content = readFileSync(skillFile, "utf-8");
    assert.ok(content.length > 0);
  });

  it("should install pr-to-lint-rule skill", () => {
    const skillFile = join(
      tmpDir,
      ".claude",
      "skills",
      "pr-to-lint-rule",
      "SKILL.md",
    );
    assert.ok(existsSync(skillFile));
    const content = readFileSync(skillFile, "utf-8");
    assert.ok(content.length > 0);
  });

  it("should be idempotent (running twice does not error)", () => {
    assert.doesNotThrow(() => installSkills(tmpDir));
  });
});
