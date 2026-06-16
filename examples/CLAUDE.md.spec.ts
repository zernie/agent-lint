/**
 * Example: CLAUDE.md specification for the vigiles project itself.
 *
 * This is the source of truth. CLAUDE.md is a compiled build artifact.
 * Run `vigiles compile` to generate CLAUDE.md from this spec.
 */
import { claude, guidance } from "../src/core/spec.js";

export default claude({
  sections: {
    positioning: `vigiles compiles \`.spec.ts\` files to instruction files (CLAUDE.md, AGENTS.md, or any markdown target). The spec is the source of truth. The markdown is a build artifact.

The linter cross-referencing engine is the core moat: \`enforce("@typescript-eslint/no-floating-promises")\` verifies the rule exists AND is enabled in your linter config. Same across 7 catalogs — ESLint, Stylelint, Ruff, Clippy, Pylint, RuboCop, and Cedar.

\`generate-types\` is the second moat: scans all 7 catalog APIs, package.json, and project files to emit a \`.d.ts\` with type unions. The TS compiler then PROVES references are valid at authoring time — typos become type errors, not runtime surprises.`,

    architecture: `Three rule kinds in specs: \`enforce()\` (delegated to an external linter — vigiles verifies the rule exists and is enabled), \`guard()\` (a path→command guard, e.g. recompile when a spec changes), and \`guidance()\` (prose only).

Core modules: \`src/spec.ts\` (types + builders), \`src/compile.ts\` (compiler), \`src/linters.ts\` (7-catalog cross-referencing engine), \`src/generate-types.ts\` (type generator).`,
  },

  keyFiles: {
    "src/spec.ts": "Type system and builder functions",
    "src/compile.ts": "Compiler: spec → markdown with SHA-256 hash",
    "src/linters.ts": "Cross-referencing engine (7 catalogs incl. Cedar)",
    "src/generate-types.ts": "Type generator: project state → .d.ts",
    "src/cli.ts": "CLI: init, compile, lint, test, eval, generate-types",
  },

  commands: {
    "npm run build": "Compile TypeScript to dist/",
    "npm test": "Build and run all tests",
    "npm run fmt": "Format with prettier",
    "npm run fmt:check": "Check formatting",
  },

  rules: {
    "zero-config-by-default": guidance(
      "vigiles compile should work with just a .spec.ts file. Config exists only for overrides (maxRules, maxTokens).",
    ),

    "never-skip-tests": guidance(
      "All tests must pass. If a test requires a CLI tool (pylint, rubocop, ruff, clippy), install the tool, don't skip the test.",
    ),

    "dont-reimplement-linters": guidance(
      "Architectural linting belongs in ast-grep/Dependency Cruiser/Steiger. Per-file code rules belong in ESLint/Ruff/Clippy. vigiles owns: compilation, linter cross-referencing, type generation, and stale reference detection.",
    ),

    "format-before-commit": guidance(
      "Run `npm run fmt:check` before committing. Inline code spans in markdown need surrounding spaces to render correctly.",
    ),

    "no-session-links": guidance(
      "This is a public repo. Claude Code session URLs are private and must not appear in commits or PRs.",
    ),

    // Example: an enforce() rule delegates to a real linter — vigiles verifies
    // the rule exists AND is enabled at compile time. (Commented out because
    // this is a demo spec, not the project's actual spec — see the root
    // CLAUDE.md.spec.ts for the full set, including guard() rules.)
    // "no-floating-promises": enforce(
    //   "@typescript-eslint/no-floating-promises",
    //   "Always await or return promises; unhandled rejections crash the process.",
    // ),
  },
});
