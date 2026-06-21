/**
 * liveness-checker.mjs — the TEMPORAL/LIVENESS fragment the type tier cannot
 * touch at all. Bounded checks of two liveness-flavoured properties of the
 * agent-runtime window protocol and the railway termination claim.
 *
 *   L1. "No orphaned active-agent state": after a bounded run, the active-agent
 *       slot is clear iff the dispatch/stop events are balanced. Under the FLAT
 *       model a missing SubagentStop (CC has no SubagentStart, only Stop; a
 *       crashed/abandoned child) leaves a STALE active-agent that mis-gates the
 *       PARENT's subsequent tool calls. We check: does there exist a reachable
 *       trace where, after control has returned to the top level (depth 0), the
 *       FLAT slot is still non-null? (a stuck/stale window — a liveness defect.)
 *
 *   L2. Railway bounded-recovery TERMINATION (the sub-Turing claim). The railway
 *       `recover: { max, step }` retries a failing step up to `max` times. The
 *       claim is "bounded recovery ALWAYS terminates". We model the recovery loop
 *       as a counter and check that EVERY path reaches a terminal state within a
 *       bound — i.e. there is no infinite retry cycle. (This is the railway
 *       analogue of a TLA+ liveness/termination check.)
 *
 * Run:  node liveness-checker.mjs   (exits 0)
 */

const json = process.argv.includes("--json");

// ---------------------------------------------------------------------------
// L1 — orphaned / stale active-agent window
// ---------------------------------------------------------------------------
// Events: open (dispatch a subagent), stop (SubagentStop), drop (the child is
// abandoned WITHOUT a Stop — a real possibility: CC has no SubagentStart, the
// window is bracketed only by Task-dispatch + SubagentStop, so a child that
// errors out before Stop fires leaves the slot set). We ask: is there a trace
// returning to top-level (every open balanced by a stop OR a drop) that leaves
// the FLAT slot non-null while ground-truth depth is 0?

function checkL1(bound) {
  const queue = [{ trace: [], flat: null, depth: 0 }];
  let explored = 0;
  let witness = null;
  while (queue.length) {
    const s = queue.shift();
    explored++;
    if (witness) break;
    // A "stale window" = ground truth is back at top level but flat slot still set.
    if (s.depth === 0 && s.flat !== null && s.trace.length > 0) {
      witness = s.trace;
      break;
    }
    if (s.trace.length >= bound) continue;
    // open
    queue.push({
      trace: [...s.trace, "open:writer"],
      flat: "writer",
      depth: s.depth + 1,
    });
    if (s.depth > 0) {
      // stop: clears the single slot (rmSync) — the WHOLE slot, not just this frame
      queue.push({
        trace: [...s.trace, "stop"],
        flat: null,
        depth: s.depth - 1,
      });
      // drop: child abandoned, no Stop fires — slot stays as-is, depth decreases
      queue.push({
        trace: [...s.trace, "drop(no-Stop)"],
        flat: s.flat,
        depth: s.depth - 1,
      });
    }
  }
  return { explored, witness };
}

// ---------------------------------------------------------------------------
// L2 — railway bounded-recovery termination
// ---------------------------------------------------------------------------
// Model: validateRailway guarantees recover.max >= 1. A step either SUCCEEDS
// (terminal: ok) or FAILS. On failure, if retries-left > 0 we retry (retries-1),
// else we go to the onError track (terminal: err). We enumerate ALL outcome
// sequences (success/fail at each attempt) and check EVERY path terminates.
// A path that never reaches a terminal state within (max+2) attempts would be a
// non-termination witness.

function checkL2(max) {
  // every node: (attemptsTaken, retriesLeft). nonterminal until ok/err.
  const queue = [{ trace: [], retriesLeft: max }];
  let explored = 0;
  let maxDepthSeen = 0;
  let nonTerminating = null;
  const HARD_CAP = max + 5; // if any path exceeds this without terminating → bug
  while (queue.length) {
    const s = queue.shift();
    explored++;
    maxDepthSeen = Math.max(maxDepthSeen, s.trace.length);
    if (s.trace.length > HARD_CAP) {
      nonTerminating = s.trace;
      break;
    }
    // outcome SUCCESS → terminal (ok). path ends, no enqueue.
    // outcome FAIL:
    if (s.retriesLeft > 0) {
      queue.push({
        trace: [...s.trace, `fail→retry(${s.retriesLeft - 1} left)`],
        retriesLeft: s.retriesLeft - 1,
      });
    }
    // else: retriesLeft === 0 → onError track → terminal (err). path ends.
    // (the SUCCESS branch and the err branch are both terminal, so we don't enqueue)
  }
  return { explored, maxDepthSeen, nonTerminating };
}

const l1 = checkL1(6);
const l2_3 = checkL2(3);
const l2_100 = checkL2(100);

const result = {
  L1_orphaned_window: {
    property:
      "after returning to top level the FLAT slot is clear (no stale window)",
    holds: !l1.witness,
    witness: l1.witness,
    statesExplored: l1.explored,
  },
  L2_recovery_termination: {
    property: "bounded recovery always terminates (no infinite retry)",
    max3: {
      terminates: !l2_3.nonTerminating,
      longestPath: l2_3.maxDepthSeen,
      statesExplored: l2_3.explored,
    },
    max100: {
      terminates: !l2_100.nonTerminating,
      longestPath: l2_100.maxDepthSeen,
      statesExplored: l2_100.explored,
    },
  },
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("=".repeat(72));
  console.log("LIVENESS / TEMPORAL fragment — what types cannot express");
  console.log("=".repeat(72));

  console.log("\n### L1 — orphaned/stale active-agent window");
  console.log(`states explored: ${l1.explored}`);
  if (l1.witness) {
    console.log("VERDICT: ✗ liveness DEFECT — a stale window is reachable:");
    console.log(`  trace: ${l1.witness.join("  →  ")}`);
    console.log(
      "  control returned to top level but active-agent.json is still set →",
    );
    console.log(
      "  the PARENT's next tool call is gated by a DEAD subagent's contract.",
    );
  } else {
    console.log("VERDICT: ✓ no stale window reachable up to bound");
  }

  console.log("\n### L2 — railway bounded-recovery termination");
  console.log(
    `max=3:   terminates=${!l2_3.nonTerminating}  longest path=${l2_3.maxDepthSeen} attempts`,
  );
  console.log(
    `max=100: terminates=${!l2_100.nonTerminating}  longest path=${l2_100.maxDepthSeen} attempts`,
  );
  if (!l2_3.nonTerminating && !l2_100.nonTerminating) {
    console.log(
      "VERDICT: ✓ termination PROVEN (bounded) — every path reaches ok|err in ≤ max+1",
    );
    console.log(
      "  → the sub-Turing claim holds: recover.max is a hard decreasing measure.",
    );
  }
  console.log();
}

process.exit(0);
