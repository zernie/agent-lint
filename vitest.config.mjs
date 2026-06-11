import { defineConfig } from "vitest/config";

// Vitest is the primary runner. Two projects:
//  - `unit`    — the TypeScript source suites (`src/**/*.test.ts`), run directly
//                (esbuild), with `.js` import specifiers resolved to their `.ts`
//                source so NodeNext-style imports work without a build step.
//  - `runners` — the cross-runner constraint: the same `vigilesMatchers` register
//                and pass under vitest, loaded from the built `dist` the way a
//                user would (`npm run test:vitest`). Proves runner-agnosticism.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          // node:test had no per-test timeout; some suites scan all 7 linter
          // catalogs or spawn the built CLI and legitimately take several seconds.
          testTimeout: 60000,
          hookTimeout: 60000,
        },
        resolve: { extensionAlias: { ".js": [".ts", ".js"] } },
      },
      {
        test: {
          name: "runners",
          include: ["test/runners/**/*.vitest.mjs"],
          setupFiles: ["./dist/vitest.mjs"],
        },
      },
    ],
    // 100% gate, scoped to the harness-testing pillar (the deterministic library
    // this suite owns end-to-end). The eval path's real `spawn` boundary is the
    // one thing a unit test can't reach — it carries a `v8 ignore` marker.
    coverage: {
      provider: "v8",
      include: [
        "src/harness-test.ts",
        "src/harness-assert.ts",
        "src/eval.ts",
        "src/eval-baseline.ts",
        "src/run-hook.ts",
        "src/mock-model.ts",
        "src/plugin-loader.ts",
        "src/judge.ts",
        "src/sandbox.ts",
      ],
      // 100% lines/functions/statements. Branches floor at 90: the remainder
      // are defensive fallbacks that can't be hit deterministically — `?? ""` on
      // already-typed CLI output, `n > 0 ? … : 0` on non-empty arrays, a
      // signal-kill exit code (`res.status ?? (res.signal ? 1 : 0)`). Gaming
      // those with ignores would only lower the signal.
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 100,
        branches: 90,
      },
      reporter: ["text", "lcov"],
    },
  },
});
