/**
 * Lenient frontmatter reader — ONE reader for the SKILL.md / subagent `---` block,
 * shared by `scan` and the PreToolUse rail (`agent-runtime`). It is deliberately
 * fault-tolerant: it audits arbitrary third-party files, so it must never throw
 * and must salvage the few scalar/list fields it needs even from a block that
 * isn't valid YAML.
 *
 * The strategy is "real parser, with a safety net": try `js-yaml` (so block
 * scalars, quoted/multi-line values, and flow arrays parse correctly for free);
 * if the block isn't valid YAML, fall back to a regex salvage of the requested
 * field and record `malformed: true` (the signal the `frontmatter-valid` rule
 * reports). A single bad line therefore never blanks out a whole file's metadata.
 *
 * This replaces three divergent hand-parsers (the old `readField` in scan.ts and
 * the regex parse in agent-runtime.ts); `core/frontmatter.ts` is a DIFFERENT
 * concern (the Level-1 `vigiles:` rule block) and is untouched.
 */
import { load, YAMLException } from "js-yaml";

export interface FrontmatterRead {
  /** Parsed mapping when the block is valid YAML, else null (malformed or scalar). */
  readonly data: Record<string, unknown> | null;
  /** Raw text inside the leading `---` fences, or null when there's no block. */
  readonly block: string | null;
  /** True when a leading `---` block EXISTS but is NOT valid YAML. */
  readonly malformed: boolean;
}

// Frontmatter is the very first thing in the file. Anchoring at the start — not
// `(?:^|\n)` — means a `---` horizontal rule in the BODY is never mistaken for
// frontmatter (which matters for the malformed-YAML verdict). A leading BOM is
// stripped first; an optional leading HTML comment is allowed too — vigiles
// stamps a compiled file with `<!-- vigiles:sha256:… -->` before the `---`.
const BLOCK_RE = /^\uFEFF?(?:<!--[\s\S]*?-->\s*)?---\r?\n([\s\S]*?)\r?\n---/;

/** A YAML block-scalar indicator: `>`/`|` with optional chomp (`+`/`-`) + indent digit. */
const BLOCK_SCALAR_RE = /^[|>][+-]?\d*$/;

/** Extract + parse the leading frontmatter block, never throwing. */
export function readFrontmatter(markdown: string): FrontmatterRead {
  const m = BLOCK_RE.exec(markdown);
  if (!m) return { data: null, block: null, malformed: false };
  const block = m[1];
  try {
    const parsed = load(block);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return {
        data: parsed as Record<string, unknown>,
        block,
        malformed: false,
      };
    }
    // Valid YAML but not a mapping (e.g. a bare scalar) — usable as no data, but
    // not "malformed": it parsed fine. Salvage will read fields from the block.
    return { data: null, block, malformed: false };
  } catch (e) {
    if (e instanceof YAMLException)
      return { data: null, block, malformed: true };
    throw e;
  }
}

/**
 * A top-level scalar field — from parsed YAML when valid, else a regex salvage
 * from the raw block (handling a block scalar `>`/`|` and a quoted value that
 * starts on the next indented line).
 */
export function frontmatterScalar(
  fm: FrontmatterRead,
  key: string,
): string | undefined {
  if (fm.data && Object.prototype.hasOwnProperty.call(fm.data, key)) {
    const v = fm.data[key];
    if (typeof v === "string") return v.trim() || undefined;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return undefined; // an array/object/null isn't a scalar field
  }
  return fm.block === null ? undefined : salvageField(fm.block, key);
}

/**
 * A tool-list field (`tools:` / `disallowedTools:`) — an array or a comma list,
 * normalized to string[]. Returns `null` when the key is ABSENT (the "no
 * contract / inherits all" signal the rail honors) and `[]` when the key is
 * PRESENT but empty ("no tools"). Salvages from the raw block when YAML is
 * malformed, so the rail still reads the contract.
 */
export function frontmatterList(
  fm: FrontmatterRead,
  key: string,
): string[] | null {
  if (fm.data && Object.prototype.hasOwnProperty.call(fm.data, key)) {
    const v = fm.data[key];
    if (v === null) return []; // `key:` with nothing after it → empty contract
    if (Array.isArray(v))
      return v.map((x) => String(x).trim()).filter((s) => s.length > 0);
    if (typeof v === "string") return splitList(v);
    return [];
  }
  return fm.block === null ? null : salvageList(fm.block, key);
}

// --- salvage (the malformed-YAML / no-data fallback) ------------------------

/** Old `readField`: gather a possibly multi-line scalar value from the raw block. */
function salvageField(block: string, key: string): string | undefined {
  const lines = block.split(/\r?\n/);
  const idx = lines.findIndex((l) => new RegExp(`^${key}:`).test(l));
  if (idx === -1) return undefined;
  const keyIndent = /^(\s*)/.exec(lines[idx])?.[1].length ?? 0;
  const inline = (
    new RegExp(`^${key}:[ \\t]*(.*)$`).exec(lines[idx])?.[1] ?? ""
  ).trim();
  if (inline && !BLOCK_SCALAR_RE.test(inline)) {
    return inline.replace(/^["']|["']$/g, "").trim() || undefined;
  }
  const collected: string[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    const indent = /^(\s*)/.exec(lines[i])?.[1].length ?? 0;
    if (indent <= keyIndent) break;
    collected.push(lines[i].trim());
  }
  return (
    collected
      .join(" ")
      .trim()
      .replace(/^["']/, "")
      .replace(/["']$/, "")
      .trim() || undefined
  );
}

/** Salvage a list field from the raw block (single-line key only). */
function salvageList(block: string, key: string): string[] | null {
  const match = new RegExp(`^${key}:[ \\t]*(.*)$`, "m").exec(block);
  if (!match) return null;
  return splitList(match[1]);
}

/** Split a comma list or inline-array string into trimmed, de-quoted tokens. */
function splitList(raw: string): string[] {
  return raw
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((t) => t.trim().replace(/^["']|["']$/g, ""))
    .filter((t) => t.length > 0);
}
