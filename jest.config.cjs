// Scope jest to the cross-runner integration tests only (the src/*.test.ts
// suites are node:test). The dist is CommonJS, so no transform is needed.
module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/runners/**/*.jest.cjs"],
  transform: {},
  // Load the opt-in entry the way a user would — this also tests that
  // `vigiles/jest` registers the matchers (auto-register).
  setupFilesAfterEnv: ["<rootDir>/dist/jest.js"],
};
