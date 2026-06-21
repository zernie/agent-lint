#!/usr/bin/env node
/**
 * M4 — graded + writer monads at RUNTIME (the resurrection of the F9-killed type form).
 *
 * F9 (typed-spec-frontier.md) KILLED a graded token budget AS A TYPE: TS2589 blows
 * up past ~2k. The founder's round-2 question: is a RUNTIME graded interpretation of
 * cost/capability/escalation worth it, and a WRITER monad for an effect audit trail?
 *
 * This file proves both shapes deterministically (no model):
 *  (A) GRADED interpretation — a monoid-accumulating interpreter that runs the
 *      contract's effects while folding a GRADE (a capability/escalation level, or a
 *      cost), and a gate that DENIES when the accumulated grade crosses a declared
 *      ceiling MID-SEQUENCE. The grade is a lattice/monoid (the graded-monad index),
 *      computed at runtime where the type couldn't.
 *  (B) WRITER monad — every effect decision appends to an immutable LOG (the writer's
 *      second channel). The result is an inspectable audit trail of exactly which
 *      effects fired, were discharged, or were denied — replayable, diffable.
 *
 * The honest verdict (in the doc): the GRADE is just an accumulator — vigiles's eval
 * tier ALREADY meters cost/latency/tokens with maxCostUsd. The genuinely new bit is
 * the writer-monad AUDIT TRAIL keyed to the EFFECT ROW (M1) — a per-run, per-leg
 * receipt — and an ESCALATION grade (privilege monotonically rises, never silently
 * resets) that the flat cost meter doesn't model. Exits 0 iff asserts pass.
 */
import assert from "node:assert/strict";

// --- (A) the escalation GRADE: a join-semilattice (monoid under `max`) ---------
//
// Capability levels form a total order; the grade of a SEQUENCE of effects is the
// JOIN (max) — privilege only rises. This is the graded-monad index computed at
// runtime. A declared ceiling denies the step that would cross it.

const LEVEL = { observe: 0, mutate: 1, exec: 2, escalate: 3 };
const LEG_LEVEL = {
  "fs-read": "observe",
  net: "observe",
  "fs-write": "mutate",
  exec: "exec",
  spawn: "escalate",
};

/** join two grades — the monoid `max` (privilege is monotone non-decreasing). */
function join(a, b) {
  return LEVEL[a] >= LEVEL[b] ? a : b;
}

// --- (B) the WRITER: an interpreter returning (value, log) — the audit trail ----
//
// runGraded folds the effect sequence, JOINs the grade, appends a receipt per
// effect to the writer log, and DENIES the first effect that would push the grade
// above `ceiling`. The log is the inspectable artifact.

function runGraded(effects, ceiling) {
  let grade = "observe"; // monoid identity (bottom of the lattice)
  const log = []; // the writer channel (immutable receipts)
  for (const leg of effects) {
    const level = LEG_LEVEL[leg] ?? "escalate";
    const next = join(grade, level);
    if (LEVEL[next] > LEVEL[ceiling]) {
      log.push({
        leg,
        level,
        grade,
        decision: "DENY",
        reason: `would escalate ${grade}→${next} past ceiling ${ceiling}`,
      });
      return { ok: false, grade, log, deniedAt: leg };
    }
    grade = next;
    log.push({ leg, level, grade, decision: "allow" });
  }
  return { ok: true, grade, log, deniedAt: null };
}

console.log("=== M4: graded + writer interpretation at runtime ===\n");

// 1. a bounded sequence under a "mutate" ceiling: read → write is fine; the grade
//    rises observe→mutate and stops. Writer log records each step.
{
  const r = runGraded(["fs-read", "fs-write"], "mutate");
  assert.equal(r.ok, true);
  assert.equal(r.grade, "mutate");
  assert.equal(r.log.length, 2);
  assert.deepEqual(
    r.log.map((e) => e.decision),
    ["allow", "allow"],
  );
  console.log(
    `[ok] read→write under ceiling=mutate: grade rose to "${r.grade}", 2 receipts logged`,
  );
}

// 2. THE GRADED DENY: same ceiling, but an exec effect mid-sequence would push the
//    grade past "mutate" — DENIED AT THAT STEP, and the writer log shows exactly
//    where + why. A flat per-tool gate can't express "the SEQUENCE crossed a line."
{
  const r = runGraded(["fs-read", "fs-write", "exec"], "mutate");
  assert.equal(r.ok, false);
  assert.equal(r.deniedAt, "exec");
  const denied = r.log.at(-1);
  assert.equal(denied.decision, "DENY");
  assert.match(denied.reason, /escalate mutate→exec past ceiling mutate/);
  console.log(
    `[ok] graded DENY: exec crossed the "mutate" ceiling at the live step — ${denied.reason}`,
  );
}

// 3. MONOTONICITY — the grade never decreases across the sequence (the lattice
//    invariant). Proven over the log: each receipt's grade >= the previous.
{
  const r = runGraded(["fs-read", "net", "fs-write", "fs-read"], "exec");
  const grades = r.log.map((e) => LEVEL[e.grade]);
  for (let i = 1; i < grades.length; i++) {
    assert.ok(
      grades[i] >= grades[i - 1],
      "grade must be monotone non-decreasing",
    );
  }
  // note: the trailing fs-read did NOT reset the grade from mutate back to observe.
  assert.equal(r.grade, "mutate");
  console.log(
    `[ok] escalation monotone: grades ${grades.join("≤")} — a late observe does NOT reset privilege`,
  );
}

// 4. the WRITER AUDIT TRAIL is the inspectable, diffable artifact — replay two runs
//    and the logs differ exactly where behaviour differed.
{
  const a = runGraded(["fs-read", "net"], "exec");
  const b = runGraded(["fs-read", "exec"], "exec");
  assert.notDeepEqual(a.log, b.log);
  assert.equal(a.grade, "observe"); // read + net both observe-level
  assert.equal(b.grade, "exec");
  console.log(
    `[ok] writer logs distinguish two runs: A ended "${a.grade}", B ended "${b.grade}" — diffable audit trail`,
  );
}

console.log("\nM4 graded+writer demo: all cases passed.");
console.log(
  "\nHONEST VERDICT: the COST grade duplicates the eval tier's maxCostUsd meter (kill\n" +
    "that framing). What's NEW: the ESCALATION grade (monotone privilege over a\n" +
    "SEQUENCE — 'this run crossed observe→exec', which a per-tool gate can't see) and\n" +
    "the writer AUDIT TRAIL keyed to the effect row. Both are runtime-only (F9's type\n" +
    "form stays dead). Med value — a rider on M1's row, not a headline.",
);
