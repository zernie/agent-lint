#!/usr/bin/env node
/**
 * check-internal-tag.mjs — `@internal` on a symbol we EXPORT is a contradiction.
 *
 * One sentence: if a declaration carries the `@internal` TSDoc tag and appears in
 * a committed api-extractor report, say so — the tag claims it is not part of the
 * API while the exports map ships it.
 *
 * WHY IT IS A SCRIPT AND NOT A LINT RULE, unlike its former other half. This
 * question is **cross-file by nature**: whether a symbol is public is decided by
 * `src/*.ts` barrels and the `exports` map in `package.json`, not by the file the
 * declaration lives in. ESLint sees one file at a time, so a rule could only
 * guess. The api reports are the answer already computed and committed, and
 * `npm run api:check` already keeps them honest.
 *
 * 🔴 THIS FILE USED TO DO TWO JOBS (it was `check-experimental-naming.mjs`). The
 * other one — an `@experimental` declaration must be NAMED `experimental_*` — is
 * now `local/experimental-name` in `eslint-rules/`. It moved because it turned
 * out not to need any of the machinery here: it needed the api reports only to
 * EXEMPT internal symbols, and that exemption contradicted the rule's own
 * rationale ("the reader who trusts the name never opens the doc" — an internal
 * reader is a reader). Dropping the exemption left jsdoc + name, both in one
 * file, and ESLint parses both properly instead of by regex.
 *
 * That split is worth stating plainly because the two checks LOOK like one
 * check — both read TSDoc tags, both are about the stability vocabulary — and
 * they are not. One is about a NAME, decidable where the name is written. The
 * other is about an EXPORT GRAPH, decidable only from outside the file. Keeping
 * them together meant the local half inherited the global half's dependencies.
 *
 * WHAT IT SUBTRACTS: the ability to call something "internal" in TSDoc while
 * shipping it from a public subpath.
 *
 * Usage: node scripts/check-internal-tag.mjs [root]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { taggedDeclarations } from "./lib/tagged-declarations.mjs";

const ROOT = resolve(process.argv[2] ?? ".");
const PREFIX = "experimental_";
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist"].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts"))
      out.push(p);
  }
  return out;
}

/** Every symbol name that appears as an export in a committed api report. */
function publicSymbols() {
  const dir = join(ROOT, "api-surface");
  const names = new Map(); // name -> [report basenames]
  let reports = [];
  try {
    reports = readdirSync(dir).filter((f) => f.endsWith(".api.md"));
  } catch {
    return { names, reports };
  }
  const DECL =
    /^export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/;
  for (const f of reports) {
    for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
      const m = DECL.exec(line.trim());
      if (m) {
        const list = names.get(m[1]) ?? [];
        list.push(f.replace(/^vigiles-|\.api\.md$/g, ""));
        names.set(m[1], list);
      }
    }
  }
  return { names, reports };
}

/**
 * Declarations tagged `@experimental`. Two deliberate exclusions:
 *
 *  - a tag on a `@module` block documents the FILE, not one symbol — otherwise
 *    every export of `services.ts` is reported for a tag never about it;
 *  - `type` / `interface` are OUT OF SCOPE. The prefix is a signal about a
 *    runtime API you CALL, and the convention it codifies only ever applied to
 *    callables — measured on the surface that existed before this gate:
 *    `vigiles/experimental` exported `experimental_emitTool`,
 *    `experimental_parseEmitted`, `experimental_assertEmittedOk`,
 *    `experimental_startServices`, `experimental_withServices` (all functions)
 *    alongside plain `ServiceSpec`, `ServiceHandle`, `ContainerRuntime`. Pulling
 *    types in would have opened with 6 cosmetic renames against 1 real finding,
 *    and a gate that arrives 86% noise is muted within the day.
 */

/**
 * Every tagged declaration in one file, ASKED OF THE PARSER.
 *
 * 🔴 THIS USED TO BE REGEXES, and that is the finding, not a detail. A doc-block
 * scanner paired with a `VALUE_DECL` shape-matcher had been extended four times,
 * each after a reviewer named a form it did not know, and it still missed
 * `const x = …; export { x }` — the case #170 carried open. Every extension
 * looked complete and none was, because a shape-matcher recognizes only shapes
 * somebody remembered to write down. `scripts/lib/tagged-declarations.mjs` asks
 * the TypeScript compiler instead, so the whole class stops being expressible;
 * the forms it is expected to handle are enumerated in
 * `scripts/lib/export-forms.mjs` and asserted in the test beside this file.
 *
 * The `@internal` over `@experimental` precedence is unchanged and still
 * load-bearing: the reporting loop below acts only on `@internal`, so recording
 * the weaker tag for a both-tagged symbol swallowed it silently while the run
 * still printed `checked: 1` — a counter that counts a symbol it then ignores is
 * worse than one that misses it, because the number reads as coverage.
 * On the merits too: `@experimental` says "this may change", `@internal` says
 * "this is not API at all", and the stronger claim is the contradiction worth
 * reporting.
 */
function taggedExperimental(file) {
  const src = readFileSync(file, "utf8");
  return taggedDeclarations(src, ["internal", "experimental"]).map((d) => ({
    name: d.name,
    line: d.line,
    kind: d.kind,
    tag: d.tags.includes("internal") ? "@internal" : "@experimental",
  }));
}

const { names: pub, reports } = publicSymbols();
if (reports.length === 0) {
  console.error(
    "check-internal-tag: no api-surface/*.api.md reports found — " +
      "run `npm run api:check` first. Refusing to pass vacuously.",
  );
  process.exit(1);
}

let checked = 0;
let findings = 0;
let skippedTypes = 0;
for (const file of walk(join(ROOT, "src"))) {
  for (const d of taggedExperimental(file)) {
    const doors = pub.get(d.name);
    // Not exported from any subpath: the tag is a note to maintainers and
    // promises nothing to anyone. Both tags are fine there, unchecked.
    if (!doors) continue;

    // 🔴 TYPES ARE OUT OF SCOPE, and this is a DECISION, not an oversight —
    // it has to be stated because until the parser landed it was neither.
    // The old regex matched `function|const|let|var|class` and therefore could
    // not see a type at all; the moment it could, seven exported-and-@internal
    // types appeared at once, every one of them deliberate. They are typed-
    // composition machinery (`Supplies`, `Pipeline`, `Handoff`, …) exported
    // ONLY so a user's inference resolves — nobody writes those names, and
    // `@internal` is the truthful way to say so. Failing the build over them
    // would force either a meaningless rename or dropping a true tag.
    //
    // It also matches the sibling rule: `local/experimental-name` excludes
    // types for the same reason — the convention is about CALL SITES, and a
    // type annotation is not one.
    //
    // Counted and REPORTED rather than dropped: this file's own history is a
    // counter that counted a symbol it then ignored, and the number read as
    // coverage. A silent skip here would repeat it exactly.
    if (d.kind === "type") {
      skippedTypes++;
      continue;
    }
    checked++;

    // `vigiles.api.md` is the root subpath: label it `vigiles`, not `vigiles/vigiles`.
    const where = [...new Set(doors)]
      .map((d) => (d === "vigiles" ? "vigiles" : `vigiles/${d}`))
      .join(", ");
    // `@internal` on a symbol that IS exported is a contradiction: the tag says
    // "not part of the API" while the exports map ships it. Say which half to
    // change rather than guessing — retracting the export and renaming are both
    // legitimate, and only the author knows which was meant.
    if (d.tag === "@internal") {
      findings++;
      console.log(
        `${relative(ROOT, file)}:${d.line} \`${d.name}\` is tagged @internal but IS exported ` +
          `(${where}). @internal answers "is it public", not "is it stable" — an exported symbol ` +
          `is public whatever the tag says. Either stop exporting it, or mark it @experimental ` +
          `and rename it \`${d.name.startsWith(PREFIX) ? d.name : PREFIX + d.name}\`.`,
      );
      continue;
    }
  }
}

console.log(
  `\npublic @experimental/@internal VALUE declarations checked: ${checked}  (across ${reports.length} api reports)`,
);
if (skippedTypes > 0)
  console.log(
    `types skipped (out of scope, see the comment above): ${skippedTypes}`,
  );
console.log(`findings: ${findings}`);
process.exit(findings ? 1 : 0);
