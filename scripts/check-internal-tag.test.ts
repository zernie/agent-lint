import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it, expect, afterAll } from "vitest";

/**
 * Tests for `scripts/check-internal-tag.mjs` — the gate that reports a symbol
 * tagged `@internal` while the exports map ships it.
 *
 * 🔴 EVERY CASE HAS BOTH HALVES: it fires on a planted defect AND it is silent
 * on the legitimate input next door. A gate whose success looks like silence
 * cannot be noticed broken, and this repository has shipped several checks that
 * were dead on arrival — each found by accident, not by review.
 *
 * The fixture builds an api-extractor report on purpose: this check is
 * cross-file BY NATURE, because "is it public" is answered by the barrels and
 * the exports map, not by the file the declaration sits in. That is the whole
 * reason it stayed a script when its former other half — `@experimental` must
 * be NAMED `experimental_*` — became the ESLint rule `local/experimental-name`
 * (tested in `eslint-rules/experimental-name.test.ts`). Cases about NAMING
 * moved there; do not re-add them here, or the split silently reverts.
 */

const REPO = resolve(import.meta.dirname, "..");
const SCRIPT = join(REPO, "scripts", "check-internal-tag.mjs");
const roots: string[] = [];

/**
 * A throwaway project with one api-extractor report and one source file.
 * `report` lists what is PUBLIC; `source` is what carries the tags.
 */
function fixture(source: string, report = "export function widget(): void;") {
  const root = mkdtempSync(join(tmpdir(), "internal-tag-"));
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

describe("check-internal-tag", () => {
  it("FIRES on an @internal function that IS exported — a contradiction", () => {
    // The tag says "not part of the API" while the exports map ships it. Six of
    // these existed on the real corpus (`pipe`, `pipeStep`, `needs`, `start`,
    // `andThen`, `effect`), all reachable from `vigiles` and `vigiles/linting`.
    const { code, out } = run(
      fixture("/**\n * @internal\n */\nexport function widget(): void {}\n"),
    );
    expect(code).not.toBe(0);
    expect(out).toContain("tagged @internal but IS exported");
  });

  it("is SILENT on an @internal function that is NOT exported — the correct use", () => {
    const { code, out } = run(
      fixture(
        "/**\n * @internal\n */\nexport function helper(): void {}\n",
        "export function somethingElse(): void;",
      ),
    );
    expect(code).toBe(0);
    expect(out).toContain("checked: 0");
  });

  it("never suggests a DOUBLED prefix on an already-prefixed name", () => {
    // An `@internal` + already-prefixed symbol must be told to change its TAG,
    // not to become `experimental_experimental_x`.
    const { out } = run(
      fixture(
        "/**\n * @internal\n */\nexport function experimental_widget(): void {}\n",
        "export function experimental_widget(): void;",
      ),
    );
    expect(out).not.toContain("experimental_experimental_");
  });

  it("FIRES when BOTH tags are present — @internal is the stronger claim", () => {
    // 🔴 A REGRESSION INTRODUCED BY THE SPLIT, found by a reviewer. The tag field
    // was recorded as `experimental ? "@experimental" : "@internal"`, and after
    // the naming half moved to ESLint the reporting loop acts only on
    // `@internal` — so a both-tagged export was recorded as `@experimental` and
    // then silently ignored. Worse than a miss: the run still printed
    // `checked: 1`, so the counter read as coverage.
    const { code, out } = run(
      fixture(
        "/**\n * @experimental\n * @internal\n */\nexport function widget(): void {}\n",
      ),
    );
    expect(code).not.toBe(0);
    expect(out).toContain("tagged @internal but IS exported");
  });

  it("FIRES on an @internal DEFAULT export — an ordinary public API shape", () => {
    // Both matchers omitted the `default` modifier, so the source side saw no
    // declaration and the api-report side saw no public name. The two absences
    // cancelled into a clean `findings: 0`.
    const { code, out } = run(
      fixture(
        "/**\n * @internal\n */\nexport default function widget(): void {}\n",
        "export default function widget(): void;",
      ),
    );
    expect(code).not.toBe(0);
    expect(out).toContain("tagged @internal but IS exported");
  });

  it("is SILENT on an @internal default export that is NOT public", () => {
    const { code, out } = run(
      fixture(
        "/**\n * @internal\n */\nexport default function helper(): void {}\n",
        "export function somethingElse(): void;",
      ),
    );
    expect(code).toBe(0);
    expect(out).toContain("checked: 0");
  });

  // ── the failure mode that would make it green and dead ──

  it("REFUSES to pass when there are no api reports to read", () => {
    // Without this, running it anywhere the reports are missing exits 0 and
    // looks identical to a clean run — the exact shape of a check that is
    // silently doing nothing.
    const root = mkdtempSync(join(tmpdir(), "internal-tag-empty-"));
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
