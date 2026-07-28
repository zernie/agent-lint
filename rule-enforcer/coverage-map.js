// Gold-set coverage map: for every rule in rules/corpus.json, which gold sets actually cover it,
// and how many of those cases are VIOLATING (the only ones that can certify recall).
//
// Answers the question the paper's §6 has to answer honestly: how many rules have a *blind* gold
// set. Three sets are distinguished on purpose, because they have different provenance:
//
//   gold.json    — Stage 2's default. NOT blind: its case notes describe the checker's behaviour
//                  ("MISSED by naive rule -> FN", "caught by naive rule").
//   gold-v2.json — larger, labels authored by the same author; notes also reveal the checker.
//   blind.json + rater2.json — the genuinely blind protocol: the rater saw code + rule statement
//                  only (no labels, no notes) and labeled independently.
//
// Run: node coverage-map.js

const corpus = require("./rules/corpus.json");
const g1 = require("./gold/gold.json");
const g2 = require("./gold/gold-v2.json");
const blind = require("./gold/blind.json");
const rater2 = require("./gold/rater2.json");

const r2Ids = new Set(rater2.map((x) => x.id));
const n = (arr, slug) => arr.filter((x) => x.rule === slug).length;
const v = (arr, slug) => arr.filter((x) => x.rule === slug && x.label === "violating").length;

const pad = (s, w) => (String(s) + " ".repeat(w)).slice(0, w);
console.log("\n  " + pad("id", 5) + pad("slug", 22) + pad("engine", 12) + pad("mech", 6) + pad("gold.json", 12) + pad("gold-v2", 12) + pad("blind+rater2", 14) + "blind gold?");
console.log("  " + "-".repeat(96));
let blindRules = 0;
for (const e of corpus) {
  const b = blind.filter((x) => x.rule === e.slug && r2Ids.has(x.id));
  const hasBlind = b.length > 0;
  if (hasBlind) blindRules++;
  const cell = (arr) => (n(arr, e.slug) ? `${n(arr, e.slug)} (${v(arr, e.slug)}v)` : "—");
  const blindCell = hasBlind ? `${b.length} (${b.filter((x) => rater2.find((r) => r.id === x.id).label === "violating").length}v)` : "—";
  console.log(
    "  " + pad(e.id, 5) + pad(e.slug, 22) + pad(e.engine || "eslint", 12) + pad(e.mechanizable ? "yes" : "no", 6) +
      pad(cell(g1), 12) + pad(cell(g2), 12) + pad(blindCell, 14) + (hasBlind ? "YES" : "no"),
  );
}
console.log("\n  corpus rules:            " + corpus.length);
console.log("  with gold.json slice:    " + new Set(g1.map((x) => x.rule)).size + " slugs, " + g1.length + " cases");
console.log("  with gold-v2 slice:      " + new Set(g2.map((x) => x.rule)).size + " slugs, " + g2.length + " cases");
console.log("  with BLIND slice:        " + blindRules + " slugs, " + blind.length + " cases (labels from an independent rater)");
console.log("  Python (astgrep-py) lane blind coverage: " + corpus.filter((e) => e.engine === "astgrep-py" && blind.some((b) => b.rule === e.slug)).length + " of " + corpus.filter((e) => e.engine === "astgrep-py").length + "\n");
