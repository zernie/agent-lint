import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { aliases } from "./vite.aliases";

// Browser-mode tests for the live demo (real Chromium + real pako, so the
// pako-vs-node-zlib parity is closed for real, not mocked). Runs
// `src/**/*.browser.test.{ts,tsx}` — the browser-parity check + the DemoAudit
// interaction tests. Kept separate from the root vitest projects (which own the
// engine's own suites); this config never touches those.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: aliases },
  // The engine dist is CJS living OUTSIDE node_modules. Have Vite's optimizer
  // (esbuild) pre-bundle it via the aliases — esbuild's CJS→ESM interop exposes
  // the named exports (`scanFiles`, `buildAuditReport`) the browser test imports,
  // and folds in the transitive require-graph (+ the `node:zlib`→pako shim).
  optimizeDeps: {
    include: ["@engine/scan-files", "@engine/audit-report", "pako"],
    // @iarna/toml (a CJS engine dep) references bare `global`; the production
    // rollup build maps it, so give esbuild's pre-bundle the same define.
    esbuildOptions: { define: { global: "globalThis" } },
  },
  // Mirror the define for any non-optimized transform path too.
  define: { global: "globalThis" },
  server: {
    fs: {
      // Allow importing the repo-root `dist/` (one level above the site root).
      allow: [fileURLToPath(new URL("..", import.meta.url))],
    },
  },
  test: {
    include: ["src/**/*.browser.test.{ts,tsx}"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});
