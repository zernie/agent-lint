/**
 * Type-level constraint: TYPED COMPOSITION — "your multi-agent pipeline doesn't
 * compile if the handoffs don't line up." The SHIPPED `agent()` / `result()`
 * builders now carry each agent's `result()` ok/err SHAPE at the type level (a
 * `TypedAgentSpec`), so a typed `pipe`/`then` cross-references one step's `ok`
 * against the next step's `needs` AT `tsc` TIME — a missing field, a wrong field
 * type, or an out-of-order step is a compile error.
 *
 * Compiled with `tsc --noEmit` (npm run test:types); it asserts types, it is not
 * executed. `// @ts-expect-error` marks the must-NOT-compile cases. Mirrors the
 * proven prototype (research/prototypes/typed-spec-power/{typed-composition,fails}.ts).
 */
import {
  agent,
  result,
  start,
  andThen,
  pipe,
  pipeStep,
  needs,
} from "../../dist/core/spec.js";

// ---------------------------------------------------------------------------
// Three flat workers, each declaring its typed result() shape.
// ---------------------------------------------------------------------------

const planner = agent({
  name: "planner",
  description: "Break a request into an ordered plan.",
  output: result({ plan: "string", files: "string[]" }, { reason: "string" }),
});

const implementer = agent({
  name: "implementer",
  description: "Implement the plan and report the diff.",
  output: result(
    { diff: "string", touched: "string[]" },
    { reason: "string", retryable: "boolean" },
  ),
});

const reviewer = agent({
  name: "reviewer",
  description: "Review the diff.",
  output: result(
    { approved: "boolean", notes: "string[]" },
    { reason: "string" },
  ),
});

// ---------------------------------------------------------------------------
// CORRECT pipeline — every handoff lines up. MUST compile.
//   planner.ok ⊇ implementer.needs, implementer.ok ⊇ reviewer.needs.
// ---------------------------------------------------------------------------

const good = pipe(
  planner,
  pipeStep(implementer, needs({ plan: "string", files: "string[]" })),
  pipeStep(reviewer, needs({ diff: "string" })),
);

// The carried final type is precise — the pipeline's `ok` is reviewer's `ok`.
const _approved: "boolean" = good.ok.approved;
void _approved;

// The same chain via the explicit start/andThen fold MUST also compile.
const goodFold = andThen(
  andThen(
    start(planner),
    pipeStep(implementer, needs({ plan: "string", files: "string[]" })),
  ),
  pipeStep(reviewer, needs({ diff: "string" })),
);
void goodFold;

// ---------------------------------------------------------------------------
// FAILURE 1 — MISSING FIELD: a reviewer that needs `securityScan`, which no
// upstream step produces. The handoff is unsatisfiable → `tsc` rejects it.
// ---------------------------------------------------------------------------

const reviewerNeedsScan = agent({
  name: "reviewer",
  description: "Review with a security scan.",
  output: result({ approved: "boolean" }, { reason: "string" }),
});

void pipe(
  planner,
  pipeStep(implementer, needs({ plan: "string", files: "string[]" })),
  // @ts-expect-error MISSING FIELD: implementer.ok has no `securityScan`.
  pipeStep(reviewerNeedsScan, needs({ securityScan: "string" })),
);

// ---------------------------------------------------------------------------
// FAILURE 2 — TYPE MISMATCH: a reviewer that needs `diff` as the WRONG type
// (`string[]`, but implementer produces `diff: "string"`).
// ---------------------------------------------------------------------------

void pipe(
  planner,
  pipeStep(implementer, needs({ plan: "string", files: "string[]" })),
  // @ts-expect-error TYPE MISMATCH: implementer produces diff:"string", reviewer needs diff:"string[]".
  pipeStep(reviewer, needs({ diff: "string[]" })),
);

// ---------------------------------------------------------------------------
// FAILURE 3 — ORDER ERROR: reviewer placed BEFORE implementer, so it never sees
// `diff`. The string-path railway lists steps in any order with no check; the
// typed pipe rejects the inverted handoff.
// ---------------------------------------------------------------------------

void pipe(
  planner,
  // @ts-expect-error ORDER ERROR: reviewer needs `diff`, but planner.ok has none (implementer hasn't run).
  pipeStep(reviewer, needs({ diff: "string" })),
);

// ---------------------------------------------------------------------------
// BACKWARDS COMPAT — a plain `agent()` with NO output is still a usable spec; a
// pipeline of bare agents (empty needs) composes. (Typed composition is purely
// additive; the string-path railway/delegate is unchanged and tested at runtime.)
// ---------------------------------------------------------------------------

const bare = agent({ name: "bare", description: "no result contract" });
void start(bare);
