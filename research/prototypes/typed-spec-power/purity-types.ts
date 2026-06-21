/**
 * PROTOTYPE — make-invalid-states-unrepresentable for purity (seed #4).
 *
 * Goal: prove a TYPED spec can make "a `pure` agent given a side-effecting tool"
 * a COMPILE error, not a runtime check. Today vigiles enforces this at compile
 * time in the COMPILER (purityViolations in src/core/effects.ts) — a real,
 * shipped check — but it runs only when you invoke `vigiles compile`. The
 * question for this research is whether the TYPE SYSTEM can reject it earlier,
 * at the spec's own `tsc`, with no vigiles command in the loop.
 *
 * This POC COPIES a minimal tool/effect catalog; it does NOT touch the shipped
 * src/core/spec.ts. Run the pass case:
 *   npx tsc --noEmit --strict purity-types.ts
 * Run the failure case: see ./purity-fails.ts
 */

// The Claude Code built-in tools, split by effect (mirrors dialect.sideEffectingTools).
type ReadOnlyTool = "Read" | "Grep" | "Glob" | "WebSearch" | "WebFetch";
type SideEffectingTool = "Write" | "Edit" | "Bash" | "NotebookEdit";
type Tool = ReadOnlyTool | SideEffectingTool;

type Purity = "pure" | "bounded" | "dangerously-unrestricted";

/**
 * The set of tools ALLOWED at a purity level, as a TYPE.
 * - pure: read-only only.
 * - bounded: read-only + the decidable side-effecting tools (Write/Edit/Notebook),
 *   but NOT Bash (its effect is undecidable at the tool level).
 * - dangerously-unrestricted: anything.
 */
type AllowedAt<P extends Purity> = P extends "pure"
  ? ReadOnlyTool
  : P extends "bounded"
    ? ReadOnlyTool | "Write" | "Edit" | "NotebookEdit"
    : Tool;

interface PureAgentSpec<P extends Purity> {
  readonly name: string;
  readonly purity: P;
  /** Every tool must be allowed at the declared purity — enforced by the type. */
  readonly tools: readonly AllowedAt<P>[];
}

function agent<const P extends Purity>(spec: PureAgentSpec<P>): PureAgentSpec<P> {
  return spec;
}

// ---------------------------------------------------------------------------
// Passing cases — these COMPILE.
// ---------------------------------------------------------------------------

export const reviewer = agent({
  name: "reviewer",
  purity: "pure",
  tools: ["Read", "Grep", "Glob"], // all read-only — OK at `pure`
});

export const editor = agent({
  name: "editor",
  purity: "bounded",
  tools: ["Read", "Write", "Edit"], // Write/Edit allowed at `bounded`
});

export const yolo = agent({
  name: "yolo",
  purity: "dangerously-unrestricted",
  tools: ["Read", "Bash", "Write"], // the loud escape hatch — anything goes
});
