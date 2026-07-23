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
