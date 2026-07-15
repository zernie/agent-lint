const { execSync } = require("child_process");
const { Linter } = require("eslint");
const tsParser = require("@typescript-eslint/parser");
const fs = require("fs"), path = require("path");
const repo = path.join(__dirname, "dogfood/hist/gitflare");
const cfg = "AGENTS.md";
const rule = require("./generated/no-console-log");
const git = a => execSync(`git -C "${repo}" ${a}`, { encoding: "utf8" });

// 1) when did a console.log rule first enter the config file?
const ruleDate = (git(`log --reverse -S'console.log' --date=short --format=%ad -- ${cfg}`).trim().split("\n")[0]) || "unknown";
console.log("config:", cfg, "| console.log first appears in it:", ruleDate);

// 2) violations in runtime src
const EXCLUDE = /(\.test\.|\.spec\.|__tests__|\/tests?\/|\/scripts?\/|\/e2e\/|\/fixtures?\/|\.d\.ts$|\/dist\/|\/build\/)/i;
const walk = (d, a) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name === "node_modules" || e.name === ".git") continue; walk(p, a); } else if (/\.(ts|tsx)$/.test(e.name)) a.push(p); } return a; };
const linter = new Linter();
const files = walk(repo, []).filter(p => !EXCLUDE.test(p.slice(repo.length)));
const viol = [];
for (const f of files) { let m; try { m = linter.verify(fs.readFileSync(f, "utf8"), { languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } }, plugins: { rc: { rules: { "no-console-log": rule } } }, rules: { "rc/no-console-log": "error" } }); } catch { continue; } for (const x of m) viol.push({ file: path.relative(repo, f), line: x.line }); }

// 3) blame each violation
let after = 0, notafter = 0;
console.log("\nviolations (" + viol.length + "):");
for (const v of viol) {
  let date = "?";
  try { const o = git(`blame -L ${v.line},${v.line} --porcelain -- "${v.file}"`); const mm = o.match(/author-time (\d+)/); if (mm) date = new Date(+mm[1] * 1000).toISOString().slice(0, 10); } catch {}
  const rel = (date !== "?" && ruleDate !== "unknown" && date >= ruleDate) ? "ADDED AFTER RULE" : "before/at rule";
  if (rel === "ADDED AFTER RULE") after++; else notafter++;
  console.log(`  ${v.file}:${v.line}  line-added ${date}  -> ${rel}`);
}
console.log(`\nRule since ${ruleDate}:  ${after} violation-lines added AFTER the rule existed,  ${notafter} before/at.`);
console.log("(Method demo: violations postdating the rule = the declared rule was in effect and still broken.)");
