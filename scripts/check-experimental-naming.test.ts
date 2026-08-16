import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it, expect, afterAll } from "vitest";

/**
 * Tests for `scripts/check-experimental-naming.mjs` — the gate that requires a
 * public declaration tagged `@experimental` to say so in its name.
 *
 * 🔴 EVERY CASE HAS BOTH HALVES: it fires on a planted defect AND it is silent
 * on the legitimate input next door. A gate whose success looks like silence
 * cannot be noticed broken, and this repository has shipped several checks that
 * were dead on arrival — each found by accident, not by review.
 *
 * The exemption cases are the load-bearing ones. This gate opened on the real
 * corpus with 7 findings, 6 of which were TYPES nobody intends to rename; had it
 * shipped that way it would have been muted the same day, which is the failure
 * mode these tests exist to pin.
 */

const REPO = resolve(import.meta.dirname, "..");
const SCRIPT = join(REPO, "scripts", "check-experimental-naming.mjs");
const roots: string[] = [];

/**
 * A throwaway project with one api-extractor report and one source file.
 * `report` lists what is PUBLIC; `source` is what carries the tags.
 */
function fixture(source: string, report = "export function widget(): void;") {
  const root = mkdtempSync(join(tmpdir(), "exp-naming-"));
  roots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "api-surface"), { recursive: true });
  writeFileSync(join(root, "src", "thing.ts"), source);
  writeFileSync(
    join(root, "api-surface", "demo.api.md"),
    "## API Report\n\n```ts\n" + report + "\n```\n",
  );
  return root;
}

function run(root: string) {
  try {
    return {
      code: 0,
      out: execFileSync("node", [SCRIPT, root], { encoding: "utf8" }),
    };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { code: err.status, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

describe("check-experimental-naming", () => {
  it("FIRES on a public @experimental function without the prefix", () => {
    const { code, out } = run(
      fixture(
        "/**\n * @experimental\n */\nexport function widget(): void {}\n",
      ),
    );
    expect(code).not.toBe(0);
    expect(out).toContain("widget");
    expect(out).toContain("experimental_widget");
  });

  it("is SILENT once the function carries the prefix", () => {
    const { code, out } = run(
      fixture(
        "/**\n * @experimental\n */\nexport function experimental_widget(): void {}\n",
        "export function experimental_widget(): void;",
      ),
    );
    expect(code).toBe(0);
    expect(out).toContain("findings: 0");
  });

  // ── the exemptions, each with the reason it exists ──

  it("is SILENT on an INTERNAL @experimental function — absent from every report", () => {
    // Internals may be experimental without renaming; only the public surface
    // makes a promise to anyone.
    const { code, out } = run(
      fixture(
        "/**\n * @experimental\n */\nexport function helper(): void {}\n",
        "export function somethingElse(): void;",
      ),
    );
    expect(code).toBe(0);
    expect(out).toContain("checked: 0");
  });

  it("is SILENT on a TYPE — the prefix convention is about callables", () => {
    // Measured on the pre-gate surface: every prefixed symbol was a function,
    // while ServiceSpec / ServiceHandle / ContainerRuntime were plain. Pulling
    // types in opens with 6 cosmetic renames against 1 real finding.
    const { code } = run(
      fixture(
        "/**\n * @experimental\n */\nexport type Widget = { a: number };\n",
        "export type Widget = {\n  a: number;\n};",
      ),
    );
    expect(code).toBe(0);
  });

  it("is SILENT on a FILE-level @experimental tag — it documents the module", () => {
    // `services.ts` carries one on its `@module` block. Without this, every
    // export of that file is reported for a tag that was never about it.
    const { code } = run(
      fixture(
        "/**\n * @experimental\n * @module demo\n */\n\nexport function widget(): void {}\n",
      ),
    );
    expect(code).toBe(0);
  });

  it("honours the opt-out marker ONLY when a reason follows it", () => {
    const withReason = run(
      fixture(
        "/**\n * vigiles:experimental-name-ok pinned name, external caller\n * @experimental\n */\nexport function widget(): void {}\n",
      ),
    );
    expect(withReason.code).toBe(0);

    // A bare marker is not an escape hatch — an unexplained exemption is how a
    // gate gets emptied one silent line at a time.
    const bare = run(
      fixture(
        "/**\n * vigiles:experimental-name-ok\n * @experimental\n */\nexport function widget(): void {}\n",
      ),
    );
    expect(bare.code).not.toBe(0);
  });

  // ── the failure mode that would make it green and dead ──

  it("REFUSES to pass when there are no api reports to read", () => {
    // Without this, running it anywhere the reports are missing exits 0 and
    // looks identical to a clean run — the exact shape of a check that is
    // silently doing nothing.
    const root = mkdtempSync(join(tmpdir(), "exp-naming-empty-"));
    roots.push(root);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(
      join(root, "src", "thing.ts"),
      "/**\n * @experimental\n */\nexport function widget(): void {}\n",
    );
    const { code, out } = run(root);
    expect(code).not.toBe(0);
    expect(out).toContain("Refusing to pass vacuously");
  });

  it("counts what it checked, so a run that inspected nothing is VISIBLE", () => {
    const { out } = run(
      fixture(
        "/**\n * @experimental\n */\nexport function experimental_widget(): void {}\n",
        "export function experimental_widget(): void;",
      ),
    );
    expect(out).toMatch(/declarations checked: [1-9]/);
  });
});
