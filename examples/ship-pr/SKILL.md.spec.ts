/**
 * Example: a gated skill pipeline (the new model).
 *
 * Typed inputs compile to argument-hint; each step carries a deterministic
 * gate the harness can run; the result gate is the skill's "done" condition.
 * Every gate reference is verified against the project at compile time.
 *
 * Run `vigiles compile` to generate SKILL.md from this spec.
 */
// The prefix is written out at every call site, deliberately. An earlier version
// of this file aliased it at the import — and this file is the one where that was
// measured: the marker survived at 0 of 5 call sites, because a reader of the body
// sees `skill(...)` and cannot tell it is provisional.
import { experimental_skill, cmd } from "../../src/core/spec.js";

export default experimental_skill({
  name: "ship-pr",
  description: "Run the project checks and open a pull request once they pass",

  inputs: [
    experimental_skill.input("branch", "the branch to open the PR from"),
    experimental_skill.input("title", "PR title", { required: false }),
  ],

  steps: [
    experimental_skill.step("Run the linter and fix any issues it reports.", {
      gate: cmd("npm run lint"),
    }),
    experimental_skill.step(
      "Run the test suite. Fix failures and re-run until it is green.",
      {
        gate: cmd("npm test"),
        retry: 3,
      },
    ),
    experimental_skill.step(
      "Open the pull request from `$1` with title `$2` (if provided).",
    ),
  ],

  // The skill is not "done" until the test suite passes.
  postcondition: cmd("npm test"),
});
