import { defineConfig, devices } from "@playwright/test";

/**
 * Thin e2e over the REAL built bundle (vite preview serves `dist/`), with the
 * network mocked per-test via `page.route`. Proves the demo works end-to-end as
 * shipped: type a repo → the real `<Report>` renders a grade; an empty repo → the
 * in-frame no-harness state. Build runs first so `preview` has something to serve.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:4173", trace: "off" },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
