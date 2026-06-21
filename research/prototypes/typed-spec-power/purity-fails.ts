/**
 * PROTOTYPE — the FAILURE proof for typed purity (seed #4).
 *
 *   npx tsc --noEmit --strict research/prototypes/typed-spec-power/purity-fails.ts
 *
 * Captured output is in research/typed-spec-power.md.
 */

// Re-declare the minimal catalog inline so this file is a self-contained proof.
type ReadOnlyTool = "Read" | "Grep" | "Glob" | "WebSearch" | "WebFetch";
type SideEffectingTool = "Write" | "Edit" | "Bash" | "NotebookEdit";
type Tool = ReadOnlyTool | SideEffectingTool;
type Purity = "pure" | "bounded" | "dangerously-unrestricted";
type AllowedAt<P extends Purity> = P extends "pure"
  ? ReadOnlyTool
  : P extends "bounded"
    ? ReadOnlyTool | "Write" | "Edit" | "NotebookEdit"
    : Tool;
interface PureAgentSpec<P extends Purity> {
  readonly name: string;
  readonly purity: P;
  readonly tools: readonly AllowedAt<P>[];
}
function agent<const P extends Purity>(spec: PureAgentSpec<P>): PureAgentSpec<P> {
  return spec;
}

// FAILURE 1 — a `pure` agent handed `Bash`. tsc rejects: "Bash" is not assignable
// to AllowedAt<"pure"> (= ReadOnlyTool). Invalid state is UNREPRESENTABLE.
export const badPure = agent({
  name: "reviewer",
  purity: "pure",
  tools: ["Read", "Bash"], // <- Bash on a pure agent
});

// FAILURE 2 — a `bounded` agent handed `Bash` (bounded bars Bash at the type level).
export const badBounded = agent({
  name: "editor",
  purity: "bounded",
  tools: ["Read", "Write", "Bash"], // <- Bash on a bounded agent
});
