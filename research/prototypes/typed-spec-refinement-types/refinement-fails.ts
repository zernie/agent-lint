/**
 * PROTOTYPE R1 (fail cases) — refinements TS REJECTS at compile time.
 *
 * Each of these is an out-of-refinement LITERAL that `tsc --strict` rejects with
 * NO vigiles run, NO model. They prove the encodable refinements in
 * ./refinement-encodable.ts are real constraints, not vacuous aliases. No
 * `@ts-expect-error` — the file genuinely fails tsc so run.mjs can assert the
 * rejection and print the diagnostic.
 *
 *   npx tsc --noEmit --strict --module nodenext --moduleResolution nodenext \
 *     --target es2022 refinement-fails.ts   (exit != 0; diagnostics below)
 */
import {
  verdictField,
  testArtifact,
  gitTool,
  boundedAgent,
} from "./refinement-encodable.js";

// FAILURE 1 — enum-membership: a verdict label outside the refined union.
// error TS2345: Argument of type '"approved"' is not assignable to parameter of
//   type '"pass" | "fail" | "needs-review"'.
export const f1 = verdictField("review", "approved");

// FAILURE 2 — string-shape: a path that is NOT a *.test.ts / *.spec.ts.
// error TS2345: Argument of type '"src/core/spec.ts"' is not assignable to
//   parameter of type 'TestPath'.
export const f2 = testArtifact("src/core/spec.ts");

// FAILURE 3 — tool-restriction: bare `Bash` is broader than the `Bash(git:*)`
// refinement (the capability narrowing is enforced).
export const f3 = gitTool("Bash");

// FAILURE 4 — tool-restriction: an rm restriction is not a git restriction.
export const f4 = gitTool("Bash(rm:-rf)");

// FAILURE 5 — non-empty: an empty tools tuple is not a NonEmptyTools.
// error TS2345: Argument of type '[]' is not assignable to parameter of type
//   'readonly [string, ...string[]]'.
export const f5 = boundedAgent([]);
