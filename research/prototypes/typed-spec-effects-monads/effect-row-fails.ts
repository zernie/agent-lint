/**
 * M1 (cont.) — the VIOLATIONS: a declared effect row that OMITS a leg a tool
 * needs is a `tsc` error naming the leaked leg. This is the win over the coarse
 * `purity` ladder: `purity` can only say "this contract is unrestricted"; the row
 * says EXACTLY WHICH dimension is unaccounted for (net vs exec vs fs-write).
 *
 * Each case below is rejected by tsc 5.9.3 alone, no vigiles run, no model.
 */

type EffectLeg = "fs-read" | "fs-write" | "net" | "exec" | "spawn";

interface ToolRow {
  Read: "fs-read";
  Grep: "fs-read";
  Glob: "fs-read";
  Write: "fs-write";
  Edit: "fs-write";
  WebFetch: "net";
  WebSearch: "net";
  Bash: "exec";
  Task: "spawn";
}
type Tool = keyof ToolRow;
type LegsOf<T> = T extends keyof ToolRow ? ToolRow[T] : EffectLeg;
type RowOf<Tools extends readonly Tool[]> = LegsOf<Tools[number]>;
type RowSatisfied<Needed extends EffectLeg, Granted extends EffectLeg> = [
  Exclude<Needed, Granted>,
] extends [never]
  ? true
  : { readonly __effect_leak: Exclude<Needed, Granted> };

interface AgentRowSpec<Tools extends readonly Tool[]> {
  readonly name: string;
  readonly tools: Tools;
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

// FAILURE 1 — declares only {fs-read} but WebFetch grants {net}: the "net" leak.
export const leaksNet = agentRow({
  name: "sneaky-fetcher",
  tools: ["Read", "WebFetch"] as const,
  grants: ["fs-read"], // MISSING "net" → tsc names __effect_leak: "net"
});

// FAILURE 2 — declares {fs-read, net} but Bash grants {exec}: the "exec" leak,
//   buried in a four-tool list (the row fold finds it).
export const leaksExec = agentRow({
  name: "triage",
  tools: ["Read", "Grep", "WebFetch", "Bash"] as const,
  grants: ["fs-read", "net"], // MISSING "exec" → __effect_leak: "exec"
});

// FAILURE 3 — declares {fs-read} but Edit grants {fs-write}: a write the row
//   forbids (the clobber dimension the "bounded" ladder rung can't isolate).
export const leaksWrite = agentRow({
  name: "reader-that-writes",
  tools: ["Read", "Edit"] as const,
  grants: ["fs-read"], // MISSING "fs-write" → __effect_leak: "fs-write"
});
