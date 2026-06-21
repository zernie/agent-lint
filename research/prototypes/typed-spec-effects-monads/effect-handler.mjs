#!/usr/bin/env node
/**
 * M2 — the RUNTIME half of effect rows: a per-call gate that decides against a
 * granular row AND a HANDLER that DISCHARGES a leg (the algebraic-effect move the
 * shipped purity gate has no analogue for).
 *
 * PL source: algebraic-effect HANDLERS (Koka/Eff/OCaml 5). A handler doesn't just
 * forbid an effect — it INTERPRETS it: `handle e with { Net k -> record(...); k() }`
 * turns a raw network effect into a contained, recorded one, REMOVING `net` from
 * the residual effect row of the handled computation. The shipped `decidePurityGate`
 * is binary (allow/deny by ladder rung); it cannot say "allow net, but only through
 * the recording proxy." A handler can.
 *
 * Concretely for the harness: a unit declares `grants: {fs-read, net}` and a
 * `handlers: { net: "record" }`. At the live PreToolUse call:
 *   - a leg in `grants` with a HANDLER  → allowed, but ROUTED (discharged): the
 *     decision carries the interpretation (e.g. "wrap WebFetch in the egress
 *     recorder"), and the residual row drops that leg.
 *   - a leg in `grants` with NO handler → allowed RAW (the unhandled-but-permitted
 *     case).
 *   - a leg NOT in `grants`             → DENIED (the row is the upper bound).
 * The "residual row" is what the unit can STILL do after handlers discharge what
 * they catch — the inspectable thing the binary gate throws away.
 *
 * This is deterministic + pure (the decision function), runs with no model, and
 * mirrors the one-detector shape of decidePurityGate. Exits 0 iff all asserts pass.
 */
import assert from "node:assert/strict";

// --- the row catalog (mirror of effect-row.ts; per-tool legs) ----------------
const TOOL_LEGS = {
  Read: "fs-read",
  Grep: "fs-read",
  Glob: "fs-read",
  Write: "fs-write",
  Edit: "fs-write",
  WebFetch: "net",
  WebSearch: "net",
  Bash: "exec",
  Task: "spawn",
};

/** The leg a tool needs (undefined ⇒ unknown tool ⇒ treat as the worst leg). */
function legOf(tool) {
  const base = tool.split("(")[0].trim();
  return TOOL_LEGS[base] ?? "exec"; // unknown ⇒ conservatively the broadest leg
}

/**
 * The pure runtime decision — the algebraic-effect HANDLER as a gate.
 *
 * @param {{grants: string[], handlers: Record<string,string>}} contract
 * @param {string} tool  the live tool call
 * @returns {{ allow: boolean, route: string|null, dischargedLeg: string|null, message: string }}
 */
export function decideHandledEffect(contract, tool) {
  const leg = legOf(tool);
  if (!contract.grants.includes(leg)) {
    return {
      allow: false,
      route: null,
      dischargedLeg: null,
      message: `tool "${tool}" needs effect leg "${leg}", not in granted row {${contract.grants.join(", ")}}`,
    };
  }
  const handler = contract.handlers?.[leg];
  if (handler) {
    // The handler INTERPRETS the effect: allowed, but routed through `handler`,
    // and the leg is DISCHARGED from the residual row.
    return {
      allow: true,
      route: handler,
      dischargedLeg: leg,
      message: `"${leg}" effect discharged via handler "${handler}"`,
    };
  }
  return { allow: true, route: null, dischargedLeg: null, message: "" };
}

/** The RESIDUAL row: granted legs minus the ones a handler discharges. The
 *  inspectable "what can this unit STILL do unmediated" the binary gate can't show. */
export function residualRow(contract) {
  const handled = new Set(Object.keys(contract.handlers ?? {}));
  return contract.grants.filter((leg) => !handled.has(leg));
}

// ---------------------------------------------------------------------------
// Proof
// ---------------------------------------------------------------------------

// A doc-fetcher: may read + reach the net, but NET MUST go through the recorder.
const fetcher = {
  grants: ["fs-read", "net"],
  handlers: { net: "egress-recorder" }, // discharge net via the recorder
};

console.log("=== M2: effect-handler discharge gate ===\n");

// 1. fs-read is granted, unhandled → allowed RAW.
{
  const d = decideHandledEffect(fetcher, "Read");
  assert.equal(d.allow, true);
  assert.equal(d.route, null);
  assert.equal(d.dischargedLeg, null);
  console.log("[ok] Read (fs-read) allowed raw — granted, no handler");
}

// 2. net is granted AND handled → allowed, but ROUTED through the recorder; the
//    net leg is DISCHARGED. This is the case the binary purity gate cannot express.
{
  const d = decideHandledEffect(fetcher, "WebFetch");
  assert.equal(d.allow, true);
  assert.equal(d.route, "egress-recorder");
  assert.equal(d.dischargedLeg, "net");
  console.log(
    `[ok] WebFetch (net) allowed but DISCHARGED via "${d.route}" — the handler move`,
  );
}

// 3. exec is NOT in the granted row → DENIED (the row is the upper bound).
{
  const d = decideHandledEffect(fetcher, "Bash");
  assert.equal(d.allow, false);
  assert.match(d.message, /needs effect leg "exec"/);
  console.log(
    `[ok] Bash (exec) DENIED — exec not in granted row {${fetcher.grants.join(", ")}}`,
  );
}

// 4. the RESIDUAL row after handlers: net is discharged, so only fs-read remains
//    unmediated. This is the inspectable artifact — "after the recorder, this unit
//    can still read the FS but its network is fully mediated."
{
  const residual = residualRow(fetcher);
  assert.deepEqual(residual, ["fs-read"]);
  console.log(
    `[ok] residual row = {${residual.join(", ")}} (net discharged by handler — the inspectable artifact)`,
  );
}

// 5. an UNHANDLED net unit (no recorder): net is granted but stays in the residual
//    row — the difference a handler makes is visible in the residual.
{
  const raw = { grants: ["fs-read", "net"], handlers: {} };
  assert.deepEqual(residualRow(raw), ["fs-read", "net"]);
  const d = decideHandledEffect(raw, "WebFetch");
  assert.equal(d.allow, true);
  assert.equal(d.dischargedLeg, null);
  console.log(
    "[ok] same row, NO handler → net stays in residual {fs-read, net}, WebFetch allowed RAW",
  );
}

console.log("\nM2 effect-handler demo: all cases passed.");
