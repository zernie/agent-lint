// Two-stage trust gate.
//
// A synthesized checker must pass BOTH:
//   Stage 1 (self-test): the valid/invalid cases the synthesizing pass wrote.
//   Stage 2 (independent gold): the rule is EXECUTED against an adversarial gold set it did not
//           author (gold/gold.json), seeded with the failure taxonomy (aliased/namespaced forms,
//           the pattern inside a string/comment, arity/lookalike variants). Precision/recall must be 1.0.
//
// The whole point: a checker that passes its OWN test and still leaks on an independent gold is the
// silent-leak case the data found in 84-96% of naive checkers. Stage 2 catches it and abstains.
//
// ONE gate, N engines. The verdict logic below is language-agnostic; the two per-engine primitives
// (self-test + gold execution) live behind an injected executor (executors/<engine>.js). A corpus
// entry names its `engine` (absent => "eslint", so R1-R10 are untouched). Adding a language is a new
// executor object, never a forked gate — the compiler-package instance of one-detector-no-drift.

const fs = require("fs");
const path = require("path");
const corpus = require("./rules/corpus.json");

const EXECUTORS = {
  eslint: require("./executors/eslint"),
  "astgrep-py": require("./executors/astgrep-py"),
};

const executorFor = (entry) => EXECUTORS[entry.engine || "eslint"];

const gold = (() => {
  try {
    return require("./gold/gold.json");
  } catch {
    return [];
  }
})();

// Provenance guard — the mechanical half of the two-stage integrity. If a gold case's code appears
// verbatim in the same rule's self-test, Stage 2 is no longer independent of Stage 1 (a synthesis
// pass "helpfully" copying cases across would silently void the leak check). Engine-agnostic: each
// executor reports its self-test's code strings; a collision fails the whole gate loudly.
function provenanceViolations(entry, ex) {
  const stCodes = new Set(ex.selfTestCode(entry).map((c) => c.trim()));
  return gold
    .filter((g) => g.rule === entry.slug)
    .map((g) => g.code.trim())
    .filter((c) => stCodes.has(c));
}

// Stage 2: execute the checker on the independent gold set it did NOT author.
function goldTest(entry, ex) {
  const cases = gold.filter((g) => g.rule === entry.slug);
  if (cases.length === 0) return { covered: false };
  const rule = ex.load(entry.slug);
  if (!rule) return { covered: true, ok: false, note: "no generated rule to execute" };
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0;
  const misses = [];
  for (const c of cases) {
    let flagged;
    try {
      flagged = ex.flags(rule, entry.slug, c.code);
    } catch (e) {
      return { covered: true, ok: false, note: "crashed on gold: " + String(e.message).slice(0, 80) };
    }
    const shouldFlag = c.label === "violating";
    if (shouldFlag && flagged) tp++;
    else if (shouldFlag && !flagged) {
      fn++;
      misses.push("MISS(" + (c.note || c.code.slice(0, 30)) + ")");
    } else if (!shouldFlag && flagged) {
      fp++;
      misses.push("FALSE+(" + (c.note || c.code.slice(0, 30)) + ")");
    } else tn++;
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const ok = precision === 1 && recall === 1;
  return { covered: true, ok, tp, fp, fn, tn, precision, recall, note: ok ? "sound on gold" : misses.join(" ") };
}

function runGate() {
  const results = [];
  for (const entry of corpus) {
    if (!entry.mechanizable) {
      results.push({ id: entry.id, slug: entry.slug, status: "declare", note: "semantic; no checker synthesized" });
      continue;
    }
    const ex = executorFor(entry);

    // Integrity precondition: Stage 1 and Stage 2 must not share cases.
    const contaminated = provenanceViolations(entry, ex);
    if (contaminated.length) {
      results.push({
        id: entry.id,
        slug: entry.slug,
        status: "abstain-contaminated",
        note: "gold case reused in self-test (Stage 2 not independent): " + contaminated[0].slice(0, 40),
      });
      continue;
    }

    const st = ex.selfTest(entry);
    if (!st.ok) {
      results.push({ id: entry.id, slug: entry.slug, status: "abstain-selftest", note: st.note });
      continue;
    }

    const g = goldTest(entry, ex);
    if (!g.covered) {
      results.push({
        id: entry.id,
        slug: entry.slug,
        status: "kept-ungraded",
        note: "passed self-test; no independent gold yet (label honestly, do not claim sound)",
      });
    } else if (g.ok) {
      results.push({
        id: entry.id,
        slug: entry.slug,
        status: "kept",
        note: "self-test + gold OK (P=" + g.precision.toFixed(2) + " R=" + g.recall.toFixed(2) + ")",
      });
    } else {
      // The finding, operationalized: passed its own test, leaked on the independent gold.
      results.push({ id: entry.id, slug: entry.slug, status: "abstain-gold", note: "SILENT LEAK caught: " + g.note });
    }
  }
  return results;
}

if (require.main === module) {
  const results = runGate();
  const pad = (s, n) => (String(s) + " ".repeat(n)).slice(0, n);
  console.log("\n  id   " + pad("rule", 22) + pad("status", 22) + "note");
  console.log("  " + "-".repeat(94));
  for (const r of results) console.log("  " + pad(r.id, 5) + pad(r.slug, 22) + pad(r.status, 22) + r.note);
  const n = results.length;
  const count = (s) => results.filter((r) => r.status === s).length;
  const kept = count("kept");
  const keptUngraded = count("kept-ungraded");
  const abstainSelf = count("abstain-selftest");
  const abstainGold = count("abstain-gold");
  const abstainContam = count("abstain-contaminated");
  const declared = count("declare");
  console.log(
    "\n  corpus=" +
      n +
      "  kept(self+gold)=" +
      kept +
      "  kept-ungraded=" +
      keptUngraded +
      "  abstain-selftest=" +
      abstainSelf +
      "  abstain-gold=" +
      abstainGold +
      "  abstain-contaminated=" +
      abstainContam +
      "  declared=" +
      declared,
  );
  console.log("  Stage 2 caught " + abstainGold + " checker(s) that passed their OWN test but leaked on independent gold.");
  console.log("  Shipped = only rules that survived BOTH gates. The rest are downgraded to advisory/declare, not silently trusted.\n");
  fs.writeFileSync(path.join(__dirname, "results.json"), JSON.stringify(results, null, 2));

  // CI GATE: assert the known-correct verdicts so a regression in the synthesis
  // or the two-stage gate FAILS the build instead of passing silently. The leaky
  // checkers (R5 name-based secret, R10 text-scan eslint-disable, P2 naive $A
  // print) MUST abstain; the sound ones MUST be kept. If a leaky checker flips to
  // "kept" that is exactly the false-confidence failure this gate exists to catch.
  // See research/dogfood-corpus.md (this is CI-enforced via .github/workflows/ci.yml).
  const EXPECTED = {
    R1: "kept",
    R2: "kept-ungraded",
    R3: "kept-ungraded",
    R4: "kept-ungraded",
    R5: "abstain-selftest",
    R6: "declare",
    R7: "declare",
    R8: "kept",
    R9: "kept",
    R10: "abstain-gold",
    // Python (ast-grep) lane: two sound rules kept, one naive rule abstains on gold.
    P1: "kept",
    P2: "abstain-gold",
    P3: "kept",
  };
  const drift = results
    .filter((r) => EXPECTED[r.id] && EXPECTED[r.id] !== r.status)
    .map((r) => "    " + r.id + " " + r.slug + ": expected " + EXPECTED[r.id] + ", got " + r.status);
  const missing = Object.keys(EXPECTED)
    .filter((id) => !results.some((r) => r.id === id))
    .map((id) => "    missing expected rule: " + id);
  if (drift.length || missing.length) {
    console.error("\n  ✗ TRUST-GATE DRIFT — the soundness verdicts changed:");
    for (const line of [...drift, ...missing]) console.error(line);
    console.error("  A leaky checker that should ABSTAIN may now be 'kept' (false confidence). Investigate before shipping.\n");
    process.exit(1);
  }
  console.log("  ✓ trust-gate verdicts match the committed expectation (CI gate green).\n");
}

module.exports = { runGate };
