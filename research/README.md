# Research & design docs — index

The thinking behind vigiles: design docs, landscape analyses, benchmark findings,
and parked ideas. Grouped by theme; each is one click away. (User-facing
how-to docs live in [`../docs/`](../docs/README.md).)

> **Building something? Start at [`roadmap.md`](roadmap.md)** — the single
> consolidated, ranked view of what ships next (Now / Next / Later / Backlog /
> Rejected), each item linking the doc below that holds its rationale.

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
- [`harness-testing-coverage-matrix.md`](harness-testing-coverage-matrix.md) — the **pillar-2 surface detail**: every plugin surface × tier, what's shipped vs. next, the spikes, the parked ideas. (The cross-pillar ranking now lives in [`roadmap.md`](roadmap.md).)
- [`adapter-api-design.md`](adapter-api-design.md) — **core-plus-adapters API design** (AI SDK, unplugin, Drizzle, Testing Library, ESLint, OTel): entry points, import-vs-string selection, the boundary lint rule, conformance posture, and the semver of the pillar-2 runner relayout. Companion to [`code-adapter-architecture.md`](code-adapter-architecture.md).
- [`eval-api-landscape.md`](eval-api-landscape.md) — the eval-API field scored against ours; the B→A→C roadmap (shipped) and the D/E punts.
- [`testing-api-design.md`](testing-api-design.md) — design proposal for the ideal testing-API _shape_ (deterministic + non-deterministic): one `Trace`, one declarative `check` vocabulary with two evaluators (strict/scored), three tiers (egress as a capability). The API-shape complement to the infra-focused eval-api-landscape.
- [`promptfoo-deep-dive.md`](promptfoo-deep-dive.md) — promptfoo in 2026; the one axis that still separates us (harness-arm A/B + cheap sub-model tiers + significance).
- [`skill-eval-landscape.md`](skill-eval-landscape.md) — AWS skill-eval scored against our pillar; trigger precision + the token-compression use case.
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

## Strategy & bets (2026-06)

The four same-day deep researches into adjacent markets, their synthesis, the
divergent-bets triage, and the SDK probe. Ranked into action in [`roadmap.md`](roadmap.md).

- [`strategic-synthesis-2026-06.md`](strategic-synthesis-2026-06.md) — **read first**: all four researches converge on extend-don't-pivot, with one unclaimed wedge (observed-≟-declared). Ranked Tier-1/2/3 bets + the positioning pivot.
- [`divergent-bets.md`](divergent-bets.md) — bolder directions triaged with founder reactions (leaderboard + cost-optimizer = strong; SDK = no; compiler-not-linter = killed).
- [`agent-supply-chain-security.md`](agent-supply-chain-security.md) — plugin/MCP supply-chain security; build a thin harness-aware `scan`, reject the security-vendor pivot.
- [`standards-conformance.md`](standards-conformance.md) — AGENTS.md/SKILL.md/MCP standardization; extend pillar 1 to be format-neutral, reject the generic-linter pivot.
- [`runtime-guardrails-observability.md`](runtime-guardrails-observability.md) — guardrails + OTel-GenAI; stay out of the request path, take the OTel-emit / verify-trace / Cedar-codegen bridges.
- [`ai-native-linting.md`](ai-native-linting.md) — the AI-reviewer wave; extend `enforce()` to AI-linter catalogs, prototype a falsifiable `judge()` rule, reject becoming a reviewer.
- [`sdk-harness-testing.md`](sdk-harness-testing.md) — do code-defined agent SDKs lack a deterministic test tier? No — first-party SDK mocks already cover it.
- [`sandbox-network.md`](sandbox-network.md) — the resolver-pinned dynamic-allowlist layer for sandbox egress.
- [`egress-sandbox-tooling.md`](egress-sandbox-tooling.md) — build-vs-adopt for the rootless egress connector: **swap slirp4netns → pasta (passt)** (Podman's default; doesn't need the tun tap-attach that fails on GH-hosted runners); nsjail/firejail/gVisor/Landlock assessed and rejected; how others pass egress tests in CI.
