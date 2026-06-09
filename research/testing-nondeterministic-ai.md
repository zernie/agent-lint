# Testing non-deterministic AI tools — prior art & the model it implies

> Landscape + design note (2026-06-09). How the field tests LLM/agent systems
> whose output varies run to run, and the model that implies for vigiles'
> harness-testing pillar. Companion to the roadmap in
> [`harness-testing-coverage-matrix.md`](harness-testing-coverage-matrix.md).

## The field has converged

Survey of 2026 agent-eval tooling and benchmarks:

- **Frameworks** — [DeepEval](https://deepeval.com/guides/guides-llm-as-a-judge)
  (pytest-native asserts incl. an `assert_tool_call` for tool selection / argument
  correctness, plus LLM-as-judge metrics), [Braintrust](https://www.braintrust.dev/articles/ai-agent-evaluation-framework)
  (trace-level observability across multi-step workflows), LangFuse,
  [Promptfoo](https://www.digitalapplied.com/blog/ai-agent-eval-frameworks-testing-guide-2026)
  (assertion-based prompt regression). Surveys:
  [Atlan six-layer harness guide](https://atlan.com/know/how-to-test-ai-agent-harness/),
  [LLM testing frameworks](https://testomat.io/blog/llm-test/).
- **Benchmarks** — [τ-bench](https://arxiv.org/abs/2406.12045) checks the **end
  database state** vs the annotated goal (not the agent's self-report), and
  introduces **pass^k** (all k attempts succeed = reliability) over the usual
  pass@k. [AgentAssay](https://arxiv.org/pdf/2603.02601) = token-efficient
  regression testing for non-deterministic agent workflows.
  ["Corrupt success" / procedure-aware eval](https://arxiv.org/pdf/2603.03116)
  catches a right end-state reached by a gamed procedure.

The patterns they share:

1. **Trace-centric.** You evaluate over a recorded _trace_ of the run — every
   tool call (name + args + result), files/state touched, the final output. The
   trace is the unit of evaluation.
2. **Deterministic-first, judge-minority.** Field rule of thumb ≈ **60%
   deterministic** (exact / regex / schema / state checks) · **30% LLM-as-judge**
   (quality, goal alignment) · **10% human**. _"Never rely on LLM-as-judge alone —
   it stacks scorer stochasticity on top of the agent's."_ Deterministic scorers
   are ground truth.
3. **State over self-report.** Verify the _outcome state_ (DB / file / test
   suite), not the agent's claim that it did the thing (τ-bench).
4. **Procedure-aware.** Right outcome via a wrong/gamed procedure = "corrupt
   success" — check the _trajectory_, not only the end-state.
5. **Reliability via pass^k.** Under non-determinism, "worked every time"
   (pass^k) ≠ "worked on average." Report both.

## The model this implies — and the line vigiles must keep

A run is: **assemble harness → run agent on task → Trace → consume.** The `Trace`
is shared. But there are **two separate consumers, and they stay separate**
(verification vs measurement):

```ts
// Trace = the observable record of ONE run
trace.tools; //  [{ name, input, result, isError }]
trace.output; // final answer text
trace.file(p); // end-state of a file
trace.sh(cmd); // run a check against the end-state
trace.hooks; //  [{ event, decision }]
trace.turns;

// PREDICATES — pure fns over a Trace. The shared vocabulary. (NO `assert` prefix)
usedTool(trace, "mcp__github__merge"); // -> boolean
toolCount(trace, "Write"); //              -> number
skillResolved(trace, "demo:greet"); //     -> boolean
toolSequence(trace, ["Read", "Edit"]); //  -> boolean
outputScore(trace, rubric); //             -> number   (judge — the 30%, sparingly)

// TESTING tier — deterministic pass/fail. `assert*` = predicate + throw.
assertToolNotUsed(trace, x); // = ok(!usedTool(trace, x))
assertSkillResolved(trace, x);
// runs on every commit, no model, green/red

// EVAL tier — statistical measurement. SEPARATE. uses the BARE predicates as metrics.
eval({
  arms: { off: {}, on: { plugin } },
  task,
  trials: 8,
  measure: (trace) => ({
    usedSkill: skillResolved(trace, "demo:greet"), // bool   -> fraction-true
    safe: !usedTool(trace, /merge|delete/), // bool   -> fraction-true
    followed: outputScore(trace, rubric), // number -> mean
  }),
});
// reports per metric:  mean ± se   AND   pass^k (succeeded every trial)
```

Two rules fall out of this (and correct an earlier sketch that blurred them):

- **Predicates are bare; only the throwing testing helpers carry `assert`.**
  `usedTool` returns a bool you can reuse anywhere; `assertToolUsed` is `usedTool`
  - throw. Don't merge them.
- **Testing and eval are different tiers, not one API.** They _share predicates
  over the Trace_, but testing **asserts** (pass/fail, every commit, free) and
  eval **measures** (mean ± se / pass^k, occasional, paid). Same vocabulary,
  separate consumers — never a single function that's "a bool here, a number
  there."

## What we have vs. what this says to build

| Need (from the field)                        | vigiles today                                           | gap                                                        |
| -------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| A unified **Trace** from both tiers          | `r.toolCalls` on the mock tier; eval ctx is `file`/`sh` | **unify**: one Trace from `runHarnessTest` _and_ `runEval` |
| `trace.output` (final answer) for judge      | buried in stdout / stream-json                          | extract it                                                 |
| `trace.hooks` (which fired + decision)       | inferred via marker files                               | capture it                                                 |
| **Predicates** separate from **`assert*`**   | we ship `assertTool*` (throwing) only                   | factor out bare predicates so eval `measure` reuses them   |
| **pass^k** reliability (not just mean ± se)  | mean ± se only                                          | add                                                        |
| Tool-**argument** assertions (not just name) | name / regex only                                       | extend (DeepEval-style)                                    |
| State-over-self-report outcome               | ✅ `sh("npm test")` after the agent stops               | — (validated)                                              |
| Procedure-aware / trajectory invariants      | ✅ `assertToolSequence`, "Edit after Read"              | — (validated; this is "corrupt success")                   |

## Bottom line

The design holds up against prior art: **a shared `Trace` + a deterministic
predicate vocabulary, with judge a minority and eval kept as a separate
statistical consumer.** The sharpest next moves the field points at: **unify the
`Trace`** (with `output` + `hooks`), **split predicates from `assert*`**, and add
**pass^k** + tool-argument assertions.

## See also

- [`harness-testing-coverage-matrix.md`](harness-testing-coverage-matrix.md) — the roadmap these gaps feed into.
- [`benchmarks-runtime-gates.md`](benchmarks-runtime-gates.md) — our own "state over self-report" + "procedure gaming" findings, independently.
- [`reference-verification-limits.md`](reference-verification-limits.md) — why verification (deterministic) is the floor and eval (measurement) the separate axis.
