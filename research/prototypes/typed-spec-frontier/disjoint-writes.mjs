#!/usr/bin/env node
/**
 * PROTOTYPE D — separation-logic DISJOINTNESS as a spec-generated RUNTIME gate.
 *
 * Separation logic's frame rule: two computations that operate on DISJOINT heap
 * regions don't interfere. Transferred to the harness: when a spec dispatches
 * several subagents IN PARALLEL (a fan-out), each declares the file region it
 * OWNS (a path prefix / glob). The safety property is that their write-sets are
 * pairwise DISJOINT — if two parallel workers can both write `src/api/`, they
 * race and clobber each other, a real multi-agent failure.
 *
 * Why this is a RUNTIME check, not a type. The *static* disjointness of declared
 * prefixes is decidable (and could be a lint rule), but the property that matters
 * is "the worker only ACTUALLY writes inside the region it declared." That is a
 * value (the live path) the type cannot see — exactly "parse, don't validate":
 * the spec COMPILES a per-worker PreToolUse gate that, at the live Write/Edit
 * call, rejects a path outside the worker's owned region. The gate cannot be
 * bypassed in the loop, and it enforces what the type provably cannot.
 *
 * This file is the PURE DECISION the generated hook runs — demonstrated firing
 * over a constructed parallel plan, no claude binary needed.
 */

// ---------------------------------------------------------------------------
// The parallel plan: each worker OWNS a path prefix. The spec would declare this
// (e.g. delegate("api-worker", { owns: "src/api/" })) and compile it into the
// per-worker hook's VIGILES_OWNED_REGION env.
// ---------------------------------------------------------------------------

const plan = {
  workers: [
    { name: "api-worker", owns: "src/api/" },
    { name: "ui-worker", owns: "src/ui/" },
    { name: "docs-worker", owns: "docs/" },
  ],
};

// --- Static half (could be a lint rule): pairwise-disjoint declared regions. ---

/** A prefix A overlaps prefix B iff one is a prefix of the other. */
function prefixesOverlap(a, b) {
  return a.startsWith(b) || b.startsWith(a);
}

function staticDisjointViolations(workers) {
  const out = [];
  for (let i = 0; i < workers.length; i++) {
    for (let j = i + 1; j < workers.length; j++) {
      if (prefixesOverlap(workers[i].owns, workers[j].owns)) {
        out.push([
          workers[i].name,
          workers[j].name,
          workers[i].owns,
          workers[j].owns,
        ]);
      }
    }
  }
  return out;
}

// --- Runtime half (the generated PreToolUse gate): the LIVE path must be in the
//     active worker's owned region. This is what a type cannot reach. ---

/**
 * The pure decision the compiled per-worker hook runs on each Write/Edit.
 * `ownedRegion` comes from the worker's compiled contract (its frontmatter /
 * the VIGILES_OWNED_REGION env the spec emits); `path` is the live tool_input.
 */
export function decideDisjointWrite(ownedRegion, tool, path) {
  if (tool !== "Write" && tool !== "Edit" && tool !== "NotebookEdit") {
    return { allow: true, message: "" };
  }
  const normalized = path.replace(/^\.\//, "");
  if (normalized.startsWith(ownedRegion)) return { allow: true, message: "" };
  return {
    allow: false,
    message:
      `Write to "${path}" is outside this worker's owned region "${ownedRegion}". ` +
      `A parallel worker owns that path; writing it races. Confine to "${ownedRegion}" ` +
      `or re-scope the fan-out so the regions stay disjoint.`,
  };
}

// ---------------------------------------------------------------------------
// Demonstration / self-test.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";

// 1) The good plan has DISJOINT declared regions (static check passes).
assert.deepEqual(staticDisjointViolations(plan.workers), []);
console.log("[ok] good plan: declared regions pairwise-disjoint");

// 2) A bad plan (two workers both under src/) is caught statically.
const badPlan = [
  { name: "w1", owns: "src/api/" },
  { name: "w2", owns: "src/" }, // src/ is a prefix of src/api/ — overlap
];
const v = staticDisjointViolations(badPlan);
assert.equal(v.length, 1);
console.log(
  `[ok] bad plan caught statically: ${v[0][0]} ∩ ${v[0][1]} (${v[0][2]} vs ${v[0][3]})`,
);

// 3) RUNTIME gate: the api-worker writing inside its region is ALLOWED.
const inRegion = decideDisjointWrite("src/api/", "Write", "src/api/routes.ts");
assert.equal(inRegion.allow, true);
console.log("[ok] runtime: api-worker writing src/api/routes.ts allowed");

// 4) RUNTIME gate: the api-worker writing the UI worker's region is DENIED —
//    the thing no type can see (the live path), enforced in the loop.
const outOfRegion = decideDisjointWrite(
  "src/api/",
  "Write",
  "src/ui/button.tsx",
);
assert.equal(outOfRegion.allow, false);
assert.match(outOfRegion.message, /outside this worker's owned region/);
console.log("[ok] runtime: api-worker writing src/ui/button.tsx DENIED");
console.log("      reason:", outOfRegion.message.split(".")[0] + ".");

// 5) Read is never gated (disjointness is a WRITE-set property).
assert.equal(
  decideDisjointWrite("src/api/", "Read", "src/ui/button.tsx").allow,
  true,
);
console.log(
  "[ok] runtime: cross-region READ allowed (disjointness is write-only)",
);

console.log("\nAll disjoint-write cases behaved as expected.");
