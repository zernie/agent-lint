/**
 * mini-checker.mjs — a bounded explicit-state model checker, in ~250 lines of
 * plain Node, for the vigiles agent-runtime STATE MACHINE.
 *
 * No TLA+/Alloy/Dafny/Lean is installed in this environment (`which tlc alloy
 * dafny lean` → nothing; only java + node). So this IS the runnable artifact:
 * it does what a model checker does — enumerate ALL reachable states under ALL
 * event interleavings up to a bound, and report a counterexample trace when an
 * invariant breaks.
 *
 * It models the ACTUAL mechanism in
 * src/adapters/claude-code/agent-runtime.ts:
 *
 *   - .vigiles/active-agent.json holds AT MOST ONE active agent (a single file
 *     overwritten by setActiveAgent / removed by clearActiveAgent). This is the
 *     FLAT model the code ships today.
 *   - PreToolUse(Task, subagent_type=X) OPENS a subagent window  → setActiveAgent(X)
 *   - SubagentStop                                              → clearActiveAgent()
 *   - PreToolUse(tool=T) is GATED by the active agent's contract  (decidePreToolUse)
 *
 * Claude Code v2.1.172 added depth-5 NESTED subagents. The code comment in
 * agent-runtime.ts admits the tracking is "flat-only, NOT nesting-safe". This
 * checker turns that prose admission into a concrete, reproducible
 * COUNTEREXAMPLE: a trace under which a forbidden tool call is ALLOWED.
 *
 * Run:  node mini-checker.mjs           (exits 0 — checking succeeded)
 *       node mini-checker.mjs --json    (machine-readable result)
 */

// ---------------------------------------------------------------------------
// The system under test: two competing implementations of active-agent tracking.
// Both consume the SAME event interleavings; we model-check each.
// ---------------------------------------------------------------------------

// Agent contracts (the `tools:` allowlist in the compiled .md). Mirrors what
// parseAgentTools returns. `null` = inherits-all (no restriction).
const CONTRACTS = {
  // a "writer" subagent: may write but never run Bash
  writer: ["Read", "Write", "Edit"],
  // a "reader" subagent: read-only, the tight contract we want to protect
  reader: ["Read", "Grep"],
};

// FLAT model (what ships): a single slot. setActive overwrites; stop clears it
// unconditionally. This is the exact semantics of writeFileSync/rmSync on one path.
function flatModel() {
  return {
    active: null, // string | null
    open(agent) {
      this.active = agent; // overwrite — single file
    },
    stop() {
      this.active = null; // rmSync — clears whatever is there
    },
    contractOf() {
      return this.active === null ? null : CONTRACTS[this.active];
    },
  };
}

// STACK model (the fix the code comment proposes): push on dispatch, pop on stop.
function stackModel() {
  return {
    stack: [],
    open(agent) {
      this.stack.push(agent);
    },
    stop() {
      this.stack.pop();
    },
    contractOf() {
      const top = this.stack[this.stack.length - 1];
      return top === undefined ? null : CONTRACTS[top];
    },
  };
}

// The pure decision from agent-runtime.ts decidePreToolUse, reproduced exactly.
function decidePreToolUse(allowed, tool) {
  if (allowed === null) return { allow: true };
  return { allow: allowed.includes(tool) };
}

// ---------------------------------------------------------------------------
// The INVARIANT we model-check (a SAFETY property over every reachable state):
//
//   "A tool call is allowed ONLY IF it is permitted by the contract of the
//    subagent that is ACTUALLY executing it."
//
// To check this we need a GROUND TRUTH of who is really running. The harness's
// real execution is a properly-nested call stack (a Task spawns a child; the
// child runs to its SubagentStop; control returns to the parent). So ground
// truth IS the stack's top. The flat model is an APPROXIMATION of that stack.
// The invariant is violated when the model under test allows a call that the
// ground-truth (stack) contract forbids.
// ---------------------------------------------------------------------------

// Events: a small alphabet sufficient to express nested dispatch + a tool call.
//   open:writer  open:reader  stop  call:Bash  call:Write
const TOOL_CALLS = ["Bash", "Write"];

function applyEvent(model, groundTruth, ev) {
  if (ev.startsWith("open:")) {
    const agent = ev.slice("open:".length);
    model.open(agent);
    groundTruth.open(agent); // ground truth is always a real stack
    return { kind: "open" };
  }
  if (ev === "stop") {
    model.stop();
    groundTruth.stop();
    return { kind: "stop" };
  }
  if (ev.startsWith("call:")) {
    const tool = ev.slice("call:".length);
    const decModel = decidePreToolUse(model.contractOf(), tool);
    const decTruth = decidePreToolUse(groundTruth.contractOf(), tool);
    return { kind: "call", tool, decModel, decTruth };
  }
  throw new Error("unknown event " + ev);
}

// A state is well-formed for our enumeration if we never `stop` below empty
// (the harness never emits SubagentStop without a matching dispatch) and never
// `call` with no active agent (a tool call always happens inside SOME agent or
// the top-level session — top-level we model as no restriction, so skip).
function legalNext(groundStackDepth, ev) {
  if (ev === "stop") return groundStackDepth > 0;
  if (ev.startsWith("call:")) return groundStackDepth > 0; // call inside a subagent
  return true; // open is always legal up to the depth bound
}

// ---------------------------------------------------------------------------
// Bounded enumeration of ALL interleavings up to TRACE_LEN events and DEPTH_MAX
// nesting. This is the "all interleavings" reasoning the type tier cannot do:
// types check one well-typed program; the model checker checks every order.
// ---------------------------------------------------------------------------

function alphabet() {
  const evs = [];
  for (const a of Object.keys(CONTRACTS)) evs.push("open:" + a);
  evs.push("stop");
  for (const t of TOOL_CALLS) evs.push("call:" + t);
  return evs;
}

function check(makeModel, { traceLen, depthMax }) {
  const EVS = alphabet();
  // BFS (shift from the front) so the FIRST counterexample found is a SHORTEST
  // one — the minimal trace is the clearest evidence.
  const states = []; // queue of (trace, groundStackDepth)
  states.push({ trace: [], depth: 0 });
  let explored = 0;
  let firstCounterexample = null;

  while (states.length > 0) {
    const { trace, depth } = states.shift();
    explored++;

    if (firstCounterexample) break; // stop at the shortest counterexample
    if (trace.length >= traceLen) continue;

    for (const ev of EVS) {
      if (!legalNext(depth, ev)) continue;
      let nextDepth = depth;
      if (ev.startsWith("open:")) {
        if (depth >= depthMax) continue; // depth bound
        nextDepth = depth + 1;
      } else if (ev === "stop") {
        nextDepth = depth - 1;
      }

      const newTrace = [...trace, ev];

      // Replay the whole trace through BOTH the model under test and ground truth,
      // checking the invariant at every `call`. (Replaying from scratch keeps the
      // checker stateless + obviously-correct; the bound keeps it cheap.)
      const verdict = replay(makeModel, newTrace);
      if (verdict.violated && !firstCounterexample) {
        firstCounterexample = { trace: newTrace, detail: verdict.detail };
      }

      states.push({ trace: newTrace, depth: nextDepth });
    }
  }
  return { explored, counterexample: firstCounterexample };
}

function replay(makeModel, trace) {
  const model = makeModel();
  const truth = stackModel(); // ground truth is ALWAYS the real call stack
  for (const ev of trace) {
    const r = applyEvent(model, truth, ev);
    if (r.kind === "call") {
      // INVARIANT: the model must not ALLOW a call the true contract FORBIDS.
      if (r.decModel.allow && !r.decTruth.allow) {
        return {
          violated: true,
          detail: {
            tool: r.tool,
            allowedByModel: r.decModel.allow,
            forbiddenByTruth: !r.decTruth.allow,
          },
        };
      }
    }
  }
  return { violated: false };
}

// ---------------------------------------------------------------------------
// Run both models and report.
// ---------------------------------------------------------------------------

const BOUND = { traceLen: 6, depthMax: 3 };
const json = process.argv.includes("--json");

const flat = check(flatModel, BOUND);
const stack = check(stackModel, BOUND);

const result = {
  bound: BOUND,
  flat: {
    statesExplored: flat.explored,
    safe: !flat.counterexample,
    counterexample: flat.counterexample,
  },
  stack: {
    statesExplored: stack.explored,
    safe: !stack.counterexample,
    counterexample: stack.counterexample,
  },
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("=".repeat(72));
  console.log("vigiles agent-runtime state machine — bounded model check");
  console.log(
    "invariant: a tool call is allowed ONLY IF the EXECUTING subagent's",
  );
  console.log(
    "           contract permits it (ground truth = the real call stack).",
  );
  console.log(`bound: traceLen=${BOUND.traceLen}, depthMax=${BOUND.depthMax}`);
  console.log("=".repeat(72));

  for (const [name, r] of [
    ["FLAT model (ships today — single active-agent.json slot)", result.flat],
    ["STACK model (the proposed nesting-safe fix)", result.stack],
  ]) {
    console.log(`\n### ${name}`);
    console.log(`states explored: ${r.statesExplored}`);
    if (r.safe) {
      console.log(
        `VERDICT: ✓ invariant HOLDS for all interleavings up to bound`,
      );
    } else {
      console.log(`VERDICT: ✗ invariant VIOLATED — counterexample found:`);
      console.log(`  trace: ${r.counterexample.trace.join("  →  ")}`);
      const d = r.counterexample.detail;
      console.log(
        `  at the final call(${d.tool}): the FLAT model says ALLOW, but the`,
      );
      console.log(
        `  subagent actually executing forbids ${d.tool} — a CONTRACT ESCAPE.`,
      );
    }
  }
  console.log();
}

// The checker itself always succeeds (it completed the search). Exit 0.
// A found counterexample is a RESULT, not a checker error.
process.exit(0);
