/**
 * API Extractor driver — the public-API surface gate.
 *
 * Runs Microsoft API Extractor over EVERY public entry point in package.json
 * `exports` and writes a committed surface report per entry under `api-surface/`. Two
 * modes:
 *
 *   node scripts/api-extractor.mjs --local   # regenerate the reports (after an
 *                                            # intentional API change)
 *   node scripts/api-extractor.mjs           # CI gate: FAIL if the live surface
 *                                            # drifts from the committed report
 *
 * The committed `api-surface/*.api.md` files are the contract — a PR that adds/removes/
 * changes a public export shows up as a report diff, so the surface can't
 * silently regrow (the reason this exists; see research/roadmap.md). The
 * `temp/*.api.json` doc models feed `npm run docs:api` (API Documenter →
 * api-reference/, a gitignored derived artifact). Pure Node, no per-entry configs.
 */
import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// One report per public entry point. `.` and `./spec` resolve to the same module
// (the spec builders), so the root is reported once as `vigiles`. Keyed by the
// report name; `dts` is the built type-entry the export maps to.
const ENTRIES = [
  { name: "vigiles", dts: "dist/core/spec.d.ts" }, // "." + "./spec"
  { name: "vigiles-linting", dts: "dist/linting.d.ts" },
  { name: "vigiles-testing", dts: "dist/testing.d.ts" },
  { name: "vigiles-unit", dts: "dist/unit.d.ts" },
  { name: "vigiles-hook", dts: "dist/hook.d.ts" },
  { name: "vigiles-integration", dts: "dist/integration.d.ts" },
  { name: "vigiles-e2e", dts: "dist/e2e.d.ts" },
  { name: "vigiles-claude-code", dts: "dist/claude-code.d.ts" },
  { name: "vigiles-codex", dts: "dist/codex.d.ts" },
  { name: "vigiles-adapter", dts: "dist/adapter.d.ts" },
  { name: "vigiles-experimental", dts: "dist/experimental.d.ts" },
  { name: "vigiles-vitest", dts: "dist/vitest.d.mts" },
  { name: "vigiles-jest", dts: "dist/jest.d.ts" },
];

const localBuild = process.argv.includes("--local");

/** Build an in-memory API Extractor config for one entry (no per-entry JSON). */
function configFor(entry) {
  return ExtractorConfig.prepare({
    configObject: {
      projectFolder: root,
      mainEntryPointFilePath: path.join(root, entry.dts),
      compiler: { tsconfigFilePath: path.join(root, "tsconfig.json") },
      apiReport: {
        enabled: true,
        reportFolder: path.join(root, "api-surface"),
        reportFileName: `${entry.name}.api.md`,
        reportTempFolder: path.join(root, "temp"),
      },
      docModel: {
        enabled: true,
        apiJsonFilePath: path.join(root, "temp", `${entry.name}.api.json`),
      },
      dtsRollup: { enabled: false },
      tsdocMetadata: { enabled: false },
      // The repo's TSDoc comments predate API Extractor; their `>`/backtick/brace
      // quirks are non-fatal noise here. Silence parser + release-tag chatter so
      // the gate reports only real SURFACE changes.
      messages: {
        compilerMessageReporting: { default: { logLevel: "warning" } },
        extractorMessageReporting: {
          default: { logLevel: "none" },
          "ae-missing-release-tag": { logLevel: "none" },
        },
        tsdocMessageReporting: { default: { logLevel: "none" } },
      },
    },
    // A virtual config path — the file need not exist; only its directory is used
    // to resolve the (already-absolute) tokens above.
    configObjectFullPath: path.join(
      root,
      "config",
      `api-extractor.${entry.name}.json`,
    ),
    packageJsonFullPath: path.join(root, "package.json"),
    // Give each entry a DISTINCT package identity (every export otherwise reports
    // as "vigiles", which collides when API Documenter merges the doc models into
    // one reference site). The name is cosmetic — it only labels the report/page.
    packageJson: { name: entry.name, version: "1.0.0" },
  });
}

let failed = 0;
for (const entry of ENTRIES) {
  const result = Extractor.invoke(configFor(entry), {
    localBuild,
    showVerboseMessages: false,
  });
  if (!result.succeeded) {
    failed += 1;
    if (!localBuild && result.apiReportChanged) {
      console.error(
        `✗ ${entry.name}: public API surface changed vs api-surface/${entry.name}.api.md — ` +
          `run \`npm run api:report\`, review the diff, and commit it if intended.`,
      );
    }
  }
}

if (failed > 0) {
  console.error(`\nAPI Extractor: ${String(failed)} entr(y/ies) failed.`);
  process.exit(1);
}
console.log(
  localBuild
    ? `API surface reports regenerated for ${String(ENTRIES.length)} entries (api-surface/*.api.md).`
    : `API surface verified for ${String(ENTRIES.length)} entries — no drift.`,
);
