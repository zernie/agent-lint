/**
 * vigiles — the ONE markdown-structure helper.
 *
 * Every place that needs to know "is this source line inside a fenced code
 * block?" routes through here, so no detector hand-rolls a fence toggle again.
 * The naive `inFence = !inFence` toggle (copy-pasted across five detectors
 * before this) is WRONG on nested / unbalanced fences: a 4-backtick block
 * containing a bare ``` line mis-toggles, and a `##` inside the block leaks out
 * as a real heading (demonstrated against `adopt`'s block splitter). Backed by
 * markdown-it (CommonMark) — the same "use the real parser, not regex"
 * discipline this repo already applies to Bash (mvdan-sh), code (ast-grep),
 * YAML (js-yaml), and TOML (@iarna/toml). Markdown was the one structured format
 * still parsed by hand.
 *
 * Node-free by construction: markdown-it is pure JS with no node builtins, so
 * this bundles clean in the browser scan engine (reached via skill-resources).
 */
import MarkdownIt from "markdown-it";

// One reusable parser; parse() is stateless across calls.
const md = new MarkdownIt();

/**
 * A boolean per source line (0-based): `true` when the line lies inside a fenced
 * code block (` ``` ` or `~~~`), the delimiter lines included — matching the
 * scope of the hand-rolled `FENCE` regexes this replaces. Indented code blocks
 * are deliberately NOT flagged, to preserve the prior detectors' behavior (they
 * only ever recognized fenced blocks). Correct on nested and unbalanced fences,
 * which the naive toggle was not.
 *
 * Pass the SAME string the caller iterates with `.split("\n")` so the returned
 * indices line up 1:1 with the caller's line array.
 */
export function fencedLineFlags(src: string): boolean[] {
  const lineCount = src.split("\n").length;
  const flags = new Array<boolean>(lineCount).fill(false);
  for (const tok of md.parse(src, {})) {
    // Only real ``` / ~~~ fences (a block-level token); markdown-it's `map` is
    // a [start, end) 0-based line range covering the delimiters + body.
    if (tok.type !== "fence" || tok.map === null) continue;
    const [start, end] = tok.map;
    for (let i = start; i < end && i < lineCount; i++) flags[i] = true;
  }
  return flags;
}

/** One fenced code block: its BODY (delimiters excluded) and where the body starts. */
export interface FencedBlock {
  /** The block's contents, without the opening/closing fence lines. */
  readonly body: string;
  /** 1-BASED line number of the body's first line, for a caller's messages. */
  readonly start: number;
}

/**
 * Every fenced code block in `src`, in document order — the same parser
 * {@link fencedLineFlags} uses, for callers that want the CONTENTS rather than a
 * per-line flag.
 *
 * 🔴 THE CLOSING FENCE MUST MATCH THE OPENING ONE, and every hand-rolled version
 * of this in the repo got that wrong the same way: any line beginning with three
 * backticks TOGGLED. CommonMark says a closing fence uses the same CHARACTER as
 * the opener and is at least as LONG, so a four-backtick block wrapping an
 * ordinary ``` example closes early — the block is cut in half, and the prose
 * after it becomes "another block" whose text is then read as commands. That
 * makes a document-rule check both MISS commands and JUDGE prose. `~~~` fences
 * were not recognized at all.
 *
 * Backed by markdown-it (CommonMark), so delimiter character, delimiter length,
 * `~~~`, indented fences inside list items and an unterminated final fence are
 * all decided by the grammar rather than re-derived here. Measured 2026-08-12 on
 * each of those shapes.
 *
 * One deliberate difference from a hand-rolled toggle, and it is the grammar's:
 * a fence indented FOUR or more spaces at top level is an indented code block,
 * not a fence, and is not returned. Line numbers count from the ORIGINAL source,
 * so a caller's message points at the real line.
 */
export function fencedCodeBlocks(src: string): FencedBlock[] {
  const out: FencedBlock[] = [];
  for (const tok of md.parse(src, {})) {
    if (tok.type !== "fence" || tok.map === null) continue;
    // `content` is the body only; `map[0]` is the OPENING delimiter's 0-based
    // line, so the body's first line is 1-based `map[0] + 2`.
    out.push({ body: tok.content.replace(/\n$/, ""), start: tok.map[0] + 2 });
  }
  return out;
}
