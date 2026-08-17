/**
 * Vocabulary + consistency suite (vitest).
 *
 * These pin the two properties that make the vocabulary bugs unrepeatable
 * rather than merely fixed:
 *
 *  1. `classify` is TOTAL — there is no absent answer to interpret, so a caller
 *     cannot fall through to silence on a name the catalog doesn't hold.
 *  2. A dialect that contradicts itself FAILS, loudly, in the conformance kit
 *     every adapter runs. `Agent` in both `builtinAgentTools` and
 *     `neverAvailableTools` shipped for months because nothing compared them.
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  classify,
  suggest,
  termIssue,
  scoredIssues,
  vocabularyFromLists,
  type HarnessVocabulary,
} from "./vocabulary.js";
import {
  dialectVocabularyProblems,
  vocabularyProjectionProblems,
} from "./vocabulary-consistency.js";
import { claudeCodeDialect } from "../adapters/claude-code/dialect.js";
import { editDistance } from "./edit-distance.js";
import { claudeCodeSubagentToolVocabulary } from "../adapters/claude-code/vocabulary.js";

/** `termIssue` for a case that must produce one — fails the test if it doesn't. */
function issueFor(
  v: HarnessVocabulary,
  name: string,
  noun = "Term",
  dead = "it is dead",
): NonNullable<ReturnType<typeof termIssue>> {
  const issue = termIssue(v, classify(v, name), noun, dead);
  assert.ok(issue, `expected an issue for "${name}"`);
  return issue;
}

const vocab: HarnessVocabulary = {
  kind: "test term",
  capturedFrom: "a fixture",
  terms: [
    { name: "Fine", status: "available" },
    { name: "Dead", status: "withheld" },
    { name: "Sometimes", status: "conditional", condition: "on Tuesdays" },
    {
      name: "Old",
      status: "conditional",
      condition: "on Tuesdays",
      aliasOf: "Sometimes",
    },
  ],
};

// --- classify is total -----------------------------------------------------

test("classify answers for a name it has never seen", () => {
  assert.deepEqual(classify(vocab, "Unheard"), {
    kind: "unrecognised",
    name: "Unheard",
  });
});

test("classify returns each declared status", () => {
  assert.equal(classify(vocab, "Fine").kind, "available");
  assert.equal(classify(vocab, "Dead").kind, "withheld");
  assert.equal(classify(vocab, "Sometimes").kind, "conditional");
});

test("only an available term is silent; the other three all say something", () => {
  const say = (n: string): boolean =>
    termIssue(vocab, classify(vocab, n), "Term", "it is dead") !== null;
  assert.equal(say("Fine"), false);
  assert.equal(say("Dead"), true);
  assert.equal(say("Sometimes"), true);
  assert.equal(say("Unheard"), true);
});

test("only withheld is scored — the other two are advisory", () => {
  const issues = ["Dead", "Sometimes", "Unheard"].map((n) =>
    issueFor(vocab, n),
  );
  assert.deepEqual(
    scoredIssues(issues).map((i) => i.severity),
    ["scored"],
  );
});

test("an unrecognised message prints the capture, so our staleness is visible", () => {
  const issue = issueFor(vocab, "Unheard");
  assert.match(issue.message, /a fixture/);
  assert.match(issue.message, /vigiles is out of date — not your config/);
});

// --- the measured typo threshold -------------------------------------------

test("no two real names in either shipped vocabulary are 1 edit apart", () => {
  // This is the measurement TYPO_MAX rests on, kept as a test so a future
  // catalog entry that lands 1 edit from an existing name fails HERE — loudly,
  // in our own suite — rather than by silently scoring someone's valid config
  // as a typo. 0 of 465 event pairs and 0 of 741 tool pairs today.
  const collisionsIn = (names: readonly string[]): string[] => {
    const out: string[] = [];
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++)
        if (editDistance(names[i].toLowerCase(), names[j].toLowerCase()) <= 1)
          out.push(`${names[i]}/${names[j]}`);
    return out;
  };
  assert.deepEqual(collisionsIn(claudeCodeDialect.hookEvents), []);
  assert.deepEqual(
    collisionsIn(claudeCodeSubagentToolVocabulary.terms.map((t) => t.name)),
    [],
  );
});

test("distance 1 is scored as a typo; distance 2 stays advisory", () => {
  const one = issueFor(vocab, "Fin");
  assert.equal(one.severity, "scored");
  assert.equal(one.suggestion, "Fine");

  const two = issueFor(vocab, "Fn");
  assert.equal(two.severity, "advisory");
  assert.equal(two.suggestion, "Fine"); // still hinted, just not accused
});

test("the Setup/Stop collision would NOT be scored under the new threshold", () => {
  // `Setup` is now in the catalog, so this can't recur for that name. The point
  // of this test is the THRESHOLD: at distance 2 — the exact width at which two
  // real names collide — an unknown name is never put in the grade. Pretend the
  // catalog is stale again and confirm the accusation doesn't come back.
  const stale: HarnessVocabulary = {
    kind: "claude-code hook event",
    capturedFrom: "a deliberately stale capture",
    terms: [{ name: "Stop", status: "available" }],
  };
  const issue = issueFor(
    stale,
    "Setup",
    "Hook event",
    "a hook here never fires",
  );
  assert.equal(issue.severity, "advisory");
  assert.match(issue.message, /vigiles is out of date — not your config/);
});

test("suggest never offers a withheld name", () => {
  // `Deed` is 1 from `Dead` (withheld) — offering it swaps one dead ref for another.
  assert.notEqual(suggest(vocab, "Deed"), "Dead");
});

// --- the invariant that was missing ----------------------------------------

test("a tool in BOTH catalogs is a conformance failure", () => {
  const broken = {
    ...claudeCodeDialect,
    builtinAgentTools: ["Read", "Agent"],
    neverAvailableTools: ["Agent"],
    sideEffectingTools: [],
    subagentToolVocabulary: undefined,
  };
  const problems = dialectVocabularyProblems(broken);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /BOTH builtinAgentTools and neverAvailableTools/);
});

test("the shipped Claude Code dialect is self-consistent", () => {
  assert.deepEqual(dialectVocabularyProblems(claudeCodeDialect), []);
});

test("the flat lists really are projections of the vocabulary", () => {
  assert.deepEqual(
    vocabularyProjectionProblems(
      claudeCodeSubagentToolVocabulary,
      claudeCodeDialect.builtinAgentTools,
      claudeCodeDialect.neverAvailableTools,
    ),
    [],
  );
});

test("a projection that drifts from its vocabulary is caught", () => {
  const problems = vocabularyProjectionProblems(vocab, ["Fine"], ["Dead"]);
  // `Sometimes` and `Old` are declarable but absent from the built-in list.
  assert.equal(problems.length, 2);
  for (const p of problems) assert.match(p, /builtinAgentTools is missing/);
});

test("a conditional term with no condition is caught", () => {
  const bad: HarnessVocabulary = {
    kind: "k",
    capturedFrom: "c",
    terms: [{ name: "X", status: "conditional" }],
  };
  const problems = vocabularyProjectionProblems(bad, ["X"], []);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /states no condition/);
});

test("an alias pointing nowhere is caught", () => {
  const bad: HarnessVocabulary = {
    kind: "k",
    capturedFrom: "c",
    terms: [{ name: "X", status: "available", aliasOf: "Ghost" }],
  };
  assert.match(
    vocabularyProjectionProblems(bad, ["X"], [])[0],
    /does not contain/,
  );
});

test("a duplicated term is caught (classify would be order-dependent)", () => {
  const bad: HarnessVocabulary = {
    kind: "k",
    capturedFrom: "c",
    terms: [
      { name: "X", status: "available" },
      { name: "X", status: "withheld" },
    ],
  };
  assert.ok(
    vocabularyProjectionProblems(bad, ["X"], ["X"]).some((p) =>
      /appears more than once/.test(p),
    ),
  );
});

test("a side-effecting tool outside the catalog is caught (unreachable)", () => {
  const problems = dialectVocabularyProblems({
    ...claudeCodeDialect,
    sideEffectingTools: ["Ghost"],
  });
  assert.ok(problems.some((p) => /can never reach it/.test(p)));
});

test("a block-semantics event outside hookEvents is caught", () => {
  const problems = dialectVocabularyProblems({
    ...claudeCodeDialect,
    noEffectHookEvents: ["NoSuchEvent"],
  });
  assert.ok(problems.some((p) => /says never fires/.test(p)));
});

// --- legacy adapters keep working ------------------------------------------

test("a synthesised vocabulary reports unknowns instead of swallowing them", () => {
  const legacy = vocabularyFromLists("x tool", "no capture", ["A"], ["B"]);
  assert.equal(classify(legacy, "A").kind, "available");
  assert.equal(classify(legacy, "B").kind, "withheld");
  assert.equal(classify(legacy, "C").kind, "unrecognised");
});
