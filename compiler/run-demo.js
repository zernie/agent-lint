const { Linter } = require("eslint");
const tsParser = require("@typescript-eslint/parser");
const fs = require("fs");
const path = require("path");
const { runGate } = require("./gate");

const kept = runGate().filter(r => r.status === "kept").map(r => r.slug);
const rulesMap = {};
const rulesConfig = {};
for (const slug of kept) {
  rulesMap[slug] = require("./generated/" + slug);
  rulesConfig["rc/" + slug] = slug === "max-function-lines" ? ["error", 40] : "error";
}
const linter = new Linter();
const srcDir = path.join(__dirname, "demo-project", "src");
const files = fs.readdirSync(srcDir).filter(f => /\.(js|ts)$/.test(f)).sort();

console.log("\n  Enforcing " + kept.length + " gate-kept rules over demo-project/src (" + files.length + " files, JS+TS):\n");
let total = 0;
for (const f of files) {
  const code = fs.readFileSync(path.join(srcDir, f), "utf8");
  const messages = linter.verify(code, {
    languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: "module" },
    plugins: { rc: { rules: rulesMap } },
    rules: rulesConfig
  });
  for (const m of messages) { total++; console.log("  " + f + ":" + m.line + "  [" + m.ruleId + "]  " + m.message); }
}
console.log("\n  " + total + " violation(s) caught across JS+TS by compiled rules.");
console.log("  (R5 no-hardcoded-secret stays abstained -> apiKey deliberately not enforced.)\n");
