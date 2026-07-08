/**
 * Gate: every runnable example under examples/ must PARSE (`node --check`).
 *
 * The `.mjs`/`.cjs`/`.js` examples are copy-paste on-ramps shown in the docs, but
 * nothing else runs them in CI (they need `claude` / Docker / model auth), so a
 * broken example could ship silently. This is the cheap floor — syntax only, no
 * imports resolved, no model, no daemon — so a typo in a shipped example fails the
 * build. (`.spec.ts`/`.eval.ts` are TypeScript compiled elsewhere; excluded here.)
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const EXAMPLES_DIR = join(process.cwd(), "examples");

const scripts = readdirSync(EXAMPLES_DIR, { recursive: true })
  .map((p) => String(p))
  .filter((p) => /\.(mjs|cjs|js)$/.test(p));

describe("examples parse (node --check)", () => {
  it("finds runnable example scripts", () => {
    expect(scripts.length).toBeGreaterThan(0);
  });

  it.each(scripts)("%s parses", (rel) => {
    expect(() =>
      execFileSync("node", ["--check", join(EXAMPLES_DIR, rel)], {
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
