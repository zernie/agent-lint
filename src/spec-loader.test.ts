/**
 * Regression tests for `loadSpec` — the spec loader that compile/test/audit all
 * go through.
 *
 * THE MEASURED FAILURE (2026-08-31, in a consuming repo). `npx vigiles compile`
 * printed `✗ … failed to load` for ALL 50 specs and advised «run `npm run build`
 * first». Both halves were wrong:
 *
 *   - the CAUSE was that `tsx` was not installed locally, so the fallback's
 *     `npx tsx` went to the npm registry; measured `npx tsx -e 'console.log(1)'`
 *     took >60s against the loader's 15s budget, so every spec timed out;
 *   - the ADVICE named a build step that does not exist in a consumer install,
 *     and `catch { return null }` had already erased the real reason.
 *
 * After installing tsx locally: `npx tsx` 0.712s, compile 0 ✓ / 39 ✗ → 48 ✓ / 2 ✗.
 *
 * The fix tries a NATIVE `import()` first (Node >= 22.6 strips types itself), so
 * the subprocess and the network are not on the happy path at all. The first test
 * below is the one that matters: it removes npm/npx from PATH entirely and
 * asserts compile still works. If someone reverts to tsx-first, that test fails.
 *
 * Deterministic, model-free, offline → free unit tier.
 */
import { describe, it, beforeAll, afterAll } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import { describeLoadFailure } from "./cli.js";

// NB: `__dirname`, not `import.meta` — this package builds to CommonJS and tsc
// rejects import.meta here (TS1470). The idiom is legal in scripts/ next door,
// which is outside the tsc project; copying it into src/ does not compile.
const ROOT = resolve(__dirname, "..");
const CLI = resolve(ROOT, "dist", "cli.js");

let dir: string;

/** A minimal, valid skill spec that imports the package's own entrypoint. */
function writeSpec(at: string, name: string): void {
  mkdirSync(dirname(at), { recursive: true });
  writeFileSync(
    at,
    `import { experimental_skill } from "vigiles/spec";\n` +
      `export default experimental_skill({\n` +
      `  name: ${JSON.stringify(name)},\n` +
      `  description: "A fixture skill. Use when testing the spec loader.",\n` +
      `  body: "# ${name}\\n\\nFixture body.\\n",\n` +
      `});\n`,
  );
}

function run(
  cwd: string,
  env: NodeJS.ProcessEnv,
): { out: string; code: number } {
  try {
    const out = execSync(`node ${JSON.stringify(CLI)} compile`, {
      cwd,
      encoding: "utf-8",
      env,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120_000,
    });
    return { out, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return {
      out: (err.stdout ?? "") + (err.stderr ?? ""),
      code: err.status ?? 1,
    };
  }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "vigiles-spec-loader-"));
  // The fixture repo resolves `vigiles/spec` through a link back to this checkout.
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  execSync(
    `ln -s ${JSON.stringify(ROOT)} ${JSON.stringify(join(dir, "node_modules", "vigiles"))}`,
  );
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "fixture", type: "module", private: true }, null, 2),
  );
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("loadSpec", () => {
  it("compiles a spec with npm and npx REMOVED FROM PATH", () => {
    // This is the load-bearing assertion. Before the fix the loader could only
    // read a .ts spec by shelling out to `npx tsx`; with npx unreachable every
    // spec failed. Native type stripping needs no subprocess, so this passes.
    writeSpec(
      join(dir, ".claude", "skills", "alpha", "SKILL.md.spec.ts"),
      "alpha",
    );

    // Shadow npm/npx with stubs that always fail, PREPENDED to PATH. Deleting
    // PATH entries instead would also remove `node` (they share a directory),
    // so the test would pass for the wrong reason — «node: not found».
    const shadow = join(dir, "no-npx");
    mkdirSync(shadow, { recursive: true });
    for (const bin of ["npx", "npm"]) {
      const f = join(shadow, bin);
      writeFileSync(
        f,
        `#!/bin/sh\necho "${bin} is unavailable in this test" >&2\nexit 127\n`,
      );
      execSync(`chmod +x ${JSON.stringify(f)}`);
    }

    const { out } = run(dir, {
      ...process.env,
      PATH: `${shadow}:${process.env.PATH ?? ""}`,
    });
    assert.match(
      out,
      /✓ .*alpha\/SKILL\.md\.spec\.ts/,
      `compile must succeed without npx on PATH, got:\n${out}`,
    );
    assert.doesNotMatch(out, /failed to load/, `no spec should fail:\n${out}`);
  });

  it("never advises `npm run build` when a spec fails to load", () => {
    // The old message said exactly this for every failure, including the ones it
    // could not possibly fix. A build step does not exist in a consumer install.
    writeSpec(
      join(dir, ".claude", "skills", "broken", "SKILL.md.spec.ts"),
      "broken",
    );
    writeFileSync(
      join(dir, ".claude", "skills", "broken", "SKILL.md.spec.ts"),
      `import { experimental_skill } from "vigiles/spec";\nthis is not valid typescript(((\n`,
    );

    const { out } = run(dir, process.env);
    assert.match(
      out,
      /failed to load/,
      `the broken spec must be reported:\n${out}`,
    );
    assert.doesNotMatch(
      out,
      /npm run build/,
      `the retired misleading advice must not come back:\n${out}`,
    );
    assert.match(
      out,
      /spec did not load|tsx|Node >= 22\.6/,
      `the message must name an actionable cause:\n${out}`,
    );

    rmSync(join(dir, ".claude", "skills", "broken"), {
      recursive: true,
      force: true,
    });
  });
});

describe("describeLoadFailure", () => {
  it("names the timeout, and the fix, when the tsx fallback is killed", () => {
    const killed = Object.assign(new Error("Command failed"), { killed: true });
    const msg = describeLoadFailure(new Error("unsupported"), killed);
    assert.match(msg, /timed out after 15s/);
    assert.match(msg, /npm i -D tsx/, "must name the actual remedy");
  });

  it("names the install when tsx cannot be found at all", () => {
    const msg = describeLoadFailure(
      new Error("Unknown file extension"),
      new Error("npx: command not found"),
    );
    assert.match(msg, /Install tsx locally/);
    assert.match(
      msg,
      /Unknown file extension/,
      "must carry the native error too",
    );
  });

  it("blames the spec when both loaders report a parse error", () => {
    const msg = describeLoadFailure(
      new SyntaxError("Unexpected token '('"),
      new Error("exited with 1"),
    );
    assert.match(msg, /spec did not load/);
    assert.match(msg, /Unexpected token/);
    assert.doesNotMatch(msg, /tsx/, "a broken spec is not a tsx problem");
  });
});
