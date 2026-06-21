/**
 * PROTOTYPE S1 (fail cases) — the branching session type REJECTS three protocol
 * bugs at `tsc`, NO vigiles run, NO model. These are the railway analogues of the
 * session-type safety violations (a branch whose continuation doesn't line up;
 * an error track that doesn't cover a step's err arm). No `@ts-expect-error` — the
 * file genuinely fails so run.mjs can assert the rejection and print diagnostics.
 *
 *   npx tsc --noEmit --strict --module nodenext --moduleResolution nodenext \
 *     --target es2022 session-fails.ts   (exit != 0; diagnostics below)
 */
import { start, then, close } from "./session-railway.js";
import type { Step, ErrorTrack } from "./session-railway.js";

const planner: Step<
  Record<string, never>,
  { plan: "string" },
  { reason: "string" }
> = {
  agent: "planner",
  needs: {},
  ok: { plan: "string" },
  err: { reason: "string" },
};

// A reviewer that needs `diff` — which the planner does NOT produce (the planner
// produces `plan`). The handoff through the success branch is broken.
const reviewer: Step<
  { diff: "string" },
  { approved: "boolean" },
  { reason: "string" }
> = {
  agent: "reviewer",
  needs: { diff: "string" },
  ok: { approved: "boolean" },
  err: { reason: "string" },
};

// FAILURE 1 — BRANCH HANDOFF: reviewer.needs (`diff`) not supplied by planner.ok
// (`plan`). The success continuation of the choice doesn't line up.
// error TS2345: ... '{ __HANDOFF_ERROR: { __missing: "diff"; }; }'.
export const bad1 = then(start(planner), reviewer);

// An implementer whose err arm carries `reason` + `retryable`.
const implementer: Step<
  { plan: "string" },
  { diff: "string" },
  { reason: "string"; retryable: "boolean" }
> = {
  agent: "implementer",
  needs: { plan: "string" },
  ok: { diff: "string" },
  err: { reason: "string", retryable: "boolean" },
};

// FAILURE 2 — UNHANDLED ERROR ARM: the error track requires `severity`, but no
// step's err arm supplies it — an error track written against the WRONG shape.
const wrongTrack: ErrorTrack<{ severity: "string" }> = {
  agent: "reporter",
  handles: { severity: "string" }, // no step produces `severity`
};

// error TS2345: ... '{ __UNHANDLED_ERROR_TRACK: { __missing: "severity"; }; }'.
export const bad2 = close(then(start(planner), implementer), wrongTrack);

// FAILURE 3 — OUT-OF-ORDER through the branch: reviewer placed before implementer,
// so reviewer (needs `diff`) runs against planner's `plan` — same combinator
// catches the swapped continuation.
export const bad3 = then(then(start(planner), reviewer), implementer);
