// Build the BLIND-labeled gold set that the trust gate can actually execute against.
//
// Why this file exists. `gold/gold.json` is the set Stage 2 uses by default, but it is not blind:
// its case notes were written with the checker in hand ("MISSED by naive rule -> FN", "caught by
// naive rule"), and `rules/corpus.json` marks several checkers as deliberately-naive plants. The
// artifact does, however, already contain a genuinely blind labeling protocol that the gate never
// consumed:
//
//   gold/blind.json   — id + rule + ruleStatement + code, NO labels and NO notes (what the second
//                       rater saw; they could not see any checker's behaviour from it)
//   gold/rater2.json  — that rater's independent labels
//   gold/gold-v2.json — the author's labels for the same 56 ids (notes DO reveal the checker)
//
// This script joins blind.json (codes) with rater2.json (labels) into gold/gold-blind.json, in the
// exact shape gate.js expects ({rule, label, code, note}), so the gate can be re-run against
// labels that were produced without seeing the checker. Notes are reduced to the case id — the
// checker-revealing prose in gold-v2 is deliberately NOT carried over.
//
// It also re-derives observed agreement and Cohen's kappa against the author's labels, and asserts
// the join is 1:1 (same ids, same code strings, same rule), so a silent drift between the three
// files cannot pass unnoticed.
//
// Run: node build-blind-gold.js

const fs = require("fs");
const path = require("path");

const blind = require("./gold/blind.json");
const rater2 = require("./gold/rater2.json");
const authored = require("./gold/gold-v2.json");

const r2 = new Map(rater2.map((x) => [x.id, x.label]));
const auth = new Map(authored.map((x) => [x.id, x]));

const problems = [];
if (blind.length !== rater2.length) problems.push(`blind.json n=${blind.length} != rater2.json n=${rater2.length}`);
for (const b of blind) {
  if (!r2.has(b.id)) problems.push(`no rater2 label for ${b.id}`);
  const a = auth.get(b.id);
  if (!a) problems.push(`no gold-v2 entry for ${b.id}`);
  else {
    if (a.code !== b.code) problems.push(`code mismatch for ${b.id}`);
    if (a.rule !== b.rule) problems.push(`rule mismatch for ${b.id}`);
  }
  if ("label" in b) problems.push(`blind.json leaks a label on ${b.id}`);
  if ("note" in b) problems.push(`blind.json leaks a note on ${b.id}`);
}
if (problems.length) {
  console.error("REFUSING to build — blind join is not 1:1:");
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}

// Agreement between the author's labels and the blind rater's, recomputed here (soundness-v2.js
// computes the same figure; duplicating it makes this file self-contained as an artifact).
let agree = 0,
  aV = 0,
  aC = 0,
  rV = 0,
  rC = 0;
const disagreements = [];
for (const b of blind) {
  const mine = auth.get(b.id).label;
  const other = r2.get(b.id);
  if (mine === other) agree++;
  else disagreements.push(`${b.id}: author=${mine} rater2=${other}`);
  mine === "violating" ? aV++ : aC++;
  other === "violating" ? rV++ : rC++;
}
const N = blind.length;
const po = agree / N;
const pe = (aV * rV + aC * rC) / (N * N);
const kappa = pe === 1 ? 1 : (po - pe) / (1 - pe);

const out = blind.map((b) => ({
  rule: b.rule,
  label: r2.get(b.id),
  code: b.code,
  note: b.id + " (blind-labeled by independent rater)",
}));

const outPath = path.join(__dirname, "gold", "gold-blind.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");

const bySlug = {};
for (const o of out) {
  const s = (bySlug[o.rule] = bySlug[o.rule] || { n: 0, v: 0 });
  s.n++;
  if (o.label === "violating") s.v++;
}
console.log(`wrote gold/gold-blind.json — ${out.length} cases across ${Object.keys(bySlug).length} rules`);
for (const [slug, s] of Object.entries(bySlug)) console.log(`  ${slug.padEnd(22)} n=${s.n}  violating=${s.v}  compliant=${s.n - s.v}`);
console.log(`agreement author vs blind rater: ${(100 * po).toFixed(1)}%  Cohen's kappa=${kappa.toFixed(3)}`);
if (disagreements.length) for (const d of disagreements) console.log("  disagreement: " + d);
