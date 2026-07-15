/**
 * Self-check for classify's routing (no eslint exec — reconcile is passed a fake
 * extract result). Run: `node classify.selfcheck.js` (exit 0 = pass, 1 = fail).
 */
"use strict";
const assert = require("node:assert");
const {
  loadRuleMap,
  classifyRule,
  looksLikeHook,
  reconcile,
} = require("./classify.js");

const ruleMap = loadRuleMap();
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
const cls = (t) => classifyRule(t, { ruleMap }).class;

check("no `as any` routes to reuse (the article's centerpiece)", () => {
  const r = classifyRule("Never use `as any` type casts", { ruleMap });
  assert.equal(r.class, "reuse");
  assert.ok(r.mappedRules.some((m) => m.includes("no-explicit-any")));
});

check("no console.log routes to reuse → no-console", () => {
  const r = classifyRule("No console.log in shipped code", { ruleMap });
  assert.equal(r.class, "reuse");
  assert.ok(r.mappedRules.some((m) => m.includes("no-console")));
});

check("action rules route to hook", () => {
  assert.equal(cls("Never push to main"), "hook");
  assert.equal(cls("Commit with -s (DCO sign-off)"), "hook");
  assert.equal(cls("Never add a Co-Authored-By: Claude line"), "hook");
  assert.equal(cls("Don't edit *_mock.go generated files"), "hook");
});

check("judgment rules route to semantic", () => {
  assert.equal(cls("Write clear, self-documenting code"), "semantic");
});

check("mechanizable-but-unmapped routes to synthesize", () => {
  // package-manager choice has no off-the-shelf rule
  assert.equal(cls("Use pnpm, not npm or yarn"), "synthesize");
});

check("empty-matching keyword can't collapse everything onto one intent", () => {
  // the "no & or |" operator keyword must NOT match an unrelated rule
  const r = classifyRule("Prefer immutable data structures everywhere", {
    ruleMap,
  });
  assert.notEqual(
    r.mappedRules && r.mappedRules[0],
    "core:no-bitwise",
    "bitwise operator keyword leaked (empty-match guard failed)",
  );
});

check("reconcile reports enforced/off/absent/not-installed correctly", () => {
  const extract = {
    ok: true,
    enabledRules: { "no-console": "error" },
    offRules: ["no-debugger"],
    installedPlugins: ["eslint-plugin-import"],
  };
  assert.equal(reconcile(["core:no-console"], extract).status, "enforced");
  assert.equal(reconcile(["core:no-debugger"], extract).status, "contradiction");
  assert.equal(reconcile(["core:eqeqeq"], extract).status, "absent");
  assert.equal(
    reconcile(["plugin:import:import/no-cycle"], extract).status,
    "absent-installed",
  );
  assert.equal(
    reconcile(["plugin:unicorn:unicorn/no-null"], extract).status,
    "not-installed",
  );
  assert.equal(reconcile(["core:no-console"], null).status, "unknown");
});

check("looksLikeHook is specific (doesn't grab lint rules mentioning a file)", () => {
  assert.equal(looksLikeHook("No console.log in any source file"), false);
});

if (failed) {
  console.log(`\n${failed} check(s) FAILED`);
  process.exit(1);
}
console.log("\nall classify self-checks passed");
