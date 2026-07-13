const { Linter } = require("eslint");
const tsParser = require("@typescript-eslint/parser");
const fs = require("fs"), path = require("path");
const repos = require("./dogfood/repos2.json");
const CHECKERS = {
  "no-console-log": require("./generated/no-console-log"),
  "no-explicit-any": require("./generated/no-explicit-any"),
  "no-eslint-disable": require("./generated/no-eslint-disable"),
};
const EXCLUDE = /(\.test\.|\.spec\.|__tests__|\/tests?\/|\/scripts?\/|\/e2e\/|\/fixtures?\/|\/__mocks__\/|\/stories\/|\.stories\.|\.d\.ts$|\.gen\.|\.generated\.|\/generated\/|\/dist\/|\/build\/|\/node_modules\/)/i;
const walk = (d, a) => { let e; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch { return a; } for (const x of e) { const p = path.join(d, x.name); if (x.isDirectory()) { if (x.name === "node_modules" || x.name === ".git") continue; walk(p, a); } else if (/\.(ts|tsx)$/.test(x.name)) a.push(p); } return a; };
const linter = new Linter();
const rows = [];
for (const repo of repos) {
  let root = path.join(__dirname, "dogfood", "src", repo.slug, repo.scope || "");
  if (!fs.existsSync(root)) root = path.join(__dirname, "dogfood", "src", repo.slug);
  const runtime = walk(root, []).filter(p => !EXCLUDE.test(p.slice(root.length)));
  for (const slug of repo.declares) {
    const rule = CHECKERS[slug];
    let violations = 0, filesWith = 0, scanned = 0, skipped = 0;
    for (const f of runtime) {
      let m; try { m = linter.verify(fs.readFileSync(f, "utf8"), { languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } }, plugins: { rc: { rules: { [slug]: rule } } }, rules: { ["rc/" + slug]: "error" } }); } catch { skipped++; continue; }
      scanned++; if (m.length) { violations += m.length; filesWith++; }
    }
    rows.push({ repo: repo.slug, rule: slug, scope: repo.scope, scanned, skipped, filesWith, violations, complies: violations === 0 });
  }
}
const pad = (s, n) => (String(s) + " ".repeat(n)).slice(0, n);
console.log("\n  " + pad("repo", 14) + pad("declared rule", 19) + pad("scope", 26) + pad("files", 7) + pad("viol", 7) + "verdict");
console.log("  " + "-".repeat(96));
for (const r of rows) console.log("  " + pad(r.repo, 14) + pad(r.rule, 19) + pad(r.scope, 26) + pad(r.scanned, 7) + pad(r.violations, 7) + (r.complies ? "COMPLIES" : "VIOLATES own rule"));
const broken = rows.filter(r => !r.complies).length, tot = rows.reduce((a, r) => a + r.violations, 0);
console.log("\n  famous repos: " + new Set(rows.map(r => r.repo)).size + "   (repo,rule) pairs: " + rows.length + "   VIOLATED: " + broken + "   complied: " + (rows.length - broken) + "   total violations: " + tot);
fs.writeFileSync(path.join(__dirname, "dogfood", "measure2-results.json"), JSON.stringify(rows, null, 2));
