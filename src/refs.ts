/**
 * vigiles — live symbol-reference verification.
 *
 * The reliable design stores nothing. There are two sources of truth — the
 * instruction file (what is referenced) and the code (what exists) — and a
 * reference check is a *join between them at audit time*. Any stored artifact
 * (a sidecar pin, an in-text marker) is a third thing that can drift from
 * either, so we don't keep one: `audit` re-extracts the code-shaped references
 * from the *current* markdown and re-resolves them against the *current*
 * project symbol index. No drift, no snapshot to maintain.
 *
 * Opportunistic and inference-based: a bare backtick reference is only checked
 * when it has a *code shape* (snake_case / camelCase / SCREAMING_CASE /
 * PascalCase / scoped `Class#method`) — a lowercase prose word like `name` is
 * left alone, avoiding the scan false-positive trap. Because the reference is
 * inferred (the author didn't declare "verify this"), an unresolved one is a
 * *warning*, not a hard error — unlike an explicitly declared `vigiles:file` /
 * `vigiles:cmd` ref, which errors.
 *
 * R1 (cross-compat): only inline code spans are read. Fenced code blocks are
 * never touched, so rustdoc doctests / typescript-docs-verifier keep working.
 */
import { resolve } from "node:path";

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

/** A reference that resolved to a single definition. */
export interface ResolvedRef {
  readonly ref: string;
  readonly line: number;
  readonly file: string;
}

/** A code-shaped reference that did not resolve, or resolved ambiguously. */
export interface UnresolvedRef {
  readonly ref: string;
  readonly line: number;
  readonly status: "missing" | "ambiguous";
  /** Candidate files when ambiguous. */
  readonly candidates: readonly string[];
}

export interface RefReport {
  readonly resolved: readonly ResolvedRef[];
  readonly unresolved: readonly UnresolvedRef[];
}

/**
 * Resolve the code-shaped inline references in a markdown instruction file
 * against the project index, live. No state is written: the report reflects the
 * current markdown joined with the current code.
 */
export function verifyRefs(markdown: string, index: SymbolIndex): RefReport {
  const resolved: ResolvedRef[] = [];
  const unresolved: UnresolvedRef[] = [];
  const seen = new Set<string>();
  for (const span of inlineSpans(markdown)) {
    if (!isCodeShaped(span.text)) continue;
    const key = `${span.text}@${String(span.line)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const r = resolveSymbol(index, span.text);
    if (r.status === "unique") {
      resolved.push({
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
  return { resolved, unresolved };
}
