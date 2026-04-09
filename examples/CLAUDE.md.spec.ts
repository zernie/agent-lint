/**
 * Example: CLAUDE.md specification for the vigiles project itself.
 *
 * This is the source of truth. CLAUDE.md is a compiled build artifact.
 * Run `vigiles compile` to generate CLAUDE.md from this spec.
 */
import { claude, enforce, guidance, prove, every } from "../src/spec.js";

export default claude({
  sections: {
    positioning: `vigiles — validates that AI instruction files (CLAUDE.md) have enforcement annotations on every rule, and cross-references those annotations against actual linter configurations.

vigiles is a **bridge between instruction files and linter configs** — not a markdown linter, not a file sync tool. The core value: every rule in your CLAUDE.md either points to a real, enabled linter rule, or explicitly declares itself as guidance-only.`,

    architecture: `TypeScript strict-mode codebase (\`src/\`). Core engine in \`src/validate.ts\`. Exports: \`parseClaudeMd\`, \`validate\`, \`readClaudeMd\`, \`validatePaths\`, \`loadConfig\`, \`findInstructionFiles\`, \`validateStructure\`, \`resolveSchema\`, \`STRUCTURE_PRESETS\`, \`RULE_PACKS\`. All types in \`src/types.ts\`.

By default, validates \`CLAUDE.md\` only. Configure \`"files"\` in \`.vigilesrc.json\` to validate additional instruction files.`,
  },

  keyFiles: {
    "src/types.ts": "TypeScript type definitions (interfaces, type aliases)",
    "src/validate.ts":
      "Core validation engine: parsing, config loading, linter checks",
    "src/cli.ts": "CLI entry point: arg parsing, output formatting",
    "src/spec.ts": "Spec system: type definitions, builder functions",
    "src/compile.ts": "Compiler: spec → markdown with hash verification",
    "src/action.ts":
      "GitHub Action wrapper, reads inputs and calls validatePaths",
  },

  commands: {
    "npm run build": "Compile TypeScript to dist/",
    "npm test": "Build and run all tests",
    "npm run fmt": "Format with prettier",
    "npm run fmt:check": "Check formatting",
  },

  rules: {
    "zero-config-by-default": guidance(
      "vigiles should work out of the box with no config file and no CLI flags. Auto-detect linters and rule markers. Config exists only for overrides, not for basic operation.",
    ),

    "never-skip-tests": guidance(
      "All tests must pass, none may be skipped. If a test requires a CLI tool (pylint, rubocop, ruff, clippy), that tool must be installed — not the test skipped.",
    ),

    "format-before-commit": enforce(
      "eslint/no-console",
      "Run `npm run fmt:check` after editing markdown files to catch formatting issues before they reach GitHub.",
    ),

    "no-session-links": guidance(
      "This is a public repo. Claude Code session URLs are private and should not be leaked in commit messages, PR descriptions, or comments.",
    ),

    "test-file-pairing": prove(
      every("src/**/*.ts").has("{name}.test.ts"),
      "Every source module should have a corresponding test file.",
    ),
  },
});
