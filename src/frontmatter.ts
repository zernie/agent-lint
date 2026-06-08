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

/** A `vigiles.files` entry (verified to exist). */
export interface FrontmatterFileRef {
  /** Project-relative path to verify exists. */
  path: string;
  /** 1-based line number of the entry in the source file (best-effort). */
  line: number;
}

/** A `vigiles.commands` entry (npm scripts verified against package.json). */
export interface FrontmatterCmdRef {
  /** Command to verify. */
  command: string;
  /** 1-based line number of the entry in the source file (best-effort). */
  line: number;
}

export interface FrontmatterParseResult {
  rules: FrontmatterRule[];
  files: FrontmatterFileRef[];
  commands: FrontmatterCmdRef[];
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

/** Result of locating the `vigiles` mapping within a parsed document. */
type VigilesLookup =
  | { kind: "none" }
  | { kind: "error"; error: FrontmatterError }
  | { kind: "map"; vigiles: Record<string, unknown> };

/**
 * Navigate a parsed frontmatter document to its `vigiles` mapping. Returns
 * "none" when there's nothing for vigiles to check, "error" when the
 * `vigiles` key is present but not a mapping, or the mapping itself.
 */
function getVigiles(
  doc: unknown,
  lines: string[],
  startLine: number,
): VigilesLookup {
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
  return { kind: "map", vigiles: vigiles as Record<string, unknown> };
}

/** Result of locating the `vigiles.enforce` list within the mapping. */
type EnforceLookup =
  | { kind: "none" }
  | { kind: "error"; error: FrontmatterError }
  | { kind: "list"; enforce: unknown[]; enforceLine: number };

/**
 * Locate the `vigiles.enforce` list. Returns "none" when absent, "error" when
 * present but not a list, or the list with its source line.
 */
function lookupEnforce(
  vigiles: Record<string, unknown>,
  lines: string[],
  startLine: number,
): EnforceLookup {
  const enforce = vigiles.enforce;
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

/**
 * Parse a `vigiles.<key>` list of plain strings (used for `files` and
 * `commands`). Returns located items plus error findings for the wrong shape
 * or non-string entries; an absent key yields empty results.
 */
function parseStringList(
  vigiles: Record<string, unknown>,
  key: "files" | "commands",
  lines: string[],
  startLine: number,
): { items: { value: string; line: number }[]; errors: FrontmatterError[] } {
  const raw = vigiles[key];
  if (raw === undefined) return { items: [], errors: [] };
  const keyLine = findLine(lines, `${key}:`, startLine - 1);
  if (!Array.isArray(raw)) {
    return {
      items: [],
      errors: [
        {
          line: keyLine,
          message: `\`vigiles.${key}\` must be a list of strings.`,
        },
      ],
    };
  }
  const items: { value: string; line: number }[] = [];
  const errors: FrontmatterError[] = [];
  let cursor = keyLine;
  for (let i = 0; i < raw.length; i++) {
    const v: unknown = raw[i];
    if (typeof v !== "string" || v.trim() === "") {
      errors.push({
        line: keyLine,
        message: `vigiles.${key}[${String(i)}] must be a non-empty string.`,
      });
      continue;
    }
    const line = findLine(lines, v, cursor);
    cursor = line;
    items.push({ value: v, line });
  }
  return { items, errors };
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

/** Fresh empty result — callers may push into the arrays, so never shared. */
function emptyResult(): FrontmatterParseResult {
  return { rules: [], files: [], commands: [], errors: [] };
}

/**
 * Parse `vigiles.enforce` rules, `vigiles.files`, and `vigiles.commands` out
 * of a markdown file's YAML frontmatter. Does not touch the filesystem and
 * does not verify references — callers feed rules into `checkLinterRule` and
 * file/command refs into `validateFileRef` / `validateCommandRef`.
 *
 * A file with no frontmatter, or frontmatter with no `vigiles` key, yields
 * empty results with no errors. Malformed YAML or a malformed `vigiles`
 * block yields error findings (never throws).
 */
export function parseFrontmatterRules(content: string): FrontmatterParseResult {
  const fm = extractFrontmatter(content);
  if (!fm) return emptyResult();

  const lines = content.split("\n");

  let doc: unknown;
  try {
    doc = load(fm.yaml);
  } catch (e) {
    const err = e as YAMLException;
    const line = (err.mark?.line ?? 0) + fm.startLine;
    return {
      rules: [],
      files: [],
      commands: [],
      errors: [
        {
          line,
          message: `Malformed YAML frontmatter: ${err.reason ?? err.message}`,
        },
      ],
    };
  }

  const vig = getVigiles(doc, lines, fm.startLine);
  if (vig.kind === "none") return emptyResult();
  if (vig.kind === "error")
    return { rules: [], files: [], commands: [], errors: [vig.error] };

  const rules: FrontmatterRule[] = [];
  const errors: FrontmatterError[] = [];

  const enforceLookup = lookupEnforce(vig.vigiles, lines, fm.startLine);
  if (enforceLookup.kind === "error") {
    errors.push(enforceLookup.error);
  } else if (enforceLookup.kind === "list") {
    let cursor = enforceLookup.enforceLine; // search start: line after `enforce:`
    for (let i = 0; i < enforceLookup.enforce.length; i++) {
      const r = parseEntry(enforceLookup.enforce[i], i, {
        lines,
        enforceLine: enforceLookup.enforceLine,
        cursor,
      });
      cursor = r.nextCursor;
      if (r.rule) rules.push(r.rule);
      if (r.error) errors.push(r.error);
    }
  }

  const fileList = parseStringList(vig.vigiles, "files", lines, fm.startLine);
  errors.push(...fileList.errors);
  const files: FrontmatterFileRef[] = fileList.items.map((it) => ({
    path: it.value,
    line: it.line,
  }));

  const cmdList = parseStringList(vig.vigiles, "commands", lines, fm.startLine);
  errors.push(...cmdList.errors);
  const commands: FrontmatterCmdRef[] = cmdList.items.map((it) => ({
    command: it.value,
    line: it.line,
  }));

  return { rules, files, commands, errors };
}

/**
 * True if the content has at least one parseable `vigiles` reference in its
 * frontmatter — an `enforce` rule, a `files` entry, or a `commands` entry.
 * Used by `require-spec` validation to treat frontmatter mode as
 * spec-equivalent, mirroring `hasInlineRules`.
 */
export function hasFrontmatterRules(content: string): boolean {
  const r = parseFrontmatterRules(content);
  return r.rules.length + r.files.length + r.commands.length > 0;
}
