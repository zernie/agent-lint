#!/usr/bin/env node
/**
 * One-shot reproducer for the typed-spec-FRONTIER prototypes.
 *
 *   node research/prototypes/typed-spec-frontier/run.mjs
 *
 * Asserts:
 *  - each compile-time "pass" file is accepted by tsc (exit 0);
 *  - each compile-time "fails" file is REJECTED by tsc (exit != 0), printing the
 *    captured diagnostic (the bug caught with NO vigiles run, NO model);
 *  - each runtime-check demo (.mjs) runs green (exit 0).
 *
 * Companion to ../typed-spec-power/run.mjs (the prior round). Exits 0 iff every
 * case behaved as expected.
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
  { file: "trifecta-types.ts", expect: "pass" },
  { file: "trifecta-fails.ts", expect: "fail" },
  { file: "typestate-protocol.ts", expect: "pass" },
  { file: "typestate-fails.ts", expect: "fail" },
  { file: "affine-capability.ts", expect: "pass" },
  { file: "affine-fails.ts", expect: "fail" },
  { file: "graded-budget.ts", expect: "pass" },
];

const nodeCases = [
  { file: "disjoint-writes.mjs" },
  { file: "hyperproperty.mjs" },
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

console.log("\n=== runtime-check (node) demos ===");
for (const c of nodeCases) {
  const { code, out } = node(c.file);
  const ok = code === 0;
  allOk &&= ok;
  console.log(`\n[${ok ? "OK" : "UNEXPECTED"}] ${c.file} — node exit ${code}`);
  if (!ok && out.trim()) console.log(out.trim());
}

console.log(
  `\n${allOk ? "All frontier cases behaved as expected." : "Some cases did NOT behave as expected."}`,
);
process.exit(allOk ? 0 : 1);
