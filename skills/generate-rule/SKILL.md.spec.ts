/**
 * generate-rule — dogfooding the gated skill pipeline on a real vigiles skill.
 *
 * Typed input → argument-hint; linear steps; the final "compile & verify" step
 * and the result are closed by a deterministic gate the harness can run.
 * `vigiles compile` verifies the gate references at author time.
 */
import { skill, step, input, cmd } from "../../src/spec.js";

export default skill({
  name: "generate-rule",
  description:
    "Add a new enforce(), check(), or guidance() rule to an existing spec file",
  disableModelInvocation: true,

  inputs: [
    input(
      "rule",
      "natural-language description of what the rule should enforce, e.g. \"no console.log in production code\"",
    ),
  ],

  steps: [
    step(`**Find the spec file.** Look for \`CLAUDE.md.spec.ts\` in the repo root. If it doesn't exist:

- If there's a hand-written \`CLAUDE.md\`, suggest running the \`migrate-to-spec\` skill first.
- If there's no \`CLAUDE.md\` either, suggest \`npx vigiles init\` to scaffold one.`),

    step(`**Classify the rule** from the description ($1):

- **enforce()** — if a linter rule can back it. Check the project's linter configs (ESLint, Ruff, Clippy, Pylint, RuboCop, Stylelint) for a matching rule; also consider an architectural tool (ast-grep, Dependency Cruiser, Steiger). If uncertain whether a rule exists, **ask the user** rather than guessing.
- **check()** — if it's a filesystem structural convention ("every X needs a Y"). Only for file-pairing; never for code content.
- **guidance()** — if it can't be mechanically enforced (subjective conventions, process rules, migration context).`),

    step(`**Generate the rule.** Create an entry with a kebab-case ID derived from the description. Examples:

    "no-console": enforce("eslint/no-console", "Use structured logger for observability."),

    "controller-tests": check(
      every("src/**/*.controller.ts").has("{name}.controller.test.ts"),
      "Every controller must have a co-located test file.",
    ),

    "research-before-implementing": guidance(
      "Google unfamiliar APIs before implementing.",
    ),`),

    step(`**Add it to the spec.** Read the existing spec file and add the new rule to the \`rules\` object, preserving alphabetical ordering if the existing rules are alphabetical. Import any new builders needed (e.g. \`check\` and \`every\` for the first \`check()\` rule).`),

    step(
      `**Compile and verify.** Build and recompile; if compilation fails (e.g. the linter rule doesn't exist), report the error and suggest alternatives. Show the user the updated spec and the compiled \`CLAUDE.md\` diff.`,
      { gate: cmd("npm run build"), retry: 2 },
    ),
  ],

  // Done only when the project builds (the new rule compiles cleanly).
  result: cmd("npm run build"),
});
