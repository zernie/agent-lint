import { describe, it, expect } from "vitest";
import { routeRules } from "./rule-routing.js";
import { INTENT_MAP } from "./rule-inventory.js";

/**
 * Golden routing DOGFOOD — a committed regression net over realistic
 * instruction-file rules, so the reuse-lane coverage (ESLint construct-
 * prohibitions + Pylint basics) can't silently regress in CI. The fixtures are
 * synthetic but GROUNDED in real OSS docs the deterministic router was validated
 * against: betterauth's "NEVER use classes" and browser-use's "Use descriptive
 * names and docstrings" both routed to reuse on the live corpus. Each block
 * pins the expected {category, rule, linter}; the FP blocks pin what must NOT
 * route (the precision guarantee).
 */

/** Assert a one-bullet rule routes to reuse with the given rule + linter. */
function expectReuse(bullet: string, rule: string, linter: string): void {
  const routed = routeRules(`- ${bullet}`).rules[0];
  expect(routed?.category, `${bullet} → category`).toBe("reuse");
  expect(routed?.rule, `${bullet} → rule`).toBe(rule);
  expect(routed?.linter, `${bullet} → linter`).toBe(linter);
}

/** Assert a rule does NOT route to reuse (precision guard). */
function expectNotReuse(bullet: string): void {
  const routed = routeRules(`- ${bullet}`).rules.find(
    (r) => r.category === "reuse",
  );
  expect(routed, `${bullet} must not route to reuse`).toBeUndefined();
}

describe("routing dogfood — ESLint construct-prohibitions → no-restricted-syntax", () => {
  it("routes real 'no <construct>' rules to the built-in", () => {
    expectReuse("Never use classes.", "no-restricted-syntax", "eslint");
    expectReuse("No default exports.", "no-restricted-syntax", "eslint");
    expectReuse("Avoid TypeScript enums.", "no-restricted-syntax", "eslint");
    expectReuse("No namespaces.", "no-restricted-syntax", "eslint");
    expectReuse("No for...in loops.", "no-restricted-syntax", "eslint");
  });

  it("precision: benign construct words never route", () => {
    expectNotReuse("Use utility classes for styling.");
    expectNotReuse("Support first-class functions.");
    expectNotReuse("Add a CSS class to the button.");
  });
});

describe("routing dogfood — Pylint basics (Python instruction file)", () => {
  // A realistic Python-repo CLAUDE.md, routed as one file.
  const PY = [
    "# Python conventions",
    "",
    "## Rules",
    "",
    "- Always add docstrings to public functions.",
    "- No bare except clauses.",
    "- Avoid broad exception handlers.",
    "- No wildcard imports.",
    "- No mutable default arguments.",
    "- Prefer f-strings over percent formatting.",
    "- No global statement in modules.",
    "- Avoid too-many-statements per function.",
    "",
    "## Project",
    "",
    "- The service lives in `src/app`.",
    "- Run the server with `uv run app`.",
  ].join("\n");

  const routed = routeRules(PY, "CLAUDE.md");
  const reuseByRule = new Map(
    routed.rules
      .filter((r) => r.category === "reuse")
      .map((r) => [r.rule, r.linter]),
  );

  it("routes each documented Python norm to its pylint rule", () => {
    const expected: [string, string][] = [
      ["missing-function-docstring", "pylint"],
      ["bare-except", "pylint"],
      ["broad-exception-caught", "pylint"],
      ["wildcard-import", "pylint"],
      ["dangerous-default-value", "pylint"],
      ["consider-using-f-string", "pylint"],
      ["global-statement", "pylint"],
      ["too-many-statements", "pylint"],
    ];
    for (const [rule, linter] of expected) {
      expect(reuseByRule.get(rule), `${rule} routed`).toBe(linter);
    }
  });

  it("does not misroute the project-info bullets (paths/commands)", () => {
    // "The service lives in `src/app`" is a description; "Run the server …" is a
    // command — neither is a pylint reuse rule.
    expect([...reuseByRule.keys()]).not.toContain("src/app");
    expect(routed.counts.reuse).toBe(8);
  });

  it("precision: cross-language / bare construct words never route to pylint", () => {
    // snake_case is Rust/Ruby too; `import *` is JS `import * as`; "unused
    // imports" collides with eslint — all deliberately excluded.
    expectNotReuse("Use snake_case for variables.");
    expectNotReuse("Re-export via `import * as ns`.");
    expectNotReuse("Enumerate the config files before parsing.");
  });
});

describe("INTENT_MAP invariant — keyword disjointness across linters", () => {
  it("no keyword is claimed by two linters (classify is first-match-wins)", () => {
    const owner = new Map<string, string>();
    const collisions: string[] = [];
    for (const m of INTENT_MAP) {
      for (const kw of m.keywords) {
        const prev = owner.get(kw);
        if (prev && prev !== m.linter) {
          collisions.push(`"${kw}": ${prev} vs ${m.linter}`);
        } else {
          owner.set(kw, m.linter);
        }
      }
    }
    expect(collisions, collisions.join("; ")).toEqual([]);
  });
});
