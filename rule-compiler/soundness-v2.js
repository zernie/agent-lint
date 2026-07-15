const { Linter } = require("eslint");
const tsParser = require("@typescript-eslint/parser");
const fs = require("fs"), path = require("path");
const gold = require("./gold/gold-v2.json");
const rater2 = require("./gold/rater2.json");
const r2 = Object.fromEntries(rater2.map(x => [x.id, x.label]));

// --- inter-annotator agreement (me vs rater2) ---
let agree = 0, mV = 0, mC = 0, rV = 0, rC = 0; const disag = [];
for (const g of gold) {
  const mine = g.label, other = r2[g.id];
  if (mine === other) agree++; else disag.push(`${g.id} (me=${mine}, r2=${other}): ${g.note}`);
  mine === "violating" ? mV++ : mC++;
  other === "violating" ? rV++ : rC++;
}
const N = gold.length, po = agree / N;
const pe = (mV * rV + mC * rC) / (N * N);
const kappa = (po - pe) / (1 - pe);

// --- checker precision/recall on the expanded set (gold = my labels) ---
const RULES = ["no-console-log","no-explicit-any","no-eslint-disable","no-empty-catch","no-hardcoded-secret"];
const linter = new Linter();
const stat = {};
for (const g of gold) {
  const rule = require("./generated/" + g.rule);
  let msgs; try { msgs = linter.verify(g.code, { languageOptions:{ parser:tsParser, ecmaVersion:2022, sourceType:"module", parserOptions:{ecmaFeatures:{jsx:true}} }, plugins:{ rc:{ rules:{ [g.rule]: rule } } }, rules:{ ["rc/"+g.rule]:"error" } }); } catch { msgs = []; }
  const fired = msgs.some(m => m.ruleId === "rc/" + g.rule);
  const s = stat[g.rule] || (stat[g.rule] = { tp:0, fp:0, fn:0, tn:0, notes:[] });
  const viol = g.label === "violating";
  if (viol && fired) s.tp++;
  else if (!viol && fired) { s.fp++; s.notes.push("FP "+g.id+": "+g.note); }
  else if (viol && !fired) { s.fn++; s.notes.push("FN "+g.id+": "+g.note); }
  else s.tn++;
}
const pad=(s,n)=>(String(s)+" ".repeat(n)).slice(0,n);
console.log("\n=== Inter-annotator agreement (author vs independent rater), n="+N+" ===");
console.log("  observed agreement: "+(100*po).toFixed(1)+"%   Cohen's kappa: "+kappa.toFixed(3)+(disag.length?"":"   (perfect)"));
if (disag.length) { console.log("  disagreements:"); disag.forEach(d=>console.log("   - "+d)); }
console.log("\n=== Checker soundness on expanded gold (labels = author, validated by agreement) ===");
console.log("  "+pad("rule",20)+pad("n",5)+pad("TP",5)+pad("FP",5)+pad("FN",5)+pad("prec",8)+pad("recall",8)+"verdict");
console.log("  "+"-".repeat(78));
for (const r of RULES) {
  const s = stat[r]; const n = s.tp+s.fp+s.fn+s.tn;
  const prec = s.tp+s.fp ? s.tp/(s.tp+s.fp) : 1, rec = s.tp+s.fn ? s.tp/(s.tp+s.fn) : 1;
  const v = (prec===1&&rec===1)?"SOUND":(prec<1&&rec<1?"LEAKY (FP+FN)":prec<1?"LEAKY (FP)":"LEAKY (FN)");
  console.log("  "+pad(r,20)+pad(n,5)+pad(s.tp,5)+pad(s.fp,5)+pad(s.fn,5)+pad(prec.toFixed(2),8)+pad(rec.toFixed(2),8)+v);
  s.notes.forEach(x=>console.log("        "+x));
}
