/**
 * Build the React/shadcn audit report (report/, Vite + vite-plugin-singlefile) to
 * ONE self-contained file and copy it to dist/audit-report.template.html — the
 * template the CLI fills with an AuditReport. Run after `tsc` by `npm run build`.
 *
 * Resilient by design: if the report toolchain can't build (e.g. an offline core
 * checkout that never installed report/ deps), it WARNS and exits 0 — the CLI then
 * falls back to the zero-dep inline report (`renderAuditHtmlSimple`). A release
 * env has the deps, so the React template ships there.
 */
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = resolve(root, "report");
const built = resolve(reportDir, "dist", "index.html");
const out = resolve(root, "dist", "audit-report.template.html");

try {
  if (!existsSync(resolve(reportDir, "node_modules"))) {
    console.log("[build-report] installing report/ deps…");
    execSync("npm install --no-audit --no-fund", {
      cwd: reportDir,
      stdio: "inherit",
    });
  }
  execSync("npm run build", { cwd: reportDir, stdio: "inherit" });
  mkdirSync(dirname(out), { recursive: true });
  copyFileSync(built, out);
  console.log("[build-report] → dist/audit-report.template.html");
} catch (e) {
  console.warn(
    "[build-report] SKIPPED — report build unavailable: " +
      (e instanceof Error ? e.message : String(e)),
  );
  console.warn(
    "[build-report] the CLI will fall back to the inline-CSS report (--simple).",
  );
  process.exit(0);
}
