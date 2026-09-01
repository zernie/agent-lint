/**
 * THE CANONICAL ENUMERATION of ways a JavaScript/TypeScript module can introduce
 * an exported binding — the shared answer to "what does this file export, and
 * under what name".
 *
 * It exists because two checks answered that question independently and both got
 * it wrong, in the same places, days apart. `local/experimental-name` took four
 * rounds of review to learn four forms (aliased re-export, separately-exported
 * tagged local, `export default`, destructured binding), each arriving after the
 * previous fix was called complete; `check-internal-tag.mjs` independently missed
 * `export default`, and then the separately-exported case too. The same construct
 * going unnamed in two checkers written days apart is not a repeated typo, it is
 * a blind spot in how "exported" gets enumerated — and patch-on-report converges
 * slowly and never tells you when it is done (#170).
 *
 * So the list is written ONCE, against the grammar rather than recollection, and
 * both checks are tested against it. A form nobody has thought of is now a
 * MISSING ROW — visible, addable, reviewable — instead of a silent gap.
 *
 * WHAT EACH ROW IS: `code` is a complete module; `exported` is every name the
 * module makes externally reachable, and `local` is the name the DECLARATION
 * carries (they differ under aliasing, which is the whole point of listing it).
 * `tagBefore` names the line a TSDoc tag would sit above — needed because in a
 * multi-line form the DECLARATION and the EXPORT are different statements, and
 * which one carries the tag is exactly the distinction these checks kept getting
 * wrong. Absent means the single statement.
 *
 * DELIBERATE EXCLUSIONS are rows too (`covered: false`), with the reason stated,
 * because an exclusion nobody wrote down is indistinguishable from an oversight —
 * which is exactly the confusion this file was created to end.
 */

/**
 * @typedef {{id: string, code: string, exported: string[], local: string|null,
 *   covered: boolean, why?: string, tagBefore?: string}} ExportForm
 */

/** @type {ExportForm[]} */
export const EXPORT_FORMS = [
  // --- Inline export modifier on a declaration ------------------------------
  {
    id: "function-declaration",
    code: `export function widget() {}`,
    exported: ["widget"],
    local: "widget",
    covered: true,
  },
  {
    id: "class-declaration",
    code: `export class Widget {}`,
    exported: ["Widget"],
    local: "Widget",
    covered: true,
  },
  {
    id: "const-declaration",
    code: `export const widget = () => {};`,
    exported: ["widget"],
    local: "widget",
    covered: true,
  },
  {
    id: "let-declaration",
    code: `export let widget = 1;`,
    exported: ["widget"],
    local: "widget",
    covered: true,
  },
  {
    id: "var-declaration",
    code: `export var widget = 1;`,
    exported: ["widget"],
    local: "widget",
    covered: true,
  },
  {
    id: "async-function-declaration",
    code: `export async function widget() {}`,
    exported: ["widget"],
    local: "widget",
    covered: true,
  },
  {
    id: "abstract-class-declaration",
    code: `export abstract class Widget {}`,
    exported: ["Widget"],
    local: "Widget",
    covered: true,
  },
  {
    id: "declare-const",
    code: `export declare const widget: number;`,
    exported: ["widget"],
    local: "widget",
    covered: true,
  },

  // --- Multiple declarators in one statement --------------------------------
  {
    id: "multiple-declarators",
    // Each declarator is its own binding. A matcher that reads "the name after
    // the keyword" sees only the first.
    code: `export const alpha = 1, beta = 2;`,
    exported: ["alpha", "beta"],
    local: "alpha",
    covered: true,
  },

  // --- Destructuring --------------------------------------------------------
  {
    id: "destructured-object",
    tagBefore: "export const { widget }",
    // Round 4 of the review found this one. The exported name is not an
    // Identifier at the top of the declarator, so a shape-matcher misses it.
    code: `const source = { widget: 1 };\nexport const { widget } = source;`,
    exported: ["widget"],
    local: "widget",
    covered: true,
  },
  {
    id: "destructured-array",
    tagBefore: "export const [first, second]",
    code: `const pair = [1, 2];\nexport const [first, second] = pair;`,
    exported: ["first", "second"],
    local: "first",
    covered: true,
  },
  {
    id: "destructured-renamed",
    tagBefore: "export const { a: widget }",
    code: `const source = { a: 1 };\nexport const { a: widget } = source;`,
    exported: ["widget"],
    local: "widget",
    covered: true,
  },

  // --- Export specifiers (the declaration is elsewhere) ---------------------
  {
    id: "specifier",
    tagBefore: "const widget = () => {};",
    // Round 2. The declaration has no export modifier at all, so a check that
    // only looks for one never records it — while the API report still lists it.
    // This is the finding #170 carried open for `check-internal-tag.mjs`.
    code: `const widget = () => {};\nexport { widget };`,
    exported: ["widget"],
    local: "widget",
    covered: true,
  },
  {
    id: "specifier-aliased",
    tagBefore: "const experimental_widget = () => {};",
    // Round 1. The exported name and the declared name differ.
    code: `const experimental_widget = () => {};\nexport { experimental_widget as widget };`,
    exported: ["widget"],
    local: "experimental_widget",
    covered: true,
  },
  {
    id: "specifier-function",
    tagBefore: "function widget() {}",
    code: `function widget() {}\nexport { widget };`,
    exported: ["widget"],
    local: "widget",
    covered: true,
  },
  {
    id: "specifier-default-alias",
    tagBefore: "const widget = 1;",
    code: `const widget = 1;\nexport { widget as default };`,
    exported: ["default"],
    local: "widget",
    covered: false,
    why:
      "`default` is not a name any consumer writes — they choose their own at " +
      "the import — so no prefix can reach a call site through it. The same " +
      "limit as an anonymous default, reached by a different syntax. The " +
      "PARSER still resolves the binding (it is a covered form for enumeration); " +
      "what is excluded is judging the NAME.",
  },

  // --- Default exports ------------------------------------------------------
  {
    id: "default-function",
    // Round 3, and independently missing from the other checker — the clearest
    // evidence that the two were enumerating from the same faulty memory.
    code: `export default function widget() {}`,
    exported: ["widget"],
    local: "widget",
    covered: true,
  },
  {
    id: "default-class",
    code: `export default class Widget {}`,
    exported: ["Widget"],
    local: "Widget",
    covered: true,
  },
  {
    id: "default-identifier",
    tagBefore: "const widget = 1;",
    code: `const widget = 1;\nexport default widget;`,
    exported: ["widget"],
    local: "widget",
    covered: true,
  },

  // --- Type-only positions --------------------------------------------------
  {
    id: "interface",
    code: `export interface Widget { a: number }`,
    exported: ["Widget"],
    local: "Widget",
    covered: true,
  },
  {
    id: "type-alias",
    code: `export type Widget = number;`,
    exported: ["Widget"],
    local: "Widget",
    covered: true,
  },
  {
    id: "enum",
    code: `export enum Widget { A }`,
    exported: ["Widget"],
    local: "Widget",
    covered: true,
  },

  // --- DELIBERATE EXCLUSIONS ------------------------------------------------
  {
    id: "anonymous-default",
    code: `export default () => {};`,
    exported: [],
    local: null,
    covered: false,
    why:
      "There is no name to carry a marker and none for an API report to list, " +
      "so there is nothing to correlate. A limit of a name-based convention, " +
      "not a bug in the checks.",
  },
  {
    id: "re-export-from",
    code: `export { widget } from "./other.js";`,
    exported: ["widget"],
    local: null,
    covered: false,
    why:
      "The declaration — and therefore any tag on it — lives in ANOTHER file. " +
      "Both checks are single-file by design; judging this needs the module " +
      "graph, which is the api report's job, not a per-file matcher's.",
  },
  {
    id: "star-re-export",
    code: `export * from "./other.js";`,
    exported: [],
    local: null,
    covered: false,
    why:
      "The exported set is not knowable from this file at all; it is whatever " +
      "the other module exports today.",
  },
  {
    id: "hoisted-in-block",
    tagBefore: "export { widget };",
    code: `{\n  var widget = 1;\n}\nexport { widget };`,
    exported: ["widget"],
    local: "widget",
    covered: false,
    why:
      "A `var`/function in a top-level BLOCK hoists to module scope. Accepted " +
      "as untracked because erring toward silence is correct here: for a rule " +
      "wired at `error` a false positive costs the build, a miss costs one " +
      "detection.",
  },
];

/** The forms both checks are expected to handle. */
export const COVERED_FORMS = EXPORT_FORMS.filter((f) => f.covered);

/** The forms deliberately out of scope, each with a stated reason. */
export const EXCLUDED_FORMS = EXPORT_FORMS.filter((f) => !f.covered);

/**
 * The form's code with a TSDoc tag placed where that form's DECLARATION is.
 *
 * Exists because getting this wrong is the same mistake the checks made: in a
 * multi-line form the tag is NOT simply at the top. Prepending it blindly
 * documents whichever statement happens to come first — for
 * `export const { widget } = source` that is the unrelated `source`, and the
 * assertion then fails for a reason that has nothing to do with the check.
 *
 * @param {ExportForm} form
 * @param {string} tag e.g. "@internal"
 * @returns {string}
 */
export function withTag(form, tag) {
  const doc = `/** ${tag} */`;
  if (!form.tagBefore) return `${doc}\n${form.code}`;
  const lines = form.code.split("\n");
  const i = lines.findIndex((l) => l.includes(form.tagBefore));
  if (i < 0) throw new Error(`tagBefore not found in ${form.id}`);
  lines.splice(i, 0, doc);
  return lines.join("\n");
}
