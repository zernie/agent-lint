/**
 * vigiles — cross-language symbol index (ast-grep / tree-sitter).
 *
 * The kernel of harness-pinned reference verification. Instruction files
 * reference project symbols in prose (`parseConfig`, `User`, `create_docx.py`);
 * authors never write a verifiable `file#symbol` form (corpus: ~0%). So instead
 * of asking authors to annotate, the *harness* resolves a bare reference against
 * the live code at write time and pins it. This module is the resolver: extract
 * the symbols a file defines, and build a project-wide name → locations index.
 *
 * Boundary (see research/symbol-verification.md): we answer "does a definition
 * with this name (in this scope) exist", NOT "does this reference resolve through
 * imports / Zeitwerk / tsconfig". Resolution is per-language and architectural —
 * delegated. Ambiguity (a name defined in several files) is reported, not guessed.
 */
import { readFileSync } from "node:fs";
import { extname } from "node:path";

import { parse, Lang, registerDynamicLanguage } from "@ast-grep/napi";
import python from "@ast-grep/lang-python";
import rust from "@ast-grep/lang-rust";
import ruby from "@ast-grep/lang-ruby";

let registered = false;
function ensureRegistered(): void {
  if (registered) return;
  // Non-web grammars ship as separate packages registered at runtime.
  registerDynamicLanguage({ python, rust, ruby });
  registered = true;
}

/** A language key accepted by ast-grep's `parse` (core enum or registered id). */
type LangKey = Lang | string;

const EXT_LANG: Record<string, LangKey> = {
  ".ts": Lang.TypeScript,
  ".tsx": Lang.Tsx,
  ".mts": Lang.TypeScript,
  ".cts": Lang.TypeScript,
  ".d.ts": Lang.TypeScript,
  ".js": Lang.JavaScript,
  ".jsx": Lang.JavaScript,
  ".mjs": Lang.JavaScript,
  ".cjs": Lang.JavaScript,
  ".css": Lang.Css,
  ".py": "python",
  ".pyi": "python",
  ".rs": "rust",
  ".rb": "ruby",
  ".rbi": "ruby",
};

/** The ast-grep language for a file, or null if unsupported (graceful skip). */
export function langForFile(file: string): LangKey | null {
  if (file.endsWith(".d.ts")) return Lang.TypeScript;
  return EXT_LANG[extname(file).toLowerCase()] ?? null;
}

/** A symbol definition found in a file. */
export interface SymbolDef {
  /** The defined identifier, e.g. "parseConfig". */
  readonly name: string;
  /** The tree-sitter node kind, e.g. "function_declaration" (raw, per-grammar). */
  readonly kind: string;
  /** Enclosing class/module name, or "" at top level. */
  readonly scope: string;
  /** 1-based line of the definition. */
  readonly line: number;
}

const ID_KINDS = new Set(["identifier", "constant", "type_identifier"]);
const SCOPE_KINDS = new Set([
  "class_declaration",
  "class_definition",
  "class",
  "module",
  "interface_declaration",
  "enum_declaration",
]);

interface RawNode {
  kind(): string;
  text(): string;
  field(name: string): RawNode | null;
  children(): RawNode[];
  range(): { start: { line: number } };
}

function recordNode(node: RawNode, scope: string, out: SymbolDef[]): void {
  const line = node.range().start.line + 1;
  const nameNode = node.field("name");
  if (nameNode) {
    out.push({ name: nameNode.text(), kind: node.kind(), scope, line });
  }
  // Assignment-style constants (Python/Ruby `X = ...`): the identifier is the
  // `left` field, not `name`.
  const left = node.field("left");
  if (left && ID_KINDS.has(left.kind())) {
    out.push({ name: left.text(), kind: node.kind(), scope, line });
  }
}

/** Extract the symbols defined in a single file's source. */
export function definedSymbols(code: string, lang: LangKey): SymbolDef[] {
  ensureRegistered();
  const out: SymbolDef[] = [];
  const walk = (node: RawNode, scope: string): void => {
    recordNode(node, scope, out);
    const nameNode = node.field("name");
    const nextScope =
      SCOPE_KINDS.has(node.kind()) && nameNode ? nameNode.text() : scope;
    for (const child of node.children()) walk(child, nextScope);
  };
  walk(parse(lang, code).root() as unknown as RawNode, "");
  return out;
}

/** Defined symbols for a file on disk, or [] if unreadable/unsupported. */
export function definedSymbolsInFile(file: string): SymbolDef[] {
  const lang = langForFile(file);
  if (!lang) return [];
  try {
    return definedSymbols(readFileSync(file, "utf-8"), lang);
  } catch {
    return [];
  }
}

/**
 * Whether `file` defines a top-level (or scoped) symbol named `name`. This is
 * the whole check for a file-qualified reference (`path#symbol`): we parse the
 * one named file — no project-wide index, no resolution across files.
 */
export function fileDefinesSymbol(file: string, name: string): boolean {
  return definedSymbolsInFile(file).some((d) => d.name === name);
}
