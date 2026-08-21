/**
 * Type-level constraint: TYPED COMPOSITION — "your multi-agent pipeline doesn't
 * compile if the handoffs don't line up." The SHIPPED `experimental_agent()` / `result()`
 * builders now carry each agent's `result()` ok/err SHAPE at the type level (a
 * `TypedAgentSpec`), so a typed `experimental_pipe`/`then` cross-references one step's `ok`
 * against the next step's `experimental_needs` AT `tsc` TIME — a missing field, a wrong field
 * type, or an out-of-order step is a compile error.
 *
 * Compiled with `tsc --noEmit` (npm run test:types); it asserts types, it is not
 * executed. `// @ts-expect-error` marks the must-NOT-compile cases. Mirrors the
 * proven prototype (research/prototypes/typed-spec-power/{typed-composition,fails}.ts).
 */
import { experimental_agent } from "../../dist/core/spec.js";

// The subagent vocabulary hangs off the root (the `experimental_skill.input()`
// chokepoint, applied to subagents): destructuring here keeps the body below
// unchanged, and the ONLY way to reach these names is through the marked root.
const {
  result,
  start: experimental_start,
  andThen: experimental_andThen,
  pipe: experimental_pipe,
  pipeStep: experimental_pipeStep,
  needs: experimental_needs,
} = experimental_agent;

// ---------------------------------------------------------------------------
// Three flat workers, each declaring its typed result() shape.
// ---------------------------------------------------------------------------

const planner = experimental_agent({
  name: "planner",
  description: "Break a request into an ordered plan.",
  output: result({ plan: "string", files: "string[]" }, { reason: "string" }),
});

const implementer = experimental_agent({
  name: "implementer",
  description: "Implement the plan and report the diff.",
  output: result(
    { diff: "string", touched: "string[]" },
    { reason: "string", retryable: "boolean" },
  ),
});

const reviewer = experimental_agent({
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

const good = experimental_pipe(
  planner,
  experimental_pipeStep(
    implementer,
    experimental_needs({ plan: "string", files: "string[]" }),
  ),
  experimental_pipeStep(reviewer, experimental_needs({ diff: "string" })),
);

// The carried final type is precise — the pipeline's `ok` is reviewer's `ok`.
const _approved: "boolean" = good.ok.approved;
void _approved;

// The same chain via the explicit start/andThen fold MUST also compile.
const goodFold = experimental_andThen(
  experimental_andThen(
    experimental_start(planner),
    experimental_pipeStep(
      implementer,
      experimental_needs({ plan: "string", files: "string[]" }),
    ),
  ),
  experimental_pipeStep(reviewer, experimental_needs({ diff: "string" })),
);
void goodFold;

// ---------------------------------------------------------------------------
// FAILURE 1 — MISSING FIELD: a reviewer that needs `securityScan`, which no
// upstream step produces. The handoff is unsatisfiable → `tsc` rejects it.
// ---------------------------------------------------------------------------

const reviewerNeedsScan = experimental_agent({
  name: "reviewer",
  description: "Review with a security scan.",
  output: result({ approved: "boolean" }, { reason: "string" }),
});

void experimental_pipe(
  planner,
  experimental_pipeStep(
    implementer,
    experimental_needs({ plan: "string", files: "string[]" }),
  ),
  // @ts-expect-error MISSING FIELD: implementer.ok has no `securityScan`.
  experimental_pipeStep(
    reviewerNeedsScan,
    experimental_needs({ securityScan: "string" }),
  ),
);

// ---------------------------------------------------------------------------
// FAILURE 2 — TYPE MISMATCH: a reviewer that needs `diff` as the WRONG type
// (`string[]`, but implementer produces `diff: "string"`).
// ---------------------------------------------------------------------------

void experimental_pipe(
  planner,
  experimental_pipeStep(
    implementer,
    experimental_needs({ plan: "string", files: "string[]" }),
  ),
  // @ts-expect-error TYPE MISMATCH: implementer produces diff:"string", reviewer needs diff:"string[]".
  experimental_pipeStep(reviewer, experimental_needs({ diff: "string[]" })),
);

// ---------------------------------------------------------------------------
// FAILURE 3 — ORDER ERROR: reviewer placed BEFORE implementer, so it never sees
// `diff`. The string-path railway lists steps in any order with no check; the
// typed pipe rejects the inverted handoff.
// ---------------------------------------------------------------------------

void experimental_pipe(
  planner,
  // @ts-expect-error ORDER ERROR: reviewer needs `diff`, but planner.ok has none (implementer hasn't run).
  experimental_pipeStep(reviewer, experimental_needs({ diff: "string" })),
);

// ---------------------------------------------------------------------------
// BACKWARDS COMPAT — a plain `experimental_agent()` with NO output is still a usable spec; a
// pipeline of bare agents (empty needs) composes. (Typed composition is purely
// additive; the string-path railway/delegate is unchanged and tested at runtime.)
// ---------------------------------------------------------------------------

const bare = experimental_agent({
  name: "bare",
  description: "no result contract",
});
void experimental_start(bare);
