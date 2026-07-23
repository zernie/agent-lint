/**
 * JVM + Go linter catalog tests (detekt / ktlint / checkstyle / golangci-lint).
 *
 * Two tiers, mirroring the rubocop/clippy coverage in spec.test.ts:
 *   - PURE (always run): the exported @internal config parsers + config-file
 *     detection through generateTypes over tmp fixtures — no binary needed.
 *   - GATED (skip loudly when the binary is absent): real rule-existence
 *     checks via checkLinterRule against the installed CLI. The four binaries
 *     are rarely installed in CI, so these use describe.skipIf — a visible
 *     skip, never a silent green and never a failure.
 */

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  checkLinterRule,
  parseDetektRuleKeys,
  parseDetektConfig,
  detektEnabledStatus,
  ktlintEnabledStatus,
  checkstyleEnabledStatus,
  golangciOutputListsLinter,
  golangciEnabledStatusFromOutput,
} from "./linters.js";
import { generateTypes } from "./generate-types.js";
import type { LinterRule } from "./spec.js";

function hasBinary(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function withTmpDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "vigiles-linters-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// LinterRule template-literal type accepts the new prefixes (compile-time).
// A wrong prefix would fail `npx tsc --noEmit` / the vitest transform.
// ---------------------------------------------------------------------------

describe("LinterRule type", () => {
  it("accepts the four new linter prefixes", () => {
    const refs: LinterRule[] = [
      "detekt/MagicNumber",
      "ktlint/standard:no-wildcard-imports",
      "checkstyle/MagicNumber",
      "golangci-lint/errcheck",
    ];
    assert.equal(refs.length, 4);
  });
});

// ---------------------------------------------------------------------------
// detekt — pure config parsing
// ---------------------------------------------------------------------------

const DETEKT_CONFIG = `style:
  active: true
  MagicNumber:
    active: true
    ignoreNumbers:
      - '-1'
  WildcardImport:
    active: false
  ForbiddenComment:
    excludes: ['**/test/**']

complexity:
  active: true
  ComplexMethod:
    threshold: 4
`;

describe("detekt config parsing", () => {
  it("parseDetektRuleKeys extracts PascalCase rule keys only", () => {
    const rules = parseDetektRuleKeys(DETEKT_CONFIG);
    assert.deepEqual([...rules].sort(), [
      "ComplexMethod",
      "ForbiddenComment",
      "MagicNumber",
      "WildcardImport",
    ]);
    // ruleset options and nested rule options are not rules
    assert.equal(rules.has("active"), false);
    assert.equal(rules.has("threshold"), false);
  });

  it("detektConfigNamesRule matches a rule key but NOT a nested option (P2)", () => {
    // A nested option like `threshold:` must never pass the existence fallback
    // as if it were a real rule — the whole point of the js-yaml parser.
    withTmpDir((dir) => {
      writeFileSync(join(dir, "detekt.yml"), DETEKT_CONFIG);
      const named = parseDetektConfig(DETEKT_CONFIG);
      assert.equal(named.has("ComplexMethod"), true);
      assert.equal(named.has("threshold"), false);
      assert.equal(named.has("active"), false);
      assert.equal(named.has("ignoreNumbers"), false);
    });
  });

  it("a ruleset-level `active: false` disables every rule under it (P2)", () => {
    const cfg = `style:
  active: false
  MagicNumber:
    ignoreNumbers: ['-1']
  WildcardImport:
    active: true
`;
    withTmpDir((dir) => {
      writeFileSync(join(dir, "detekt.yml"), cfg);
      // Ruleset off + no rule-level active → disabled (inherited off).
      assert.equal(detektEnabledStatus("MagicNumber", dir), "disabled");
      // A rule's OWN active:true still wins over the ruleset default.
      assert.equal(detektEnabledStatus("WildcardImport", dir), "enabled");
    });
    const parsed = parseDetektConfig(cfg);
    assert.equal(parsed.get("MagicNumber")?.active, "disabled");
    assert.equal(parsed.get("WildcardImport")?.active, "enabled");
  });

  it("detektEnabledStatus reads active: true/false per rule", () => {
    withTmpDir((dir) => {
      writeFileSync(join(dir, "detekt.yml"), DETEKT_CONFIG);
      assert.equal(detektEnabledStatus("MagicNumber", dir), "enabled");
      assert.equal(detektEnabledStatus("WildcardImport", dir), "disabled");
      // listed but no explicit active: — inherits detekt defaults
      assert.equal(detektEnabledStatus("ForbiddenComment", dir), "unknown");
      // absent from the config — detekt defaults apply
      assert.equal(detektEnabledStatus("LongMethod", dir), "unknown");
    });
  });

  it("detektEnabledStatus finds config/detekt/detekt.yml", () => {
    withTmpDir((dir) => {
      mkdirSync(join(dir, "config", "detekt"), { recursive: true });
      writeFileSync(join(dir, "config", "detekt", "detekt.yml"), DETEKT_CONFIG);
      assert.equal(detektEnabledStatus("WildcardImport", dir), "disabled");
    });
  });

  it("detektEnabledStatus is unknown with no config file", () => {
    withTmpDir((dir) => {
      assert.equal(detektEnabledStatus("MagicNumber", dir), "unknown");
    });
  });
});

// ---------------------------------------------------------------------------
// ktlint — pure .editorconfig parsing
// ---------------------------------------------------------------------------

const KTLINT_EDITORCONFIG = `root = true

[*.{kt,kts}]
ktlint_code_style = ktlint_official
ktlint_standard_no-wildcard-imports = disabled
ktlint_standard_final-newline = enabled
ktlint_experimental = disabled
`;

describe("ktlint .editorconfig parsing", () => {
  it("reads per-rule enabled/disabled properties", () => {
    withTmpDir((dir) => {
      writeFileSync(join(dir, ".editorconfig"), KTLINT_EDITORCONFIG);
      assert.equal(
        ktlintEnabledStatus("standard:no-wildcard-imports", dir),
        "disabled",
      );
      assert.equal(
        ktlintEnabledStatus("standard:final-newline", dir),
        "enabled",
      );
      // no per-rule and no ruleset-level property → unknown
      assert.equal(ktlintEnabledStatus("standard:indent", dir), "unknown");
    });
  });

  it("falls back to the ruleset-level property", () => {
    withTmpDir((dir) => {
      writeFileSync(join(dir, ".editorconfig"), KTLINT_EDITORCONFIG);
      assert.equal(
        ktlintEnabledStatus("experimental:some-rule", dir),
        "disabled",
      );
    });
  });

  it("defaults an unqualified rule to the standard ruleset", () => {
    withTmpDir((dir) => {
      writeFileSync(join(dir, ".editorconfig"), KTLINT_EDITORCONFIG);
      assert.equal(ktlintEnabledStatus("no-wildcard-imports", dir), "disabled");
    });
  });

  it("is unknown with no .editorconfig", () => {
    withTmpDir((dir) => {
      assert.equal(
        ktlintEnabledStatus("standard:no-wildcard-imports", dir),
        "unknown",
      );
    });
  });
});

// ---------------------------------------------------------------------------
// checkstyle — pure checkstyle.xml parsing
// ---------------------------------------------------------------------------

const CHECKSTYLE_XML = `<?xml version="1.0"?>
<!DOCTYPE module PUBLIC "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN" "https://checkstyle.org/dtds/configuration_1_3.dtd">
<module name="Checker">
  <module name="NewlineAtEndOfFile"/>
  <module name="TreeWalker">
    <module name="MagicNumber">
      <property name="ignoreNumbers" value="0, 1"/>
    </module>
    <module name="WhitespaceAround">
      <property name="severity" value="ignore"/>
    </module>
  </module>
</module>
`;

describe("checkstyle config parsing", () => {
  it("a listed module is enabled; severity=ignore is disabled", () => {
    withTmpDir((dir) => {
      writeFileSync(join(dir, "checkstyle.xml"), CHECKSTYLE_XML);
      assert.equal(checkstyleEnabledStatus("MagicNumber", dir), "enabled");
      assert.equal(
        checkstyleEnabledStatus("NewlineAtEndOfFile", dir),
        "enabled",
      );
      assert.equal(
        checkstyleEnabledStatus("WhitespaceAround", dir),
        "disabled",
      );
    });
  });

  it("an absent module is disabled (checkstyle configs are whitelists)", () => {
    withTmpDir((dir) => {
      writeFileSync(join(dir, "checkstyle.xml"), CHECKSTYLE_XML);
      assert.equal(checkstyleEnabledStatus("FinalClass", dir), "disabled");
    });
  });

  it("finds config/checkstyle/checkstyle.xml", () => {
    withTmpDir((dir) => {
      mkdirSync(join(dir, "config", "checkstyle"), { recursive: true });
      writeFileSync(
        join(dir, "config", "checkstyle", "checkstyle.xml"),
        CHECKSTYLE_XML,
      );
      assert.equal(checkstyleEnabledStatus("MagicNumber", dir), "enabled");
    });
  });

  it("is unknown with no config file", () => {
    withTmpDir((dir) => {
      assert.equal(checkstyleEnabledStatus("MagicNumber", dir), "unknown");
    });
  });
});

// ---------------------------------------------------------------------------
// golangci-lint — pure output parsing
// ---------------------------------------------------------------------------

const GOLANGCI_LINTERS_OUTPUT = `Enabled by your configuration linters:
errcheck: Errcheck is a program for checking for unchecked errors in Go code. [fast: false, auto-fix: false]
govet (vet, vetshadow): Vet examines Go source code and reports suspicious constructs. [fast: false, auto-fix: false]
staticcheck (megacheck): It's a set of rules from staticcheck. [fast: false, auto-fix: false]

Disabled by your configuration linters:
gocyclo: Computes and checks the cyclomatic complexity of functions. [fast: true, auto-fix: false]
unparam: Reports unused function parameters. [fast: false, auto-fix: false]
`;

describe("golangci-lint output parsing", () => {
  it("golangciOutputListsLinter matches names at line start", () => {
    assert.equal(
      golangciOutputListsLinter(GOLANGCI_LINTERS_OUTPUT, "errcheck"),
      true,
    );
    assert.equal(
      golangciOutputListsLinter(GOLANGCI_LINTERS_OUTPUT, "govet"),
      true,
    );
    assert.equal(
      golangciOutputListsLinter(GOLANGCI_LINTERS_OUTPUT, "gocyclo"),
      true,
    );
    assert.equal(
      golangciOutputListsLinter(GOLANGCI_LINTERS_OUTPUT, "totally-fake"),
      false,
    );
    // a name only appearing mid-description must not match
    assert.equal(
      golangciOutputListsLinter(GOLANGCI_LINTERS_OUTPUT, "staticcheck"),
      true,
    );
    assert.equal(
      golangciOutputListsLinter(GOLANGCI_LINTERS_OUTPUT, "megacheck"),
      false,
    );
  });

  it("golangciEnabledStatusFromOutput splits enabled/disabled sections", () => {
    assert.equal(
      golangciEnabledStatusFromOutput(GOLANGCI_LINTERS_OUTPUT, "errcheck"),
      "enabled",
    );
    assert.equal(
      golangciEnabledStatusFromOutput(GOLANGCI_LINTERS_OUTPUT, "gocyclo"),
      "disabled",
    );
    assert.equal(
      golangciEnabledStatusFromOutput(GOLANGCI_LINTERS_OUTPUT, "unparam"),
      "disabled",
    );
    assert.equal(
      golangciEnabledStatusFromOutput(GOLANGCI_LINTERS_OUTPUT, "nolintlint"),
      "unknown",
    );
  });
});

// ---------------------------------------------------------------------------
// generate-types — config detection + discovery over tmp fixtures (pure)
// ---------------------------------------------------------------------------

describe("generateTypes JVM/Go discovery", () => {
  it("discovers detekt rules from detekt.yml, excluding active: false", () => {
    withTmpDir((dir) => {
      writeFileSync(join(dir, "detekt.yml"), DETEKT_CONFIG);
      const result = generateTypes({ basePath: dir, fileGlobs: [] });
      const detekt = result.linters.find((l) => l.linter === "detekt");
      assert.ok(detekt, "detekt catalog should be discovered");
      assert.deepEqual([...detekt.rules].sort(), [
        "ComplexMethod",
        "ForbiddenComment",
        "MagicNumber",
      ]);
      assert.ok(result.dts.includes("DetektRule"));
    });
  });

  it("excludes rules under a ruleset with active: false (P2)", () => {
    // A whole ruleset turned off must not emit its rules into DetektRule — a
    // spec would type-check against rules detekt won't run.
    const cfg = `style:
  active: false
  MagicNumber:
    active: true
  WildcardImport:
    ignoreImports: ['java.*']
complexity:
  active: true
  LongMethod:
    threshold: 60
`;
    withTmpDir((dir) => {
      writeFileSync(join(dir, "detekt.yml"), cfg);
      const result = generateTypes({ basePath: dir, fileGlobs: [] });
      const detekt = result.linters.find((l) => l.linter === "detekt");
      assert.ok(detekt, "detekt catalog should be discovered");
      // style is off → MagicNumber (own active:true still counts) is kept, but
      // WildcardImport (inherits the off ruleset) is excluded; complexity is on.
      assert.deepEqual([...detekt.rules].sort(), ["LongMethod", "MagicNumber"]);
    });
  });

  it("discovers ktlint rules from .editorconfig properties", () => {
    withTmpDir((dir) => {
      writeFileSync(join(dir, ".editorconfig"), KTLINT_EDITORCONFIG);
      const result = generateTypes({ basePath: dir, fileGlobs: [] });
      const ktlint = result.linters.find((l) => l.linter === "ktlint");
      assert.ok(ktlint, "ktlint catalog should be discovered");
      // only explicitly enabled per-rule properties; ktlint_code_style is not a rule
      assert.deepEqual(ktlint.rules, ["standard:final-newline"]);
      assert.ok(result.dts.includes("KtlintRule"));
    });
  });

  it("discovers checkstyle modules, EXCLUDING severity=ignore ones (Codex review)", () => {
    withTmpDir((dir) => {
      writeFileSync(join(dir, "checkstyle.xml"), CHECKSTYLE_XML);
      const result = generateTypes({ basePath: dir, fileGlobs: [] });
      const checkstyle = result.linters.find((l) => l.linter === "checkstyle");
      assert.ok(checkstyle, "checkstyle catalog should be discovered");
      // WhitespaceAround has `severity="ignore"` → DISABLED → left out of the
      // type union, so a spec can't type-check against a rule CI won't enforce
      // (the generated-types proof would be defeated otherwise).
      assert.deepEqual(checkstyle.rules, ["MagicNumber", "NewlineAtEndOfFile"]);
      assert.ok(result.dts.includes("CheckstyleRule"));
      assert.ok(
        !result.dts.includes("WhitespaceAround"),
        "the severity=ignore module must not appear in the CheckstyleRule type",
      );
    });
  });

  it("does not discover anything in an empty project", () => {
    withTmpDir((dir) => {
      const result = generateTypes({ basePath: dir, fileGlobs: [] });
      const names = result.linters.map((l) => l.linter);
      for (const name of ["detekt", "ktlint", "checkstyle", "golangci-lint"]) {
        assert.equal(names.includes(name), false, `${name} should be absent`);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Gated integration: real rule-existence checks via the installed binaries.
// These skip LOUDLY (vitest reports them skipped) when the tool is absent.
// ---------------------------------------------------------------------------

describe.skipIf(!hasBinary("detekt"))(
  "checkLinterRule() detekt (gated)",
  () => {
    it("detects a bundled detekt rule", () => {
      const result = checkLinterRule("detekt/MagicNumber", process.cwd());
      assert.equal(result.exists, true);
      assert.equal(result.linter, "detekt");
    });

    it("errors on a nonexistent detekt rule", () => {
      const result = checkLinterRule(
        "detekt/CompletelyFakeRuleXyz",
        process.cwd(),
      );
      assert.equal(result.exists, false);
      assert.ok(result.error?.includes("CompletelyFakeRuleXyz"));
    });
  },
);

describe.skipIf(!hasBinary("ktlint"))(
  "checkLinterRule() ktlint (gated)",
  () => {
    it("accepts a qualified ruleset:rule-id reference", () => {
      const result = checkLinterRule(
        "ktlint/standard:no-wildcard-imports",
        process.cwd(),
      );
      assert.equal(result.exists, true);
      assert.equal(result.linter, "ktlint");
      assert.equal(result.rule, "standard:no-wildcard-imports");
    });

    it("rejects an unqualified reference (format-only check)", () => {
      const result = checkLinterRule("ktlint/NoWildcardImports", process.cwd());
      assert.equal(result.exists, false);
    });
  },
);

describe.skipIf(!hasBinary("checkstyle"))(
  "checkLinterRule() checkstyle (gated)",
  () => {
    it("detects a TreeWalker check", () => {
      const result = checkLinterRule("checkstyle/MagicNumber", process.cwd());
      assert.equal(result.exists, true);
      assert.equal(result.linter, "checkstyle");
    });

    it("detects a Checker-level (file-level) check", () => {
      const result = checkLinterRule(
        "checkstyle/NewlineAtEndOfFile",
        process.cwd(),
      );
      assert.equal(result.exists, true);
    });

    it("errors on a nonexistent module", () => {
      const result = checkLinterRule(
        "checkstyle/CompletelyFakeModuleXyz",
        process.cwd(),
      );
      assert.equal(result.exists, false);
      assert.ok(result.error?.includes("CompletelyFakeModuleXyz"));
    });
  },
);

describe.skipIf(!hasBinary("golangci-lint"))(
  "checkLinterRule() golangci-lint (gated)",
  () => {
    it("detects a real linter", () => {
      const result = checkLinterRule("golangci-lint/errcheck", process.cwd());
      assert.equal(result.exists, true);
      assert.equal(result.linter, "golangci-lint");
    });

    it("errors on a nonexistent linter", () => {
      const result = checkLinterRule(
        "golangci-lint/completely-fake-linter-xyz",
        process.cwd(),
      );
      assert.equal(result.exists, false);
      assert.ok(result.error?.includes("completely-fake-linter-xyz"));
    });
  },
);

// Without the binary on PATH, the CLI catalogs report a clear not-found error
// instead of a false positive — always testable, no binary required.
describe("missing-binary behavior", () => {
  it.skipIf(hasBinary("detekt"))(
    "detekt absent from PATH → honest CLI-not-found error",
    () => {
      const result = checkLinterRule("detekt/MagicNumber", process.cwd());
      assert.equal(result.exists, false);
      assert.ok(result.error?.includes('CLI tool "detekt" not found'));
    },
  );

  it.skipIf(hasBinary("golangci-lint"))(
    "golangci-lint absent from PATH → honest CLI-not-found error",
    () => {
      const result = checkLinterRule("golangci-lint/errcheck", process.cwd());
      assert.equal(result.exists, false);
      assert.ok(result.error?.includes('CLI tool "golangci-lint" not found'));
    },
  );
});
