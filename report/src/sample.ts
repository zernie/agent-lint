import type { AuditReport } from "@/schema";

/** Dev/fallback fixture — shown by `npm run dev` and if the CLI hasn't injected data. */
export const SAMPLE: AuditReport = {
  meta: {
    schemaVersion: 1,
    tool: "vigiles",
    vigilesVersion: "0.0.0",
    harness: "claude-code",
    dir: "demo",
  },
  score: {
    overall: 77,
    grade: "C",
    empty: false,
    categories: [
      { key: "Truthfulness", score: 100, weight: 1, findings: [] },
      {
        key: "Triggering",
        score: 92,
        weight: 1,
        findings: ["1 near-identical skill description(s) (wrong one fires)"],
      },
      {
        key: "Structure",
        score: 92,
        weight: 1,
        findings: ["1 agent tool(s) that don't exist (typo / never-available)"],
      },
      {
        key: "Tested",
        score: 88,
        weight: 1,
        findings: ["4 untested surface(s)"],
      },
    ],
  },
  recommendations: [
    {
      surface: "reviewer",
      action: "fix",
      rationale:
        'Unknown tool "Reed" — silently dropped, the agent can\'t use it.',
      fix: 'change the tool "Reed" to "Read"',
      detector: "subagent-tool-contract",
      confidence: "likely",
    },
    {
      surface: "deploy ↔ ship",
      action: "differentiate",
      rationale:
        "Near-identical descriptions (0.92 similar) — the selector can't tell them apart.",
      fix: "differentiate the descriptions of deploy and ship",
      detector: "description-overlap",
      confidence: "possible",
    },
  ],
  inventory: {
    skills: 2,
    agents: 1,
    hooks: 1,
    commands: 0,
    mcp: false,
    untested: 4,
  },
  adoptable: {
    createAllCommand: "npx vigiles init",
    surfaces: [
      {
        path: "skills/deploy/SKILL.md",
        command: "npx vigiles init --target=skills/deploy/SKILL.md",
      },
      {
        path: "agents/reviewer.md",
        command: "npx vigiles init --target=agents/reviewer.md",
      },
    ],
  },
  adoptability: {
    total: 5,
    broken: 2,
    brokenRefs: [
      {
        kind: "enforce",
        ref: "@typescript-eslint/no-floating-promises",
        issue: "rule not found in eslint config",
      },
      {
        kind: "file",
        ref: "src/auth/login.ts",
        issue: "file does not exist",
      },
    ],
  },
};
