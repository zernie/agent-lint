import { describe, it, expect } from "vitest";
import {
  enumerateEslintCatalog,
  parseEslintCatalog,
  type RuleCatalog,
} from "./rule-catalog.js";

// Vitest runs from the repo root (see vitest.config.mjs).
const REPO_ROOT = process.cwd();

describe("parseEslintCatalog (pure)", () => {
  it("parses a payload into core + plugin rules with enabled state", () => {
    const raw = JSON.stringify({
      core: ["no-console", "no-debugger"],
      enabled: ["no-console", "boundaries/dependencies"],
      plugins: {
        boundaries: ["dependencies", "element-types"],
        "@typescript-eslint": ["no-explicit-any"],
      },
    });
    const cat = parseEslintCatalog(raw);
    expect(cat).not.toBeNull();
    const catalog = cat as RuleCatalog;
    expect(catalog.linter).toBe("eslint");
    // 2 core + 2 boundaries + 1 ts-eslint
    expect(catalog.available).toBe(5);
    expect(catalog.rules).toHaveLength(5);
    // no-console (core, enabled) + boundaries/dependencies (enabled)
    expect(catalog.enabled).toBe(2);

    const core = catalog.rules.find((r) => r.id === "no-console");
    expect(core).toEqual({ id: "no-console", plugin: null, enabled: true });

    const disabledCore = catalog.rules.find((r) => r.id === "no-debugger");
    expect(disabledCore?.plugin).toBeNull();
    expect(disabledCore?.enabled).toBe(false);

    const boundaries = catalog.rules.find(
      (r) => r.id === "boundaries/dependencies",
    );
    expect(boundaries).toEqual({
      id: "boundaries/dependencies",
      plugin: "boundaries",
      enabled: true,
    });

    const tsRule = catalog.rules.find(
      (r) => r.id === "@typescript-eslint/no-explicit-any",
    );
    expect(tsRule?.plugin).toBe("@typescript-eslint");
    expect(tsRule?.enabled).toBe(false);
  });

  it("returns null for the sentinel, empty, malformed, and empty-catalog inputs", () => {
    expect(parseEslintCatalog("null")).toBeNull();
    expect(parseEslintCatalog("   ")).toBeNull();
    expect(parseEslintCatalog("")).toBeNull();
    expect(parseEslintCatalog("{ not json")).toBeNull();
    expect(parseEslintCatalog("[1,2,3]")).toBeNull();
    expect(parseEslintCatalog("42")).toBeNull();
    // valid object but no rules at all → null
    expect(
      parseEslintCatalog(
        JSON.stringify({ core: [], enabled: [], plugins: {} }),
      ),
    ).toBeNull();
  });

  it("tolerates missing / wrong-typed fields", () => {
    // no plugins key, enabled missing → still yields core rules, none enabled
    const cat = parseEslintCatalog(JSON.stringify({ core: ["no-with"] }));
    expect(cat?.available).toBe(1);
    expect(cat?.enabled).toBe(0);
    // non-string-array fields are ignored, not fatal
    const cat2 = parseEslintCatalog(
      JSON.stringify({ core: ["a", 1], enabled: 5, plugins: { p: "x" } }),
    );
    // core is not a clean string[] → dropped; plugins.p not a string[] → dropped
    expect(cat2).toBeNull();
  });
});

describe("enumerateEslintCatalog (integration, executes ESLint)", () => {
  const catalog = enumerateEslintCatalog(REPO_ROOT);

  if (!catalog) {
    it.skip("SKIPPED — ESLint not resolvable in this repo", () => {
      expect(catalog).toBeNull();
    });
    return;
  }

  it("enumerates a large available catalog with a subset enabled", () => {
    expect(catalog.linter).toBe("eslint");
    expect(catalog.available).toBeGreaterThan(300);
    expect(catalog.enabled).toBeGreaterThan(0);
    expect(catalog.enabled).toBeLessThan(catalog.available);
    expect(catalog.rules).toHaveLength(catalog.available);
  });

  it("includes boundaries/dependencies with a correct plugin field", () => {
    const rule = catalog.rules.find((r) => r.id === "boundaries/dependencies");
    expect(rule).toBeDefined();
    expect(rule?.plugin).toBe("boundaries");
  });

  it("marks core rules with a null plugin and plugin rules with their prefix", () => {
    const core = catalog.rules.filter((r) => r.plugin === null);
    const plugin = catalog.rules.filter((r) => r.plugin !== null);
    expect(core.length).toBeGreaterThan(200);
    expect(plugin.length).toBeGreaterThan(0);
    // every plugin rule's id is prefixed with its plugin
    for (const r of plugin) {
      expect(r.id.startsWith(`${r.plugin ?? ""}/`)).toBe(true);
    }
  });
});
