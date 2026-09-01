/**
 * `compile` must not mint a hash-valid artifact over refs it just called dead
 * (#173) — driven through the REAL built CLI, because the defect is in what the
 * command LEAVES ON DISK, which no unit test of `compileClaude` can observe.
 *
 * The reported repro, verbatim in shape: a spec naming a file and an npm script
 * that do not exist. `compile` printed both errors and exited 1 — and still
 * wrote `CLAUDE.md`, stamped with a valid integrity hash. `lint` verifies that
 * hash, finds it intact, and exits 0. So the command the README calls the CI
 * gate for broken refs went green over breakage that had been printed minutes
 * earlier on the author's own screen.
 *
 * Deterministic, model-free, offline → the free unit tier.
 */
import { test, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

import { makeTmpDir, cleanupTmpDir } from "./core/test-utils.js";

const CLI = resolve(__dirname, "..", "dist", "cli.js");
const SPEC_ENTRY = resolve(__dirname, "..", "dist", "core", "spec.js");

let dir: string;

/** Run the CLI in the fixture, returning exit code + combined output. */
function run(...args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync("node", [CLI, ...args], {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return {
      code: err.status ?? 1,
      out: `${err.stdout ?? ""}${err.stderr ?? ""}`,
    };
  }
}

beforeEach(() => {
  dir = makeTmpDir();
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "gate-fixture", version: "0.0.0", scripts: {} }),
  );
});

afterEach(() => {
  cleanupTmpDir(dir);
});

/** A spec whose refs are both dead — one file, one npm script. */
function deadRefSpec(): string {
  return (
    `import { instructionFile, file, cmd } from ${JSON.stringify(SPEC_ENTRY)};\n` +
    `export default instructionFile({\n` +
    `  sections: {\n` +
    `    Overview: \`Gate reproduction.\`,\n` +
    `    Routing: [file("docs/never-existed.md"), cmd("npm run never-existed")],\n` +
    `  },\n` +
    `  rules: {},\n` +
    `});\n`
  );
}

test("compile does NOT write an artifact when refs are dead (#173)", () => {
  writeFileSync(join(dir, "CLAUDE.md.spec.ts"), deadRefSpec());

  const compiled = run("compile", "CLAUDE.md.spec.ts");

  assert.notEqual(compiled.code, 0, "a dead ref must fail the compile");
  assert.match(compiled.out, /never-existed/, "the error names the dead ref");
  assert.equal(
    existsSync(join(dir, "CLAUDE.md")),
    false,
    "no artifact: writing one here mints a valid hash over known-dead refs",
  );
});

test("a failed compile leaves the LAST GOOD artifact alone, not a broken one", () => {
  // Why this half matters: "do not write" must not mean "destroy what is there".
  const good =
    `import { instructionFile } from ${JSON.stringify(SPEC_ENTRY)};\n` +
    `export default instructionFile({\n` +
    `  sections: { Overview: \`All refs real.\` },\n` +
    `  rules: {},\n` +
    `});\n`;
  writeFileSync(join(dir, "CLAUDE.md.spec.ts"), good);
  assert.equal(run("compile", "CLAUDE.md.spec.ts").code, 0);

  const before = readFileSync(join(dir, "CLAUDE.md"), "utf-8");
  assert.match(before, /All refs real/);

  // Now break the spec and recompile.
  writeFileSync(join(dir, "CLAUDE.md.spec.ts"), deadRefSpec());
  assert.notEqual(run("compile", "CLAUDE.md.spec.ts").code, 0);

  assert.equal(
    readFileSync(join(dir, "CLAUDE.md"), "utf-8"),
    before,
    "the previous good artifact must survive a failed compile untouched",
  );

  // 🔴 THIS ASSERTION USED TO SAY `lint` MUST BE GREEN HERE, and that expectation
  // was the hole itself. The surviving artifact IS intact — its hash matches what
  // the spec compiled to — but the spec it came from now names a file that does
  // not exist, so calling the repo clean is exactly the false confidence #173 was
  // filed about. The hash is an integrity claim, not a reference claim.
  //
  // `spec-refs` closes that residue, so a dead reference is reported even though
  // the artifact is untouched. What the surviving-artifact half of this test
  // still pins is the FILE: refusing to write must not mean destroying what is
  // there, which is asserted above by comparing the bytes.
  const linted = run("lint", ".");
  assert.equal(linted.code, 2, "the dead reference is caught, not the file");
  assert.match(linted.out, /never-existed/);
});

test("lint no longer goes green over an artifact compile refused to write", () => {
  // The end-to-end shape of the report: the author compiles, sees the error,
  // gets distracted, commits. CI runs `lint`.
  writeFileSync(join(dir, "CLAUDE.md.spec.ts"), deadRefSpec());
  run("compile", "CLAUDE.md.spec.ts");

  const linted = run("lint", ".");
  assert.equal(
    linted.out.includes("hash valid"),
    false,
    "there is no artifact to call intact, so lint cannot report one",
  );
});
