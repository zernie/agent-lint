/**
 * vigiles — harness-pinned reference resolution.
 *
 * The corpus says authors write bare references (`parseConfig`, `User#full_name`)
 * and ~never a verifiable `file#symbol` form. So the harness does the work: at
 * write time (a PostToolUse hook on an instruction file) we resolve each bare
 * reference against the live project symbol index and *pin* the ones that
 * resolve uniquely. The pin (`reference → file`) is the durable, non-gameable
 * artifact `audit` later re-checks — a renamed/removed symbol breaks the pin.
 *
 * Opportunistic by design: we pin what clearly resolves and never invent pins
 * for prose. A reference is only considered if it has a *code shape*
 * (snake_case / camelCase / SCREAMING_CASE / PascalCase / scoped `Class#method`)
 * — a bare lowercase word like `name` or `high` is left as prose, avoiding the
 * scan false-positive trap. Code-shaped references that do NOT resolve are
 * surfaced to the agent at write time (typo / hallucination), with full context.
 *
 * R1 (cross-compat): only inline code spans are read. Fenced code blocks are
 * never touched, so rustdoc doctests / typescript-docs-verifier keep working.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

import { globSync } from "glob";

import { SymbolIndex, resolveSymbol, definedSymbolsInFile } from "./symbols.js";

const SOURCE_GLOB = "**/*.{ts,tsx,js,jsx,mjs,cjs,py,pyi,rs,rb,rbi,css}";
const IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**",
  "**/.vigiles/**",
  "**/vendor/**",
];

/** Build a project-wide symbol index from the source files under `cwd`. */
export function buildProjectIndex(cwd: string): SymbolIndex {
  const index = new SymbolIndex();
  const files = globSync(SOURCE_GLOB, { cwd, ignore: IGNORE, nodir: true });
  for (const rel of files) {
    // Store the nice relative path, read from the absolute one.
    index.add(rel, definedSymbolsInFile(resolve(cwd, rel)));
  }
  return index;
}

/** An inline code span with its 1-based source line. */
export interface Span {
  readonly text: string;
  readonly line: number;
}

const FENCE = /^\s*```/;
const SPAN = /`([^`\n]+)`/g;

/**
 * Extract inline code spans, skipping fenced code blocks (R1). Returns each
 * span's trimmed text and 1-based line.
 */
export function inlineSpans(markdown: string): Span[] {
  const spans: Span[] = [];
  let inFence = false;
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (FENCE.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const m of lines[i].matchAll(SPAN)) {
      spans.push({ text: m[1].trim(), line: i + 1 });
    }
  }
  return spans;
}

const SCOPED = /^[A-Za-z_]\w*(?:#|::)[\w?!]+$/;
const PLAIN_ID = /^[A-Za-z_]\w*$/;

/**
 * Whether a span has a *code shape* worth resolving — scoped, or a plain
 * identifier that isn't a bare lowercase word (those are almost always prose).
 */
export function isCodeShaped(text: string): boolean {
  if (SCOPED.test(text)) return true;
  if (!PLAIN_ID.test(text)) return false;
  const hasUnderscore = text.includes("_");
  const hasCamel = /[a-z][A-Z]/.test(text);
  const isPascal = /^[A-Z][a-z]/.test(text);
  const isScreaming = /^[A-Z][A-Z0-9_]+$/.test(text);
  return hasUnderscore || hasCamel || isPascal || isScreaming;
}

/** A reference resolved to a single definition. */
export interface Pin {
  readonly ref: string;
  readonly line: number;
  readonly file: string;
}

/** A code-shaped reference that did not resolve, or resolved ambiguously. */
export interface Unresolved {
  readonly ref: string;
  readonly line: number;
  readonly status: "missing" | "ambiguous";
  /** Candidate files when ambiguous. */
  readonly candidates: readonly string[];
}

export interface PinResult {
  readonly pinned: readonly Pin[];
  readonly unresolved: readonly Unresolved[];
}

/**
 * Resolve the code-shaped inline references in a markdown instruction file
 * against the project index: pin the unique ones, collect the rest for the
 * agent to disposition (typo, ambiguity, or genuinely missing).
 */
export function pinReferences(markdown: string, index: SymbolIndex): PinResult {
  const pinned: Pin[] = [];
  const unresolved: Unresolved[] = [];
  const seen = new Set<string>();
  for (const span of inlineSpans(markdown)) {
    if (!isCodeShaped(span.text)) continue;
    const key = `${span.text}@${String(span.line)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const r = resolveSymbol(index, span.text);
    if (r.status === "unique") {
      pinned.push({
        ref: span.text,
        line: span.line,
        file: r.locations[0].file,
      });
    } else {
      unresolved.push({
        ref: span.text,
        line: span.line,
        status: r.status,
        candidates: r.locations.map((l) => l.file),
      });
    }
  }
  return { pinned, unresolved };
}

// ---------------------------------------------------------------------------
// Persistence + re-check (the audit side of the pin lifecycle)
// ---------------------------------------------------------------------------

function pinsPath(cwd: string, target: string): string {
  const flat = target.replace(/[\\/]/g, "__").replace(/^__+/, "");
  return resolve(cwd, ".vigiles", `${flat}.pins.json`);
}

/** Persist the pins for an instruction file to its `.vigiles` sidecar. */
export function writePins(
  cwd: string,
  target: string,
  pins: readonly Pin[],
): void {
  const p = pinsPath(cwd, target);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ target, pins }, null, 2) + "\n");
}

/** Read the pins recorded for an instruction file (empty if none). */
export function readPins(cwd: string, target: string): Pin[] {
  const p = pinsPath(cwd, target);
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, "utf-8")) as { pins?: Pin[] };
    return Array.isArray(parsed.pins) ? parsed.pins : [];
  } catch {
    return [];
  }
}

export interface BrokenPin extends Pin {
  /** Why the pin no longer holds. */
  readonly reason: string;
}

/**
 * Re-check pins against a fresh index: a pin is broken when its reference no
 * longer resolves uniquely to the pinned file (renamed, removed, moved, or
 * gone ambiguous). This is what turns a write-time pin into a durable,
 * non-gameable audit check.
 */
export function recheckPins(
  pins: readonly Pin[],
  index: SymbolIndex,
): BrokenPin[] {
  const broken: BrokenPin[] = [];
  for (const pin of pins) {
    const r = resolveSymbol(index, pin.ref);
    if (r.status === "missing") {
      broken.push({ ...pin, reason: `\`${pin.ref}\` is no longer defined` });
    } else if (r.status === "ambiguous") {
      broken.push({
        ...pin,
        reason: `\`${pin.ref}\` is now defined in several files`,
      });
    } else if (r.locations[0].file !== pin.file) {
      broken.push({
        ...pin,
        reason: `\`${pin.ref}\` moved to ${r.locations[0].file}`,
      });
    }
  }
  return broken;
}
