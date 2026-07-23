/**
 * fencedLineFlags — the shared fence oracle that replaced five copy-pasted
 * `inFence = !inFence` toggles. The load-bearing case is the one the naive
 * toggle got WRONG: a nested / unbalanced fence, where an odd count of
 * fence-looking lines flipped the toggle and leaked a `##` inside a code block
 * out as a real heading.
 */
import { describe, it, expect } from "vitest";
import { fencedLineFlags } from "./markdown.js";

/** Indices (0-based) whose flag is true, for compact assertions. */
const fencedIndices = (src: string): number[] =>
  fencedLineFlags(src).flatMap((f, i) => (f ? [i] : []));

describe("fencedLineFlags", () => {
  it("flags the lines of a simple fenced block, delimiters included", () => {
    const src = ["before", "```", "code", "```", "after"].join("\n");
    expect(fencedIndices(src)).toEqual([1, 2, 3]);
  });

  it("returns one flag per source line, none outside a fence", () => {
    const src = ["# H", "", "para"].join("\n");
    expect(fencedLineFlags(src)).toEqual([false, false, false]);
  });

  it("handles a NESTED fence: an inner ``` inside a 4-backtick block stays fenced", () => {
    const src = [
      "## Setup", // 0
      "", // 1
      "````markdown", // 2  outer open
      "```bash", // 3  inner (would flip a naive toggle)
      "echo hi", // 4
      "```", // 5  inner close
      "## inside the block", // 6  must be treated as fenced, NOT a heading
      "````", // 7  outer close
      "", // 8
      "## Rules", // 9  the only OTHER real content line
    ].join("\n");
    const flags = fencedLineFlags(src);
    // The entire outer block (lines 2..7) is fenced — including the `##` at 6.
    expect(flags[6]).toBe(true);
    expect(fencedIndices(src)).toEqual([2, 3, 4, 5, 6, 7]);
    // Real headings outside the block are NOT fenced.
    expect(flags[0]).toBe(false);
    expect(flags[9]).toBe(false);
  });

  it("handles an UNBALANCED / stray fence — the case the naive toggle corrupted", () => {
    // A single stray ``` line inside the outer block (odd toggle count). The
    // naive toggle wrongly treated the trailing `##` as outside a fence; the
    // real parser keeps the whole outer block fenced.
    const src = [
      "## Setup", // 0
      "", // 1
      "````markdown", // 2 outer open
      "To open a code block, type:", // 3
      "```", // 4 stray single fence (odd)
      "## Heading INSIDE the outer block", // 5 must stay fenced
      "````", // 6 outer close
      "", // 7
      "## Rules", // 8
    ].join("\n");
    const flags = fencedLineFlags(src);
    expect(flags[5]).toBe(true); // the in-block `##` is fenced, not a heading
    expect(flags[0]).toBe(false);
    expect(flags[8]).toBe(false);
  });

  it("supports ~~~ fences too", () => {
    const src = ["a", "~~~", "x", "~~~", "b"].join("\n");
    expect(fencedIndices(src)).toEqual([1, 2, 3]);
  });

  it("does NOT flag indented code (matches the prior FENCE regex scope)", () => {
    // Four-space-indented code is NOT a fenced block; the detectors this helper
    // replaced only ever recognized ``` / ~~~ fences.
    const src = ["para", "", "    not a fence, indented code", "", "end"].join(
      "\n",
    );
    expect(fencedLineFlags(src).every((f) => !f)).toBe(true);
  });
});
