/**
 * Canonical example — a skill-outcome *eval* (`runEval`).
 *
 * The eval tier is the empirical half of harness testing: it drives the *real*
 * model N trials per arm and measures whether a harness change actually moves
 * agent behaviour. Here the change is a skill's guidance, and the question is
 * the one you ask of any of the ~156 wshobson `SKILL.md`s — *does the skill
 * produce the right outcome?*
 *
 *   - arm `no_skill`  — no guidance present
 *   - arm `with_skill`— a SKILL.md the task tells the agent to read
 *
 * Metric `followed`: did the commit message the agent wrote use a Conventional
 * Commits prefix (the skill's rule)? Expect ~0 without the skill, higher with.
 *
 *   npx vigiles eval --trials=6 examples/harness/skill-outcome.eval.mjs
 *   node examples/harness/skill-outcome.eval.mjs 6      # standalone
 *
 * Real model → real cost. Needs the `claude` CLI + model auth and a built
 * dist/. External users import from the package: `from "vigiles/eval"`.
 *
 * Note: a SKILL.md in the working dir is not auto-loaded the way an installed
 * plugin skill is — so the arm difference is delivered by telling the agent to
 * read it. In a production setup the arm would toggle plugin installation.
 */
import { runEval, formatEvalReport } from "../../dist/eval.js";

const trials = Number(process.env.VIGILES_TRIALS || process.argv[2] || 3);

const SKILL = `# commit-message

When you write a commit message, ALWAYS start the subject line with a
Conventional Commits type and colon: \`feat:\`, \`fix:\`, \`chore:\`, \`docs:\`,
\`refactor:\`, or \`test:\`. Example: \`feat: add logout button\`.
`;

const report = await runEval({
  name: "skill-outcome: does the commit-message skill change the output?",
  fixture: {
    "package.json": JSON.stringify({ name: "app", private: true }),
  },
  arms: {
    no_skill: {},
    with_skill: { files: { "SKILL.md": SKILL } },
  },
  task:
    "Read SKILL.md if it exists and follow it. Write a one-line commit message " +
    "for a change that adds a logout button, into the file COMMIT_MSG. Then stop.",
  measure: (ctx) => {
    const msg = (ctx.file("COMMIT_MSG") ?? "").trim();
    const followed = /^(feat|fix|chore|docs|refactor|test)(\(|:)/.test(msg);
    return { followed };
  },
  trials,
  model: "haiku",
});

console.log(formatEvalReport(report));
