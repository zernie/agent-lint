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
 * The fix tries a NATIVE `import()` first (Node strips types itself from 22.18 on
 * the 22 line and 23.6 on 23; 22.6-22.17 need --experimental-strip-types), so
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

/**
 * Can THIS runtime import a .ts file directly?
 *
 * Probed, not inferred from `process.version`: native type stripping depends on
 * the major/minor AND on flags (`--no-strip-types` turns it off on a runtime
 * that otherwise supports it), so a version comparison would be wrong in both
 * directions. The repository's own CI runs Node 20, where the answer is no —
 * see .github/workflows/ci.yml (`node-version: "20"`).
 */
async function nativeTypeStripping(): Promise<boolean> {
  const probeDir = mkdtempSync(join(tmpdir(), "vigiles-strip-probe-"));
  const probe = join(probeDir, "probe.ts");
  writeFileSync(probe, "export default 1 as number;\n");
  try {
    await import(probe);
    return true;
  } catch {
    return false;
  } finally {
    rmSync(probeDir, { recursive: true, force: true });
  }
}

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
  it("compiles a spec with npm and npx REMOVED FROM PATH", async (ctx) => {
    // P1 from review on #178, and it was right: without this gate the assertion
    // below breaks CI deterministically. On a runtime with no type stripping the
    // native path cannot work, the stubs make the fallback unusable on purpose,
    // and «failed to load» is then the CORRECT outcome — the test would be
    // asserting a capability the runtime does not have.
    if (!(await nativeTypeStripping())) {
      ctx.skip();
      return;
    }
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

  it("reads exit status 127 — not stderr text — as a missing tsx", () => {
    const notFound = Object.assign(new Error("Command failed: npx tsx"), {
      status: 127,
    });
    const msg = describeLoadFailure(
      new Error('Unknown file extension ".ts"'),
      notFound,
    );
    assert.match(msg, /tsx is not\s+installed/);
  });

  it("does NOT read a spec's own 'not found' as a missing tsx", () => {
    // P2 from review on #178: matching the child's stderr misdiagnoses a spec
    // that fails for its own reasons — e.g. a config it requires is absent —
    // as a missing runner, and then advises installing something already there.
    const specFailed = Object.assign(
      new Error("Command failed: Error: config not found: ./missing.json"),
      { status: 1 },
    );
    const msg = describeLoadFailure(
      new Error('Unknown file extension ".ts"'),
      specFailed,
    );
    assert.doesNotMatch(msg, /tsx is not installed/);
    assert.match(msg, /config not found/, "the spec's own error must survive");
  });

  it("keeps the tsx error when native loading is merely unsupported", () => {
    // P2 from the same review: without type stripping the native attempt can only ever
    // say «Unknown file extension», so leading with it discards the one message
    // that came from actually running the spec. The repo's CI is Node 20, so
    // this is the COMMON path there, not an edge case.
    const msg = describeLoadFailure(
      new Error('Unknown file extension ".ts" for /tmp/x/SKILL.md.spec.ts'),
      Object.assign(new Error("SyntaxError: Unexpected token '('"), {
        status: 1,
      }),
    );
    assert.match(msg, /Unexpected token/, "the actionable error must be shown");
    assert.doesNotMatch(
      msg,
      /Unknown file extension/,
      "the expected native-loader noise must not be the headline",
    );
  });

  it("shows BOTH when the native error is informative", () => {
    const msg = describeLoadFailure(
      new SyntaxError("Unexpected token '('"),
      Object.assign(new Error("exited with 1"), { status: 1 }),
    );
    assert.match(msg, /Unexpected token/);
    assert.match(
      msg,
      /tsx said/,
      "both sides matter when neither is boilerplate",
    );
  });
});
