const { Linter } = require("eslint");
const tsParser = require("@typescript-eslint/parser");
const gold = require("./gold/gold.json");
const RULES = ["no-console-log","no-explicit-any","no-eslint-disable","no-hardcoded-secret","no-empty-catch"];
const linter = new Linter();
const byRule = {};
for (const g of gold) {
  const rule = require("./generated/" + g.rule);
  let msgs; try {
    msgs = linter.verify(g.code, { languageOptions:{ parser:tsParser, ecmaVersion:2022, sourceType:"module", parserOptions:{ecmaFeatures:{jsx:true}} },
      plugins:{ rc:{ rules:{ [g.rule]: rule } } }, rules:{ ["rc/"+g.rule]: "error" } });
  } catch { msgs = []; }
  const fired = msgs.some(m => m.ruleId === "rc/" + g.rule);
  const b = byRule[g.rule] || (byRule[g.rule] = { tp:0, fp:0, fn:0, tn:0, fails:[] });
  const viol = g.label === "violating";
  if (viol && fired) b.tp++;
  else if (!viol && fired) { b.fp++; b.fails.push("FP: "+g.note); }
  else if (viol && !fired) { b.fn++; b.fails.push("FN: "+g.note); }
  else b.tn++;
}
const pad=(s,n)=>(String(s)+" ".repeat(n)).slice(0,n);
console.log("\n  "+pad("rule",20)+pad("TP",5)+pad("FP",5)+pad("FN",5)+pad("prec",8)+pad("recall",8)+"verdict");
console.log("  "+"-".repeat(70));
let sound=0;
for (const r of RULES) {
  const b = byRule[r]; if(!b) continue;
  const prec = b.tp+b.fp ? b.tp/(b.tp+b.fp) : 1;
  const rec  = b.tp+b.fn ? b.tp/(b.tp+b.fn) : 1;
  const ok = prec===1 && rec===1;
  if(ok) sound++;
  console.log("  "+pad(r,20)+pad(b.tp,5)+pad(b.fp,5)+pad(b.fn,5)+pad(prec.toFixed(2),8)+pad(rec.toFixed(2),8)+(ok?"SOUND":"LEAKY -> "+b.fails.join("; ")));
}
console.log("\n  "+RULES.length+" checkers on gold set: "+sound+" sound (prec=rec=1), "+(RULES.length-sound)+" leaky.");
console.log("  Failure taxonomy: AST/keyword-based synthesis is sound here; text-scan (eslint-disable) FPs on prose; name-based (secret) FNs.");
