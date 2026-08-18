#!/usr/bin/env node
/**
 * check-text-sources — a tracked SOURCE file must be text, i.e. must not contain
 * a NUL byte.
 *
 * WHY THIS IS A GATE AND NOT A STYLE NOTE. Git decides "binary" per blob by
 * looking for a NUL in the first 8000 bytes. A blob it calls binary gets no line
 * diff and — the part that costs real time — NO THREE-WAY MERGE: every concurrent
 * branch that touches it conflicts, and the conflict cannot be resolved by
 * picking hunks, because there are no hunks.
 *
 * Measured on 2026-08-18: `src/scan-files.test.ts` carried two RAW NUL bytes
 * inside a template literal — a separator someone typed instead of escaping. Two
 * branches were declared "conflicting with each other" and parked for a day.
 * After replacing those two bytes with the escape, BOTH merged into main with
 * ZERO conflicts. The conflict was entirely an artifact of the byte.
 *
 * The rest of this codebase already writes the escape (skill-contract.ts,
 * scan-core.ts, coverage-artifact.ts, coverage-probe.ts — eight sites), so this
 * gate does not impose a convention; it stops one file from leaving it.
 *
 * NOT a `.gitattributes text` marker: forcing the attribute would restore diff
 * and merge while leaving the byte in the source, which hides the defect instead
 * of removing it. The byte is the thing that is wrong.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const EXT = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|json|md|yml|yaml|sh|css|html)$/;

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  // The separator is a NUL, written as an ESCAPE: this file is subject to the
  // rule it enforces, and a literal one here would make it binary.
  .split("\u0000")
  .filter((p) => p !== "" && EXT.test(p));

// A scan that returns nothing is either "nothing to check" or "I looked in the
// wrong place", and only the code can tell them apart. Here it is always the
// latter: this repository always tracks source files.
if (tracked.length === 0) {
  console.error(
    "check-text-sources: scanned 0 files — refusing to pass vacuously.",
  );
  process.exit(1);
}

const bad = [];
for (const p of tracked) {
  const buf = readFileSync(p);
  const at = buf.indexOf(0);
  if (at !== -1) {
    let count = 0;
    for (const b of buf) if (b === 0) count++;
    bad.push({ p, at, count });
  }
}

if (bad.length > 0) {
  for (const b of bad) {
    console.error(
      `✗ ${b.p}: ${b.count} raw NUL byte(s), first at offset ${b.at}.\n` +
        `  Git treats this file as BINARY: no diff, and no three-way merge.\n` +
        `  Write the escape instead — \\u0000 in a string is the same value.`,
    );
  }
  process.exit(1);
}

console.log(`check-text-sources: ${tracked.length} source files, none binary`);
