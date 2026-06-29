/**
 * Plugin-health leaderboard test suite. `scoreReport` is pure over a `ScanReport`
 * so most cases are hand-built structs (fast, no fs); `rankPlugins` is exercised
 * over two tmp fixtures to prove the healthy plugin ranks above the broken one.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  scoreReport,
  rankPlugins,
  formatLeaderboard,
  formatLeaderboardMarkdown,
  reportDeductions,
  computeIntegrityScore,
} from "./leaderboard.js";
import { auditScore } from "./audit-score.js";
import type { ScanReport } from "./scan.js";
import { makeTmpDir, cleanupTmpDir } from "./core/test-utils.js";

function report(over: Partial<ScanReport> = {}): ScanReport {
  return {
    dir: "x",
    instructions: null,
    skills: [],
    agents: [],
    hooks: [],
    inlineHooks: 0,
    manualHookCount: 0,
    commands: 0,
    mcp: false,
    danglingRefs: [],
    hookEventIssues: [],
    frontmatterIssues: [],
    frontmatterValueIssues: [],
    skillMetaIssues: [],
    mcpIssues: [],
    mcpHookIssues: [],
    descriptionOverlaps: [],
    trifectaFindings: [],
    skillResourceIssues: [],
    skillFenceIssues: [],
    pluginLayoutIssues: [],
    delegationTrifecta: [],
    hookBlockFindings: [],
    hookMatcherFindings: [],
    malformedFrontmatter: [],
    warnings: [],
    untested: 0,
    puritySummary: { pure: 0, bounded: 0, unrestricted: 0 },
    ...over,
  };
}

test("a structurally clean plugin scores 100", () => {
  const r = report({
    skills: [
      {
        name: "s",
        path: "p",
        hasDescription: true,
        userInvoked: false,
        descriptionScript: null,
        resourceIssues: [],
        trifecta: null,
        fenceIssue: null,
      },
    ],
    hooks: [{ command: "bash h.sh", script: "h.sh", status: "ok" }],
  });
  const { score, issues } = scoreReport(r);
  assert.equal(score, 100);
  assert.equal(issues.length, 0);
});

test("penalties: missing hook -15, no-desc -10; inherit-all + untested advisory (not scored)", () => {
  assert.equal(
    scoreReport(
      report({
        hooks: [{ command: "bash h", script: "h", status: "missing" }],
      }),
    ).score,
    85,
  );
  assert.equal(
    scoreReport(
      report({
        skills: [
          {
            name: "s",
            path: "p",
            hasDescription: false,
            userInvoked: false,
            descriptionScript: null,
            resourceIssues: [],
            trifecta: null,
            fenceIssue: null,
          },
        ],
      }),
    ).score,
    90,
  );
  // inherit-all (no `tools:` line) is ADVISORY — it does NOT affect the score
  // (omitting the contract is idiomatic, not breakage), but it's still surfaced as
  // an advisory note. See reportDeductions for the rationale.
  const inheritAll = scoreReport(
    report({
      agents: [
        {
          name: "a",
          path: "p",
          tools: null,
          toolIssues: [],
          mcpToolIssues: [],
          disallowedToolIssues: [],
          purity: "unrestricted" as const,
          effectBuckets: { readOnly: [], sideEffecting: [], unknown: [] },
          trifecta: null,
        },
      ],
    }),
  );
  assert.equal(inheritAll.score, 100);
  assert.ok(
    inheritAll.issues.some(
      (i) => i.includes("inherit all tools") && i.includes("advisory"),
    ),
    "inherit-all still surfaced as an advisory note",
  );
  // Untested surfaces are ADVISORY — they do NOT affect the score (a hardening
  // gap is not breakage), but they're still surfaced as an advisory issue.
  const untestedResult = scoreReport(
    report({
      skills: [
        {
          name: "s",
          path: "p",
          hasDescription: true,
          userInvoked: false,
          descriptionScript: null,
          resourceIssues: [],
          trifecta: null,
          fenceIssue: null,
        },
      ],
      untested: 4,
    }),
  );
  assert.equal(untestedResult.score, 100);
  assert.ok(
    untestedResult.issues.some(
      (i) => i.includes("untested") && i.includes("advisory"),
    ),
    "untested surfaces still surfaced as an advisory note",
  );
});

test("penalty: broken intra-plugin reference -8 each", () => {
  const { score, issues } = scoreReport(
    report({
      hooks: [{ command: "bash h.sh", script: "h.sh", status: "ok" }],
      danglingRefs: ["skills/using-x/SKILL.md", "agents/missing.md"],
    }),
  );
  assert.equal(score, 84); // 100 - 2*8
  assert.ok(issues.some((i) => i.includes("broken intra-plugin reference")));
});

test("a HARD lethal-trifecta finding deducts W_TRIFECTA (-20); advisory does not", () => {
  // A hard (explicit all-three) trifecta is a declared exfil path → graded -20.
  const hard = scoreReport(
    report({
      agents: [
        {
          name: "exfil-bot",
          path: "agents/exfil-bot.md",
          tools: ["Bash", "WebFetch"],
          toolIssues: [],
          mcpToolIssues: [],
          disallowedToolIssues: [],
          purity: "unrestricted" as const,
          effectBuckets: { readOnly: [], sideEffecting: [], unknown: [] },
          trifecta: { severity: "hard" },
        },
      ] as unknown as ScanReport["agents"],
      trifectaFindings: [
        {
          path: "agents/exfil-bot.md",
          kind: "subagent",
          name: "exfil-bot",
          finding: { severity: "hard" },
        },
      ] as unknown as ScanReport["trifectaFindings"],
    }),
  );
  assert.equal(hard.score, 80); // 100 - 20
  assert.ok(hard.issues.some((i) => i.includes("lethal-trifecta")));

  // An advisory (inherits-all) trifecta is NOT graded — it's surfaced elsewhere
  // (the Safety ring) as an advisory, never a leaderboard penalty.
  const advisory = scoreReport(
    report({
      agents: [
        {
          name: "broad",
          path: "agents/broad.md",
          tools: null,
          toolIssues: [],
          mcpToolIssues: [],
          disallowedToolIssues: [],
          purity: "unrestricted" as const,
          effectBuckets: { readOnly: [], sideEffecting: [], unknown: [] },
          trifecta: { severity: "advisory" },
        },
      ] as unknown as ScanReport["agents"],
      trifectaFindings: [
        {
          path: "agents/broad.md",
          kind: "subagent",
          name: "broad",
          finding: { severity: "advisory" },
        },
      ] as unknown as ScanReport["trifectaFindings"],
    }),
  );
  assert.equal(advisory.score, 100); // inherits-all advisory not graded
});

test("the audit overall == leaderboard health, even with a HARD trifecta", () => {
  // The invariant: both surfaces read the SAME shared computeIntegrityScore over
  // reportDeductions — Safety being a graded ring must not break that.
  const r = report({
    commands: 1, // a surface (so neither is the empty machine)
    agents: [
      {
        name: "exfil-bot",
        path: "agents/exfil-bot.md",
        tools: ["Bash", "WebFetch"],
        toolIssues: [],
        mcpToolIssues: [],
        disallowedToolIssues: [],
        purity: "unrestricted" as const,
        effectBuckets: { readOnly: [], sideEffecting: [], unknown: [] },
        trifecta: { severity: "hard" },
      },
    ] as unknown as ScanReport["agents"],
    trifectaFindings: [
      {
        path: "agents/exfil-bot.md",
        kind: "subagent",
        name: "exfil-bot",
        finding: { severity: "hard" },
      },
    ] as unknown as ScanReport["trifectaFindings"],
    hooks: [{ command: "bash h.sh", script: "h.sh", status: "ok" }],
  });
  const health = computeIntegrityScore(reportDeductions(r)).score;
  const audit = auditScore(r);
  assert.equal(health, 80);
  assert.equal(audit.overall, health); // the two surfaces never disagree
});

test("score clamps at 0 and an empty machine is not healthy", () => {
  const empty = scoreReport(report());
  assert.equal(empty.score, 0);
  assert.deepEqual(empty.issues, ["no loadable plugin surface"]);

  // many missing hooks would go negative without the clamp
  const r = report({
    hooks: Array.from({ length: 10 }, (_, i) => ({
      command: `bash h${String(i)}`,
      script: `h${String(i)}`,
      status: "missing" as const,
    })),
  });
  assert.equal(scoreReport(r).score, 0);
});

test("a command-only or MCP-only plugin is a real surface, not score 0", () => {
  // commands/*.md with no skills/agents/hooks — Anthropic ships these.
  const cmdOnly = scoreReport(report({ commands: 3 }));
  assert.equal(cmdOnly.score, 100);
  assert.deepEqual(cmdOnly.issues, []);

  // an MCP-only plugin (.mcp.json, no other surface) is loadable too.
  const mcpOnly = scoreReport(report({ mcp: true }));
  assert.equal(mcpOnly.score, 100);
  assert.deepEqual(mcpOnly.issues, []);

  // truly empty (no surface at all) is still 0.
  assert.equal(scoreReport(report()).score, 0);
});

test("rankPlugins orders healthy above broken, with grades", () => {
  const dir = makeTmpDir("lb");
  const mk = (sub: string, files: Record<string, string>) => {
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(dir, sub, rel);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, content);
    }
    return join(dir, sub);
  };

  const healthy = mk("healthy", {
    "skills/ok/SKILL.md":
      "---\nname: ok\ndescription: A healthy skill with a usable long description\n---\n#ok\n",
  });
  const broken = mk("broken", {
    "skills/bad/SKILL.md": "---\nname: bad\n---\n#bad\n", // no description
    ".claude-plugin/plugin.json": JSON.stringify({
      name: "broken",
      hooks: {
        PreToolUse: [
          {
            matcher: "Edit",
            hooks: [
              {
                type: "command",
                command: "bash ${CLAUDE_PLUGIN_ROOT}/hooks/gone.sh",
              },
            ],
          },
        ],
      },
    }),
  });

  const ranked = rankPlugins([broken, healthy]);
  assert.equal(ranked[0].name, "healthy");
  assert.equal(ranked[0].grade, "A");
  assert.ok(ranked[0].score > ranked[1].score);
  assert.equal(ranked[1].name, "broken");
  cleanupTmpDir(dir);
});

test("formatLeaderboard renders ranks, grades, and reasons", () => {
  const scores = rankPlugins([]); // empty is fine for the header path
  assert.ok(formatLeaderboard(scores).includes("Plugin health leaderboard (0"));

  const text = formatLeaderboard([
    {
      dir: "d",
      name: "demo",
      score: 70,
      grade: "C",
      issues: ["2 untested surface(s)"],
      report: report(),
    },
  ]);
  assert.ok(text.includes("demo"));
  assert.ok(text.includes("C"));
  assert.ok(text.includes("2 untested surface(s)"));
});

test("formatLeaderboardMarkdown renders a publishable table", () => {
  const md = formatLeaderboardMarkdown([
    {
      dir: "d",
      name: "demo",
      score: 70,
      grade: "C",
      issues: ["2 untested surface(s)", "1 broken intra-plugin reference(s)"],
      report: report(),
    },
    {
      dir: "e",
      name: "clean-one",
      score: 100,
      grade: "A",
      issues: [],
      report: report(),
    },
  ]);
  assert.match(md, /\| # \| grade \| score \| plugin \| top issues \|/);
  assert.match(md, /\| 1 \| C \| 70 \| `demo` \| 2 untested surface\(s\);/);
  assert.match(md, /`clean-one` \| — clean \|/); // no issues → clean
  assert.match(md, /Structural health only/);
});

test("rankPlugins labels a plugin by its manifest name, not the dir basename", () => {
  const dir = makeTmpDir("lb-name");
  const sub = join(dir, "plugin@abc123"); // a SHA-pinned dir basename
  mkdirSync(join(sub, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(sub, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "cool-plugin" }),
  );
  mkdirSync(join(sub, "skills", "ok"), { recursive: true });
  writeFileSync(
    join(sub, "skills", "ok", "SKILL.md"),
    "---\nname: ok\ndescription: A healthy skill with a usable long description\n---\n#ok\n",
  );
  const ranked = rankPlugins([sub]);
  assert.equal(ranked[0].name, "cool-plugin"); // not "plugin@abc123"
  cleanupTmpDir(dir);
});
