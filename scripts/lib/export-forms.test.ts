/**
 * The export-form corpus, asserted against the enumeration BOTH naming checks
 * rest on (#170).
 *
 * The point is not that these particular forms work. It is that "did we cover
 * it?" stops being a memory question. Four forms were added to
 * `local/experimental-name` one at a time across four review rounds, each after
 * the previous fix was called complete, and `check-internal-tag.mjs`
 * independently missed two of the same ones — the same construct unnamed in two
 * checkers written days apart. Patch-on-report converges slowly and never tells
 * you when it is done.
 *
 * So a form nobody has thought of is now a MISSING ROW in
 * `scripts/lib/export-forms.mjs` — reviewable — rather than a silent gap, and an
 * exclusion is a row too, with its reason, because an exclusion nobody wrote
 * down is indistinguishable from an oversight.
 */
import { describe, it, expect } from "vitest";

import {
  EXPORT_FORMS,
  COVERED_FORMS,
  EXCLUDED_FORMS,
  withTag,
} from "./export-forms.mjs";
import { exportedNames, taggedDeclarations } from "./tagged-declarations.mjs";

describe("the corpus itself", () => {
  it("names every excluded form's reason", () => {
    // An exclusion without a stated reason is the thing this file exists to
    // prevent: indistinguishable from having forgotten the case.
    for (const f of EXCLUDED_FORMS)
      expect(
        f.why,
        `${f.id} is excluded but says nothing about why`,
      ).toBeTruthy();
  });

  it("has no duplicate ids", () => {
    const ids = EXPORT_FORMS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers the four forms that arrived one review round at a time", () => {
    // Named explicitly so deleting one is a visible act, not a quiet trim.
    for (const id of [
      "specifier-aliased",
      "specifier",
      "default-function",
      "destructured-object",
    ])
      expect(EXPORT_FORMS.some((f) => f.id === id && f.covered)).toBe(true);
  });
});

describe("the parser enumerates every covered form", () => {
  for (const form of COVERED_FORMS) {
    it(`${form.id}`, () => {
      expect(exportedNames(form.code).sort()).toEqual(
        [...form.exported].sort(),
      );
    });
  }
});

describe("a tagged declaration is found in every covered form", () => {
  for (const form of COVERED_FORMS) {
    if (!form.local) continue;
    it(`${form.id}`, () => {
      // The tag goes on the DECLARATION, wherever the export happens to be —
      // which is exactly what a shape-matcher anchored on `export` cannot see.
      const tagged = taggedDeclarations(withTag(form, "@internal"), [
        "internal",
      ]);
      expect(tagged.length).toBeGreaterThan(0);
      expect(tagged.some((d) => d.exported)).toBe(true);
    });
  }
});

describe("the excluded forms stay excluded", () => {
  it("an anonymous default yields no name to judge", () => {
    const form = EXCLUDED_FORMS.find((f) => f.id === "anonymous-default");
    expect(
      taggedDeclarations(withTag(form!, "@internal"), ["internal"]),
    ).toEqual([]);
  });

  it("`as default` still RESOLVES — only judging its name is excluded", () => {
    // The exclusion is about the naming convention, not about the parser: the
    // binding is perfectly knowable, and pretending otherwise would hide a real
    // export from the enumeration half.
    const form = EXCLUDED_FORMS.find((f) => f.id === "specifier-default-alias");
    expect(exportedNames(form?.code ?? "")).toEqual(["default"]);
  });

  it("a re-export from another module is not claimed as local", () => {
    const form = EXCLUDED_FORMS.find((f) => f.id === "re-export-from");
    // The declaration — and any tag on it — lives in the other file.
    expect(exportedNames(form?.code ?? "")).toEqual([]);
  });
});

describe("kind: values are judged, types are not", () => {
  it("an interface is a type", () => {
    const [d] = taggedDeclarations(
      `/** @internal */\nexport interface Widget { a: number }`,
      ["internal"],
    );
    expect(d?.kind).toBe("type");
  });

  it("an enum is a VALUE — it emits runtime code", () => {
    const [d] = taggedDeclarations(
      `/** @internal */\nexport enum Widget { A }`,
      ["internal"],
    );
    expect(d?.kind).toBe("value");
  });

  it("a const is a value", () => {
    const [d] = taggedDeclarations(
      `/** @internal */\nexport const widget = 1;`,
      ["internal"],
    );
    expect(d?.kind).toBe("value");
  });
});
