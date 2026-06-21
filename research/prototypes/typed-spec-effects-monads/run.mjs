#!/usr/bin/env node
/**
 * One-shot reproducer for the typed-spec EFFECTS-&-MONADS prototypes (round 2).
 *
 *   node research/prototypes/typed-spec-effects-monads/run.mjs
 *
 * Asserts:
 *  - each compile-time "pass" file is accepted by tsc (exit 0);
 *  - each compile-time "fails" file is REJECTED by tsc, printing the diagnostic
 *    (the effect-leak caught with NO vigiles run, NO model);
 *  - each runtime demo (.mjs) runs green (exit 0).
 *
 * Companion to ../typed-spec-frontier/run.mjs and ../typed-spec-power/run.mjs.
 * Exits 0 iff every case behaved as expected.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");

const TSC_FLAGS = [
  "--noEmit",
  "--strict",
  "--module",
  "nodenext",
  "--moduleResolution",
  "nodenext",
  "--target",
  "es2022",
];

function tsc(file) {
  const r = spawnSync("npx", ["tsc", ...TSC_FLAGS, join(here, file)], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return { code: r.status ?? 1, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

function node(file) {
  const r = spawnSync("node", [join(here, file)], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return { code: r.status ?? 1, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

const tscCases = [
  { file: "effect-row.ts", expect: "pass" },
  { file: "effect-row-fails.ts", expect: "fail" },
];

const nodeCases = [
  { file: "effect-handler.mjs" },
  { file: "spec-interpreter.mjs" },
  { file: "graded-writer.mjs" },
];

let allOk = true;

console.log("=== compile-time (tsc) cases ===");
for (const c of tscCases) {
  const { code, out } = tsc(c.file);
  const compiled = code === 0;
  const ok = c.expect === "pass" ? compiled : !compiled;
  allOk &&= ok;
  console.log(
    `\n[${ok ? "OK" : "UNEXPECTED"}] ${c.file} — expected ${c.expect}, tsc exit ${code}`,
  );
  if (c.expect === "fail" && out.trim()) console.log(out.trim());
}

console.log("\n=== runtime demos (node) ===");
for (const c of nodeCases) {
  const { code, out } = node(c.file);
  const ok = code === 0;
  allOk &&= ok;
  console.log(`\n[${ok ? "OK" : "UNEXPECTED"}] ${c.file} — node exit ${code}`);
  if (out.trim()) console.log(out.trim());
}

console.log(
  `\n${allOk ? "All effects-&-monads cases behaved as expected." : "Some cases did NOT behave as expected."}`,
);
process.exit(allOk ? 0 : 1);
