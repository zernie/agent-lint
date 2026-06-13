import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import sonarjs from "eslint-plugin-sonarjs";
import boundaries from "eslint-plugin-boundaries";
import globals from "globals";

// Hexagonal boundary (see research/code-adapter-architecture.md). After the
// reshape the two element types are whole directories: the reference-verification
// DOMAIN lives in src/core/, the Claude Code harness/transport ADAPTER in
// src/adapters/claude-code/. The application/barrel layer (cli, scan, the
// testing/integration/unit barrels, action) stays at src/ root, unclassified —
// it's the composition root, allowed to wire adapter to core. The invariant: the
// domain must never import the adapter, so the core stays harness-agnostic for a
// future src/adapters/<other-harness>. Holds today with zero violations.
const VERIFY_CORE = "src/core/**/*.ts";
const CC_HARNESS = "src/adapters/claude-code/**/*.ts";

export default [
  {
    ignores: ["dist/", "node_modules/", "examples/harness/vendor/"],
  },
  eslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      sonarjs,
    },
    rules: {
      ...tseslint.configs["strict-type-checked"]?.rules,
      // TypeScript handles these better than ESLint
      "no-undef": "off",
      "no-unused-vars": "off",
      // Allow unused vars prefixed with _
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // We use createRequire legitimately for linter detection
      "@typescript-eslint/no-require-imports": "off",
      // Relax some strict rules that are too noisy for this codebase
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      // Ban non-null assertions — use proper narrowing instead
      "@typescript-eslint/no-non-null-assertion": "error",

      // --- Complexity rules ---
      complexity: ["warn", { max: 15 }],
      "max-depth": ["warn", { max: 4 }],
      "max-lines-per-function": [
        "warn",
        { max: 80, skipBlankLines: true, skipComments: true },
      ],
      "max-params": ["warn", { max: 4 }],

      // --- SonarJS ---
      "sonarjs/cognitive-complexity": ["warn", 15],
      "sonarjs/no-duplicate-string": ["warn", { threshold: 4 }],
      "sonarjs/no-identical-functions": "warn",
      "sonarjs/no-duplicated-branches": "warn",
      "sonarjs/no-identical-conditions": "error",
      "sonarjs/no-identical-expressions": "error",
      "sonarjs/no-nested-conditional": "warn",
      "sonarjs/nested-control-flow": ["warn", { maximumNestingLevel: 3 }],
    },
  },
  // Architectural boundary: core ⊄ adapter (eslint-plugin-boundaries).
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    plugins: { boundaries },
    settings: {
      // NodeNext: imports use `.js` specifiers that resolve to `.ts` — the
      // typescript resolver maps them so boundaries can classify each dependency.
      "import/resolver": { typescript: { alwaysTryTypes: true } },
      "boundaries/elements": [
        { type: "cc-harness", mode: "full", pattern: CC_HARNESS },
        { type: "verify-core", mode: "full", pattern: VERIFY_CORE },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          rules: [
            {
              from: { type: "verify-core" },
              disallow: { to: { type: "cc-harness" } },
              message:
                "Hexagonal boundary: the reference-verification domain (${file.type}) must not import the Claude Code harness/transport adapter (${dependency.type}). Keep the core harness-agnostic — depend through a port, or move this module into the application layer. See research/code-adapter-architecture.md.",
            },
          ],
        },
      ],
    },
  },
  // Test files: relax promise, assertion, and complexity rules
  {
    files: ["src/**/*.test.ts"],
    rules: {
      // node:test describe/it return promises that don't need to be awaited
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      // Tests are naturally longer and more repetitive
      "max-lines-per-function": "off",
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/no-identical-functions": "off",
    },
  },
];
