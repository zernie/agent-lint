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
 * ⚠️ `export default` IS matched, and was not until 2026-08-21. Both this matcher
 * and the api-report one above omitted the modifier, so an `@internal` symbol
 * exported as default was invisible to BOTH halves at once — the source side saw
 * no declaration and the report side saw no public name, and the two absences
 * cancelled into a clean `findings: 0`. A default export is an ordinary public
 * API shape, so the check simply did not hold for it.
 *
 * An ANONYMOUS default (`export default function () {}`) is still out of reach:
 * it has no name for the api report to list, so there is nothing to correlate.
 * Stated rather than left as silence.
 */
const VALUE_DECL =
  /^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(function|const|let|var|class)\s+([A-Za-z0-9_$]+)/;

/**
 * A TSDoc tag, with or without prose after it.
 *
 * 🔴 The first version of this required the tag ALONE on its line
 * (`@experimental\s*$`). Real tags carry prose — `@internal Experimental
 * typed-composition surface — …` on `pipe`, and two in `services.ts` — so the
 * check silently skipped them. Measured the day it shipped: 2 of 8 tagged
 * `@experimental` declarations and 31 of 39 `@internal` ones were invisible to
 * it. A stricter pattern read as a safer one and was the opposite.
 */
const tagRe = (tag) => new RegExp(`^\\s*\\*\\s*@${tag}\\b`, "m");

/**
 * The next value declaration after a doc block, skipping anything that is not
 * one — `pipe` has an `/* eslint-disable ... *\/` between its JSDoc and its
 * first overload, and anchoring at the very next character missed it. Only
 * comments and blank lines may intervene; real code ends the search, so a doc
 * block that documents nothing does not silently adopt a distant declaration.
 */
function declAfter(src, from) {
  let rest = src.slice(from);
  for (;;) {
    const skipped = rest.replace(
      /^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)\s*)+/,
      "",
    );
    const decl = VALUE_DECL.exec(skipped);
    if (decl) return decl;
    if (skipped === rest) return null;
    rest = skipped;
  }
}

function taggedExperimental(file) {
  const src = readFileSync(file, "utf8");
  const out = [];
  const BLOCK = /\/\*\*[\s\S]*?\*\//g;
  let m;
  while ((m = BLOCK.exec(src)) !== null) {
    const block = m[0];
    const experimental = tagRe("experimental").test(block);
    const internal = tagRe("internal").test(block);
    if (!experimental && !internal) continue;
    if (/@module\b/.test(block)) continue; // file-level tag, not a symbol
    const decl = declAfter(src, m.index + block.length);
    if (!decl) continue;
    const line = src.slice(0, m.index + block.length).split("\n").length;
    out.push({
      name: decl[2],
      line,
      // 🔴 `@internal` WINS when both tags are present, and the opposite order
      // was a live bug for as long as this file had one job. It reads as a
      // harmless tie-break, and it is not: since the split, the reporting loop
      // acts only on `@internal`, so recording `@experimental` for a
      // both-tagged symbol swallowed it silently — and the run still printed
      // `checked: 1`, claiming it had looked. A counter that counts a symbol it
      // then ignores is worse than one that misses it, because the number reads
      // as coverage.
      //
      // Precedence is also right on the merits: `@experimental` says "this may
      // change", `@internal` says "this is not API at all". The second is the
      // stronger claim about an exported symbol, and the stronger claim is the
      // contradiction worth reporting.
      tag: internal ? "@internal" : "@experimental",
    });
  }
  return out;
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
for (const file of walk(join(ROOT, "src"))) {
  for (const d of taggedExperimental(file)) {
    const doors = pub.get(d.name);
    // Not exported from any subpath: the tag is a note to maintainers and
    // promises nothing to anyone. Both tags are fine there, unchecked.
    if (!doors) continue;
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
  `\npublic @experimental/@internal declarations checked: ${checked}  (across ${reports.length} api reports)`,
);
console.log(`findings: ${findings}`);
process.exit(findings ? 1 : 0);
