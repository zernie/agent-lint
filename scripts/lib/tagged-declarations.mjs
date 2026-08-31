/**
 * "Which declarations in this file carry a TSDoc tag, what are they NAMED, and
 * is the module making them externally reachable?" — answered by the TypeScript
 * parser rather than by a regex enumerating shapes from memory.
 *
 * 🔴 WHY A PARSER. The regex this replaces had been extended four times, each
 * time after a reviewer named a form it did not know (aliased re-export,
 * separately-exported tagged local, `export default`, destructured binding), and
 * the last of those stayed open in #170. Every extension looked complete and
 * none was, because a shape-matcher can only recognize shapes somebody
 * remembered to write down. The parser already knows the grammar, so the whole
 * class stops being expressible — the same argument this repository makes for
 * parsing Bash with a shell AST and markdown with markdown-it instead of
 * regexes, applied to its own tooling.
 *
 * `typescript` is already a direct dependency and is the language's own parser,
 * so this is ADOPT, not BUILD.
 *
 * SINGLE-FILE by design: it reports the LOCAL export status of each declaration.
 * Whether a symbol is genuinely public is a question about the export graph, and
 * the committed api reports answer that already — see check-internal-tag.mjs.
 *
 * The forms it is expected to handle, and the ones deliberately excluded, are
 * enumerated in ./export-forms.mjs and asserted against this module by
 * scripts/check-internal-tag.test.ts.
 */
import ts from "typescript";

/**
 * @typedef {{name: string, line: number, tags: string[], exported: boolean,
 *   kind: "value"|"type"}} TaggedDecl
 */

/** Names this module exports through an `export { … }` specifier list. */
function specifierExportedLocals(source) {
  /** @type {Map<string, string>} */
  const locals = new Map(); // local name -> exported name
  for (const stmt of source.statements) {
    if (!ts.isExportDeclaration(stmt)) continue;
    // `export { x } from "./other"` re-exports someone else's declaration; the
    // tag would live in that file, so it is not ours to judge (an excluded form).
    if (stmt.moduleSpecifier) continue;
    const clause = stmt.exportClause;
    if (!clause || !ts.isNamedExports(clause)) continue;
    for (const spec of clause.elements)
      locals.set((spec.propertyName ?? spec.name).text, spec.name.text);
  }
  return locals;
}

/** `export default <identifier>;` — the declaration sits elsewhere in the file. */
function defaultExportedLocal(source) {
  for (const stmt of source.statements) {
    if (!ts.isExportAssignment(stmt) || stmt.isExportEquals) continue;
    if (ts.isIdentifier(stmt.expression)) return stmt.expression.text;
  }
  return null;
}

/** Does this node carry an inline `export` modifier? */
function hasExportModifier(node) {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword,
    )
  );
}

/**
 * Every name a binding pattern introduces — so `export const { a, b: c } = x`
 * and `export const [d] = y` yield their real bindings instead of nothing. This
 * is the form that took four review rounds to be noticed.
 */
function bindingNames(name, out = []) {
  if (ts.isIdentifier(name)) {
    out.push(name.text);
    return out;
  }
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const el of name.elements) {
      if (ts.isOmittedExpression(el)) continue;
      bindingNames(el.name, out);
    }
  }
  return out;
}

/** The TSDoc tag names on a node, lowercased (`["internal"]`). */
function tagsOf(node) {
  return ts.getJSDocTags(node).map((t) => t.tagName.text.toLowerCase());
}

/**
 * Parse `src` and return every declaration carrying at least one of `wanted`.
 *
 * @param {string} src   file contents
 * @param {string[]} wanted  tag names without the `@`, e.g. ["internal"]
 * @returns {TaggedDecl[]}
 */
export function taggedDeclarations(src, wanted) {
  const source = ts.createSourceFile(
    "input.ts",
    src,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
  const bySpecifier = specifierExportedLocals(source);
  const defaultLocal = defaultExportedLocal(source);
  const want = new Set(wanted.map((t) => t.toLowerCase()));
  /** @type {TaggedDecl[]} */
  const out = [];

  const lineOf = (node) =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  const record = (node, names, tags, kind) => {
    for (const name of names) {
      out.push({
        name,
        line: lineOf(node),
        tags,
        kind,
        exported:
          hasExportModifier(node) ||
          bySpecifier.has(name) ||
          defaultLocal === name,
      });
    }
  };

  const visit = (node) => {
    // A VariableStatement carries the doc block; its declarators carry the names.
    if (ts.isVariableStatement(node)) {
      const tags = tagsOf(node).filter((t) => want.has(t));
      if (tags.length > 0) {
        const names = node.declarationList.declarations.flatMap((d) =>
          bindingNames(d.name),
        );
        record(node, names, tags, "value");
      }
      return;
    }
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node)
    ) {
      const tags = tagsOf(node).filter((t) => want.has(t));
      // An anonymous `export default class {}` has no name to correlate — an
      // excluded form, skipped rather than invented.
      // An `enum` counts as a VALUE: it emits runtime code and is callable
      // from a call site, which is the distinction the caller acts on.
      const kind =
        ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
          ? "type"
          : "value";
      if (tags.length > 0 && node.name)
        record(node, [node.name.text], tags, kind);
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return out;
}

/**
 * The names a module makes externally reachable — the corpus-facing view used to
 * assert this module against ./export-forms.mjs.
 *
 * @param {string} src
 * @returns {string[]}
 */
export function exportedNames(src) {
  const source = ts.createSourceFile(
    "input.ts",
    src,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const names = new Set();
  for (const [, exportedAs] of specifierExportedLocals(source))
    names.add(exportedAs);
  const defaultLocal = defaultExportedLocal(source);
  if (defaultLocal) names.add(defaultLocal);
  for (const stmt of source.statements) {
    if (!hasExportModifier(stmt)) continue;
    if (ts.isVariableStatement(stmt))
      for (const d of stmt.declarationList.declarations)
        for (const n of bindingNames(d.name)) names.add(n);
    else if ("name" in stmt && stmt.name && ts.isIdentifier(stmt.name))
      names.add(stmt.name.text);
  }
  return [...names];
}
