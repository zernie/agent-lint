import type { AuditReport } from "@/schema";

/** Dev/fallback fixture — shown by `npm run dev` and if the CLI hasn't injected data. */
export const SAMPLE: AuditReport = {
  meta: {
    schemaVersion: 1,
    tool: "vigiles",
    kind: "audit",
    vigilesVersion: "0.0.0",
    harness: "claude-code",
    dir: "my-plugin",
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
        key: "Safety",
        score: 80,
        weight: 1,
        findings: [
          "1 unit(s) holding all three lethal-trifecta legs (prompt-injection exfil path)",
        ],
      },
      {
        key: "Tested",
        score: 88,
        weight: 1,
        findings: ["4 untested surface(s)"],
      },
    ],
  },
  verdict: {
    sentence: "Two one-line fixes away from a B.",
    grade: "C",
    pointsToNextGrade: 3,
    fixesToNextGrade: 2,
    perRecommendation: [
      { index: 0, pointsIfFixed: 4 },
      { index: 1, pointsIfFixed: 2 },
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
  rulesInventory: [
    {
      intent: "strict equality ===",
      linter: "eslint",
      matched: "eqeqeq",
      rule: "eqeqeq",
      configState: "contradiction",
      configFix: '"eqeqeq": "error"',
    },
    {
      intent: "no console.log / use the logger",
      linter: "eslint",
      matched: "console.log",
      rule: "no-console",
      configState: "not-in-config",
      configFix: '"no-console": "error"',
    },
    {
      intent: "no debugger",
      linter: "eslint",
      matched: "no-debugger",
      rule: "no-debugger",
      configState: "not-in-config",
      configFix: '"no-debugger": "error"',
    },
    {
      intent: "no `any` type",
      linter: "eslint",
      matched: "no-explicit-any",
      rule: "@typescript-eslint/no-explicit-any",
      configState: "in-config",
      configFix: '"@typescript-eslint/no-explicit-any": "error"',
    },
    {
      intent: "no floating promises",
      linter: "eslint",
      matched: "no-floating-promises",
      rule: "@typescript-eslint/no-floating-promises",
      configState: "preset-maybe",
      configFix: '"@typescript-eslint/no-floating-promises": "error"',
    },
  ],
};
