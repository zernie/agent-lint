#!/usr/bin/env node
/**
 * One-shot reproducer for the typed-spec-power prototypes.
 *
 *   node research/prototypes/typed-spec-power/run.mjs
 *
 * Asserts each "good" file compiles (exit 0) and each "fails" file is REJECTED
 * by tsc (exit != 0), and prints the captured diagnostics. The whole point is
 * that the broken pipelines / purity violations are caught by `tsc` alone — no
 * `vigiles` command in the loop.
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

const cases = [
  { file: "typed-composition.ts", expect: "pass" },
  { file: "fails.ts", expect: "fail" },
  { file: "purity-types.ts", expect: "pass" },
  { file: "purity-fails.ts", expect: "fail" },
];

let allOk = true;
for (const c of cases) {
  const { code, out } = tsc(c.file);
  const compiled = code === 0;
  const ok = c.expect === "pass" ? compiled : !compiled;
  allOk &&= ok;
  const verdict = ok ? "OK" : "UNEXPECTED";
  console.log(
    `\n[${verdict}] ${c.file} — expected ${c.expect}, tsc exit ${code}`,
  );
  if (out.trim()) console.log(out.trim());
}

console.log(
  `\n${allOk ? "All cases behaved as expected." : "Some cases did NOT behave as expected."}`,
);
process.exit(allOk ? 0 : 1);
