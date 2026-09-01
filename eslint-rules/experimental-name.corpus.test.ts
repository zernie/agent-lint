/**
 * `local/experimental-name` against the SHARED export-form corpus (#170).
 *
 * The rule's own test file covers its behaviour case by case. This one asks a
 * different question: does it see every form of export the corpus enumerates?
 *
 * That distinction is the whole point of the issue. Nine of seventeen review
 * findings on one PR landed in this rule alone, arriving in sequence — aliased
 * re-export, then a separately-exported tagged local, then `export default`,
 * then a destructured binding — each after the previous fix was called complete.
 * Case-by-case tests could not tell anyone when the list was finished, because
 * they only ever contained the forms somebody had already thought of. Driving
 * both checks off ONE enumeration is what turns that into a question a test can
 * answer, and makes an unknown form a missing ROW rather than a silent gap.
 */
import { RuleTester } from "eslint";
import tsparser from "@typescript-eslint/parser";
import { describe, it } from "vitest";

import rule from "./experimental-name.mjs";
import { COVERED_FORMS, withTag } from "../scripts/lib/export-forms.mjs";

RuleTester.describe = describe as never;
RuleTester.it = it as never;
RuleTester.itOnly = it.only as never;

const tester = new RuleTester({
  languageOptions: { parser: tsparser as never, ecmaVersion: 2022 },
});

/**
 * VALUE forms only. Types are deliberately out of the rule's scope — the
 * convention is about CALL SITES, and a type annotation is not one — so feeding
 * them here would assert the opposite of the decision.
 */
const TYPE_FORMS = new Set(["interface", "type-alias", "enum"]);
const valueForms = COVERED_FORMS.filter(
  (f) => f.local !== null && !TYPE_FORMS.has(f.id),
);

/**
 * The form's code with EVERY binding it introduces renamed to carry the prefix.
 *
 * Every binding, not just `local` — `export const alpha = 1, beta = 2` and
 * `export const [first, second] = pair` introduce two, and renaming one leaves
 * the rule correctly reporting the other. Getting that wrong made four corpus
 * cases look like rule bugs when the fault was here; the corpus's value is
 * partly that it made the difference visible.
 *
 * A name already carrying the prefix is left alone, or `specifier-aliased`
 * (whose local IS `experimental_widget`) would become `experimental_experimental_widget`.
 */
function prefixAll(form: (typeof valueForms)[number]): string {
  const names = new Set<string>([form.local as string, ...form.exported]);
  let code = withTag(form, "@experimental");
  for (const n of names) {
    if (n === "default" || n.startsWith("experimental_")) continue;
    code = code.replaceAll(new RegExp(`\\b${n}\\b`, "g"), `experimental_${n}`);
  }
  return code;
}

/** How many bindings in this form would be reported when unprefixed. */
function unprefixedCount(form: (typeof valueForms)[number]): number {
  const names = new Set<string>([form.local as string, ...form.exported]);
  return [...names].filter(
    (n) => n !== "default" && !n.startsWith("experimental_"),
  ).length;
}

tester.run("experimental-name (corpus)", rule as never, {
  // Every form, correctly named, must be SILENT. A rule that fires on a valid
  // export is worse than one that misses: it fails a correct build, and a rule
  // that fails correct builds gets switched off rather than fixed.
  valid: valueForms.map((form) => ({
    name: `${form.id}: prefixed name is accepted`,
    code: prefixAll(form),
  })),

  // …and every form, UNPREFIXED, must be caught. Without this half the suite
  // above is satisfied by a rule that does nothing at all.
  invalid: valueForms.map((form) => ({
    name: `${form.id}: unprefixed name is reported`,
    code: withTag(form, "@experimental"),
    errors: unprefixedCount(form),
  })),
});
