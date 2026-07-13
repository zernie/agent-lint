const { Linter } = require("eslint");
const tsParser = require("@typescript-eslint/parser");
const fs = require("fs");
const path = require("path");
const repos = require("./dogfood/repos.json");

const CHECKERS = {
  "no-console-log": require("./generated/no-console-log"),
  "no-explicit-any": require("./generated/no-explicit-any"),
  "no-eslint-disable": require("./generated/no-eslint-disable"),
};
// exclude tests / specs / build scripts / fixtures / stories / type-decls / build output
const EXCLUDE = /(\.test\.|\.spec\.|__tests__|\/tests?\/|\/scripts?\/|\/e2e\/|\/fixtures?\/|\/__mocks__\/|\/stories\/|\.stories\.|\.d\.ts$|\/dist\/|\/build\/|\/node_modules\/)/i;

function walk(dir, acc) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name === "node_modules" || e.name === ".git") continue; walk(p, acc); }
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const linter = new Linter();
const rows = [];
for (const repo of repos) {
  const root = path.join(__dirname, "dogfood", "src", repo.slug);
  const runtime = walk(root, []).filter(p => !EXCLUDE.test(p.slice(root.length)));
  for (const slug of repo.declares) {
    const rule = CHECKERS[slug];
    let violations = 0, filesWith = 0, scanned = 0, skipped = 0;
    for (const f of runtime) {
      let msgs;
      try {
        msgs = linter.verify(fs.readFileSync(f, "utf8"), {
          languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
          plugins: { rc: { rules: { [slug]: rule } } },
          rules: { ["rc/" + slug]: "error" }
        });
      } catch (e) { skipped++; continue; }
      scanned++;
      if (msgs.length) { violations += msgs.length; filesWith++; }
    }
    rows.push({ repo: repo.slug, rule: slug, scanned, skipped, filesWith, violations, complies: violations === 0 });
  }
}

const pad = (s, n) => (String(s) + " ".repeat(n)).slice(0, n);
console.log("\n  " + pad("repo", 15) + pad("declared rule", 20) + pad("src files", 11) + pad("violations", 12) + pad("files hit", 11) + "verdict");
console.log("  " + "-".repeat(84));
for (const r of rows)
  console.log("  " + pad(r.repo, 15) + pad(r.rule, 20) + pad(r.scanned, 11) + pad(r.violations, 12) + pad(r.filesWith, 11) + (r.complies ? "COMPLIES" : "VIOLATES own rule"));
const broken = rows.filter(r => !r.complies).length;
const totViol = rows.reduce((a, r) => a + r.violations, 0);
console.log("\n  (repo,rule) pairs: " + rows.length + "   VIOLATED own rule: " + broken + "   complied: " + (rows.length - broken) + "   total real violations: " + totViol);
fs.writeFileSync(path.join(__dirname, "dogfood", "measure-results.json"), JSON.stringify(rows, null, 2));
