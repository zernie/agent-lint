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

// Which gold set Stage 2 executes against. Default = gold/gold-blind.json — the set whose LABELS
// were assigned by a second rater who saw only the identifier, the rule name and the code, with the
// checker's behaviour withheld (built by build-blind-gold.js: blind.json codes + the independent
// rater's labels; kappa=1.000, n=56 — see gold/SOUNDNESS.md). This is the run the paper's §6 reports
// (fixed 2026-07-28: the default used to be gold/gold.json below, whose case NOTES were written with
// the checker already in hand, and printed a verdict for R1/no-console-log that contradicts §6 — see
// repro/2026-07-28-artifact-fixes.md). Set GOLD_SET to a path relative to this directory to run the
// gate against another set, e.g. the OLD non-blind default (kept reachable, not deleted):
//   GOLD_SET=gold/gold.json node gate.js         (= npm run gate:non-blind)
const GOLD_SET = process.env.GOLD_SET || "gold/gold-blind.json";
const IS_DEFAULT_GOLD = GOLD_SET === "gold/gold-blind.json";
const gold = (() => {
  try {
    return require(path.resolve(__dirname, GOLD_SET));
  } catch {
    return [];
  }
})();

// Vacuous-recall guard. recall = tp/(tp+fn) defaults to 1 when a rule's gold slice contains NO
// violating case, so a checker that fires on nothing would be "kept" at P=R=1.00 on a
// compliant-only slice. A gold set that cannot exhibit a miss cannot certify recall. Set
// VACUOUS_RECALL=allow to restore the pre-fix behaviour (for the before/after comparison).
const ALLOW_VACUOUS_RECALL = process.env.VACUOUS_RECALL === "allow";

// Vacuous-precision guard — the mirror of the one above, closed 2026-07-28. precision = tp/(tp+fp)
// defaults to 1 when a rule's gold slice contains NO compliant case, so a checker that flags EVERY
// program (fp can structurally never become nonzero) would be "kept" at P=R=1.00 on a
// violating-only slice. A gold set that cannot exhibit a false alarm cannot certify precision, same
// as one that cannot exhibit a miss cannot certify recall. Set VACUOUS_PRECISION=allow to restore
// the pre-fix behaviour (for the before/after comparison; see gold/fixtures/vacuous-precision.json).
const ALLOW_VACUOUS_PRECISION = process.env.VACUOUS_PRECISION === "allow";

// Provenance guard — the mechanical half of the two-stage integrity. If a gold case's code appears
// verbatim in the same rule's self-test, Stage 2 is no longer independent of Stage 1 (a synthesis
// pass "helpfully" copying cases across would silently void the leak check). Engine-agnostic: each
// executor reports its self-test's code strings; a collision fails the whole gate loudly.
// The comparison is EXACT-STRING by default, which is what the committed baseline is calibrated
// against. Set PROVENANCE=normalized to compare modulo whitespace and a trailing semicolon — the
// stricter reading of "the same case", used to measure how much reuse the exact test misses.
const NORMALIZED_PROVENANCE = process.env.PROVENANCE === "normalized";
const canon = (s) => (NORMALIZED_PROVENANCE ? String(s).replace(/\s+/g, " ").replace(/;\s*$/, "").trim() : String(s).trim());

function provenanceViolations(entry, ex) {
  // A malformed self-test may yield a non-string case (e.g. an ESLint invalid
  // object missing `.code`) — filter to strings so `.trim()` can't throw here
  // and abort the whole gate before the self-test verdict runs.
  const stCodes = new Set(
    ex
      .selfTestCode(entry)
      .filter((c) => typeof c === "string")
      .map(canon),
  );
  return gold
    .filter((g) => g.rule === entry.slug)
    .map((g) => canon(g.code))
    .filter((c) => stCodes.has(c));
}

// Stage 2: execute the checker on the independent gold set it did NOT author.
function goldTest(entry, ex) {
  const cases = gold.filter((g) => g.rule === entry.slug);
  if (cases.length === 0) return { covered: false, why: "no independent gold yet" };
  // THE FIX (2 lines): a gold slice with no violating case cannot certify recall — recall would be
  // vacuously 1. Downgrade to kept-ungraded rather than certifying soundness on it.
  if (!ALLOW_VACUOUS_RECALL && !cases.some((c) => c.label === "violating"))
    return { covered: false, why: "gold slice has no violating case — recall would be vacuous" };
  // THE MIRROR FIX (2 lines, closed 2026-07-28): a gold slice with no compliant case cannot certify
  // precision — a checker that flags EVERY program cannot produce a false positive on it (fp is
  // structurally 0), so precision would be vacuously 1. Same disposition as the recall guard above:
  // downgrade to kept-ungraded, do not certify soundness on a slice that cannot discriminate.
  if (!ALLOW_VACUOUS_PRECISION && !cases.some((c) => c.label === "compliant"))
    return { covered: false, why: "gold slice has no compliant case — precision would be vacuous" };
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

    // A malformed synthesized rule/self-test (a case missing `.code`, a bad
    // ast-grep pattern) must ABSTAIN this one rule, never abort the whole
    // corpus — mirror the executor's own try/catch so the rest still runs.
    try {
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
          note: "passed self-test; " + (g.why || "no independent gold yet") + " (label honestly, do not claim sound)",
        });
      } else if (g.ok) {
        results.push({
          id: entry.id,
          slug: entry.slug,
          status: "kept",
          note: "self-test + gold OK (P=" + g.precision.toFixed(2) + " R=" + g.recall.toFixed(2) + ")",
          metrics: { n: g.tp + g.fp + g.fn + g.tn, tp: g.tp, fp: g.fp, fn: g.fn, tn: g.tn, precision: g.precision, recall: g.recall },
        });
      } else {
        // The finding, operationalized: passed its own test, leaked on the independent gold.
        results.push({
          id: entry.id,
          slug: entry.slug,
          status: "abstain-gold",
          note: "SILENT LEAK caught: " + g.note,
          metrics: { n: g.tp + g.fp + g.fn + g.tn, tp: g.tp, fp: g.fp, fn: g.fn, tn: g.tn, precision: g.precision, recall: g.recall },
        });
      }
    } catch (e) {
      results.push({
        id: entry.id,
        slug: entry.slug,
        status: "abstain-selftest",
        note: "self-test malformed: " + String(e && e.message ? e.message : e).slice(0, 80),
      });
    }
  }
  return results;
}

if (require.main === module) {
  const results = runGate();
  const pad = (s, n) => (String(s) + " ".repeat(n)).slice(0, n);
  console.log(
    "\n  gold set: " + GOLD_SET + "  (" + gold.length + " cases, " +
      new Set(gold.map((g) => g.rule)).size + " slugs)" +
      (ALLOW_VACUOUS_RECALL ? "   [VACUOUS_RECALL=allow — pre-fix behaviour]" : "") +
      (ALLOW_VACUOUS_PRECISION ? "   [VACUOUS_PRECISION=allow — pre-fix behaviour]" : "") +
      (NORMALIZED_PROVENANCE ? "   [PROVENANCE=normalized]" : ""),
  );
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
  // Never clobber the committed baseline when running against a non-default gold set.
  const isBaselineRun = IS_DEFAULT_GOLD && !ALLOW_VACUOUS_RECALL && !ALLOW_VACUOUS_PRECISION && !NORMALIZED_PROVENANCE;
  const outFile = isBaselineRun
    ? "results.json"
    : "results." +
      path.basename(GOLD_SET, ".json") +
      (ALLOW_VACUOUS_RECALL ? "-vacuous" : "") +
      (ALLOW_VACUOUS_PRECISION ? "-vacuous-precision" : "") +
      (NORMALIZED_PROVENANCE ? "-normprov" : "") +
      ".json";
  fs.writeFileSync(path.join(__dirname, outFile), JSON.stringify(results, null, 2));
  console.log("  wrote " + outFile);

  // CI GATE: assert the known-correct verdicts so a regression in the synthesis
  // or the two-stage gate FAILS the build instead of passing silently.
  //
  // Calibrated against the DEFAULT gold set, which since 2026-07-28 is
  // gold/gold-blind.json (independent-rater labels, kappa=1.000, n=56) — the
  // same run §6 of the paper reports. See repro/2026-07-28-artifact-fixes.md
  // for the before/after and why R1 moved.
  //
  // The three checkers §6 names as refusing, by three distinct mechanisms, MUST
  // abstain: R5 no-hardcoded-secret (fails its OWN self-test — Stage 1), R1
  // no-console-log (passes self-test, P=1.00 but recall 0.86 on blind gold —
  // misses window.console.log(1)), R10 no-eslint-disable (fails both sides at
  // once, P=0.60 R=0.60). The two AST-anchored sound checkers MUST be kept: R8
  // no-empty-catch, R9 no-explicit-any. If any of these flip, that is exactly
  // the false-confidence failure this gate exists to catch.
  //
  // The blind gold set has no Python (ast-grep) cases yet (5 rules / 56 cases,
  // all ESLint-lane — see gold/SOUNDNESS.md), so P1-P3 are honestly
  // kept-ungraded: "no independent gold yet" is not the same failure as a
  // caught leak, and must not be reported as one.
  // See research/dogfood-corpus.md (this is CI-enforced via .github/workflows/ci.yml).
  const EXPECTED = {
    R1: "abstain-gold",
    R2: "kept-ungraded",
    R3: "kept-ungraded",
    R4: "kept-ungraded",
    R5: "abstain-selftest",
    R6: "declare",
    R7: "declare",
    R8: "kept",
    R9: "kept",
    R10: "abstain-gold",
    // Python (ast-grep) lane: no blind gold exists for it yet, so all three are
    // honestly ungraded rather than certified sound or caught leaking.
    P1: "kept-ungraded",
    P2: "kept-ungraded",
    P3: "kept-ungraded",
  };
  // The committed expectation is calibrated against the DEFAULT gold set; a different gold set is
  // an experiment, not a regression. Report the diff instead of failing the build.
  if (!isBaselineRun) {
    const diff = results.filter((r) => EXPECTED[r.id] && EXPECTED[r.id] !== r.status);
    console.log("  (non-default run: committed-expectation check reported, not enforced)");
    if (!diff.length) console.log("  no verdict changes vs the committed baseline.\n");
    else {
      console.log("  verdict CHANGES vs the committed baseline (" + diff.length + "):");
      for (const r of diff) console.log("    " + r.id + " " + r.slug + ": " + EXPECTED[r.id] + " -> " + r.status);
      console.log("");
    }
    return;
  }
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
