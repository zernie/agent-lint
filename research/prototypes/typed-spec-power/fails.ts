/**
 * PROTOTYPE — the FAILURE proof for typed composition.
 *
 * Each block below is a pipeline that is SEMANTICALLY broken (a handoff that a
 * markdown railway would happily emit and only discover at runtime). The TYPED
 * spec rejects every one at `tsc`. Run:
 *
 *   npx tsc --noEmit --strict research/prototypes/typed-spec-power/fails.ts
 *
 * The captured output is in research/typed-spec-power.md.
 */

import { agent, start, then } from "./typed-composition.js";

const planner = agent({
  name: "planner",
  needs: {},
  result: {
    ok: { plan: "string", files: "string[]" },
    err: { reason: "string" },
  },
});

const implementer = agent({
  name: "implementer",
  needs: { plan: "string", files: "string[]" },
  result: {
    ok: { diff: "string", touched: "string[]" },
    err: { reason: "string", retryable: "boolean" },
  },
});

// A reviewer that needs a field NOBODY upstream produces.
const reviewerNeedsSecurityScan = agent({
  name: "reviewer",
  needs: { securityScan: "string" }, // <- never produced by implementer
  result: { ok: { approved: "boolean" }, err: { reason: "string" } },
});

// FAILURE 1 — MISSING FIELD: implementer.ok has no `securityScan`.
// tsc rejects this `then(...)` call, naming __missing: "securityScan".
export const missingField = then(
  then(start(planner), implementer),
  reviewerNeedsSecurityScan,
);

// A reviewer that needs `diff` but as the WRONG type.
const reviewerWrongType = agent({
  name: "reviewer",
  needs: { diff: "string[]" }, // implementer produces diff: "string"
  result: { ok: { approved: "boolean" }, err: { reason: "string" } },
});

// FAILURE 2 — TYPE MISMATCH: implementer produces diff:"string", reviewer
// declares it needs diff:"string[]". tsc rejects, naming __mismatch: "diff".
export const wrongType = then(
  then(start(planner), implementer),
  reviewerWrongType,
);

// FAILURE 3 — ORDER ERROR: reviewer placed BEFORE implementer, so it never sees
// `diff`. A markdown railway lists steps in any order with no check; the typed
// spec rejects the inverted handoff.
const reviewerNeedsDiff = agent({
  name: "reviewer",
  needs: { diff: "string" },
  result: { ok: { approved: "boolean" }, err: { reason: "string" } },
});
export const wrongOrder = then(start(planner), reviewerNeedsDiff);
