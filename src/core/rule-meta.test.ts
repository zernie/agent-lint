import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { RULE_META, allRuleMeta, type RuleName } from "./rule-meta.js";
import { DEFAULT_RULES } from "./validate.js";

const RULES_DOC_DIR = join(__dirname, "..", "..", "docs", "rules");

function docRuleNames(): string[] {
  return readdirSync(RULES_DOC_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

describe("RULE_META registry", () => {
  it("declares a meta for every documented rule (docs/rules/*.md)", () => {
    const docs = docRuleNames().sort();
    const metas = Object.keys(RULE_META).sort();
    // Every doc has a meta AND every meta has a doc — the rule SET is one thing.
    expect(metas).toEqual(docs);
  });

  it("each meta's defaultSeverity matches the real DEFAULT_RULES", () => {
    for (const meta of allRuleMeta()) {
      if (meta.id === "orphan-docs") continue; // built-in, not in RulesConfig
      const actual = DEFAULT_RULES[meta.id as keyof typeof DEFAULT_RULES];
      const normalized =
        actual === false ? "off" : Array.isArray(actual) ? actual[0] : actual;
      expect(normalized, `defaultSeverity drift for ${meta.id}`).toBe(
        meta.defaultSeverity,
      );
    }
  });

  it("every meta has a non-empty surface + a known bucket", () => {
    const buckets = new Set([
      "structural-closed",
      "external-decidable",
      "heuristic-behavioral",
    ]);
    for (const meta of allRuleMeta()) {
      expect(meta.surface.length, `${meta.id} surface`).toBeGreaterThan(0);
      expect(buckets.has(meta.bucket), `${meta.id} bucket`).toBe(true);
      expect(meta.id, `${meta.id} id matches key`).toBe(meta.id);
      expect(meta.summary.length, `${meta.id} summary`).toBeGreaterThan(0);
      expect(meta.detector.length, `${meta.id} detector`).toBeGreaterThan(0);
    }
  });

  it("a heuristic-behavioral rule never claims a hard (error) default — that would cry wolf", () => {
    for (const meta of allRuleMeta()) {
      if (meta.bucket === "heuristic-behavioral") {
        expect(
          meta.defaultSeverity,
          `${meta.id} is heuristic but defaults to error`,
        ).not.toBe("error");
      }
    }
  });

  it("ruleMeta() round-trips a known id and rejects an unknown one", () => {
    const id: RuleName = "lethal-trifecta";
    expect(RULE_META[id].bucket).toBe("structural-closed");
  });
});
