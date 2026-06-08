import { defineConfig } from "vitest/config";

// Scope vitest to the cross-runner integration tests only — the src/*.test.ts
// suites are node:test and must not be picked up here.
export default defineConfig({
  test: {
    include: ["test/runners/**/*.vitest.mjs"],
    // Load the opt-in entry the way a user would — this also tests that
    // `vigiles/vitest` registers the matchers (auto-register).
    setupFiles: ["./dist/vitest.mjs"],
  },
});
