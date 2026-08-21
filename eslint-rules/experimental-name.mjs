/**
 * `local/experimental-name` — a symbol the source calls EXPERIMENTAL must SAY SO
 * IN ITS NAME.
 *
 * One sentence: if an exported declaration carries the `@experimental` TSDoc tag,
 * its name must start with `experimental_`.
 *
 * WHY THIS EXISTS, measured. The prefix convention already existed —
 * `experimental_emitTool`, `experimental_parseEmitted`, `experimental_withServices`
 * were all named that way on purpose. It was written down nowhere and enforced by
 * nothing, so `skill()` shipped from `vigiles/spec` under a stable name while
 * `docs/skills.md` opened with "**`skill()` is experimental**". Prose said one
 * thing, the API said the other — the exact defect class vigiles exists to catch,
 * in vigiles. A convention that is only a habit gets violated by the next author,
 * and the reader who trusts the NAME (the thing an editor autocompletes) never
 * reads the doc that would have warned them.
 *
 * WHAT IT SUBTRACTS: the ability to mark something experimental in one place and
 * stable in another. Experimentality is declared ONCE, in TSDoc, and the name is
 * checked against it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY AN ESLINT RULE AND NOT THE SCRIPT IT REPLACES
 *
 * This began as `scripts/check-experimental-naming.mjs`, a standalone pass over
 * regex-matched declaration lines, gated by `npm run experimental:check`. Two
 * things were wrong with that shape and only one of them was obvious.
 *
 * The obvious one: it hand-rolled a parser. `VALUE_DECL` was a regex against a
 * single line, so it could not see a declaration whose modifiers wrapped, and
 * `tagRe` walked backwards through lines guessing where the doc comment started.
 * ESLint hands us the AST and the attached comments. Same class as this repo's
 * own rule about parsing markdown with a parser instead of regexes: a hand-rolled
 * matcher over structured input is a deferred defect, and this one had already
 * shipped two — a tag with prose after it was invisible for a while (2 of 8
 * `@experimental` declarations and 31 of 39 `@internal` ones), and a bare opt-out
 * marker read as an explained one.
 *
 * The less obvious one, and the reason the port was blocked until now: the script
 * needed `api-surface/*.api.md` to decide what was PUBLIC, because internal
 * symbols were exempt. That exemption is what made it cross-file — and it also
 * contradicted the script's own stated rationale, that "the reader who trusts the
 * NAME never opens the doc". An internal reader is a reader. Dropping the
 * exemption removes the api reports from the equation entirely, and what is left
 * is jsdoc + name, both of which live in one file.
 *
 * 🔴 That drop was only SAFE after a separate change, and the order matters. The
 * six compiled-hook entry points used to be declared unprefixed and gain the
 * prefix at their re-export in `src/hook.ts` — so at the declaration site, 14
 * tagged symbols looked like violations, and a per-file rule would have opened at
 * 14 false findings and been switched off within the day. The de-aliasing landed
 * first (one spelling per symbol, everywhere). Re-measured after it, on the whole
 * of `src/`, with no exemption at all: **22 tagged exported value declarations,
 * 0 without the prefix.** The rule turns on silent.
 *
 * SCOPE: value declarations only (`function` / `const` / `let` / `var` / `class`).
 * Types and interfaces are out, deliberately and by measurement: the convention
 * only ever applied to callables, and the surface before the gate paired
 * `experimental_startServices` with a plain `ServiceSpec`, `ServiceHandle`,
 * `ContainerRuntime`. Pulling types in would have opened with 6 cosmetic renames
 * against 1 real finding, and a gate that arrives 86% noise is muted the same day.
 *
 * A `@module` tag documents the FILE, not one symbol — a file-level
 * `@module vigiles/eval (services)` must not condemn every export beneath it.
 *
 * OPT OUT on the declaration, with a reason on the SAME line:
 *   `vigiles:experimental-name-ok <why>`
 * The same-line requirement is not fussiness: `\s+\S` is satisfied by a newline
 * plus the JSDoc continuation `*`, so a bare marker followed by any further tag
 * would read as "explained".
 */

const PREFIX = "experimental_";
const ALLOW = /vigiles:experimental-name-ok[^\S\n]+\S/;

/** A tag with or without prose after it — real tags carry prose. */
const tagRe = (tag) => new RegExp(`^\\s*\\*?\\s*@${tag}\\b`, "m");

/** The declared names of an exported statement, or [] if it declares no value. */
function declaredNames(node) {
  if (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") {
    return node.id ? [node.id] : [];
  }
  if (node.type === "VariableDeclaration") {
    return node.declarations
      .map((d) => d.id)
      .filter((id) => id.type === "Identifier");
  }
  return [];
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "an exported declaration tagged @experimental must be named experimental_*",
    },
    schema: [],
    messages: {
      // `experimental_` is spelled literally rather than passed as data: a
      // placeholder for a constant is a placeholder someone can forget to fill,
      // and the first test written against this message did exactly that.
      unprefixed:
        "`{{name}}` is tagged @experimental but is not named `experimental_{{name}}`. " +
        "The tag warns a reader who opens the doc; the name warns the one who does not — " +
        "and that is most of them. Rename it, or opt out on the declaration with " +
        "`vigiles:experimental-name-ok <reason>`.",
      aliasedAway:
        "this re-export renames `{{local}}` to `{{exported}}`, stripping the " +
        "`experimental_` prefix. Consumers would then call an unstable API through " +
        "a stable-looking name — the exact defect the prefix exists to prevent, and " +
        "the one that made a marker survive at 0 of 5 call sites when it was done at " +
        "an import. Export the prefixed spelling, or, if this IS a deliberate " +
        "compatibility alias, say so with `@deprecated` on the specifier (or " +
        "`vigiles:experimental-name-ok <reason>`).",
    },
  },
  create(context) {
    const source = context.sourceCode;
    return {
      ExportNamedDeclaration(node) {
        if (!node.declaration) {
          // `export { x }` / `export { experimental_x as x } from "…"`.
          //
          // 🔴 THIS BRANCH USED TO BE A BARE `return`, and that was a hole in the
          // middle of the rule's own thesis. The prefix is supposed to reach every
          // CALL SITE; a barrel that re-exports `experimental_widget as widget`
          // hands consumers a stable-looking name for an unstable API, which is
          // precisely the aliasing this rule was written after — measured at 0 of 5
          // call sites surviving when the same trick was done at an import. Skipping
          // every specifier form meant the rule policed declarations and ignored the
          // one construct that can undo them. Found by a reviewer, in the same PR
          // that introduced the rule.
          //
          // A deliberate compatibility alias is legitimate and common — the whole
          // point of a deprecation window is to export the old spelling for one
          // major. Those carry `@deprecated` on the specifier, which is both the
          // opt-out and the documentation, so no second marker is needed.
          for (const spec of node.specifiers ?? []) {
            if (spec.type !== "ExportSpecifier") continue;
            const local = spec.local.name ?? spec.local.value;
            const exported = spec.exported.name ?? spec.exported.value;
            if (typeof local !== "string" || typeof exported !== "string")
              continue;
            if (!local.startsWith(PREFIX)) continue;
            if (exported.startsWith(PREFIX)) continue;
            const near = source
              .getCommentsBefore(spec)
              .map((c) => c.value)
              .join("\n");
            if (tagRe("deprecated").test(near)) continue;
            if (ALLOW.test(near)) continue;
            const line = source.lines[spec.loc.start.line - 1] ?? "";
            if (ALLOW.test(line)) continue;
            context.report({
              node: spec,
              messageId: "aliasedAway",
              data: { local, exported },
            });
          }
          return;
        }
        const names = declaredNames(node.declaration);
        if (names.length === 0) return;

        const comments = source.getCommentsBefore(node);
        const doc = comments.map((c) => c.value).join("\n");
        if (!tagRe("experimental").test(doc)) return;
        if (tagRe("module").test(doc)) return;
        if (ALLOW.test(doc)) return;

        for (const id of names) {
          if (id.name.startsWith(PREFIX)) continue;
          // A same-line trailing marker also opts out.
          const line = source.lines[id.loc.start.line - 1] ?? "";
          if (ALLOW.test(line)) continue;
          context.report({
            node: id,
            messageId: "unprefixed",
            data: { name: id.name },
          });
        }
      },
    };
  },
};
