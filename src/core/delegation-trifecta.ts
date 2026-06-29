/**
 * DELEGATION-TRIFECTA — the lethal trifecta SPLIT across a delegation edge.
 *
 * The per-unit {@link lethalTrifectaIssues} (`./lethal-trifecta.ts`) catches a
 * single subagent / skill that holds all THREE capability legs at once. But the
 * trifecta can EMERGE across a delegation (or inheritance) edge: a parent that
 * can only read private data (leg A) delegates to a child that can ingest
 * untrusted content AND exfiltrate (legs B+C). NEITHER unit trips the per-unit
 * check, yet the CHAIN — the parent plus everything it can reach — forms the full
 * trifecta. A prompt injection in the child's untrusted input can pivot back
 * through the delegation and leak the parent's private data.
 *
 * This is CAPABILITY-DIFF ACROSS THE DELEGATION TREE: the EFFECTIVE (combined)
 * capability of a unit is the union of its own tools plus the tools of every unit
 * reachable through `delegatesTo`. We classify that effective set and flag a unit
 * whose effective set is a full trifecta while its OWN set is not.
 *
 * NO DOUBLE-REPORT (one-detector-no-drift / don't-cry-wolf): a unit whose OWN
 * tools already form a full trifecta is SKIPPED here — {@link lethalTrifectaIssues}
 * owns it. This detector reports ONLY the EMERGENT case the per-unit check can't
 * see.
 *
 * HIGH-PRECISION (FP-safe): if the effective set contains a wildcard (inherits-all)
 * the unit reaches everything and would always "trifecta" — that maximal-blast-
 * radius case is the per-unit ADVISORY detector's job, so we SKIP it. We flag ONLY
 * concrete, explicit tool unions where every leg is supplied by a named tool.
 *
 * Pure, no IO. The delegation graph (nodes + directed `delegatesTo` edges) is the
 * INPUT — this module does not decide where edges come from; a caller supplies them
 * from the parsed harness. The dialect is injected (core ⊄ adapter), reused for the
 * underlying leg classification.
 */
import type { HarnessDialect } from "./dialect.js";
import { classifyTrifectaLegs, type TrifectaLegs } from "./lethal-trifecta.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One unit (subagent/skill) in the delegation graph. */
export interface CapabilityNode {
  readonly name: string;
  readonly kind: "skill" | "agent";
  /** This unit's OWN declared tools. [] = none declared. ["*"] = inherits-all (wildcard). */
  readonly tools: readonly string[];
  /** Names of units this one can delegate to / inherits capabilities from (directed edges). */
  readonly delegatesTo: readonly string[];
}

/** A trifecta that EMERGES across delegation — present in a unit's effective set but NOT its own. */
export interface DelegationTrifectaFinding {
  readonly name: string;
  readonly kind: "skill" | "agent";
  /** The delegated-to units (by name) that supplied at least one leg the unit lacks on its own. */
  readonly via: readonly string[];
  /** The tools that supplied each leg in the EFFECTIVE (combined) set. */
  readonly legs: TrifectaLegs;
  /** Ready-to-show, actionable message. */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** A full trifecta = all three legs non-empty. */
function isFullTrifecta(legs: TrifectaLegs): boolean {
  return (
    legs.private.length > 0 &&
    legs.untrusted.length > 0 &&
    legs.exfil.length > 0
  );
}

/** Strips a `Tool(restriction)` suffix and returns the base tool name. */
function baseTool(raw: string): string {
  return raw.split("(")[0].trim();
}

/** True for the wildcard sentinels that mean "inherits-all". */
function isWildcard(tool: string): boolean {
  return tool === "" || tool === "*";
}

/**
 * The set of node names reachable from `start` over `delegatesTo`, INCLUDING
 * `start` itself. Cycle-safe (a `visited` set). An edge naming a node not in the
 * map is skipped — its tools can't be resolved.
 */
function effectiveReach(
  start: string,
  byName: ReadonlyMap<string, CapabilityNode>,
): Set<string> {
  const visited = new Set<string>();
  const stack: string[] = [start];
  while (stack.length > 0) {
    const name = stack.pop();
    if (name === undefined || visited.has(name)) continue;
    visited.add(name);
    const node = byName.get(name);
    if (node === undefined) continue;
    for (const next of node.delegatesTo) {
      if (!visited.has(next)) stack.push(next);
    }
  }
  return visited;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find units whose EFFECTIVE (own + delegated) capability set forms a full lethal
 * trifecta that their OWN set does not — an emergent, cross-delegation exfil path.
 *
 * Returns findings in stable order (by node name). See the module header for the
 * skip rules (own-set already a trifecta → owned by the per-unit detector; an
 * effective wildcard → owned by the per-unit advisory).
 */
export function delegationTrifectaIssues(
  nodes: readonly CapabilityNode[],
  dialect: HarnessDialect,
): DelegationTrifectaFinding[] {
  const byName = new Map<string, CapabilityNode>();
  for (const node of nodes) byName.set(node.name, node);

  const findings: DelegationTrifectaFinding[] = [];

  for (const node of nodes) {
    // (b) If the unit's OWN tools already form a full trifecta, the per-unit
    // detector owns it — never double-report.
    const ownLegs = classifyTrifectaLegs(node.tools, dialect);
    if (isFullTrifecta(ownLegs)) continue;

    // (c) Effective tools = the de-duplicated union across the reachable set.
    const reach = effectiveReach(node.name, byName);
    const effSet = new Set<string>();
    for (const name of reach) {
      const reached = byName.get(name);
      if (reached === undefined) continue;
      for (const tool of reached.tools) effSet.add(tool);
    }
    const effectiveTools = [...effSet];

    // (d) FP-safe wildcard guard: an inherits-all unit in the reachable set
    // would always "trifecta" — that's the per-unit advisory's job.
    if (effectiveTools.some((t) => isWildcard(baseTool(t)))) continue;

    // (e) Classify the effective set.
    const effLegs = classifyTrifectaLegs(effectiveTools, dialect);

    // (f) Emit ONLY when the effective set is a full trifecta (own set wasn't).
    if (!isFullTrifecta(effLegs)) continue;

    // The tools that supplied any leg in the effective set.
    const legTools = new Set<string>([
      ...effLegs.private,
      ...effLegs.untrusted,
      ...effLegs.exfil,
    ]);

    // `via` = reachable units (excluding this node) that contribute a leg tool.
    const via: string[] = [];
    for (const name of reach) {
      if (name === node.name) continue;
      const reached = byName.get(name);
      if (reached === undefined) continue;
      const contributes = reached.tools.some((t) => legTools.has(baseTool(t)));
      if (contributes && !via.includes(name)) via.push(name);
    }
    via.sort();

    const message =
      `Subagent "${node.name}" is not a data-leak risk on its own, but combined ` +
      `with what it delegates to (${via.join(", ")}), the chain can read private ` +
      `data (${effLegs.private.join(", ")}), ingest untrusted content ` +
      `(${effLegs.untrusted.join(", ")}), AND exfiltrate ` +
      `(${effLegs.exfil.join(", ")}) — a prompt injection in the untrusted input ` +
      `could pivot through the delegation to leak data. Break the delegation or ` +
      `drop one leg.`;

    findings.push({
      name: node.name,
      kind: node.kind,
      via,
      legs: effLegs,
      message,
    });
  }

  findings.sort((a, b) => a.name.localeCompare(b.name));
  return findings;
}
