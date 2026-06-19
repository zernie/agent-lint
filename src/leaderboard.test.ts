/**
 * Plugin-health leaderboard test suite. `scoreReport` is pure over a `ScanReport`
 * so most cases are hand-built structs (fast, no fs); `rankPlugins` is exercised
 * over two tmp fixtures to prove the healthy plugin ranks above the broken one.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { scoreReport, rankPlugins, formatLeaderboard } from "./leaderboard.js";
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
    malformedFrontmatter: [],
    warnings: [],
    untested: 0,
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
      },
    ],
    hooks: [{ script: "h.sh", status: "ok" }],
  });
  const { score, issues } = scoreReport(r);
  assert.equal(score, 100);
  assert.equal(issues.length, 0);
});

test("penalties: missing hook -15, no-desc -10, no-contract -5, untested -3", () => {
  assert.equal(
    scoreReport(report({ hooks: [{ script: "h", status: "missing" }] })).score,
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
          },
        ],
      }),
    ).score,
    90,
  );
  assert.equal(
    scoreReport(
      report({
        agents: [
          {
            name: "a",
            path: "p",
            tools: null,
            toolIssues: [],
            mcpToolIssues: [],
            disallowedToolIssues: [],
          },
        ],
      }),
    ).score,
    95,
  );
  assert.equal(
    scoreReport(
      report({
        skills: [
          {
            name: "s",
            path: "p",
            hasDescription: true,
            userInvoked: false,
            descriptionScript: null,
          },
        ],
        untested: 4,
      }),
    ).score,
    88,
  );
});

test("penalty: broken intra-plugin reference -8 each", () => {
  const { score, issues } = scoreReport(
    report({
      hooks: [{ script: "h.sh", status: "ok" }],
      danglingRefs: ["skills/using-x/SKILL.md", "agents/missing.md"],
    }),
  );
  assert.equal(score, 84); // 100 - 2*8
  assert.ok(issues.some((i) => i.includes("broken intra-plugin reference")));
});

test("score clamps at 0 and an empty machine is not healthy", () => {
  const empty = scoreReport(report());
  assert.equal(empty.score, 0);
  assert.deepEqual(empty.issues, ["no loadable plugin surface"]);

  // many missing hooks would go negative without the clamp
  const r = report({
    hooks: Array.from({ length: 10 }, (_, i) => ({
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
