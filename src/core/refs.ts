/**
 * vigiles — file-qualified symbol reference verification (variant A).
 *
 * A reference names both the file and the symbol, as an inline code span:
 *
 *     See `src/config.ts#parseConfig` for the loader.
 *     Render with `app/models/user.rb#full_name`.
 *
 * We parse *that one named file* and check it defines the symbol. No
 * project-wide index, no cross-file resolution, no autoloader chasing, no
 * ambiguity (the file disambiguates). Because the `path.ext#symbol` shape is
 * unmistakable and deliberately written, it is a *declared* reference — like
 * `vigiles:file` / `vigiles:cmd` — so a broken one is an **error**, not an
 * inferred-prose warning. The author names the file; vigiles proves the symbol.
 *
 * R1 (cross-compat): only inline code spans are read. Fenced code blocks are
 * never touched, so rustdoc doctests / typescript-docs-verifier keep working.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { langForFile, fileDefinesSymbol } from "./symbols.js";

const FENCE = /^\s*```/;
const SPAN = /`([^`\n]+)`/g;

/** An inline code span with its 1-based source line. */
export interface Span {
  readonly text: string;
  readonly line: number;
}

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

// A file-qualified symbol reference: `<path>.<ext>` then `#`/`::` then a symbol.
// Requires a real file extension before the separator, so a bare scoped symbol
// An explicit `vigiles:symbol <path>.<ext>#<symbol>` directive inside a code
// span. The literal `vigiles:symbol` prefix means zero detection heuristic — a
// span either carries it or it does not — consistent with the rest of vigiles'
// markers. The mark is self-contained (file + symbol in one inline token), so
// it binds unambiguously even in a long line with several references.
const SYMBOL_MARK =
  /^vigiles:symbol\s+([\w@./-]+\.[A-Za-z0-9]+)(?:#|::)([A-Za-z_]\w*[?!]?)$/;

/** A parsed file-qualified reference. */
export interface SymbolRef {
  readonly file: string;
  readonly symbol: string;
  readonly line: number;
}

/** A reference that failed verification. */
export interface SymbolRefError extends SymbolRef {
  readonly reason: string;
}

/** Extract the `vigiles:symbol` references from a markdown file. */
export function symbolRefs(markdown: string): SymbolRef[] {
  const refs: SymbolRef[] = [];
  for (const span of inlineSpans(markdown)) {
    const m = SYMBOL_MARK.exec(span.text);
    if (m) refs.push({ file: m[1], symbol: m[2], line: span.line });
  }
  return refs;
}

/**
 * Verify the file-qualified symbol references in a markdown file: the named
 * file must exist and define the named symbol. `basePath` is the directory the
 * paths resolve against (the instruction file's own directory).
 */
export function verifySymbolRefs(
  markdown: string,
  basePath: string,
): SymbolRefError[] {
  const errors: SymbolRefError[] = [];
  for (const ref of symbolRefs(markdown)) {
    const full = resolve(basePath, ref.file);
    if (!existsSync(full)) {
      errors.push({ ...ref, reason: `File not found: "${ref.file}"` });
    } else if (langForFile(ref.file) === null) {
      errors.push({
        ...ref,
        reason: `Unsupported language for symbol check: "${ref.file}"`,
      });
    } else if (!fileDefinesSymbol(full, ref.symbol)) {
      errors.push({
        ...ref,
        reason: `"${ref.symbol}" is not defined in ${ref.file}`,
      });
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Enforcement: force code references to carry the file-qualified mark
// ---------------------------------------------------------------------------

const PATH_LIKE = /[/\\]|\.[A-Za-z0-9]+$/; // a path or a bare filename
const PLAIN_ID = /^[A-Za-z_]\w*$/;
const SCOPED = /^[A-Za-z_]\w*(?:#|::)[\w?!]+$/;
const IGNORE_FILE = /<!--\s*vigiles:ignore-file\s*-->/;
const IGNORE_LINE = /<!--\s*vigiles:ignore\s*-->/;

/**
 * Whether a span looks like a *code reference* that ought to carry a
 * file-qualified mark — a scoped name, or an identifier that isn't a bare
 * lowercase prose word. A function-call form `` `foo(args)` `` is treated as a
 * reference to its callee `foo`. Paths/filenames are excluded (they are `file`
 * refs).
 */
export function isCodeShaped(text: string): boolean {
  const callee = text.replace(/\s*\([^)]*\)\s*$/, ""); // `foo(args)` → `foo`
  if (SCOPED.test(callee)) return true;
  if (!PLAIN_ID.test(callee)) return false;
  const hasUnderscore = callee.includes("_");
  const hasCamel = /[a-z][A-Z]/.test(callee);
  const isPascal = /^[A-Z][a-z]/.test(callee);
  const isScreaming = /^[A-Z][A-Z0-9_]+$/.test(callee);
  return hasUnderscore || hasCamel || isPascal || isScreaming;
}

/**
 * Code-shaped inline references that are NOT yet marked — the spans the
 * enforcement hook makes the agent mark as `` `vigiles:symbol path.ext#symbol` ``
 * or opt out of with `<!-- vigiles:ignore -->` (or `<!-- vigiles:ignore-file -->`
 * for the whole file).
 */
export function unmarkedCodeRefs(markdown: string): Span[] {
  if (IGNORE_FILE.test(markdown)) return [];
  const lines = markdown.split("\n");
  return inlineSpans(markdown).filter((span) => {
    if (IGNORE_LINE.test(lines[span.line - 1] ?? "")) return false;
    if (SYMBOL_MARK.test(span.text)) return false; // already a vigiles:symbol mark
    if (PATH_LIKE.test(span.text)) return false; // a path/filename → file ref
    return isCodeShaped(span.text);
  });
}
