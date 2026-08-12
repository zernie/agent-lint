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

// TRUE-POSITIVE — the bug fixture (MIT; see test/dogfood/README.md) reproduces THREE
// real defects: tool-contract, frontmatter-valid, AND a hard lethal-trifecta.
test("true-positive: madappgang-frontend tester reproduces AskUserQuestion + malformed YAML + lethal-trifecta", () => {
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

  // The tester's tools grant all three legs (Read/Bash = private, WebFetch/WebSearch
  // = untrusted, Bash/WebFetch = exfil) — a real, hard lethal-trifecta in the wild.
  const trifecta = r.trifectaFindings.find((t) => t.name === "tester");
  assert.ok(
    trifecta && trifecta.finding.severity === "hard",
    "tester's tool set must fire a HARD lethal-trifecta (a real exfil path)",
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

// FP-GUARD (real corpus) — the two 2026-08-12 corrections, each checked on the
// wild plugins rather than on a fixture written to pass.
//
// 1. FOREIGN-RUNNER TESTS. The rule used to accuse any `*.test.*` file living
//    under a surface dir and tell its author to rename it. Measured on the
//    author's own repo, that hit an offline test of a pure reducer
//    (`skills/verify-citations/scripts/verify-cites.test.mjs`) — a working test
//    the advice would have dropped out of vitest's run. Nothing in these vendored
//    plugins drives an agent, so the warning must be absent here.
// 2. EMPTY FENCE. `disallowed-tools: []` now reports as `"ineffective"` instead of
//    `"none"`. No real plugin here writes that, so the aggregate must not move —
//    a change to how one state is ROUTED must not silently re-bucket the corpus.
for (const prefix of [
  "oh-my-claudecode",
  "wshobson-accessibility",
  "superpowers",
  "madappgang-frontend",
  "davila7-perf-guard",
]) {
  test(`FP-guard: no foreign-runner or empty-fence finding on ${prefix}`, () => {
    const r = scanPlugin(vendored(prefix));
    assert.deepEqual(
      r.warnings.filter((w) => w.includes("COLLECTS AND EXECUTES")),
      [],
      `${prefix} must not be told to rename a file it does not run a model from`,
    );
    assert.deepEqual(
      r.trifectaFindings.filter(
        (t) =>
          t.kind === "skill" && /declared but EMPTY/.test(t.finding.message),
      ),
      [],
      `${prefix} declares no empty fence, so the new branch must stay silent`,
    );
  });
}
