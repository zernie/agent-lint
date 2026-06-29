/**
 * Golden scan-verdict conformance over REAL, SHA-pinned vendored plugins
 * (test/dogfood/*). The complement to vendor.test.ts (loader
 * invariants): this locks the deterministic RULES against reality, offline and
 * model-free, in the free unit tier.
 *
 * Two directions, both grounded in the wild rather than synthetic tmp fixtures:
 *
 * - FP-GUARD: a real, well-formed plugin must stay CLEAN — none of the
 *   high-precision rules may fire on it. This is the regression that catches a
 *   rule going noisy (the whole "don't cry wolf on third-party plugins" bet).
 * - TRUE-POSITIVE: a slice kept BECAUSE it reproduces a real defect must keep
 *   firing the exact rule it's there to lock (see test/dogfood/README.md).
 *
 * Snapshots are pinned by commit SHA → deterministic, no network, no key.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { scanPlugin, type ScanReport } from "./scan.js";

// __dirname is dist/ at runtime; the vendored plugins live at the repo root.
const VENDOR = resolve(__dirname, "..", "test/dogfood");

/** The vendored dir whose name starts with `prefix` (SHA-suffix agnostic). */
function vendored(prefix: string): string {
  const match = readdirSync(VENDOR).find((d) => d.startsWith(prefix));
  assert.ok(match, `no vendored plugin dir starting with "${prefix}"`);
  return resolve(VENDOR, match);
}

/** Every NEW-rule field, flattened — the surfaces the high-precision rules drive. */
function ruleFindings(r: ScanReport): Record<string, number> {
  return {
    toolIssues: r.agents.reduce((n, a) => n + a.toolIssues.length, 0),
    mcpToolIssues: r.agents.reduce((n, a) => n + a.mcpToolIssues.length, 0),
    disallowedToolIssues: r.agents.reduce(
      (n, a) => n + a.disallowedToolIssues.length,
      0,
    ),
    hookEventIssues: r.hookEventIssues.length,
    frontmatterIssues: r.frontmatterIssues.length,
    frontmatterValueIssues: r.frontmatterValueIssues.length,
    mcpIssues: r.mcpIssues.length,
    descriptionOverlaps: r.descriptionOverlaps.length,
    malformedFrontmatter: r.malformedFrontmatter.length,
    skillFenceIssues: r.skillFenceIssues.length,
    pluginLayoutIssues: r.pluginLayoutIssues.length,
    delegationTrifecta: r.delegationTrifecta.length,
    hookBlockFindings: r.hookBlockFindings.length,
    hookMatcherFindings: r.hookMatcherFindings.length,
  };
}

// FP-GUARD — real, well-formed plugins the rules must NOT flag. (superpowers has a
// known dangling ref, but that's the OLD danglingRefs detector, not a new-rule
// field — so the new-rule findings must still all be zero.)
for (const prefix of [
  "oh-my-claudecode",
  "wshobson-accessibility",
  "superpowers",
]) {
  test(`FP-guard: no high-precision rule fires on ${prefix}`, () => {
    const findings = ruleFindings(scanPlugin(vendored(prefix)));
    for (const [rule, n] of Object.entries(findings)) {
      assert.equal(
        n,
        0,
        `${prefix} unexpectedly flagged by ${rule} (${String(n)})`,
      );
    }
  });
}

// TRUE-POSITIVE — the bug fixture (MIT; see test/dogfood/README.md) must keep firing both the
// tool-contract and frontmatter-valid rules it's vendored to lock.
test("true-positive: madappgang-frontend tester reproduces AskUserQuestion + malformed YAML", () => {
  const r = scanPlugin(vendored("madappgang-frontend"));

  const tester = r.agents.find((a) => a.name === "tester");
  assert.ok(tester, "the tester agent should load");
  const askUserQuestion = tester.toolIssues.find(
    (i) => i.tool === "AskUserQuestion",
  );
  assert.ok(
    askUserQuestion && askUserQuestion.kind === "never-available",
    "AskUserQuestion must be flagged never-available to a subagent",
  );

  assert.ok(
    r.malformedFrontmatter.some((m) => m.path.includes("tester.md")),
    "tester.md's one-line description is invalid YAML → frontmatter-valid fires",
  );
});

// FP-GUARD (calibration) — a real MIT hook component (davila7/claude-code-templates)
// whose description says it "blocks deployments" but is a PostToolUse hook that
// `exit 2`s. On PostToolUse, exit 2 FEEDS stderr back to the model (a legitimate
// channel), so the detector must NOT flag it — block-vs-feedback intent isn't
// deterministically separable, and flagging would cry wolf on every nudge/lint
// hook (incl. vigiles's own refs-nudge.sh). See test/dogfood/README.md.
test("calibration: davila7 PostToolUse exit-2 hook is NOT flagged (feedback, not a failed block)", () => {
  const r = scanPlugin(vendored("davila7-perf-guard"));
  assert.deepEqual(
    r.hookBlockFindings,
    [],
    "a PostToolUse exit-2 hook must not fire hook-block-ineffective (it's a feedback channel)",
  );
});
