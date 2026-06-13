/**
 * Ported community skills — proof that the generator form expresses the real,
 * praised "agentic" skills (the deep tail the flat model can't hold), and that
 * they are deterministically testable. Structural ports (not verbatim prose) of:
 *
 *  - devonjones/pr-review-loop — the corpus stress test: a bounded round loop
 *    (7-round ceiling) with a quality-weighted exit, a per-finding for-each, and
 *    a nested bounded CI retry sub-loop.
 *  - test-driven-development (superpowers) — the red→green→refactor cycle.
 *  - subagent-driven-development (superpowers) — per-task for-each with two
 *    nested bounded review loops.
 *
 * These are exercised in community-skills.test.ts with a scripted model.
 */
import {
  act,
  checkpoint,
  finish,
  type SkillProgram,
} from "./adapters/claude-code/skill-driver.js";
import { cmd } from "./core/spec.js";

/** COLLECT → BATCH → FIX rounds; ceiling 7; exit when no actionable feedback. */
export const prReviewLoop: SkillProgram = function* () {
  let round = 0;
  for (;;) {
    round++;
    yield act("Collect all review comments on the PR");
    yield act("Batch findings by file and severity");
    for (;;) {
      const next = yield act("Take the next P1/P2 finding, or say 'done'");
      if (next === "done") break;
      yield act("Fix this finding");
    }
    let attempt = 0;
    let ci = "fail";
    while (attempt < 3 && ci !== "pass") {
      attempt++;
      ci = yield act("Run CI and report 'pass' or 'fail'");
    }
    yield checkpoint(cmd("true")); // CI must be green to continue the round
    const more = yield act(
      "Is there actionable (P1/P2) feedback left? 'yes'/'no'",
    );
    if (more === "no" || round >= 7) break;
  }
  yield finish(cmd("true"));
};

/** Red → Green → Refactor, once per behavior until done. */
export const tdd: SkillProgram = function* () {
  for (;;) {
    const feature = yield act("Pick the next behavior to implement, or 'done'");
    if (feature === "done") break;
    yield act("Write a failing test and watch it fail (RED)");
    yield act("Write the minimum code to pass (GREEN)");
    yield checkpoint(cmd("true")); // tests pass
    yield act("Refactor while keeping tests green");
    yield checkpoint(cmd("true")); // tests still pass
  }
  yield finish(cmd("true"));
};

/** Per task: bounded spec review, implement, bounded quality review, gate. */
export const subagentDriven: SkillProgram = function* () {
  for (;;) {
    const task = yield act("Take the next task from the plan, or 'done'");
    if (task === "done") break;
    let a1 = 0;
    let specOk = "no";
    while (a1 < 3 && specOk !== "yes") {
      a1++;
      specOk = yield act(
        "Dispatch a subagent to review the spec; approved? yes/no",
      );
    }
    yield act("Implement the task");
    let a2 = 0;
    let qualityOk = "no";
    while (a2 < 3 && qualityOk !== "yes") {
      a2++;
      qualityOk = yield act(
        "Dispatch a subagent for quality review; approved? yes/no",
      );
    }
    yield checkpoint(cmd("true"));
  }
  yield finish(cmd("true"));
};
