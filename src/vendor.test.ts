/**
 * Conformance tests over REAL, vendored plugins (examples/harness/vendor/*).
 *
 * Model-free and in-gate: loadPlugin parses + materializes each plugin's ACTUAL
 * shipped layout, and we assert invariants that must hold for any well-formed
 * plugin — it loads, `${CLAUDE_PLUGIN_ROOT}` resolves, skills materialize, and the
 * warnings (surface + dangling-ref) are accurate. Grounded in reality rather than
 * synthetic fixtures: this is the shape that caught the superpowers partial-vendor
 * dangling ref. Each plugin is pinned by commit SHA, so the suite is deterministic
 * and offline (no network, no model, no API key).
 *
 * Assertions are INVARIANTS, never version trivia — we check "≥ 1 skill loaded"
 * and "the known dangling ref is flagged, nothing spurious", not "exactly N
 * skills" (which would break on a harmless re-pin and test nothing real).
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { join } from "node:path";

import { loadPlugin } from "./plugin-loader.js";

// __dirname is dist/ at runtime; the vendored plugins live at the repo root.
const VENDOR = "../examples/harness/vendor";

interface PluginCase {
  readonly label: string;
  readonly dir: string;
  readonly expectHooks: boolean;
  readonly minSkills: number;
  readonly expectAgents: boolean;
  readonly expectCommands: boolean;
  /** Intra-plugin file refs knowingly absent in the snapshot (e.g. a partial vendor). */
  readonly knownDangling: readonly string[];
}

const PLUGINS: readonly PluginCase[] = [
  {
    label: "obra/superpowers",
    dir: "superpowers@6fd4507",
    expectHooks: true,
    minSkills: 1,
    expectAgents: false,
    expectCommands: false,
    // the vendored slice omits skills/using-superpowers/, which SessionStart reads
    knownDangling: ["skills/using-superpowers/SKILL.md"],
  },
  {
    label: "wshobson/accessibility",
    dir: "wshobson-accessibility@cf6059d",
    expectHooks: false,
    minSkills: 1,
    expectAgents: true,
    expectCommands: true,
    knownDangling: [],
  },
];

const hasWarning = (ws: readonly string[], sub: string): boolean =>
  ws.some((w) => w.includes(sub));

/** How many intra-plugin dangling refs the loader flagged (parsed from the warning). */
const danglingCount = (ws: readonly string[]): number => {
  const w = ws.find((x) => x.includes("intra-plugin"));
  const m = w?.match(/references (\d+) intra-plugin/);
  return m?.[1] ? Number(m[1]) : 0;
};

const skillCount = (files: Record<string, string>): number =>
  Object.keys(files).filter((f) => /skills\/.*SKILL\.md$/.test(f)).length;

for (const p of PLUGINS) {
  test(`${p.label}: loadPlugin parses the real shipped layout`, () => {
    const loaded = loadPlugin(join(__dirname, VENDOR, p.dir));

    // 1. a real surface loaded — never a silent empty machine
    assert.ok(
      loaded.settings.hooks || Object.keys(loaded.files).length > 0,
      "expected hooks or files to load",
    );
    assert.ok(
      !hasWarning(loaded.warnings, "nothing was loaded"),
      "should not be an empty machine",
    );

    // 2. hooks presence matches, and ${CLAUDE_PLUGIN_ROOT} fully resolved
    assert.equal(Boolean(loaded.settings.hooks), p.expectHooks);
    assert.ok(
      !JSON.stringify(loaded.settings).includes("CLAUDE_PLUGIN_ROOT"),
      "no unresolved ${CLAUDE_PLUGIN_ROOT}",
    );

    // 3. skills materialized into the sandbox
    assert.ok(
      skillCount(loaded.files) >= p.minSkills,
      `expected ≥ ${String(p.minSkills)} skill(s)`,
    );

    // 4. surface warnings are accurate (agents/commands belong to the eval tier)
    assert.equal(hasWarning(loaded.warnings, "subagent file"), p.expectAgents);
    assert.equal(
      hasWarning(loaded.warnings, "slash-command file"),
      p.expectCommands,
    );

    // 5. dangling-ref detector is accurate: exactly the known set, nothing spurious
    assert.equal(danglingCount(loaded.warnings), p.knownDangling.length);
    for (const ref of p.knownDangling) {
      assert.ok(hasWarning(loaded.warnings, ref), `should flag ${ref}`);
    }
  });
}
