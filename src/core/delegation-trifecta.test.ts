/**
 * Delegation-trifecta detector suite (vitest) — the lethal trifecta SPLIT across
 * a delegation edge. Asserts the EMERGENT case: a unit whose own set is not a
 * trifecta but whose effective (own + delegated) set is. Verifies the no-double-
 * report skip (own set already full → owned by the per-unit detector), cycle
 * safety, missing-edge tolerance, and the FP-safe wildcard guard.
 *
 * Tool legs are grounded in `./lethal-trifecta.ts`'s catalogs:
 *   Read     → leg A (PRIVATE_BUILTINS)
 *   WebSearch→ leg B (UNTRUSTED_BUILTINS)
 *   WebFetch → leg B + leg C (UNTRUSTED_BUILTINS + EXFIL_BUILTINS)
 *   Bash     → leg A + leg C (LEG_BASH_DUAL)
 *   mcp__filesystem__read_file → leg A (PRIVATE_MCP_SERVERS "filesystem")
 */
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  delegationTrifectaIssues,
  type CapabilityNode,
} from "./delegation-trifecta.js";
import { claudeCodeDialect } from "../adapters/claude-code/dialect.js";

test("headline: emergent trifecta across a delegation edge → parent flagged", () => {
  // A: Read (leg A only). B: WebFetch (legs B+C). NEITHER is a full trifecta on
  // its own, but A's effective set = Read+WebFetch = all three legs.
  const nodes: CapabilityNode[] = [
    { name: "A", kind: "agent", tools: ["Read"], delegatesTo: ["B"] },
    { name: "B", kind: "agent", tools: ["WebFetch"], delegatesTo: [] },
  ];
  const findings = delegationTrifectaIssues(nodes, claudeCodeDialect);
  assert.equal(findings.length, 1);
  const f = findings[0];
  assert.equal(f.name, "A");
  assert.equal(f.kind, "agent");
  // B supplied the untrusted + exfil legs A lacked.
  assert.deepEqual(f.via, ["B"]);
  assert.ok(f.legs.private.includes("Read"));
  assert.ok(f.legs.untrusted.includes("WebFetch"));
  assert.ok(f.legs.exfil.includes("WebFetch"));
  assert.match(f.message, /delegates to \(B\)/);
});

test("a node whose OWN set is already a full trifecta is NOT reported here", () => {
  // X holds all three legs itself (Read=A, WebSearch=B, WebFetch=C). The per-unit
  // detector owns it — this detector must skip it (no double-report).
  const nodes: CapabilityNode[] = [
    {
      name: "X",
      kind: "agent",
      tools: ["Read", "WebSearch", "WebFetch"],
      delegatesTo: [],
    },
  ];
  const findings = delegationTrifectaIssues(nodes, claudeCodeDialect);
  assert.equal(findings.length, 0);
});

test("an own-trifecta node that ALSO delegates is still not double-reported", () => {
  const nodes: CapabilityNode[] = [
    {
      name: "X",
      kind: "agent",
      tools: ["Bash", "WebFetch"], // Bash=A+C, WebFetch=B+C → all three own
      delegatesTo: ["Y"],
    },
    { name: "Y", kind: "agent", tools: ["Read"], delegatesTo: [] },
  ];
  const findings = delegationTrifectaIssues(nodes, claudeCodeDialect);
  // X is skipped (own trifecta); Y on its own is leg A only → no finding.
  assert.equal(findings.length, 0);
});

test("no delegation edges → no findings (the per-unit detector covers everything)", () => {
  const nodes: CapabilityNode[] = [
    { name: "A", kind: "agent", tools: ["Read"], delegatesTo: [] },
    { name: "B", kind: "agent", tools: ["WebFetch"], delegatesTo: [] },
    { name: "C", kind: "skill", tools: ["WebSearch"], delegatesTo: [] },
  ];
  const findings = delegationTrifectaIssues(nodes, claudeCodeDialect);
  assert.equal(findings.length, 0);
});

test("a delegation cycle (A→B→A) terminates with the correct effective union", () => {
  // A: Read (A). B: WebFetch (B+C). They delegate to each other (a cycle).
  // Both A and B end up with effective Read+WebFetch = all three legs.
  const nodes: CapabilityNode[] = [
    { name: "A", kind: "agent", tools: ["Read"], delegatesTo: ["B"] },
    { name: "B", kind: "agent", tools: ["WebFetch"], delegatesTo: ["A"] },
  ];
  const findings = delegationTrifectaIssues(nodes, claudeCodeDialect);
  // Both nodes flagged (effective union is a trifecta for each), no infinite loop.
  assert.equal(findings.length, 2);
  assert.deepEqual(
    findings.map((f) => f.name),
    ["A", "B"],
  );
  // A is reached via B and vice versa.
  assert.deepEqual(findings[0].via, ["B"]);
  assert.deepEqual(findings[1].via, ["A"]);
});

test("an edge naming a missing node is skipped without crashing", () => {
  // A delegates to "ghost" (not in the graph) → its tools can't be resolved.
  // A's effective set is just its own (Read) → no trifecta, no finding, no crash.
  const nodes: CapabilityNode[] = [
    { name: "A", kind: "agent", tools: ["Read"], delegatesTo: ["ghost"] },
  ];
  const findings = delegationTrifectaIssues(nodes, claudeCodeDialect);
  assert.equal(findings.length, 0);
});

test("a missing edge alongside a real one still resolves the real one", () => {
  const nodes: CapabilityNode[] = [
    {
      name: "A",
      kind: "agent",
      tools: ["Read"],
      delegatesTo: ["ghost", "B"],
    },
    { name: "B", kind: "agent", tools: ["WebFetch"], delegatesTo: [] },
  ];
  const findings = delegationTrifectaIssues(nodes, claudeCodeDialect);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].name, "A");
  assert.deepEqual(findings[0].via, ["B"]);
});

test("wildcard guard: delegating to an inherits-all node is SKIPPED (no finding)", () => {
  // B inherits all tools (["*"]). A's effective set reaches a wildcard → the
  // per-unit advisory owns that maximal-blast-radius case; skip here.
  const nodes: CapabilityNode[] = [
    { name: "A", kind: "agent", tools: ["Read"], delegatesTo: ["B"] },
    { name: "B", kind: "agent", tools: ["*"], delegatesTo: [] },
  ];
  const findings = delegationTrifectaIssues(nodes, claudeCodeDialect);
  assert.equal(findings.length, 0);
});

test("via lists ALL contributing delegated units, de-duped and sorted", () => {
  // A: Read (A). Delegates to C and B. B: WebSearch (B). C: WebFetch (B+C).
  // A's effective = Read+WebSearch+WebFetch = all three. Both B and C supply a leg.
  const nodes: CapabilityNode[] = [
    {
      name: "A",
      kind: "agent",
      tools: ["Read"],
      delegatesTo: ["C", "B"],
    },
    { name: "B", kind: "agent", tools: ["WebSearch"], delegatesTo: [] },
    { name: "C", kind: "agent", tools: ["WebFetch"], delegatesTo: [] },
  ];
  const findings = delegationTrifectaIssues(nodes, claudeCodeDialect);
  assert.equal(findings.length, 1);
  // Stable, sorted order regardless of edge order.
  assert.deepEqual(findings[0].via, ["B", "C"]);
});

test("a deep chain (A→B→C) accumulates legs transitively", () => {
  // A: Read (A) → B: WebSearch (B) → C: Bash (A+C). A's effective = all three.
  const nodes: CapabilityNode[] = [
    { name: "A", kind: "agent", tools: ["Read"], delegatesTo: ["B"] },
    { name: "B", kind: "agent", tools: ["WebSearch"], delegatesTo: ["C"] },
    { name: "C", kind: "agent", tools: ["Bash"], delegatesTo: [] },
  ];
  const findings = delegationTrifectaIssues(nodes, claudeCodeDialect);
  // A flagged (effective all three). B's effective = WebSearch+Bash = A+B+C too.
  // C's own = Bash (A+C only) → no finding.
  assert.deepEqual(
    findings.map((f) => f.name),
    ["A", "B"],
  );
  assert.deepEqual(findings[0].via, ["B", "C"]);
});
