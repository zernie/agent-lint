/**
 * Tests for `local/experimental-name` — the rule that requires a declaration
 * tagged `@experimental` to say so in its name.
 *
 * 🔴 EVERY CASE HAS BOTH HALVES: it fires on a planted defect AND it is silent
 * on the legitimate input next door. A gate whose success looks like silence
 * cannot be noticed broken, and this repository has shipped several checks that
 * were dead on arrival — each found by accident, not by review.
 *
 * The exemption cases are the load-bearing ones. The predecessor script opened
 * on the real corpus with 7 findings, 6 of which were TYPES nobody intends to
 * rename; had it shipped that way it would have been muted the same day, which
 * is the failure mode these tests exist to pin.
 *
 * 🔴 ONE EXEMPTION IS DELIBERATELY GONE and has a test asserting its absence:
 * the predecessor exempted symbols missing from `api-surface/*.api.md`, i.e.
 * internal ones. That exemption contradicted the rule's own rationale — "the
 * reader who trusts the NAME never opens the doc" is true of an internal reader
 * too — and it was the only reason the check needed to be cross-file at all.
 * Re-adding it would send this rule back to being a script.
 */
import { RuleTester } from "eslint";
import tsparser from "@typescript-eslint/parser";
import { describe, it } from "vitest";

import rule from "./experimental-name.mjs";

// RuleTester drives describe/it itself. This repo does not enable vitest's
// globals, so they are handed over explicitly rather than read off globalThis.
RuleTester.describe = describe as never;
RuleTester.it = it as never;
RuleTester.itOnly = it.only as never;

const tester = new RuleTester({
  languageOptions: { parser: tsparser as never, ecmaVersion: 2022 },
});

const doc = (tag: string) => `/**\n * ${tag}\n */\n`;

tester.run("experimental-name", rule as never, {
  valid: [
    {
      name: "carries the prefix",
      code: doc("@experimental") + "export function experimental_widget() {}",
    },
    {
      name: "no tag at all — most of the codebase",
      code: "/** An ordinary helper. */\nexport function widget() {}",
    },
    {
      name: "a TYPE — the convention is about callables, measured",
      // Every prefixed symbol on the pre-gate surface was a function, while
      // ServiceSpec / ServiceHandle / ContainerRuntime were plain. Pulling types
      // in opens with 6 cosmetic renames against 1 real finding.
      code: doc("@experimental") + "export type Widget = { a: number };",
    },
    {
      name: "an INTERFACE — same reason",
      code: doc("@experimental") + "export interface Widget { a: number }",
    },
    {
      name: "a FILE-level tag documents the module, not the symbol under it",
      // `services.ts` carries one on its `@module` block. Without this, every
      // export of that file is reported for a tag that was never about it.
      code: "/**\n * @experimental\n * @module demo\n */\n\nexport function widget() {}",
    },
    {
      name: "opted out WITH a reason",
      code: "/**\n * vigiles:experimental-name-ok pinned name, external caller\n * @experimental\n */\nexport function widget() {}",
    },
    {
      name: "not exported — the rule is about what we ship",
      code: doc("@experimental") + "function widget() {}",
    },
    {
      name: "a re-export that KEEPS the prefix",
      code: 'export { experimental_widget } from "./x.js";',
    },
    {
      name: "a deliberate compatibility alias, marked @deprecated on the specifier",
      // This is the alias window: exporting the old spelling for one major is the
      // whole mechanism, and `@deprecated` is both the opt-out and the docs.
      code: 'export {\n  /** @deprecated Renamed to `experimental_widget`. */\n  experimental_widget as widget,\n} from "./x.js";',
    },
    {
      name: "an alias that does not touch a prefixed name",
      code: 'export { plain as other } from "./x.js";',
    },
    {
      name: "an UNtagged local exported separately",
      code: "const widget = () => {};\nexport { widget };",
    },
    {
      name: "a tagged local that already carries the prefix, exported separately",
      code:
        doc("@experimental") +
        "const experimental_widget = () => {};\nexport { experimental_widget };",
    },
    {
      name: "a tagged local exported separately, opted out with a reason",
      code: "/**\n * vigiles:experimental-name-ok probe, deliberately unprefixed\n * @experimental\n */\nconst widget = () => {};\nexport { widget };",
    },
    {
      name: "a default export that already carries the prefix",
      code:
        doc("@experimental") +
        "export default function experimental_widget() {}",
    },
    {
      name: "an ANONYMOUS default — no name to carry the marker",
      // Not an oversight: a name-based convention has nothing to say about a
      // call site that names nothing. Stated so the silence is readable.
      code: doc("@experimental") + "export default function () {};",
    },
    {
      name: "an UNtagged default export",
      code: "export default function widget() {}",
    },
    {
      name: "a same-named local from ANOTHER module — not ours to judge",
      // `export { widget } from "./x.js"` re-exports someone else's `widget`;
      // the tagged local of the same name in this file is a different binding.
      code:
        doc("@experimental") +
        'const widget = 1;\nexport { widget } from "./x.js";',
    },
  ],
  invalid: [
    {
      name: "a re-export that STRIPS the prefix — the hole this rule exists to close",
      // 🔴 The rule shipped returning early on every specifier form, so this was
      // silent: a barrel could hand consumers a stable-looking name for an
      // unstable API, which is the exact aliasing the rule was written after.
      code: 'export { experimental_widget as widget } from "./x.js";',
      errors: [{ message: /stripping the `experimental_` prefix/u }],
    },
    {
      name: "an unmarked alias is not excused by a @deprecated on a DIFFERENT specifier",
      code: 'export {\n  /** @deprecated */\n  experimental_a as a,\n  experimental_b as b,\n} from "./x.js";',
      errors: 1,
    },
    {
      name: "tagged, exported, unprefixed",
      code: doc("@experimental") + "export function widget() {}",
      // Matched on the rendered MESSAGE, not the id: the id alone would pass
      // even if the rule named the wrong symbol or suggested the wrong
      // replacement, and both are the substance of what it reports.
      errors: [{ message: /`widget`.*not named `experimental_widget`/u }],
    },
    {
      name: "a tag that carries PROSE after it is still a tag",
      // 🔴 The predecessor anchored the tag at end-of-line, so
      // `@internal Experimental typed-composition surface — …` (the real text on
      // `pipe`) was invisible: 2 of 8 `@experimental` and 31 of 39 `@internal`
      // declarations were skipped. Deleting this test restores that blindness.
      code:
        doc("@experimental — surface may change without a major bump.") +
        "export function widget() {}",
      errors: 1,
    },
    {
      name: "a const, not only a function",
      code: doc("@experimental") + "export const widget = () => {};",
      errors: 1,
    },
    {
      name: "a class",
      code: doc("@experimental") + "export class Widget {}",
      errors: 1,
    },
    {
      name: "a BARE opt-out marker is not an escape hatch",
      // An unexplained exemption is how a gate gets emptied one silent line at
      // a time. `\s+\S` alone would be satisfied by the newline plus the JSDoc
      // continuation `*`, so the reason must be on the marker's own line.
      code: "/**\n * vigiles:experimental-name-ok\n * @experimental\n */\nexport function widget() {}",
      errors: 1,
    },
    {
      name: "a TAGGED local declared without the prefix and exported separately",
      // 🔴 The second hole in the specifier path. The declaration branch never
      // sees it (no `export` modifier) and the aliasing branch skipped it (the
      // local has no prefix to strip), so a tagged callable reached consumers
      // under a stable-looking name with nothing complaining.
      code:
        doc("@experimental") + "const widget = () => {};\nexport { widget };",
      errors: [{ message: /is tagged @experimental and is exported here/u }],
    },
    {
      name: "…and the export may legally PRECEDE the declaration it names",
      // Which is why the judgement is deferred to Program:exit rather than made
      // when the specifier is visited.
      code:
        "export { widget };\n" + doc("@experimental") + "function widget() {}",
      errors: 1,
    },
    {
      name: "a TAGGED default export without the prefix — the third export path",
      // 🔴 ExportNamedDeclaration never fires for `export default`, so this
      // shipped unchecked while the rule's header and STABILITY.md both claimed
      // every exported declaration was covered.
      code: doc("@experimental") + "export default function widget() {}",
      errors: [{ message: /`widget`.*not named `experimental_widget`/u }],
    },
    {
      name: "a tagged default-exported CLASS, same path",
      code: doc("@experimental") + "export default class Widget {}",
      errors: 1,
    },
    {
      name: "an INTERNAL symbol is NOT exempt — the removed exemption",
      // This is the case the predecessor let through. Nothing here says the
      // symbol is public, and it is still reported: an internal reader trusts
      // the name exactly as an external one does. See the header.
      code: doc("@experimental") + "export function internalHelper() {}",
      errors: 1,
    },
  ],
});
