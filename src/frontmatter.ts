/**
 * vigiles — YAML frontmatter rule mode (Level 1 adoption).
 *
 * Parses a `vigiles.enforce` block out of a markdown file's YAML
 * frontmatter, so a project can declare enforce rules in structured YAML
 * instead of `<!-- vigiles:enforce ... -->` HTML comments (Level 0) or a
 * typed `.spec.ts` (Level 2). Every frontmatter rule goes through the same
 * `checkLinterRule` verification as inline and spec rules.
 *
 * Shape (verbose — chosen so a JSON Schema can give `rule` an enum that
 * YAML LSP autocompletes and squiggles on typo):
 *
 *   ---
 *   # yaml-language-server: $schema=./.vigiles/schema.json
 *   vigiles:
 *     enforce:
 *       - rule: "@typescript-eslint/no-explicit-any"
 *         why: "Use unknown"
 *   ---
 *
 * Like inline mode, only `enforce` is supported — the prose body of the
 * file is the guidance. Malformed YAML is reported, never thrown: a broken
 * frontmatter block produces an error finding, not a crash.
 */

import { load, YAMLException } from "js-yaml";

export interface FrontmatterRule {
  /** Linter rule reference, e.g. "eslint/no-console". */
  linterRule: string;
  /** Why this rule is enforced (human-readable, shown in agent context). */
  why: string;
  /** 1-based line number of the rule in the source file (best-effort). */
  line: number;
}

export interface FrontmatterParseResult {
  rules: FrontmatterRule[];
  /** Frontmatter that looks like a vigiles block but failed to parse. */
  errors: { line: number; message: string }[];
}

const BOM = "﻿";
const OPEN_RE = /^---[ \t]*\r?\n/;
const CLOSE_RE = /\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

interface Frontmatter {
  yaml: string;
  /** 1-based source line of the first YAML content line (after the opener). */
  startLine: number;
}

/**
 * Extract the YAML frontmatter block. Frontmatter must be the very first
 * thing in the file (after an optional BOM): a `---` line, the YAML body,
 * then a closing `---` or `...` line. Returns null when no block is present.
 */
function extractFrontmatter(content: string): Frontmatter | null {
  const text = content.startsWith(BOM) ? content.slice(BOM.length) : content;
  const open = OPEN_RE.exec(text);
  if (!open) return null;
  const rest = text.slice(open[0].length);
  const close = CLOSE_RE.exec(rest);
  if (!close) return null;
  // Line 1 is the opening `---`; YAML content starts on line 2.
  return { yaml: rest.slice(0, close.index), startLine: 2 };
}

/** First 1-based line at or after `fromIndex` whose text contains `needle`. */
function findLine(lines: string[], needle: string, fromIndex: number): number {
  for (let i = fromIndex; i < lines.length; i++) {
    if (lines[i].includes(needle)) return i + 1;
  }
  return fromIndex + 1;
}

type FrontmatterError = { line: number; message: string };

/** Result of locating the `vigiles.enforce` list within a parsed document. */
type EnforceLookup =
  | { kind: "none" }
  | { kind: "error"; error: FrontmatterError }
  | { kind: "list"; enforce: unknown[]; enforceLine: number };

/**
 * Navigate a parsed frontmatter document to its `vigiles.enforce` list.
 * Returns "none" when there's nothing for vigiles to check, "error" when a
 * `vigiles`/`enforce` key is present but the wrong shape, or the list.
 */
function lookupEnforce(
  doc: unknown,
  lines: string[],
  startLine: number,
): EnforceLookup {
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return { kind: "none" };
  }
  const vigiles = (doc as Record<string, unknown>).vigiles;
  if (vigiles === undefined) return { kind: "none" };
  if (
    vigiles === null ||
    typeof vigiles !== "object" ||
    Array.isArray(vigiles)
  ) {
    return {
      kind: "error",
      error: {
        line: findLine(lines, "vigiles:", startLine - 1),
        message: "`vigiles` frontmatter key must be a mapping.",
      },
    };
  }
  const enforce = (vigiles as Record<string, unknown>).enforce;
  if (enforce === undefined) return { kind: "none" };
  const enforceLine = findLine(lines, "enforce:", startLine - 1);
  if (!Array.isArray(enforce)) {
    return {
      kind: "error",
      error: {
        line: enforceLine,
        message: "`vigiles.enforce` must be a list of { rule, why } entries.",
      },
    };
  }
  return { kind: "list", enforce, enforceLine };
}

interface EntryContext {
  lines: string[];
  enforceLine: number;
  /** Line index to search forward from when locating the next rule. */
  cursor: number;
}

/** Parse one `vigiles.enforce` entry into a rule or an error finding. */
function parseEntry(
  entry: unknown,
  index: number,
  ctx: EntryContext,
): { rule?: FrontmatterRule; error?: FrontmatterError; nextCursor: number } {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    return {
      error: {
        line: ctx.enforceLine,
        message: `vigiles.enforce[${String(index)}] must be a mapping with \`rule\` and \`why\`.`,
      },
      nextCursor: ctx.cursor,
    };
  }
  const { rule, why } = entry as Record<string, unknown>;
  if (typeof rule !== "string" || rule.trim() === "") {
    return {
      error: {
        line: ctx.enforceLine,
        message: `vigiles.enforce[${String(index)}] is missing a string \`rule\`.`,
      },
      nextCursor: ctx.cursor,
    };
  }
  const line = findLine(ctx.lines, rule, ctx.cursor);
  if (typeof why !== "string" || why.trim() === "") {
    return {
      error: {
        line,
        message: `vigiles.enforce[${String(index)}] (rule "${rule}") is missing a string \`why\`.`,
      },
      nextCursor: line,
    };
  }
  return { rule: { linterRule: rule, why, line }, nextCursor: line };
}

/**
 * Parse `vigiles.enforce` rules out of a markdown file's YAML frontmatter.
 * Does not touch the filesystem and does not verify rules against any
 * linter — callers feed the returned rules into `checkLinterRule`.
 *
 * A file with no frontmatter, or frontmatter with no `vigiles` key, yields
 * empty results with no errors. Malformed YAML or a malformed `vigiles`
 * block yields error findings (never throws).
 */
export function parseFrontmatterRules(content: string): FrontmatterParseResult {
  const fm = extractFrontmatter(content);
  if (!fm) return { rules: [], errors: [] };

  const lines = content.split("\n");

  let doc: unknown;
  try {
    doc = load(fm.yaml);
  } catch (e) {
    const err = e as YAMLException;
    const line = (err.mark?.line ?? 0) + fm.startLine;
    return {
      rules: [],
      errors: [
        {
          line,
          message: `Malformed YAML frontmatter: ${err.reason ?? err.message}`,
        },
      ],
    };
  }

  const lookup = lookupEnforce(doc, lines, fm.startLine);
  if (lookup.kind === "none") return { rules: [], errors: [] };
  if (lookup.kind === "error") return { rules: [], errors: [lookup.error] };

  const rules: FrontmatterRule[] = [];
  const errors: FrontmatterError[] = [];
  let cursor = lookup.enforceLine; // search start: line after `enforce:`
  for (let i = 0; i < lookup.enforce.length; i++) {
    const r = parseEntry(lookup.enforce[i], i, {
      lines,
      enforceLine: lookup.enforceLine,
      cursor,
    });
    cursor = r.nextCursor;
    if (r.rule) rules.push(r.rule);
    if (r.error) errors.push(r.error);
  }

  return { rules, errors };
}

/**
 * True if the content has at least one parseable `vigiles.enforce` rule in
 * its frontmatter. Used by `require-spec` validation to treat frontmatter
 * mode as spec-equivalent, mirroring `hasInlineRules`.
 */
export function hasFrontmatterRules(content: string): boolean {
  return parseFrontmatterRules(content).rules.length > 0;
}
