/**
 * Build the React/shadcn audit report (report/, Vite + vite-plugin-singlefile) to
 * ONE self-contained file and copy it to dist/audit-report.template.html — the
 * template the CLI fills with an AuditReport. Run after `tsc` by `npm run build`.
 *
 * Fails LOUD (exit 1) if it can't build — the React report is part of the product,
 * so a build/release must not silently ship without the template. It auto-installs
 * report/ deps if missing (first run / CI), so a normal `npm run build` Just Works
 * where the npm registry is reachable.
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
  console.error(
    "[build-report] FAILED to build the audit report template: " +
      (e instanceof Error ? e.message : String(e)),
  );
  console.error(
    "[build-report] the React report is part of the product — fix the report/ build " +
      "(needs the npm registry for first install).",
  );
  process.exit(1);
}
