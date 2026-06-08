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

/** A located definition: a symbol plus the file it lives in. */
export interface SymbolLocation extends SymbolDef {
  readonly file: string;
}

/** A project-wide index: symbol name → every place it is defined. */
export class SymbolIndex {
  private readonly byName = new Map<string, SymbolLocation[]>();

  add(file: string, defs: readonly SymbolDef[]): void {
    for (const d of defs) {
      const list = this.byName.get(d.name) ?? [];
      list.push({ ...d, file });
      this.byName.set(d.name, list);
    }
  }

  addFile(file: string): void {
    this.add(file, definedSymbolsInFile(file));
  }

  /** All definitions of `name` across the project. */
  lookup(name: string): readonly SymbolLocation[] {
    return this.byName.get(name) ?? [];
  }

  get size(): number {
    return this.byName.size;
  }
}

export type ResolveStatus = "unique" | "ambiguous" | "missing";

export interface ResolveResult {
  readonly status: ResolveStatus;
  /** Candidate locations (one when unique, several when ambiguous, none when missing). */
  readonly locations: readonly SymbolLocation[];
}

/**
 * Resolve a bare symbol reference against the index. A scoped reference
 * (`Class#method` or `Class::method`) narrows to definitions whose enclosing
 * scope matches. Returns unique / ambiguous / missing — never a guess.
 */
export function resolveSymbol(index: SymbolIndex, ref: string): ResolveResult {
  const scoped = /^([A-Za-z_]\w*)(?:#|::)([\w?!]+)$/.exec(ref);
  const [scope, name] = scoped ? [scoped[1], scoped[2]] : ["", ref];
  let hits = index.lookup(name);
  if (scope) hits = hits.filter((h) => h.scope === scope);
  if (hits.length === 0) return { status: "missing", locations: [] };
  if (hits.length === 1) return { status: "unique", locations: hits };
  return { status: "ambiguous", locations: hits };
}
