// ast-grep (Python) executor for the two-stage trust gate.
//
// The synthesized artifact is a JSON rule OBJECT (data, not code) — the same
// shape as an ast-grep YAML rule — executed IN-PROCESS via @ast-grep/napi. That
// is a strictly smaller trust surface than a synthesized ESLint `create(context)`
// function: there is no imported code to audit, nothing runs except the fixed
// ast-grep matcher over the declarative rule.
//
// There is no RuleTester for ast-grep, so Stage 1 (self-test) runs the author's
// own valid/invalid snippets through the SAME matcher Stage 2 uses. The two
// stages stay distinct the way they always were — by the PROVENANCE of the cases,
// not the engine: Stage 1 cases are authored with the checker (shared blind
// spots); Stage 2 gold is authored blind against the prose, seeded with the
// failure taxonomy. The gate's provenance guard enforces that they never overlap.

const fs = require("fs");
const path = require("path");
const { parse, registerDynamicLanguage } = require("@ast-grep/napi");
const pythonLang = require("@ast-grep/lang-python");

let registered = false;
function ensureRegistered() {
  if (registered) return;
  // The Python grammar ships as a separate package registered at runtime
  // (mirrors src/core/symbols.ts in the root package).
  registerDynamicLanguage({ python: pythonLang.default || pythonLang });
  registered = true;
}

// Execute a JSON rule object against one Python snippet; did it match anything?
function matches(ruleJson, code) {
  ensureRegistered();
  const found = parse("python", code)
    .root()
    .findAll({ rule: ruleJson.rule, constraints: ruleJson.constraints });
  return found.length > 0;
}

const selfTestPath = (slug) =>
  path.join(__dirname, "..", "selftest", slug + ".js");

function loadSelfTest(entry) {
  const stPath = selfTestPath(entry.slug);
  if (!fs.existsSync(stPath)) return null;
  return require(stPath);
}

// Stage 1: every `invalid` snippet must match; every `valid` snippet must not.
function selfTest(entry) {
  const st = loadSelfTest(entry);
  if (!st) return { ok: false, note: "missing self-test" };
  for (const code of st.invalid || []) {
    if (!matches(st.rule, code))
      return {
        ok: false,
        note: "FAILED self-test: expected a match on " + snippet(code),
      };
  }
  for (const code of st.valid || []) {
    if (matches(st.rule, code))
      return {
        ok: false,
        note: "FAILED self-test: unexpected match on " + snippet(code),
      };
  }
  return { ok: true };
}

function snippet(code) {
  return JSON.stringify(code).slice(0, 60);
}

// Every code string in the self-test (for the provenance guard). ast-grep
// valid/invalid cases are bare Python source strings.
function selfTestCode(entry) {
  const st = loadSelfTest(entry);
  if (!st) return [];
  return [...(st.valid || []), ...(st.invalid || [])];
}

// Load the generated JSON rule object for Stage 2 (or null if absent).
function load(slug) {
  const rulePath = path.join(__dirname, "..", "generated", slug + ".json");
  if (!fs.existsSync(rulePath)) return null;
  return JSON.parse(fs.readFileSync(rulePath, "utf8"));
}

// Stage 2 primitive: execute the rule object against one code string.
function flags(ruleJson, slug, code) {
  return matches(ruleJson, code);
}

module.exports = { selfTest, selfTestCode, load, flags };
