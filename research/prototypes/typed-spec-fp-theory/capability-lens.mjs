// T4 — OPTICS / LENSES for the capability-diff (moat #2), evaluated honestly.
//
// A lens is a composable (get, set) focus onto a part of a structure. The pitch:
// focus the spec's effect/capability SURFACE through a lens, then a diff across
// two spec versions is a principled `view(lens, v2) ∖ view(lens, v1)`.
//
// This file builds the lens to test whether it EARNS its place over T2's plain
// interpreter fold. Verdict (printed at the end): the GET half (a derived focus)
// is genuinely useful and composes; the SET half (lawful update) is mostly
// inapplicable because the surface is DERIVED, not stored — you can't lawfully
// `set` a capability set and expect `get∘set = id` when the capability is a
// FUNCTION of the tools. So it's a GETTER (a "fold" optic), not a full lens.
//
// Run: `node capability-lens.mjs` — asserts + exits 0.

import assert from "node:assert/strict";

const CATALOG = {
  Read: { cap: "observe" },
  Edit: { cap: "mutate" },
  WebFetch: { cap: "network" },
  Bash: { cap: "exec" },
};

// A spec value (simplified): a name + a flat tools list.
const specV1 = { name: "triage", tools: ["Read", "Edit"] };
const specV2 = { name: "triage", tools: ["Read", "Edit", "Bash"] };

// ---------------------------------------------------------------------------
// A LENS as { get, set }. We can build a lawful lens onto the STORED `tools`
// field — get/set round-trips (get∘set = id, set∘get = id).
// ---------------------------------------------------------------------------
const toolsLens = {
  get: (s) => s.tools,
  set: (tools, s) => ({ ...s, tools }),
};
// Lens law check: set(get(s), s) === s (no-op set).
assert.deepEqual(toolsLens.set(toolsLens.get(specV1), specV1), specV1);

// ---------------------------------------------------------------------------
// Compose with a GETTER (a "fold"/"getter" optic) that DERIVES capabilities.
// This half is NOT a lawful lens — capabilities are a function of tools, so
// there is no lawful inverse `set`. It's a one-way fold, which optics libraries
// call a `Getter`/`Fold`, not a `Lens`. Composing lens∘getter gives a getter.
// ---------------------------------------------------------------------------
const capabilityGetter = (tools) =>
  new Set(tools.map((t) => CATALOG[t]?.cap ?? "UNKNOWN"));

// The composed focus: spec → capability set (read-only).
const viewCapabilities = (spec) => capabilityGetter(toolsLens.get(spec));

// The principled DIFF across versions through the composed optic.
function capabilityDiff(v1, v2) {
  const a = viewCapabilities(v1);
  const b = viewCapabilities(v2);
  return {
    added: [...b].filter((c) => !a.has(c)),
    removed: [...a].filter((c) => !b.has(c)),
  };
}

const diff = capabilityDiff(specV1, specV2);
console.log("[T4] capability diff via composed optic:", diff);
assert.deepEqual(diff.added, ["exec"]); // Bash added the exec capability.
assert.deepEqual(diff.removed, []);

// ---------------------------------------------------------------------------
// Where the LENS (set half) genuinely earns it: a lawful UPDATE on the STORED
// tools, e.g. "remove every tool that grants the exec capability" — a
// composable, reversible edit expressed as `over(toolsLens, f)`. THIS is the
// real optics win (a principled spec EDIT), distinct from the diff.
// ---------------------------------------------------------------------------
const over = (lens, f, s) => lens.set(f(lens.get(s)), s);
const dropExec = (tools) => tools.filter((t) => CATALOG[t]?.cap !== "exec");

const deExeced = over(toolsLens, dropExec, specV2);
console.log("[T4] over(toolsLens, dropExec):", deExeced.tools);
assert.deepEqual(deExeced.tools, ["Read", "Edit"]);
assert.deepEqual(viewCapabilities(deExeced), new Set(["observe", "mutate"]));

// ---------------------------------------------------------------------------
// VERDICT (the honest evaluation the brief asked for):
//   - The capability DIFF is better expressed as T2's interpreter fold +
//     set-difference. The lens adds composition syntax but NO new power for the
//     diff — the derivation is a GETTER, and a getter is just T2's fold.
//   - The lens's SET half earns its place only for a different feature: a
//     principled, reversible spec EDITOR (`over(toolsLens, dropExec)`), which is
//     idea #6 from fp-for-agent-harness.md ("lenses for settings.json"), NOT the
//     capability diff. So: optics are a real but NARROW win for spec EDITING,
//     and a REPACKAGING of T2's fold for the capability DIFF. Don't sell lenses
//     as the diff engine; the interpreter already is.
// ---------------------------------------------------------------------------
console.log(
  "[T4] verdict: getter-for-diff = repackaged T2 fold; lawful-set = a real (separate) spec-editor win ✓",
);
