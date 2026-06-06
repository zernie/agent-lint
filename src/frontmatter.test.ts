/**
 * Tests for the YAML frontmatter rule parser.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseFrontmatterRules, hasFrontmatterRules } from "./frontmatter.js";

describe("parseFrontmatterRules", () => {
  it("parses a single enforce rule", () => {
    const { rules, errors } = parseFrontmatterRules(
      `---
vigiles:
  enforce:
    - rule: eslint/no-console
      why: Use the logger
---

# Project
`,
    );
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.equal(rules.length, 1);
    assert.equal(rules[0].linterRule, "eslint/no-console");
    assert.equal(rules[0].why, "Use the logger");
    assert.equal(rules[0].line, 4);
  });

  it("parses multiple rules and tracks line numbers in order", () => {
    const { rules, errors } = parseFrontmatterRules(
      `---
vigiles:
  enforce:
    - rule: "@typescript-eslint/no-explicit-any"
      why: Use unknown
    - rule: ruff/F401
      why: No unused imports
---
`,
    );
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.equal(rules.length, 2);
    assert.equal(rules[0].linterRule, "@typescript-eslint/no-explicit-any");
    assert.equal(rules[0].line, 4);
    assert.equal(rules[1].linterRule, "ruff/F401");
    assert.equal(rules[1].why, "No unused imports");
    assert.equal(rules[1].line, 6);
  });

  it("ignores a yaml-language-server modeline inside the block", () => {
    const { rules, errors } = parseFrontmatterRules(
      `---
# yaml-language-server: $schema=./.vigiles/schema.json
vigiles:
  enforce:
    - rule: eslint/no-eval
      why: Never eval
---
`,
    );
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.equal(rules.length, 1);
    assert.equal(rules[0].linterRule, "eslint/no-eval");
  });

  it("supports a `...` closing delimiter", () => {
    const { rules, errors } = parseFrontmatterRules(
      `---
vigiles:
  enforce:
    - rule: eslint/no-console
      why: logger
...
body
`,
    );
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.equal(rules.length, 1);
  });

  it("returns empty results when there is no frontmatter", () => {
    const { rules, errors } = parseFrontmatterRules(
      `# Project\n\nJust prose.\n`,
    );
    assert.equal(rules.length, 0);
    assert.equal(errors.length, 0);
  });

  it("returns empty results when frontmatter has no vigiles key", () => {
    const { rules, errors } = parseFrontmatterRules(
      `---
title: My Doc
tags: [a, b]
---

body
`,
    );
    assert.equal(rules.length, 0);
    assert.equal(errors.length, 0);
  });

  it("returns empty results when vigiles has no enforce key", () => {
    const { rules, errors } = parseFrontmatterRules(
      `---
vigiles: {}
---
`,
    );
    assert.equal(rules.length, 0);
    assert.equal(errors.length, 0);
  });

  it("reports malformed YAML without throwing", () => {
    const { rules, errors } = parseFrontmatterRules(
      `---
vigiles:
  enforce:
    - rule: eslint/no-console
       why: bad indent here :
      : :
---
`,
    );
    assert.equal(rules.length, 0);
    assert.ok(errors.length >= 1, "expected at least one error");
    assert.match(errors[0].message, /Malformed YAML frontmatter/);
  });

  it("reports when enforce is not a list", () => {
    const { rules, errors } = parseFrontmatterRules(
      `---
vigiles:
  enforce: "eslint/no-console"
---
`,
    );
    assert.equal(rules.length, 0);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /must be a list/);
  });

  it("reports an entry missing `rule`", () => {
    const { rules, errors } = parseFrontmatterRules(
      `---
vigiles:
  enforce:
    - why: orphaned why
---
`,
    );
    assert.equal(rules.length, 0);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /missing a string `rule`/);
  });

  it("reports an entry missing `why`", () => {
    const { rules, errors } = parseFrontmatterRules(
      `---
vigiles:
  enforce:
    - rule: eslint/no-console
---
`,
    );
    assert.equal(rules.length, 0);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /missing a string `why`/);
  });

  it("reports an entry that is not a mapping", () => {
    const { rules, errors } = parseFrontmatterRules(
      `---
vigiles:
  enforce:
    - "eslint/no-console | Use logger"
---
`,
    );
    assert.equal(rules.length, 0);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /must be a mapping/);
  });

  it("keeps valid rules and reports invalid ones in the same block", () => {
    const { rules, errors } = parseFrontmatterRules(
      `---
vigiles:
  enforce:
    - rule: eslint/no-console
      why: logger
    - rule: eslint/no-eval
---
`,
    );
    assert.equal(rules.length, 1);
    assert.equal(rules[0].linterRule, "eslint/no-console");
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /missing a string `why`/);
  });

  it("reports when vigiles is not a mapping", () => {
    const { rules, errors } = parseFrontmatterRules(
      `---
vigiles: "oops"
---
`,
    );
    assert.equal(rules.length, 0);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /must be a mapping/);
  });
});

describe("hasFrontmatterRules", () => {
  it("returns true when a valid enforce rule exists", () => {
    assert.equal(
      hasFrontmatterRules(
        `---
vigiles:
  enforce:
    - rule: eslint/no-console
      why: logger
---
`,
      ),
      true,
    );
  });

  it("returns false for plain markdown", () => {
    assert.equal(hasFrontmatterRules(`# Title\n\nparagraph\n`), false);
  });

  it("returns false when frontmatter has no vigiles block", () => {
    assert.equal(hasFrontmatterRules(`---\ntitle: x\n---\n`), false);
  });

  it("returns false when the only entry is malformed", () => {
    assert.equal(
      hasFrontmatterRules(
        `---
vigiles:
  enforce:
    - rule: eslint/no-console
---
`,
      ),
      false,
    );
  });
});
