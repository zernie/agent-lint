// run.mjs — proof harness for the constraint-aware pairwise generator.
//
// Models a vigiles-shaped HARNESS PARAMETER SPACE (the kind a `.spec.ts` declares
// in enumerable form, and markdown cannot) and shows:
//   (1) the row-count saving vs the full 2^N factorial — the headline evidence;
//   (2) that typed-purity-style CONSTRAINTS prune the invalid region BEFORE sampling
//       (the prune-then-sample synthesis from prune-the-timeline);
//   (3) that the generated array covers every REACHABLE value-pair (the NIST claim's
//       precondition) AND never emits a constraint-violating row.
//
// Exits 0 iff all assertions hold. Output is the evidence cited in the research doc.

import {
  generateCoveringArray,
  allValidPairs,
  uncoveredPairs,
  fullFactorialCount,
  validFullFactorialCount,
} from "./covering-array.mjs";

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error(`  ✗ ${msg}`);
    failures++;
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

function report(label, params, constraints) {
  console.log(`\n=== ${label} ===`);
  const full = fullFactorialCount(params);
  const valid = validFullFactorialCount(params, constraints);
  const rows = generateCoveringArray(params, { constraints });
  const required = allValidPairs(params, constraints);
  const missed = uncoveredPairs(rows, params, constraints);

  console.log(
    `  params: ${params.map((p) => `${p.name}[${p.values.length}]`).join(" × ")}`,
  );
  console.log(`  full factorial (2^N-style)      : ${full} configs`);
  console.log(`  valid after constraint pruning  : ${valid} configs`);
  console.log(`  pairwise covering-array ROWS    : ${rows.length} rows`);
  console.log(`  required reachable value-pairs  : ${required.length}`);
  console.log(`  uncovered pairs                 : ${missed.length}`);
  const saving = full > 0 ? (100 * (1 - rows.length / full)).toFixed(1) : "0";
  console.log(
    `  saving vs full factorial        : ${saving}%  (${rows.length}/${full})`,
  );

  assert(missed.length === 0, `every reachable pair covered (0 misses)`);
  assert(
    rows.every((r) => constraints.every((c) => c(r) === true)),
    `no row violates a constraint`,
  );
  assert(
    rows.length <= valid,
    `covering array (${rows.length}) ≤ valid space (${valid})`,
  );
  return {
    full,
    valid,
    rows: rows.length,
    required: required.length,
    missed: missed.length,
  };
}

// ---------------------------------------------------------------------------
// CASE A — the canonical small example from the article (3 booleans → 4 rows).
// ---------------------------------------------------------------------------
const boolish = ["on", "off"];
report(
  "A. 3 booleans, no constraints (article's '8 → 4 rows')",
  [
    { name: "skillA", values: boolish },
    { name: "skillB", values: boolish },
    { name: "skillC", values: boolish },
  ],
  [],
);

// ---------------------------------------------------------------------------
// CASE B — a realistic vigiles harness param space WITH typed-purity-style
// constraints. This is the thesis: the spec declares the space, the type system
// + declared constraints prune it, the array samples only the valid region.
//
//   skillA/skillB/skillC : installed on/off  (roster dimension)
//   model                : sonnet | haiku    (the per-model interaction dimension)
//   purity               : pure | bounded | unrestricted
//   bash                 : on/off            (whether the agent may run Bash)
//   flagX                : on/off            (a mutually-exclusive feature flag)
//
// Constraints (PICT-style "IF a THEN NOT b", expressed as code — the SAME predicate
// typed purity already encodes in spec.ts):
//   C1: purity = pure  ⇒  bash = off        (a pure agent CANNOT run Bash)
//   C2: skillA = off   ⇒  skillB = off       (B depends on A — roster dependency)
//   C3: model = haiku  ⇒  flagX = off        (flagX requires the stronger model)
// ---------------------------------------------------------------------------
const purePruneBash = (a) => !(a.purity === "pure" && a.bash === "on");
const bDependsOnA = (a) => !(a.skillA === "off" && a.skillB === "on");
const flagNeedsSonnet = (a) => !(a.model === "haiku" && a.flagX === "on");

const harnessParams = [
  { name: "skillA", values: boolish },
  { name: "skillB", values: boolish },
  { name: "skillC", values: boolish },
  { name: "model", values: ["sonnet", "haiku"] },
  { name: "purity", values: ["pure", "bounded", "unrestricted"] },
  { name: "bash", values: boolish },
  { name: "flagX", values: boolish },
];

report(
  "B. vigiles harness space, NO constraints (the naive 2^N)",
  harnessParams,
  [],
);
const withC = report(
  "B'. SAME space, typed-purity-style CONSTRAINTS (prune then sample)",
  harnessParams,
  [purePruneBash, bDependsOnA, flagNeedsSonnet],
);

// extra hard checks on the constrained run: prove the pruning actually held
{
  const rows = generateCoveringArray(harnessParams, {
    constraints: [purePruneBash, bDependsOnA, flagNeedsSonnet],
  });
  console.log(
    `\n  constraint-respect spot checks on the ${rows.length} emitted rows:`,
  );
  assert(
    rows.every((r) => !(r.purity === "pure" && r.bash === "on")),
    "C1 held: no pure agent runs Bash (the unrepresentable state never sampled)",
  );
  assert(
    rows.every((r) => !(r.skillA === "off" && r.skillB === "on")),
    "C2 held: skillB never installed without skillA",
  );
  assert(
    rows.every((r) => !(r.model === "haiku" && r.flagX === "on")),
    "C3 held: flagX never on under haiku",
  );
}

// ---------------------------------------------------------------------------
// CASE C — the eval-cost headline: a bigger roster (the '20 flags → ~10 rows'
// regime the article cites) to show the saving widens fast with N.
// ---------------------------------------------------------------------------
const bigRoster = Array.from({ length: 10 }, (_, i) => ({
  name: `skill${i}`,
  values: boolish,
}));
bigRoster.push({ name: "model", values: ["sonnet", "haiku", "opus"] });
const bigC = report(
  "C. 10 on/off skills × 3 models (eval-cost regime)",
  bigRoster,
  [],
);

// ---------------------------------------------------------------------------
// summary table for the doc
// ---------------------------------------------------------------------------
console.log("\n=== SUMMARY (row-count saving = the evidence) ===");
console.log(
  "  B' constrained vigiles space :",
  withC.rows,
  "rows vs",
  withC.full,
  "full  →",
  (100 * (1 - withC.rows / withC.full)).toFixed(1) + "% fewer real-model runs",
);
console.log(
  "  C  10 skills × 3 models      :",
  bigC.rows,
  "rows vs",
  bigC.full,
  "full  →",
  (100 * (1 - bigC.rows / bigC.full)).toFixed(1) + "% fewer real-model runs",
);

console.log(
  `\n${failures === 0 ? "ALL ASSERTIONS PASSED" : `${failures} ASSERTION(S) FAILED`}`,
);
process.exit(failures === 0 ? 0 : 1);
