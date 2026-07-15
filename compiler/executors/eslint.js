// ESLint executor for the two-stage trust gate.
//
// Stage 1 (self-test): the valid/invalid cases the synthesizing pass wrote, run
// through ESLint's RuleTester. Stage 2 (gold): the generated rule EXECUTED via
// Linter against the independent adversarial gold set.
//
// This is the extraction of the original inline gate logic into the injected
// executor interface (one gate, N engines — see gate.js). Behaviour is verbatim;
// only the artifact paths gained a `..` (executors/ is one level under compiler/).

const { RuleTester, Linter } = require("eslint");
const fs = require("fs");
const path = require("path");

let tsParser = null;
try {
  tsParser = require("@typescript-eslint/parser");
} catch {
  /* JS-only fallback */
}

const selfTestPath = (slug) =>
  path.join(__dirname, "..", "selftest", slug + ".js");
const generatedPath = (slug) =>
  path.join(__dirname, "..", "generated", slug + ".js");

// Stage 1: does the checker pass the test its own author wrote?
function selfTest(entry) {
  const stPath = selfTestPath(entry.slug);
  if (!fs.existsSync(stPath)) return { ok: false, note: "missing self-test" };
  const st = require(stPath);
  const tester = new RuleTester({
    languageOptions: st.languageOptions || {
      ecmaVersion: 2022,
      sourceType: "module",
    },
  });
  try {
    tester.run(st.name, st.rule, {
      valid: st.valid || [],
      invalid: st.invalid || [],
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      note:
        "FAILED self-test: " + String(e.message).split("\n")[0].slice(0, 100),
    };
  }
}

// Every code string in the self-test (for the provenance guard). ESLint invalid
// cases are objects with a `.code`; valid cases are bare strings.
function selfTestCode(entry) {
  const stPath = selfTestPath(entry.slug);
  if (!fs.existsSync(stPath)) return [];
  const st = require(stPath);
  const codeOf = (v) => (typeof v === "string" ? v : v.code);
  return [...(st.valid || []).map(codeOf), ...(st.invalid || []).map(codeOf)];
}

// Load the generated rule module for Stage 2 (or null if absent).
function load(slug) {
  const rulePath = generatedPath(slug);
  if (!fs.existsSync(rulePath)) return null;
  return require(rulePath);
}

// Stage 2 primitive: execute the rule against one code string; did it flag?
function flags(ruleModule, slug, code) {
  const linter = new Linter();
  const cfg = {
    plugins: { arc: { rules: { [slug]: ruleModule } } },
    rules: { ["arc/" + slug]: "error" },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      ...(tsParser ? { parser: tsParser } : {}),
    },
  };
  const msgs = linter.verify(code, [cfg]);
  return msgs.some((m) => m.ruleId === "arc/" + slug);
}

module.exports = { selfTest, selfTestCode, load, flags };
