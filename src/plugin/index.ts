import type { ESLint } from "eslint";

/**
 * ESLint plugin shell for agent-lint.
 *
 * This plugin ships with no built-in rules. Use the /pr-to-lint-rule Claude
 * Code skill to generate project-specific rules and register them here.
 */
export const plugin: ESLint.Plugin = {
  meta: {
    name: "eslint-plugin-agent-lint",
    version: "0.1.0",
  },
  rules: {},
};
