import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { checkLinterRule, clearCedarCache } from "./linters.js";
import { makeTmpDir, cleanupTmpDir } from "./test-utils.js";

const SHELL_POLICY = `@id("shell-allowlist")
permit (
  principal,
  action == Action::"shell_execute",
  resource
) when {
  resource.command in ["npm test", "npm run build"]
};`;

const FILE_POLICY = `@id("file-read-deny")
forbid (
  principal,
  action == Action::"file_read",
  resource
) when { resource.path like "/etc/*" };`;

describe("checkLinterRule() — cedar", () => {
  it("resolves an annotated policy by @id", () => {
    const dir = makeTmpDir("cedar-id");
    try {
      mkdirSync(join(dir, ".cedar"), { recursive: true });
      writeFileSync(join(dir, ".cedar/policies.cedar"), SHELL_POLICY);
      clearCedarCache();

      const result = checkLinterRule("cedar/shell-allowlist", dir);
      assert.equal(result.exists, true);
      assert.equal(result.enabled, "enabled");
      assert.equal(result.linter, "cedar");
      assert.equal(result.rule, "shell-allowlist");
    } finally {
      cleanupTmpDir(dir);
    }
  });

  it("resolves multiple policies in one file", () => {
    const dir = makeTmpDir("cedar-multi");
    try {
      mkdirSync(join(dir, ".cedar"), { recursive: true });
      writeFileSync(
        join(dir, ".cedar/bundle.cedar"),
        `${SHELL_POLICY}\n\n${FILE_POLICY}`,
      );
      clearCedarCache();

      assert.equal(checkLinterRule("cedar/shell-allowlist", dir).exists, true);
      assert.equal(checkLinterRule("cedar/file-read-deny", dir).exists, true);
    } finally {
      cleanupTmpDir(dir);
    }
  });

  it("falls back to filename when no @id annotation present", () => {
    const dir = makeTmpDir("cedar-filename");
    try {
      mkdirSync(join(dir, ".cedar"), { recursive: true });
      writeFileSync(
        join(dir, ".cedar/legacy-rule.cedar"),
        `permit (principal, action, resource);`,
      );
      clearCedarCache();

      const result = checkLinterRule("cedar/legacy-rule", dir);
      assert.equal(result.exists, true);
      assert.equal(result.enabled, "enabled");
    } finally {
      cleanupTmpDir(dir);
    }
  });

  it("scans cedar/ as well as .cedar/", () => {
    const dir = makeTmpDir("cedar-alt-dir");
    try {
      mkdirSync(join(dir, "cedar"), { recursive: true });
      writeFileSync(join(dir, "cedar/policies.cedar"), SHELL_POLICY);
      clearCedarCache();

      assert.equal(checkLinterRule("cedar/shell-allowlist", dir).exists, true);
    } finally {
      cleanupTmpDir(dir);
    }
  });

  it("reports missing policy with suggestion", () => {
    const dir = makeTmpDir("cedar-typo");
    try {
      mkdirSync(join(dir, ".cedar"), { recursive: true });
      writeFileSync(join(dir, ".cedar/policies.cedar"), SHELL_POLICY);
      clearCedarCache();

      const result = checkLinterRule("cedar/shell-allowlst", dir);
      assert.equal(result.exists, false);
      assert.match(result.error ?? "", /shell-allowlist/);
    } finally {
      cleanupTmpDir(dir);
    }
  });

  it("reports a clean miss when no policy files exist", () => {
    const dir = makeTmpDir("cedar-empty");
    try {
      clearCedarCache();
      const result = checkLinterRule("cedar/anything", dir);
      assert.equal(result.exists, false);
      assert.match(result.error ?? "", /No Cedar policies found/);
    } finally {
      cleanupTmpDir(dir);
    }
  });

  it("honors custom rulesDir override", () => {
    const dir = makeTmpDir("cedar-custom");
    try {
      mkdirSync(join(dir, "policies/agent-core"), { recursive: true });
      writeFileSync(join(dir, "policies/agent-core/shell.cedar"), SHELL_POLICY);
      clearCedarCache();

      const result = checkLinterRule("cedar/shell-allowlist", dir, {
        linters: { cedar: { rulesDir: "policies/agent-core" } },
      });
      assert.equal(result.exists, true);
    } finally {
      cleanupTmpDir(dir);
    }
  });
});
