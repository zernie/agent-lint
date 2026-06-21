#!/usr/bin/env node
/**
 * PROTOTYPE R2 — the "build one thing" pick: refinement → spec-GENERATED runtime
 * guard, with "parse, don't validate."
 *
 * The refinements TS CANNOT prove for an arbitrary value (numeric bounds, "every
 * element is a test path", cross-field length equality) drop here. The spec
 * declares the refinement as DATA; vigiles compiles it into a runtime check that
 * mints a BRAND only after the predicate passes — so downstream code that asks
 * for a `Refined<"score01">` provably holds a value that passed `0 <= n <= 1`.
 * This is the runtime twin of vigiles's shipped VerifiedPath / VerifiedCmd brands
 * (which are minted only after existsSync / package.json verification).
 *
 * Two halves shown:
 *   (1) AUTHOR-TIME parse: a `result()` field declared with a refinement predicate
 *       compiles to a parse function. Bad input → a typed PARSE FAILURE (not a
 *       thrown exception deep in the consumer); good input → a branded value.
 *   (2) RUNTIME GATE: the SAME predicate is emitted into a PreToolUse-style gate
 *       so a subagent that RETURNS an out-of-refinement result is caught at the
 *       boundary — the live value, which no type sees.
 *
 *   node refinement-runtime-guard.mjs   (exits 0 iff every assertion holds)
 */

import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// The refinement vocabulary a spec declares as DATA. Each is a base type + a
// predicate over the PARSED value. This is what `result({ score: refine("number",
// inRange(0,1)) })` would compile to — a tiny, dependency-free predicate registry.
// ---------------------------------------------------------------------------

/** A refinement = a base kind + a predicate + a human label for the error. */
const refine = (base, predicate, label) => ({ base, predicate, label });

const inRange = (lo, hi) => (n) => typeof n === "number" && n >= lo && n <= hi;
const everyTestPath = (xs) =>
  Array.isArray(xs) && xs.every((p) => /\.(test|spec)\.[tj]s$/.test(p));
const isGitCmd = (s) => typeof s === "string" && /^git\s/.test(s.trim());

// A subagent's result() contract, refined beyond what OutputFieldType carries:
const reviewerContract = {
  // numeric bound — NOT TS-encodable (peano blow-up); a runtime predicate.
  score: refine("number", inRange(0, 1), "score must be in [0,1]"),
  // "every element is a test path" — a dependent predicate over a runtime array.
  changedTests: refine(
    "string[]",
    everyTestPath,
    "every path must be a test file",
  ),
  // restriction membership over a live command string.
  ranCommand: refine("string", isGitCmd, "ranCommand must be a git command"),
};

// ---------------------------------------------------------------------------
// PARSE, DON'T VALIDATE. A successful parse mints a brand; a failed parse returns
// a typed failure the consumer MUST handle. The brand is a Symbol-keyed tag, the
// runtime echo of the shipped `VerifiedPath & { [__brand] }` pattern.
// ---------------------------------------------------------------------------

const REFINED = Symbol("vigiles.refined");

/** parse(field, value) → { ok:true, value: branded } | { ok:false, error }. */
function parseRefined(field, value) {
  if (!field.predicate(value)) {
    return {
      ok: false,
      error: `refinement failed: ${field.label} (got ${JSON.stringify(value)})`,
    };
  }
  // mint the brand ONLY after the predicate holds — the value is now provably refined.
  const branded = { value, [REFINED]: field.label };
  return { ok: true, value: branded };
}

/** A consumer that ONLY accepts a branded (already-parsed) value. */
function consumeRefined(branded) {
  assert.ok(branded && branded[REFINED], "consumer requires a REFINED value");
  return branded.value;
}

// ---------------------------------------------------------------------------
// (1) AUTHOR-TIME parse demo.
// ---------------------------------------------------------------------------

// good: a reviewer returns a well-formed result — every refinement passes.
const goodScore = parseRefined(reviewerContract.score, 0.82);
assert.equal(goodScore.ok, true);
assert.equal(consumeRefined(goodScore.value), 0.82);
console.log(
  "[ok] score 0.82 parses and brands (consumer accepts the refined value)",
);

// bad: a score outside [0,1] — the PARSE fails up front, not deep in the consumer.
const badScore = parseRefined(reviewerContract.score, 1.7);
assert.equal(badScore.ok, false);
assert.match(badScore.error, /score must be in \[0,1\]/);
console.log(`[ok] score 1.7 rejected at parse: ${badScore.error}`);

// the consumer CANNOT be handed a raw 1.7 — only a branded value passes the guard.
assert.throws(() => consumeRefined({ value: 1.7 }), /requires a REFINED value/);
console.log(
  "[ok] consumer refuses an unbranded (unparsed) value — parse-don't-validate holds",
);

// dependent predicate: "every changed file is a test path".
const goodTests = parseRefined(reviewerContract.changedTests, [
  "src/a.test.ts",
  "src/b.spec.ts",
]);
assert.equal(goodTests.ok, true);
const badTests = parseRefined(reviewerContract.changedTests, [
  "src/a.test.ts",
  "src/core/spec.ts", // not a test file → the whole array fails the refinement
]);
assert.equal(badTests.ok, false);
console.log(
  `[ok] dependent "every element is a test path" caught: ${badTests.error}`,
);

// ---------------------------------------------------------------------------
// (2) RUNTIME GATE demo — the same contract emitted as a boundary check on a
// subagent's RETURNED result. This is the value no type sees: the live payload.
// parseAgentResult would call this before handing the result to the orchestrator.
// ---------------------------------------------------------------------------

/** Validate a whole returned result object against the refined contract. */
function gateResult(contract, payload) {
  const failures = [];
  for (const [name, field] of Object.entries(contract)) {
    const r = parseRefined(field, payload[name]);
    if (!r.ok) failures.push(`${name}: ${r.error}`);
  }
  return failures.length === 0
    ? { allow: true, message: "" }
    : { allow: false, message: failures.join("; ") };
}

const wellFormedReturn = {
  score: 0.9,
  changedTests: ["x.test.ts"],
  ranCommand: "git diff --stat",
};
assert.equal(gateResult(reviewerContract, wellFormedReturn).allow, true);
console.log("[ok] runtime gate ALLOWS a well-formed subagent result");

const malformedReturn = {
  score: 2.0, // out of range
  changedTests: ["notatest.ts"], // not a test path
  ranCommand: "rm -rf /", // not a git command
};
const denied = gateResult(reviewerContract, malformedReturn);
assert.equal(denied.allow, false);
assert.match(denied.message, /score must be in/);
assert.match(denied.message, /every path must be a test file/);
assert.match(denied.message, /ranCommand must be a git command/);
console.log(
  `[ok] runtime gate DENIES a malformed subagent result: ${denied.message}`,
);

console.log(
  "\nAll refinement runtime-guard assertions held — parse-don't-validate + the live-value gate work.",
);
