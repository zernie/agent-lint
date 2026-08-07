/**
 * BROWSER-PARITY firewall — closes the pako-vs-node-zlib gap for real.
 *
 * `runAudit` runs the engine's NCD description-overlap check, which gzips skill
 * descriptions. In Node that's `node:zlib`; in the browser it's pako (the aliased
 * shim). If pako's compressed length ever diverged from Node's, the overlap
 * distance — and thus the GRADE — would drift. This test computes the report
 * IN A REAL BROWSER (via pako) over the sample repo and asserts byte-for-byte
 * equality with the EXPECTED report generated in Node (`scripts/gen-parity-expected.mjs`).
 *
 * If it fails: pako and node:zlib disagree on this input — do NOT paper over it;
 * report it. (Regenerate the expected only after an intentional engine change:
 * `node site/scripts/gen-parity-expected.mjs`.)
 *
 * That instruction used to be correct for only ONE of the two states this test
 * could be in. Vite's dependency prebundle (`site/node_modules/.vite`) survived
 * `npm run build`, so the browser could compute against a PREVIOUS engine and
 * fail with a field-level diff indistinguishable from a real divergence —
 * sending the reader after a pako bug that did not exist (observed 2026-08-07).
 * `site/vitest.config.ts` now keys the prebundle cache DIRECTORY on a fingerprint
 * of `dist/`, so "the browser ran an older engine than Node" is no longer a
 * reachable state, and the instruction above is true again for every way this
 * test can fail. See site/vite.engine-stamp.ts.
 */
import { describe, it, expect } from "vitest";
import { runAudit } from "./runAudit";
import files from "./__fixtures__/sample-repo.files.json";
import expected from "./__fixtures__/sample-repo.expected.json";

describe("browser audit parity (pako === node:zlib)", () => {
  it("produces the identical AuditReport in-browser as Node does", () => {
    const got = runAudit(files as Record<string, string>, "acme/widgets");
    expect(
      got,
      "in-browser AuditReport differs from the Node-generated expected. The " +
        "prebundle cache is keyed to dist/, so this should be a REAL pako-vs-" +
        "node:zlib divergence or an intentional engine change (regenerate with " +
        "`node site/scripts/gen-parity-expected.mjs`) — not a stale cache.",
    ).toEqual(expected);
  });

  it("the sample actually exercises the NCD overlap path (non-A grade)", () => {
    // Guards the guard: a fixture that graded a clean A wouldn't test overlap.
    expect(expected.score.grade).not.toBe("A");
    expect(expected.recommendations.length).toBeGreaterThan(0);
  });
});
