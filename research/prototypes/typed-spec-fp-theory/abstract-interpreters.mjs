// T2 — Spec as a free-monad AST with MULTIPLE ABSTRACT INTERPRETERS.
//
// One pipeline AST. Several interpreters that run it ABSTRACTLY — over effects,
// capabilities, and cost, NEVER over runtime values, NEVER running the model —
// to derive properties at compile/scan time. This is how moats #1 (blast radius)
// #2 (capability diff) and #3 (cost) are actually COMPUTED: a single source
// (the AST) folded by swappable algebras (abstract interpreters).
//
// Abstract interpretation (Cousot & Cousot 1977): replace concrete semantics
// (run the model, observe effects) with an ABSTRACT semantics over a lattice
// (fold declared effect legs). Sound by over-approximation: the abstract result
// is a guaranteed UPPER BOUND on what the concrete run could do.
//
// The AST is APPLICATIVE/SELECTIVE (T1): `seq` (applicative sequence) and
// `branch` (selective, both arms present). There is deliberately NO monadic
// `bind` constructor — that's the boundary T1 proves. So every interpreter is a
// total fold and the derived surface is exact (the JOIN over selective arms).
//
// Run: `node abstract-interpreters.mjs` — asserts all derivations + exits 0.

import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// The ONE abstract syntax: a small contract/pipeline AST.
//   tool(name)          — a leaf: invoke a tool
//   seq(...nodes)       — applicative sequence (run all; surface = union)
//   branch(ok, err)     — selective: BOTH arms present; surface = join(ok, err)
// No `bind`. The structure is fully visible without running anything.
// ---------------------------------------------------------------------------

const tool = (name) => ({ kind: "tool", name });
const seq = (...nodes) => ({ kind: "seq", nodes });
const branch = (ok, err) => ({ kind: "branch", ok, err });

// The TOOL catalog — a tool maps to a SET of effect legs + a capability class +
// a rough cost weight. This is the per-leg split of the dialect's one
// `sideEffectingTools` bucket (the data every interpreter shares).
const CATALOG = {
  Read: { legs: ["fs-read"], cap: "observe", cost: 1 },
  Grep: { legs: ["fs-read"], cap: "observe", cost: 1 },
  Edit: { legs: ["fs-write"], cap: "mutate", cost: 2 },
  Write: { legs: ["fs-write"], cap: "mutate", cost: 2 },
  WebFetch: { legs: ["net"], cap: "network", cost: 3 },
  Bash: { legs: ["exec"], cap: "exec", cost: 5 },
};

// ---------------------------------------------------------------------------
// An ALGEBRA is a fold over the AST: { tool, seq, branch } → a value in some
// monoid/semilattice. `interpret(ast, algebra)` is the single generic fold
// reused by every interpreter (one AST, many interpretations — the Expression
// Problem's "add an interpretation" axis is free).
// ---------------------------------------------------------------------------

function interpret(ast, alg) {
  switch (ast.kind) {
    case "tool":
      return alg.tool(ast.name);
    case "seq":
      return ast.nodes
        .map((n) => interpret(n, alg))
        .reduce(alg.combine, alg.empty);
    case "branch":
      // SELECTIVE: combine BOTH arms (the join). We can't know which runs, but
      // both are in the structure, so the abstract result is their union.
      return alg.combine(interpret(ast.ok, alg), interpret(ast.err, alg));
    default:
      throw new Error(`unknown node ${ast.kind}`);
  }
}

// ---------------------------------------------------------------------------
// INTERPRETER 1 — EFFECT-SURFACE accumulation (the moat engine for #1).
// Monoid: (set-of-legs, ∪, ∅). Derives the total blast radius statically.
// ---------------------------------------------------------------------------
const unionSet = (a, b) => new Set([...a, ...b]);
const effectAlgebra = {
  empty: new Set(),
  combine: unionSet,
  tool: (name) =>
    new Set(CATALOG[name]?.legs ?? ["fs-read", "fs-write", "net", "exec"]),
  //                                              ^ unknown tool ⇒ conservative TOP (sound).
};

// ---------------------------------------------------------------------------
// INTERPRETER 2 — CAPABILITY accumulation (feeds the #2 capability DIFF).
// Same fold, different monoid: (set-of-capability-classes, ∪, ∅).
// ---------------------------------------------------------------------------
const capabilityAlgebra = {
  empty: new Set(),
  combine: unionSet,
  tool: (name) => new Set([CATALOG[name]?.cap ?? "UNKNOWN"]),
};

// ---------------------------------------------------------------------------
// INTERPRETER 3 — COST UPPER BOUND (the #3 estimator).
// Monoid for `seq` is (+); for `branch` we take MAX (worst-case arm) — note the
// fold combine is `+`, so we special-case branch via a max-algebra. Shows the
// SAME AST drives a different monoid where seq and branch differ.
// ---------------------------------------------------------------------------
function costUpperBound(ast) {
  switch (ast.kind) {
    case "tool":
      return CATALOG[ast.name]?.cost ?? 99; // unknown ⇒ expensive (sound upper bound)
    case "seq":
      return ast.nodes.reduce((s, n) => s + costUpperBound(n), 0);
    case "branch":
      return Math.max(costUpperBound(ast.ok), costUpperBound(ast.err)); // worst arm
    default:
      throw new Error(`unknown node ${ast.kind}`);
  }
}

// ---------------------------------------------------------------------------
// ONE pipeline, interpreted THREE ways without ever running the model.
// A doc-triage worker: read logs, then EITHER edit a fix (ok arm) OR fetch +
// nothing else (err arm reports). Selective branch — both arms visible.
// ---------------------------------------------------------------------------
const triage = seq(
  tool("Read"),
  branch(
    seq(tool("Grep"), tool("Edit")), // ok track: fix it
    tool("WebFetch"), // err track: fetch an upstream report
  ),
);

const effects = interpret(triage, effectAlgebra);
const caps = interpret(triage, capabilityAlgebra);
const cost = costUpperBound(triage);

console.log("[T2] one AST, three abstract interpreters (no model run):");
console.log("  effect surface :", [...effects].sort().join(", "));
console.log("  capabilities   :", [...caps].sort().join(", "));
console.log("  cost ≤         :", cost);

// The effect surface is the JOIN over the selective arms — exactly the static
// blast radius. Read ∪ (Grep ∪ Edit) ∪ WebFetch = {fs-read, fs-write, net}.
assert.deepEqual([...effects].sort(), ["fs-read", "fs-write", "net"]);
assert.deepEqual([...caps].sort(), ["mutate", "network", "observe"]);
// cost: Read(1) + max(Grep+Edit = 3, WebFetch = 3) = 4.
assert.equal(cost, 4);

// ---------------------------------------------------------------------------
// CONNECTING TO #2 — the CAPABILITY DIFF across two spec versions.
// Because capabilities are derived by an interpreter (not hand-listed), a diff
// of two AST versions is the set-difference of their derived capability sets —
// principled, computed, can't drift from the spec. (T4 optics make this a lens.)
// ---------------------------------------------------------------------------
const triageV2 = seq(
  tool("Read"),
  branch(seq(tool("Grep"), tool("Edit")), seq(tool("WebFetch"), tool("Bash"))), // err arm now SHELLS OUT
);
const capsV2 = interpret(triageV2, capabilityAlgebra);
const added = [...capsV2].filter((c) => !caps.has(c));
console.log("  v1→v2 capability DIFF (added):", added.join(", "));
assert.deepEqual(added, ["exec"]); // the new shell-out is caught by the diff.

// ---------------------------------------------------------------------------
// SOUNDNESS witness — an UNKNOWN tool widens every interpreter to the top
// (over-approximation), so a surface is NEVER under-reported.
// ---------------------------------------------------------------------------
const unknownPipe = seq(tool("Read"), tool("mcp__weird__thing"));
const unknownSurface = interpret(unknownPipe, effectAlgebra);
assert.deepEqual([...unknownSurface].sort(), [
  "exec",
  "fs-read",
  "fs-write",
  "net",
]);
console.log(
  "  unknown tool ⇒ surface widens to TOP (sound):",
  [...unknownSurface].sort().join(", "),
);

console.log("[T2] all abstract-interpretation derivations hold ✓");
