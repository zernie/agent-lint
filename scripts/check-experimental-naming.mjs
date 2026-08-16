#!/usr/bin/env node
/**
 * check-experimental-naming.mjs — a symbol the source calls EXPERIMENTAL must
 * SAY SO IN ITS NAME.
 *
 * One sentence: if a declaration carries the `@experimental` TSDoc tag and is
 * reachable from a public subpath, its name must start with `experimental_`.
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
 * WHY NOT the alternatives:
 *   - A `vigiles lint` finding shipped to users — rejected: `experimental_` is
 *     THIS project's naming convention, not a universal property of harnesses.
 *     It would also be a new user-facing surface, which the project refuses by
 *     default.
 *   - A new marker comment — rejected: `@experimental` is standard TSDoc, already
 *     used in `src/experimental-emit.ts` and `src/services.ts`, and already
 *     understood by api-extractor. A second marker would be a second truth.
 *   - Prose in CLAUDE.md — rejected BY MEASUREMENT: the convention was already
 *     prose, and `skill()` violated it anyway.
 *
 * HOW IT DECIDES WHAT IS PUBLIC: `api-surface/*.api.md`, the committed
 * api-extractor reports that `npm run api:check` already keeps honest. A symbol
 * absent from every report is internal and exempt — internals may be experimental
 * without renaming.
 *
 * Usage: node scripts/check-experimental-naming.mjs [root]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(process.argv[2] ?? ".");
const PREFIX = "experimental_";
/**
 * Opt out on the declaration itself, with a reason after the marker.
 *
 * The reason must be on the SAME line: `\s+\S` would be satisfied by the newline
 * plus the JSDoc continuation `*`, so a bare marker followed by any further tag
 * would read as "explained". Caught by the bare-marker test, not by review.
 */
const ALLOW = /vigiles:experimental-name-ok[^\S\n]+\S/;

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
    /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/;
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
const VALUE_DECL =
  /^\s*export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(function|const|let|var|class)\s+([A-Za-z0-9_$]+)/;

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
      tag: experimental ? "@experimental" : "@internal",
      exempt: ALLOW.test(block),
    });
  }
  return out;
}

const { names: pub, reports } = publicSymbols();
if (reports.length === 0) {
  console.error(
    "check-experimental-naming: no api-surface/*.api.md reports found — " +
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
    if (d.exempt) continue;

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

    if (d.name.startsWith(PREFIX)) continue;
    findings++;
    console.log(
      `${relative(ROOT, file)}:${d.line} \`${d.name}\` is tagged @experimental and is ` +
        `public (${where}) but is not named \`${PREFIX}${d.name}\`. ` +
        `Rename it, drop the tag, or mark the declaration ` +
        `\`vigiles:experimental-name-ok <reason>\`.`,
    );
  }
}

console.log(
  `\npublic @experimental/@internal declarations checked: ${checked}  (across ${reports.length} api reports)`,
);
console.log(`findings: ${findings}`);
process.exit(findings ? 1 : 0);
