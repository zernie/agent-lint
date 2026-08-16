/**
 * Example: a gated skill pipeline (the new model).
 *
 * Typed inputs compile to argument-hint; each step carries a deterministic
 * gate the harness can run; the result gate is the skill's "done" condition.
 * Every gate reference is verified against the project at compile time.
 *
 * Run `vigiles compile` to generate SKILL.md from this spec.
 */
// The prefix is what crosses the package boundary; aliasing at the import
// keeps it visible there and keeps the body readable.
import { experimental_skill as skill, cmd } from "../../src/core/spec.js";

export default skill({
  name: "ship-pr",
  description: "Run the project checks and open a pull request once they pass",

  inputs: [
    skill.input("branch", "the branch to open the PR from"),
    skill.input("title", "PR title", { required: false }),
  ],

  steps: [
    skill.step("Run the linter and fix any issues it reports.", {
      gate: cmd("npm run lint"),
    }),
    skill.step(
      "Run the test suite. Fix failures and re-run until it is green.",
      {
        gate: cmd("npm test"),
        retry: 3,
      },
    ),
    skill.step(
      "Open the pull request from `$1` with title `$2` (if provided).",
    ),
  ],

  // The skill is not "done" until the test suite passes.
  result: cmd("npm test"),
});
