/**
 * Self-check for extract-existing's PURE logic (no eslint exec): severity
 * normalisation, base/scoped variant unification, ruleStatus, installedPlugins,
 * and the sample-file picker's skip rules. The exec path (`eslint
 * --print-config`) is verified live against a real repo — see README.
 *
 * Run: `node extract-existing.selfcheck.js` (exit 0 = pass, 1 = fail).
 */
"use strict";
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  normalizeSeverity,
  ruleVariants,
  ruleStatus,
  installedPlugins,
  pickSampleFile,
} = require("./extract-existing.js");

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log("  ok  " + name);
  } catch (e) {
    failed++;
    console.log("  FAIL " + name + " — " + e.message);
  }
}

check("normalizeSeverity handles all forms", () => {
  assert.equal(normalizeSeverity("error"), "error");
  assert.equal(normalizeSeverity(2), "error");
  assert.equal(normalizeSeverity(["error", { x: 1 }]), "error");
  assert.equal(normalizeSeverity("warn"), "warn");
  assert.equal(normalizeSeverity(1), "warn");
  assert.equal(normalizeSeverity("off"), "off");
  assert.equal(normalizeSeverity(0), "off");
  assert.equal(normalizeSeverity(["off"]), "off");
});

check("ruleVariants unifies base and @typescript-eslint/ scope", () => {
  assert.deepEqual(ruleVariants("no-unused-vars").sort(), [
    "@typescript-eslint/no-unused-vars",
    "no-unused-vars",
  ]);
  assert.deepEqual(ruleVariants("@typescript-eslint/no-explicit-any").sort(), [
    "@typescript-eslint/no-explicit-any",
    "no-explicit-any",
  ]);
  // a plugin rule with its own scope is left alone
  assert.deepEqual(ruleVariants("import/no-cycle"), ["import/no-cycle"]);
});

check("ruleStatus resolves error/warn/off/absent across variants", () => {
  const ex = {
    enabledRules: { "@typescript-eslint/no-explicit-any": "error" },
    offRules: ["no-console"],
  };
  assert.equal(ruleStatus(ex, "no-explicit-any"), "error"); // base hits scoped
  assert.equal(ruleStatus(ex, "@typescript-eslint/no-explicit-any"), "error");
  assert.equal(ruleStatus(ex, "no-console"), "off");
  assert.equal(ruleStatus(ex, "eqeqeq"), "absent");
});

check("installedPlugins reads eslint-plugin-* from package.json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "extract-plugins-"));
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      devDependencies: {
        eslint: "^9",
        "eslint-plugin-import": "^2",
        "@typescript-eslint/eslint-plugin": "^8",
        "eslint-plugin-unicorn": "^55",
        lodash: "^4",
      },
    }),
  );
  const plugins = installedPlugins(dir);
  assert.ok(plugins.includes("eslint-plugin-import"));
  assert.ok(plugins.includes("@typescript-eslint/eslint-plugin"));
  assert.ok(plugins.includes("eslint-plugin-unicorn"));
  assert.ok(!plugins.includes("lodash"));
  assert.ok(!plugins.includes("eslint")); // eslint itself is not a plugin
  fs.rmSync(dir, { recursive: true, force: true });
});

check("pickSampleFile skips test/spec/decl files, prefers real source", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "extract-pick-"));
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "types.d.ts"), "export type A = 1;");
  fs.writeFileSync(path.join(dir, "src", "cli.test.ts"), "test('x',()=>{})");
  fs.writeFileSync(path.join(dir, "eslint.config.mjs"), "export default [];");
  fs.writeFileSync(path.join(dir, "src", "app.ts"), "export const x = 1;");
  const picked = pickSampleFile(dir);
  assert.equal(picked, path.join("src", "app.ts"));
  fs.rmSync(dir, { recursive: true, force: true });
});

if (failed) {
  console.log(`\n${failed} check(s) FAILED`);
  process.exit(1);
}
console.log("\nall extract-existing self-checks passed");
