# Research & design docs — index

The thinking behind vigiles: design docs, landscape analyses, benchmark findings,
and parked ideas. Grouped by theme; each is one click away. (User-facing
how-to docs live in [`../docs/`](../docs/README.md).)

## Positioning & landscape

- [`landscape-mid-2026.md`](landscape-mid-2026.md) — the mid-2026 frame: ContextCov, Harness Engineering, AgentProof, AWS Bedrock + Cedar, Compiled AI. The positioning vigiles sits in.
- [`competitive-landscape.md`](competitive-landscape.md) — competitive landscape: rule-porter, rulesync, vibe-cli, Ruler, moat analysis.
- [`sync-landscape-analysis.md`](sync-landscape-analysis.md) — rule-sync landscape, per-tool breakdown, what's worth absorbing.
- [`reference-verification-limits.md`](reference-verification-limits.md) — the conceptual boundary of reference verification (the moat) and its undecidability ceiling.

## The two pillars

**Pillar 1 — verify the references (the moat).**

- [`executable-specs.md`](executable-specs.md) — design of the typed-spec → compiled-markdown system.
- [`symbol-verification.md`](symbol-verification.md) — cross-language symbol references (`vigiles:symbol`), ast-grep, the mark-vs-index decision.
- [`enforce-over-guidance.md`](enforce-over-guidance.md) — deterministic upgrade gates: snapshot-gated downgrades + Merkle diff vs upstream catalog.

**Pillar 2 — test the harness.**

- [`harness-testing.md`](harness-testing.md) — the three-tier design (unit `runHook` / deterministic `runHarnessTest` / eval `runEval`) + the plugin loader. Start here.
- [`harness-testing-coverage-matrix.md`](harness-testing-coverage-matrix.md) — **the living roadmap**: every plugin surface × tier, what's shipped vs. what's next, the spikes, and the parked ideas. The session centerpiece.
- [`benchmarks-runtime-gates.md`](benchmarks-runtime-gates.md) — the evals run in anger: runtime gates are a no-op/net-negative; verifying the map beats policing the route.
- [`testing-nondeterministic-ai.md`](testing-nondeterministic-ai.md) — prior art on testing non-deterministic AI/agent tools (DeepEval, Braintrust, τ-bench, pass^k, procedure-aware eval) and the `Trace` + predicate model it implies.

## Subagents & orchestration

- [`subagent-compilation.md`](subagent-compilation.md) — compiling typed subagent definitions (`agent()` → `agents/<name>.md`); the declared-vs-enforced tool gap (`tools:` is documentation, a `PreToolUse` hook is the rail); the empirical "no iterator in a subagent" survey (~100 agents).
- [`railway-subagents.md`](railway-subagents.md) — **railway-style orchestration over flat subagents.** The direct, differentiated answer to Anthropic's **ultraplan / dynamic-workflows** (plan-as-code): be the _typed, verified, compiled_ counterpart to its ephemeral generated script. Includes the Temporal analogy and the marks / `workflow()`-spec / deterministic-driver options. **Closest external thing to our direction — read for inspiration.**

## Skills

- [`skill-authoring-pains.md`](skill-authoring-pains.md) — the documented real-world pains (triggering, silent frontmatter failures, refs rot) + the doc-vs-procedure split.
- [`skill-as-pipeline.md`](skill-as-pipeline.md) — the skill-as-pipeline model (result/process gates) the benchmarks tested and largely deflated.

## Self-evolving specs & proofs

- [`self-evolving-specs.md`](self-evolving-specs.md) — proofs, Merkle history, the evolution engine.
- [`formal-proofs-for-agents.md`](formal-proofs-for-agents.md) — formal verification via Lean 4 / Dafny, the Cedar pattern, Leanstral.

## Runtime enforcement & agent integration

- [`runtime-enforcement.md`](runtime-enforcement.md) — spec-derived runtime enforcement via hooks, skill contracts, session audit.
- [`agent-integration.md`](agent-integration.md) — the deterministic backstop for AI agents: hooks, proofs, static checks anchored at the spec.
- [`dynamic-workflows-and-scope.md`](dynamic-workflows-and-scope.md) — dynamic workflows and scope boundaries.

## FP techniques for AI-written code

- [`fp-for-deterministic-ai.md`](fp-for-deterministic-ai.md) — pure functions, exhaustive matches, Result types.
- [`fp-for-agent-harness.md`](fp-for-agent-harness.md) — Railway / algebraic-effect structure for hooks and the tool-use loop.

## Adoption, distribution & ideas

- [`distribution-strategy.md`](distribution-strategy.md) — **why nobody uses vigiles yet**: funnel diagnosis + the demo lever (now shipped).
- [`adoption-strategy.md`](adoption-strategy.md) — zero-config setup, progressive enforcement, agent workflows.
- [`feature-ideas.md`](feature-ideas.md) — the parked-ideas list (custom-rule plugin API, reverse coverage, sandboxed exec §13, …).
- [`architecture-platform.md`](architecture-platform.md) — architecture-aware agent platform (FSD/DDD/hexagonal presets).
- [`ai-code-quality.md`](ai-code-quality.md) — AI code-quality patterns.
- [`code-search-for-agents.md`](code-search-for-agents.md) — code-search approaches (grep vs embeddings vs AST-grep).
