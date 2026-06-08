// Scope jest to the cross-runner integration tests only (the src/*.test.ts
// suites are node:test). The dist is CommonJS, so no transform is needed.
module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/runners/**/*.jest.cjs"],
  transform: {},
};
