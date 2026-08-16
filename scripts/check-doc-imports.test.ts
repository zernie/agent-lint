import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it, expect, afterAll } from "vitest";

/**
 * Tests for `scripts/check-doc-imports.mjs` — the gate that reads TypeScript examples in the
 * docs and reports imports of this package's own module surface that do not resolve.
 *
 * 🔴 EVERY CASE HERE HAS BOTH HALVES: it fires on a planted defect AND it is silent on the
 * legitimate input next door. A gate whose success looks like silence cannot be noticed broken,
 * so "silent" alone is indistinguishable from dead — this repository has shipped three checks
 * that were dead on arrival, and each was found by accident.
 *
 * The false-positive cases are the load-bearing ones. The measured reason this gate exists in
 * this narrow shape rather than as a full type-check is that only 36.3% of the real corpus is
 * self-contained; the illustrative fragments below are what a full `tsc` would fire on, 232
 * times, and what mutes a checker within a week.
 */

const REPO = resolve(import.meta.dirname, "..");
const SCRIPT = join(REPO, "scripts", "check-doc-imports.mjs");
const roots: string[] = [];

/** A throwaway package that self-references through its own `exports` map, like vigiles does. */
function fixture(docBody: string): string {
  const root = mkdtempSync(join(tmpdir(), "doc-import-check-"));
  roots.push(root);
  mkdirSync(join(root, "dist"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "demo-pkg",
      version: "0.0.0",
      type: "commonjs",
      exports: { "./real": "./dist/real.js" },
    }),
  );
  writeFileSync(join(root, "dist", "real.js"), "exports.greet = () => {};\n");
  writeFileSync(
    join(root, "dist", "real.d.ts"),
    "export declare function greet(name: string): void;\n",
  );
  // The script resolves `typescript` and `markdown-it` from the target package, so borrow ours.
  symlinkSync(join(REPO, "node_modules"), join(root, "node_modules"), "dir");
  writeFileSync(join(root, "docs", "guide.md"), docBody);
  return root;
}

function run(root: string): { code: number; out: string } {
  try {
    return {
      code: 0,
      out: execFileSync("node", [SCRIPT, root, "docs"], { encoding: "utf8" }),
    };
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    return { code: err.status ?? 1, out: err.stdout ?? "" };
  }
}

const fence = (body: string, marker = "") =>
  `${marker}\n\`\`\`ts\n${body}\n\`\`\`\n`;

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

describe("check-doc-imports", () => {
  it("FIRES on a subpath the exports map does not serve", () => {
    const { code, out } = run(
      fixture(fence(`import { greet } from "demo-pkg/phantom";\ngreet("x");`)),
    );
    expect(out).toContain("TS2307");
    expect(out).toContain("demo-pkg/phantom");
    expect(code).toBe(1);
  });

  it("FIRES on a named import the package does not export", () => {
    const { code, out } = run(
      fixture(
        fence(
          `import { greet, nope } from "demo-pkg/real";\ngreet("x");\nnope();`,
        ),
      ),
    );
    expect(out).toContain("TS2305");
    expect(out).toContain("nope");
    expect(code).toBe(1);
  });

  it("is SILENT on an import that resolves", () => {
    const { code, out } = run(
      fixture(fence(`import { greet } from "demo-pkg/real";\ngreet("x");`)),
    );
    expect(out).toContain("findings: 0");
    expect(code).toBe(0);
  });

  // ── the false-positive half: what a full type-check would fire on and this must not ──

  it("is SILENT on an illustrative fragment with free variables", () => {
    // Two thirds of the real corpus looks like this. A gate that fires here is muted in a week.
    const { code } = run(
      fixture(
        fence(`const report = runEval(config);\nconsole.log(report.mean);`),
      ),
    );
    expect(code).toBe(0);
  });

  it("is SILENT on a deliberate type error in a non-own-surface call", () => {
    const { code } = run(
      fixture(fence(`import { greet } from "demo-pkg/real";\ngreet(42);`)),
    );
    expect(code).toBe(0);
  });

  // 🔴 THE TWO CASES BELOW PIN THE TWO FILTER HALVES, ONE EACH, AND THEY EXIST BECAUSE THE FIRST
  // VERSION OF THIS SUITE DID NOT. Mutating either half — dropping the diagnostic-code allowlist,
  // or dropping the "message names OUR package" test — left all ten tests GREEN, because the
  // fragments above trip BOTH filters independently and so cannot tell them apart. A green
  // mutation is a finding about the test, not a verdict on the checker.
  //
  // Both cases are transcribed from what the real corpus actually contains, measured by turning
  // each half off and reading what came through:
  //   own-package filter off → 3 findings, all `import … from "./my-harness-adapter.js"`
  //   diagnostic-code filter off → 1 finding, TS2664 in a `declare module` augmentation

  it("is SILENT on a RELATIVE import the doc invents for the example", () => {
    // TS2307 — the same code a phantom subpath produces — but about someone else's module.
    // Three real blocks in docs/adapter-api.md and docs/authoring-an-adapter.md do exactly this.
    // Pins: the "message names our package" half. Dropping it turns these three into findings.
    const { code, out } = run(
      fixture(
        fence(
          `import { adapter } from "./my-harness-adapter.js";\nvoid adapter;`,
        ),
      ),
    );
    expect(out).toContain("findings: 0");
    expect(code).toBe(0);
  });

  it("is SILENT on a module augmentation naming a generated module", () => {
    // TS2664, which NAMES our package and so passes the own-package half — only the
    // diagnostic-code allowlist stops it. `docs/linter-support.md` documents exactly this
    // augmentation against `vigiles/generated`, a module that exists only after codegen.
    // Pins: the allowlist half. Dropping it turns that block into a finding.
    const { code, out } = run(
      fixture(
        fence(
          `declare module "demo-pkg/generated" {\n  export const x: number;\n}`,
        ),
      ),
    );
    expect(out).toContain("findings: 0");
    expect(code).toBe(0);
  });

  it("is SILENT on a block that is not TypeScript", () => {
    const root = fixture("```sh\nnpm install demo-pkg/phantom\n```\n");
    expect(run(root).code).toBe(0);
  });

  // ── the markers ──

  it("`vigiles:check` OPTS IN to the full type-check, catching what gate 1 ignores", () => {
    const { code, out } = run(
      fixture(
        fence(
          `import { greet } from "demo-pkg/real";\ngreet(42);`,
          "<!-- vigiles:check -->",
        ),
      ),
    );
    expect(out).toContain("TS2345"); // Argument of type 'number' is not assignable to 'string'
    expect(out).toContain("[vigiles:check]");
    expect(code).toBe(1);
  });

  it("`vigiles:ignore` exempts ONE block and nothing after it", () => {
    const body =
      fence(
        `import { greet } from "demo-pkg/phantom";`,
        "<!-- vigiles:ignore -->",
      ) + fence(`import { greet } from "demo-pkg/gone";`);
    const { out } = run(fixture(body));
    expect(out).not.toContain("demo-pkg/phantom");
    expect(out).toContain("demo-pkg/gone"); // the exemption did not leak to the next block
  });

  it("`vigiles:ignore-file` exempts the whole file", () => {
    const body =
      "<!-- vigiles:ignore-file -->\n" +
      fence(`import { greet } from "demo-pkg/phantom";`);
    expect(run(fixture(body)).code).toBe(0);
  });

  // ── the failure mode that would make it green and dead ──

  it("counts the blocks it scanned, so a glob that matches nothing is VISIBLE", () => {
    // A run over zero blocks exits 0 — identical to a clean run. The count is the only thing
    // that tells the two apart, which is why it is printed rather than kept internal.
    const { out } = run(
      fixture(fence(`import { greet } from "demo-pkg/real";`)),
    );
    expect(out).toMatch(/blocks scanned: [1-9]/);
  });
});
