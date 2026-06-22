/**
 * Capability-diff — "did this change widen the agent's blast radius?" (moat #2).
 *
 * The whole-harness capability lattice ({@link HarnessCapabilities}, computed by
 * `computeHarnessCapabilities`) is the set of effects an agent/harness can reach:
 * read-only tools, side-effecting tools, unknown/MCP tools, and the loosest purity.
 * Diffing two lattices (a PR's base vs head) yields a deterministic, model-free
 * verdict: a change WIDENED the blast radius iff it adds a side-effecting or
 * unknown/MCP tool, or loosens the purity floor. New read-only tools and removals
 * are reported but are NOT a widening.
 *
 * Honesty / don't-cry-wolf: a widening is INFORMATIONAL by default (a PR comment),
 * not an automatic failure — widening the surface is often intended. The CLI gates
 * a non-zero exit behind an explicit `--fail-on-widen`. Pure + harness-agnostic
 * (operates on the lattice, no dialect needed). See research/typed-spec-moat.md (#2).
 */

import type { HarnessCapabilities } from "./generate-harness.js";
import type { PurityLevel } from "./effects.js";

const PURITY_RANK: Record<PurityLevel, number> = {
  pure: 0,
  bounded: 1,
  unrestricted: 2,
};

/** A purity move between two lattices (omitted when unchanged). */
export interface PurityChange {
  readonly from: PurityLevel;
  readonly to: PurityLevel;
  /** `widened` = loosened (pure→bounded→unrestricted); `narrowed` = tightened. */
  readonly direction: "widened" | "narrowed";
}

export interface CapabilityDiff {
  /** Side-effecting tools reachable AFTER but not before — the core blast-radius growth. */
  readonly addedSideEffecting: readonly string[];
  /** Unknown-effect (MCP / unrecognized) tools newly reachable — also widened reach. */
  readonly addedUnknown: readonly string[];
  /** Read-only tools newly reachable — benign (reported, NOT a widening). */
  readonly addedReadOnly: readonly string[];
  /** Tools reachable before but not after — a NARROWING (good; informational). */
  readonly removed: readonly string[];
  /** The purity move, or null when unchanged. */
  readonly purity: PurityChange | null;
  /** The verdict: did the blast radius GROW (new side-effecting/unknown, or purity loosened)? */
  readonly widened: boolean;
}

const addedIn = (
  before: readonly string[],
  after: readonly string[],
): string[] => after.filter((x) => !before.includes(x));

/** Diff two capability lattices → what changed + the widened verdict. Pure. */
export function diffCapabilities(
  before: HarnessCapabilities,
  after: HarnessCapabilities,
): CapabilityDiff {
  const addedSideEffecting = addedIn(before.sideEffecting, after.sideEffecting);
  const addedUnknown = addedIn(before.unknown, after.unknown);
  const addedReadOnly = addedIn(before.readOnly, after.readOnly);

  // A tool is "removed" if it was reachable in ANY bucket before and in NONE after.
  const afterAll = new Set([
    ...after.readOnly,
    ...after.sideEffecting,
    ...after.unknown,
  ]);
  const removed = [
    ...before.readOnly,
    ...before.sideEffecting,
    ...before.unknown,
  ].filter((x) => !afterAll.has(x));

  const fromRank = PURITY_RANK[before.purity];
  const toRank = PURITY_RANK[after.purity];
  const purity: PurityChange | null =
    fromRank === toRank
      ? null
      : {
          from: before.purity,
          to: after.purity,
          direction: toRank > fromRank ? "widened" : "narrowed",
        };

  const widened =
    addedSideEffecting.length > 0 ||
    addedUnknown.length > 0 ||
    purity?.direction === "widened";

  return {
    addedSideEffecting,
    addedUnknown,
    addedReadOnly,
    removed,
    purity,
    widened,
  };
}

/** True when the diff carries no change at all (the common, quiet case). */
export function isNoOpDiff(d: CapabilityDiff): boolean {
  return (
    d.addedSideEffecting.length === 0 &&
    d.addedUnknown.length === 0 &&
    d.addedReadOnly.length === 0 &&
    d.removed.length === 0 &&
    d.purity === null
  );
}

/** Render a capability-diff as a PR-comment-style report (Markdown-friendly). */
export function formatCapabilityDiff(d: CapabilityDiff): string {
  if (isNoOpDiff(d)) {
    return "Capability surface unchanged — no blast-radius change.";
  }
  const lines = [
    d.widened
      ? "⚠️ Capability surface **WIDENED** — this change grows the agent's blast radius:"
      : "Capability surface changed (no widening — narrowing / read-only only):",
  ];
  if (d.addedSideEffecting.length > 0)
    lines.push(`  + side-effecting: ${d.addedSideEffecting.join(", ")}`);
  if (d.addedUnknown.length > 0)
    lines.push(`  + unknown/MCP: ${d.addedUnknown.join(", ")}`);
  if (d.purity?.direction === "widened")
    lines.push(`  + purity loosened: ${d.purity.from} → ${d.purity.to}`);
  if (d.addedReadOnly.length > 0)
    lines.push(`  · read-only added (benign): ${d.addedReadOnly.join(", ")}`);
  if (d.removed.length > 0)
    lines.push(`  − narrowed (removed): ${d.removed.join(", ")}`);
  if (d.purity?.direction === "narrowed")
    lines.push(`  − purity tightened: ${d.purity.from} → ${d.purity.to}`);
  return lines.join("\n");
}
