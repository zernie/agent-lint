/**
 * Faithful markdown → typed-spec adoption — the deterministic half of `init`
 * auto-adopt (research/install-enforcement-dx.md).
 *
 * Turns an existing instruction file (CLAUDE.md / AGENTS.md) into a `claude()`
 * spec source that compiles back to ~the same file, so adopting a rich,
 * hand-tuned instruction file is SAFE: every heading becomes a prose section
 * (verbatim), no rule is invented, nothing is dropped. The contract to the user
 * is "review the diff" — for a well-headed file that diff is small (whitespace +
 * the canonical `# <target>` h1). The agentic path (the `adopt-spec` skill)
 * handles irregular prose better; this is the zero-model floor.
 *
 * WHY IT ALWAYS COMPILES: the compiler only rejects `#`/`##` headers INSIDE a
 * section body (sections render as `##`), so we split the file on every `#`/`##`
 * heading — each becomes its own section, and `###`+ subheadings ride along
 * inside the body untouched. Reserved lowercase keys
 * (`commands`/`keyFiles`/`rules`) are never produced (`safeKey`). `guidance()`
 * vs `enforce()` is deliberately NOT guessed here — that cross-referencing is
 * `strengthen`'s separate, later job; adoption is lossless transcription.
 */

import { parseIntegrityHeader } from "./integrity.js";

export type AdoptTier = "structured" | "raw";

export interface AdoptResult {
  /** Generated `.spec.ts` source (compiles back to ~the original file). */
  source: string;
  /**
   * `structured` = a clean `##`-headed file mapped 1:1 to sections (the diff is
   * just the canonical h1 + whitespace). `raw` = a heading-less or
   * intro-bearing file we wrapped under a synthesized `Overview` section —
   * content is preserved verbatim, but the diff adds a heading, so "review the
   * diff" matters more.
   */
  tier: AdoptTier;
  /** Number of named sections produced (excluding the auto-rendered h1). */
  sectionCount: number;
}

/**
 * The intermediate adoption result: the `claude()` spec FIELDS (before
 * rendering to source). Exposed so the renderer and the round-trip tests share
 * one parse — the test can feed `sections` straight into `compileClaude` and
 * assert the file is reproduced, without evaluating generated TS source.
 */
export interface AdoptedSpec {
  target: string;
  /** Heading → verbatim section body, in document order. */
  sections: Record<string, string>;
  /** Set only when a faithful section exceeds the compiler's 200-line guard. */
  maxSectionLines?: number;
  tier: AdoptTier;
}

interface Block {
  /** Heading text, or null for the leading preamble block. */
  heading: string | null;
  /** Hash count (1 or 2) for a heading block; null for the preamble. */
  level: 1 | 2 | null;
  lines: string[];
}

// A top-level heading is `#` or `##` (the levels the compiler reserves for
// document/section structure). `###`+ stay inside a section body.
const HEADING_RE = /^ {0,3}(#{1,2})\s+(.*)$/;
const FENCE_RE = /^ {0,3}(?:`{3,}|~{3,})/;

// Mirrors compile.ts RESERVED_SECTION_KEYS — keys that clash with the structured
// `commands`/`keyFiles`/`rules` fields and would be a compile error as a section.
const RESERVED_SECTION_KEYS = new Set([
  "commands",
  "keyFiles",
  "key-files",
  "key_files",
  "rules",
]);

/**
 * Split a markdown body into a leading preamble block plus one block per
 * top-level (`#`/`##`) heading. Fence-aware, so a `## ` inside a fenced code
 * block is not a split point (matching the compiler's own section validator).
 */
function splitIntoBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  let current: Block = { heading: null, level: null, lines: [] };
  let inFence = false;
  for (const line of body.split("\n")) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      current.lines.push(line);
      continue;
    }
    const m = inFence ? null : line.match(HEADING_RE);
    if (m) {
      blocks.push(current);
      current = {
        heading: m[2].trim(),
        level: m[1].length as 1 | 2,
        lines: [],
      };
    } else {
      current.lines.push(line);
    }
  }
  blocks.push(current);
  return blocks;
}

/**
 * Avoid a reserved lowercase section key (`commands`/`rules`/…) by capitalizing
 * the first letter — which is exactly the heading the compiler renders anyway,
 * so there's no visible diff.
 */
function safeKey(heading: string): string {
  return RESERVED_SECTION_KEYS.has(heading)
    ? heading.charAt(0).toUpperCase() + heading.slice(1)
    : heading;
}

/**
 * Allocate a unique section key, disambiguating a duplicate with ` (2)`, ` (3)`,
 * … and recording it in `used`. Shared by the real-heading loop and the
 * synthesized `Overview`, so no two sections collide on one object key (which
 * would silently drop the earlier one's content).
 */
function allocKey(base: string, used: Set<string>): string {
  let key = base;
  for (let n = 2; used.has(key); n++) key = `${base} (${n})`;
  used.add(key);
  return key;
}

/**
 * Emit a readable multi-line TS template literal for arbitrary section content,
 * escaping the three sequences that would break it: backslash, backtick, and the
 * `${` interpolation opener. TS un-escapes them back to the original string, so
 * the round-trip is exact.
 */
function tsTemplate(s: string): string {
  const esc = s
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
  return "`" + esc + "`";
}

function renderSpecSource(spec: AdoptedSpec): string {
  const targetLine =
    spec.target !== "CLAUDE.md"
      ? `\n  target: ${JSON.stringify(spec.target)},`
      : "";
  const maxLine =
    spec.maxSectionLines !== undefined
      ? `\n  maxSectionLines: ${String(spec.maxSectionLines)},`
      : "";
  const entries = Object.entries(spec.sections)
    .map(
      ([key, content]) => `    ${JSON.stringify(key)}: ${tsTemplate(content)},`,
    )
    .join("\n");
  const sectionsBlock = entries
    ? `\n  sections: {\n${entries}\n  },`
    : `\n  sections: {},`;
  return `// Adopted from ${spec.target} by \`vigiles init\` — faithful by default.
// Each heading became a prose section; no rules were inferred. Run the
// \`/strengthen\` skill to upgrade prose to verified enforce()/guard() rules.
import { claude } from "vigiles/spec";

export default claude({${targetLine}${maxLine}${sectionsBlock}
  rules: {},
});
`;
}

/**
 * Parse an instruction file's markdown into the faithful `claude()` spec FIELDS.
 * The shared core of {@link adoptMarkdown} and the round-trip tests.
 *
 * @param markdown the file's current content (an existing integrity header, if
 *   any, is stripped — we adopt the body)
 * @param target   the bare target filename (`"CLAUDE.md"` / `"AGENTS.md"`),
 *   which the compiler renders as the h1
 */
export function adoptToSpec(markdown: string, target: string): AdoptedSpec {
  const header = parseIntegrityHeader(markdown);
  const body = header ? header.body : markdown;

  const blocks = splitIntoBlocks(body);
  const overviewLines: string[] = [];
  const ordered: { key: string; content: string }[] = [];
  const usedKeys = new Set<string>();
  let titleConsumed = false;
  let synthesizedHeading = false;

  for (const block of blocks) {
    if (block.level === null) {
      // Preamble before any heading — has no structural home, so it goes to a
      // synthesized Overview section.
      overviewLines.push(...block.lines);
      continue;
    }
    if (!titleConsumed && block.level === 1) {
      // The document title — the compiler re-renders `# <target>` from the
      // filename, so drop the heading line; its body (intro prose under the h1)
      // also has no slot, so it joins Overview.
      titleConsumed = true;
      overviewLines.push(...block.lines);
      continue;
    }
    const key = allocKey(safeKey(block.heading ?? ""), usedKeys);
    ordered.push({ key, content: block.lines.join("\n").trim() });
  }

  const overview = overviewLines.join("\n").trim();
  if (overview) {
    synthesizedHeading = true;
    // Allocate the synthesized key with the SAME dedup as real headings, so a
    // file that already has a literal `## Overview` doesn't collide and silently
    // drop the intro when the sections object is built (it becomes "Overview (2)").
    ordered.unshift({ key: allocKey("Overview", usedKeys), content: overview });
  }

  const sections: Record<string, string> = {};
  for (const { key, content } of ordered) sections[key] = content;

  // A faithful section can legitimately be long; lift the 200-line guard above
  // the longest one so adoption never trips it (only when actually needed, so a
  // normal spec stays free of the override).
  const longest = ordered.reduce(
    (n, s) => Math.max(n, s.content.split("\n").length),
    0,
  );

  return {
    target,
    sections,
    maxSectionLines: longest > 190 ? longest + 50 : undefined,
    tier: synthesizedHeading || ordered.length === 0 ? "raw" : "structured",
  };
}

/**
 * Convert an instruction file's markdown into a faithful `claude()` spec source
 * (the deliverable `init` writes).
 */
export function adoptMarkdown(markdown: string, target: string): AdoptResult {
  const spec = adoptToSpec(markdown, target);
  return {
    source: renderSpecSource(spec),
    tier: spec.tier,
    sectionCount: Object.keys(spec.sections).length,
  };
}
