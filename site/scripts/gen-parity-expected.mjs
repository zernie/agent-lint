/**
 * Regenerate the browser-parity EXPECTED fixture.
 *
 * Runs the engine in NODE (real `node:zlib`) over the sample file-map and writes
 * the resulting AuditReport — exactly what `runAudit` produces (same vigilesVersion
 * + the meta.dir slug override). The browser-parity test then computes the SAME
 * report in-browser via pako and asserts deep equality: if pako's gzip length ever
 * diverged from node's, the NCD-driven description-overlap grade would differ and
 * this test would fail. Run:  node site/scripts/gen-parity-expected.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { scanFiles } from "../../dist/scan-files.js";
import { buildAuditReport } from "../../dist/audit-report.js";

const SLUG = "acme/widgets";
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

const files = JSON.parse(
  readFileSync(
    here("../src/demo/__fixtures__/sample-repo.files.json"),
    "utf-8",
  ),
);

const report = scanFiles(files);
const audit = buildAuditReport(report, {
  harness: "claude-code",
  vigilesVersion: "live",
});
// Mirror runAudit's meta.dir override.
const withSlug = { ...audit, meta: { ...audit.meta, dir: SLUG } };

writeFileSync(
  here("../src/demo/__fixtures__/sample-repo.expected.json"),
  JSON.stringify(withSlug, null, 2) + "\n",
);
console.log(
  `wrote expected: grade ${withSlug.score.grade} (${withSlug.score.overall}), ${withSlug.recommendations.length} recs`,
);
