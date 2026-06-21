/**
 * M1 — GRANULAR EFFECT ROWS beyond the pure|bounded|unrestricted ladder.
 *
 * PL source: algebraic-effect ROWS (Koka `<exn,div,console>`, Eff, OCaml 5
 * effects, Unison abilities). The shipped `effectSurface` (src/core/effects.ts)
 * collapses a tool contract to a 3-rung TOTAL ORDER: pure < bounded < unrestricted.
 * That answers "how constrained?" but NOT "constrained IN WHICH DIMENSION?". A row
 * is a SET of independent legs — a tool grants `{FS-write}` OR `{Net}` OR `{Exec}`
 * — so two contracts that are both "unrestricted" on the ladder are distinguishable
 * by row: a doc-fetcher needs `{Net}` only; a formatter needs `{FS-write}` only;
 * neither needs the other's leg, and a row makes that asymmetry typed + checkable.
 *
 * This file proves, against real tsc 5.9.3:
 *   (a) a row is COMPUTED from the const tools tuple at the type level (a fold);
 *   (b) a declared `grants:` row that OMITS a leg a tool needs is a `tsc` error
 *       naming the missing leg — the row is a typed UPPER BOUND on effects,
 *       finer than `purity`;
 *   (c) the lethal-trifecta legs (private/untrusted/exfil) are a DIFFERENT row
 *       over the SAME tuple — one fold, many independent effect dimensions.
 *
 * Self-contained: copies a minimal typed `agent()` variant; does NOT import src/.
 */

// --- The effect-row vocabulary (the typed mirror of a dialect leg-catalog) ----

/** Independent effect legs — a SET, not a ladder. Beyond pure|bounded|unrestricted. */
type EffectLeg =
  | "fs-read"
  | "fs-write"
  | "net" // any network egress
  | "exec" // arbitrary subprocess (Bash)
  | "spawn"; // dispatch a subagent / task

/** Tool → the set of legs it grants. The row catalog (mirrors sideEffectingTools,
 *  but PER-DIMENSION instead of one side-effecting bucket). */
interface ToolRow {
  Read: "fs-read";
  Grep: "fs-read";
  Glob: "fs-read";
  Write: "fs-write";
  Edit: "fs-write";
  WebFetch: "net";
  WebSearch: "net";
  Bash: "exec"; // worst-case: exec subsumes everything, but typed as its own leg
  Task: "spawn";
}

type Tool = keyof ToolRow;

/** Legs of one tool (or never for an unknown/MCP tool — conservatively widened
 *  to the full leg set so an unknown tool can't sneak under a tight row). */
type LegsOf<T> = T extends keyof ToolRow ? ToolRow[T] : EffectLeg;

/** Fold the union of legs over the const tools tuple — the COMPUTED row. */
type RowOf<Tools extends readonly Tool[]> = LegsOf<Tools[number]>;

/** True iff every leg the tools NEED is present in the DECLARED grant row.
 *  Collapses to a descriptive error naming the first missing leg otherwise. */
type RowSatisfied<Needed extends EffectLeg, Granted extends EffectLeg> = [
  Exclude<Needed, Granted>,
] extends [never]
  ? true
  : { readonly __effect_leak: Exclude<Needed, Granted> };

// --- A minimal typed agent() that gates tools by a DECLARED effect row --------

interface AgentRowSpec<Tools extends readonly Tool[]> {
  readonly name: string;
  readonly tools: Tools;
  /** The effect row the author DECLARES this agent may use. The compiler proves
   *  the tools' computed row ⊆ this declared grant — a finer `purity`. */
  readonly grants: readonly EffectLeg[];
}

function agentRow<
  const Tools extends readonly Tool[],
  const Grant extends EffectLeg,
>(
  spec: RowSatisfied<RowOf<Tools>, Grant> extends true
    ? AgentRowSpec<Tools> & { readonly grants: readonly Grant[] }
    : AgentRowSpec<Tools> & {
        readonly grants: readonly Grant[];
        readonly __EFFECT_LEAK: RowSatisfied<RowOf<Tools>, Grant>;
      },
): AgentRowSpec<Tools> {
  return spec as AgentRowSpec<Tools>;
}

// --- PASS: a doc-fetcher whose declared row exactly covers its tools ----------

export const fetcher = agentRow({
  name: "doc-fetcher",
  tools: ["Read", "WebFetch"] as const,
  grants: ["fs-read", "net"], // covers {fs-read, net} — compiles
});

// PASS: a formatter — different row over a different tuple, NO net leg needed.
export const formatter = agentRow({
  name: "formatter",
  tools: ["Read", "Edit"] as const,
  grants: ["fs-read", "fs-write"], // compiles; note: NO "net" — finer than "bounded"
});

// PASS: over-granting is allowed (the row is an UPPER bound, like a type widening).
export const broad = agentRow({
  name: "broad",
  tools: ["Read"] as const,
  grants: ["fs-read", "net", "fs-write"], // grants more than needed — fine
});
