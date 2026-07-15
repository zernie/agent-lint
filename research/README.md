# Research & design docs — index

The thinking behind vigiles: design docs, landscape analyses, benchmark findings,
and parked ideas — the project's **internal record, not user-facing** (those
how-to docs live in [`../docs/`](../docs/README.md)). Grouped by theme; each is
one click away.

> **Two indexes, two audiences.** This README is the **human** index — curated,
> thematic, prose. [`CLAUDE.md`](CLAUDE.md) (compiled from
> [`CLAUDE.md.spec.ts`](CLAUDE.md.spec.ts)) is the **agent** index — every doc in
> one line, so a session gets the whole corpus as directory memory. Every doc also
> carries `status:` (`active` / `shipped` / `idea` / `superseded` / `rejected`) and
> `topic:` frontmatter, so you can slice the corpus deterministically:
> `grep -l 'status: shipped' research/*.md`, `grep -l 'topic: eval' research/*.md`.

> **Building something? Start at [`roadmap.md`](roadmap.md)** — the single
> consolidated, ranked view of what ships next (Now / Next / Later / Backlog /
> Rejected), each item linking the doc below that holds its rationale.

> **❓ Confused about enforcement / routing / naming? question → the ONE doc** (these
> recur and get mis-stated — go straight to the answer, don't re-derive):
>
> - _How much of a real CLAUDE.md is enforceable? is "no off-the-shelf rule" the same as "not enforceable"?_ → [`rule-enforceability.md`](rule-enforceability.md) (~65% mechanizable; **no** — custom synthesis covers project-specific rules).
> - _How does synthesis work — does vigiles run/pay for a model?_ → [`rule-enforceability.md`](rule-enforceability.md) + [`audit-rule-compile-tier.md`](audit-rule-compile-tier.md) (opt-in copy-prompt → the user's own sub → deterministic gate; **$0 to vigiles**).
> - _Which linters does prose routing support (ESLint/Ruff/Pylint/Clippy)?_ → [`rule-enforceability.md`](rule-enforceability.md) (ESLint + Pylint + Ruff route-only; Clippy = gap). `docs/linter-support.md` is the different `enforce()` verification.
> - _`@vigiles/rule-enforcer` vs `vigiles compile` — same thing?_ → [`rule-enforceability.md`](rule-enforceability.md) naming section (**no**: rule-enforcer = prose→rule engine; `compile` = spec→md).
> - _Why warn vs error / can't it all be a type?_ → [`enforcement-model.md`](enforcement-model.md) (decidability gradient).

> **💡 Looking for ideas (not the plan)?** The four idea backlogs, newest first:
>
> - [`audit-wow-ideas.md`](audit-wow-ideas.md) — the live menu of new `audit`/lint
>   checks + the **Flue-framework poach (Appendix D: F1–F8)** + the **OSS-issue
>   detector harvest** (which of the top OSS-plugin pains are shipped vs queued) +
>   the prevent/detect/measure handling matrix. **The main idea doc.**
> - [`feature-ideas.md`](feature-ideas.md) — the long-tail parked-ideas list.
> - [`harness-state-space.md`](harness-state-space.md) — the analogical-transfer
>   moat ideas (CS principles mapped onto the harness).
>
> Each is cross-linked from [`roadmap.md`](roadmap.md), where the ones worth doing
> are ranked into Now/Next/Later. Ideas live here; the **plan** lives there.

## Positioning & landscape

- [`landscape-mid-2026.md`](landscape-mid-2026.md) — the mid-2026 frame: ContextCov, Harness Engineering, AgentProof, AWS Bedrock + Cedar, Compiled AI. The positioning vigiles sits in.
- [`competitive-landscape.md`](competitive-landscape.md) — competitive landscape: rule-porter, rulesync, vibe-cli, Ruler, moat analysis.
- [`pre-release-focus.md`](pre-release-focus.md) — the consolidation: the park/polish/add triage of the WHOLE feature surface, the API-surface freeze plan, the positioning lock, the markdown-mode decision, and the launch sequence. The "what actually ships" lens the roadmap points to. (Investor/competitor strategy lives in the private `startup/` vault, not indexed here.)
- [`harness-checkup-and-lanes.md`](harness-checkup-and-lanes.md) — the casual-vs-power lane decision (from CC-user feedback: most users won't author tests but want free harness info): ship `scan` as a zero-config "Lighthouse for your harness" (score + score-explainer + predefined disaster-battery/over-fire checks, no authoring), authored tests/evals as discoverable depth — both lanes as ONE funnel. Mostly packaging (vigiles already ships ~80%). Validated against Lighthouse/npm-audit/Snyk/SonarCloud/ESLint/Knip/Codecov + PLG research.
- [`audit-wow-ideas.md`](audit-wow-ideas.md) — the menu of NEW `audit` checks/measurements that create TENSION (an "oh shit", not a green A), from a 3-stream fan-out (our vault + real OSS failure patterns + the adjacent-tools gap). Verdict: don't add more deterministic markdown checks (agnix ~432 / claudelint 114 / CPV 190+ own that lane); the unique wow is the lethal-trifecta state check + the Safety/blast-radius ring + cross-reference-against-reality + the behavioral tier on the sub. Includes the OWASP Agentic-Top-10 → deterministic-check mapping and the full competitive appendix. **Appendix D = the Flue-framework poach (F1–F8: capability-diff across the delegation tree (F1, shipped), typed I/O handoff, model-specifier resolution, workflows/tool-defs as surfaces, a `vigiles/flue` adapter).** The "SHIPPED since" + "PLANNED" lists track which OSS-issue detectors are live (5 shipped) vs queued + the prevent/detect/measure handling matrix.
- [`agentic-harness-evolution-poach.md`](agentic-harness-evolution-poach.md) — poach of the arXiv "Agentic Harness Engineering" paper (auto-evolving coding-agent harnesses) for the optimize/measure/evolve line: the falsifiable-prediction-per-edit + auto-rollback loop, and the peer-reviewed validation that structure (tools/hooks/memory) beats prose (enforce > guidance).
- [`audit-rule-compile-tier.md`](audit-rule-compile-tier.md) — design spec (2 Fable passes): the `audit` opt-in tier that compiles a repo's CLAUDE.md/AGENTS.md prose rules via the sibling `agent-rules-compiler` engine (the `compile-rules` skill + `gate.js`), runs the gate-kept ones, and shows REAL violations + per-rule copy-command buttons. Two surfaces (deterministic foreign-safe teaser vs model-on-sub own-repo tier reusing the existing `decideExecute` consent). Hard invariants: difficulty ⟂ gate (gate is the final trust filter); hooks NEVER auto-build (false-safety = the flagship finding); report never spends; one engine, two entry points (no duplication).
- [`compiler-end-to-end-flow.md`](compiler-end-to-end-flow.md) — the whole rule-enforcer pipeline (harvest → segment → classify+reconcile → gate → existing-violations → persist → feedback) after the `agent-rules-compiler` fold into `@vigiles/rule-enforcer`. Records the two decisions (existing violations grandfather via ESLint's `eslint-suppressions.json` ratchet, never `eslint-disable`; Stage 0 becomes a bulk rule-harvester/taxonomy) and the built-vs-next map (rule-inventory + extract-existing + classify + 129-intent plugin index done; harvester + baseline writer + opt-in audit power-tier next).
- [`oss-lane-sweep-2026-06.md`](oss-lane-sweep-2026-06.md) — GitHub/npm sweep confirming the cross-reference-verification + harness-testing + skill-eval lane is unoccupied by OSS; the structural-lint surface is crowded with `agnix` (297★) the incumbent to watch (differentiate on capabilities A/B/C/D, not rule count).
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
- [`haretrail-eval-ideas.md`](haretrail-eval-ideas.md) — a deep `audit` dogfood of a Codex skills repo (fleytman/haretrail) → un-built ideas: new deterministic cross-ref checks (`openai.yaml` / trigger-manifest / env-var contract) + new eval helpers (the **selection-collision "confusion matrix for your router"** primitive, manifest-driven fixtures + auto-negatives, description-ablation). The cross-language flag it prompted was REMOVED (refuted).

## Self-evolving specs & proofs

- [`self-evolving-specs.md`](self-evolving-specs.md) — proofs, Merkle history, the evolution engine.
- [`formal-proofs-for-agents.md`](formal-proofs-for-agents.md) — formal verification via Lean 4 / Dafny, the Cedar pattern, Leanstral.

## Runtime enforcement & agent integration

- [`rule-enforceability.md`](rule-enforceability.md) — **THE cohesive answer to "how much of a real user CLAUDE.md/AGENTS.md can vigiles enforce, and how."** The 4 enforcement homes (off-the-shelf config / synthesized custom / ref-verification / prose); the measured real-OSS distribution (~65% mechanizable — "no off-the-shelf rule" ≠ "not enforceable"); how synthesis works (opt-in copy-prompt → the user's own sub → deterministic gate, $0 to vigiles); the AST-not-regex soundness rule; linter support incl. the clippy gap. Read this to stop re-deriving it.
- [`enforcement-model.md`](enforcement-model.md) — **why each rule's severity is what it is** (and why "make it all impossible by construction" is unachievable): prevention is a gradient bounded by decidability; the three buckets (structural-closed / external-decidable / heuristic-behavioral) that set each rule's ceiling. The model behind `src/core/rule-meta.ts` + the `lint-rule-calibration` rule. (Companion to `rule-enforceability.md`, which is about a USER's prose rules; this is about vigiles's OWN checks.)
- [`runtime-enforcement.md`](runtime-enforcement.md) — spec-derived runtime enforcement via hooks, skill contracts, session audit.
- [`agent-integration.md`](agent-integration.md) — the deterministic backstop for AI agents: hooks, proofs, static checks anchored at the spec.
- [`dynamic-workflows-and-scope.md`](dynamic-workflows-and-scope.md) — dynamic workflows and scope boundaries.

## FP techniques for AI-written code

- [`fp-for-deterministic-ai.md`](fp-for-deterministic-ai.md) — pure functions, exhaustive matches, Result types.
- [`fp-for-agent-harness.md`](fp-for-agent-harness.md) — Railway / algebraic-effect structure for hooks and the tool-use loop.

## Adoption, distribution & ideas

- [`adoption-direction.md`](adoption-direction.md) — **THE committed adoption direction (2026-07-15).** Supersedes the spec-first framing: `audit` is the front door, the hand-edited markdown is the source of truth, code-quality rules are enforced in the repo's **native** linter config (spec = optional authoring layer for harness-structure only), and **audit-as-score** is the adoption vehicle. Includes the reconciliation ledger of every doc still asserting the old framing. Read this before building any adoption/spec/adopt feature.
- [`adoption-strategy.md`](adoption-strategy.md) — zero-config setup, progressive enforcement, agent workflows.
- [`adoption-gateway-preview.md`](adoption-gateway-preview.md) — **"what would vigiles catch in YOUR repo?"** — the `audit` adoption preview. Why deterministic spec-creation fails (extraction is semantic), and the architecture that works: **LLM proposes, deterministic disposes** — the model drafts the spec, the moat verifies the refs, so the "M broken right now" number is trustworthy though extraction is probabilistic. A model-gated tier behind the existing consent.
- [`feature-ideas.md`](feature-ideas.md) — the parked-ideas list (custom-rule plugin API, reverse coverage, sandboxed exec §13, …).
- [`architecture-platform.md`](architecture-platform.md) — architecture-aware agent platform (FSD/DDD/hexagonal presets).
- [`ai-code-quality.md`](ai-code-quality.md) — AI code-quality patterns.
- [`code-search-for-agents.md`](code-search-for-agents.md) — code-search approaches (grep vs embeddings vs AST-grep).

## Adjacent-market analysis (2026-06)

Technical assessments of adjacent markets — what to extend, delegate, or reject.
(Business/competitive STRATEGY lives in the private `startup/` vault, not here.)

- [`agent-supply-chain-security.md`](agent-supply-chain-security.md) — plugin/MCP supply-chain security; build a thin harness-aware `scan`, reject the security-vendor pivot.
- [`standards-conformance.md`](standards-conformance.md) — AGENTS.md/SKILL.md/MCP standardization; extend pillar 1 to be format-neutral, reject the generic-linter pivot.
- [`runtime-guardrails-observability.md`](runtime-guardrails-observability.md) — guardrails + OTel-GenAI; stay out of the request path, take the OTel-emit / verify-trace / Cedar-codegen bridges.
- [`ai-native-linting.md`](ai-native-linting.md) — the AI-reviewer wave; extend `enforce()` to AI-linter catalogs, prototype a falsifiable `judge()` rule, reject becoming a reviewer.
- [`sdk-harness-testing.md`](sdk-harness-testing.md) — do code-defined agent SDKs lack a deterministic test tier? No — first-party SDK mocks already cover it.
- [`sandbox-network.md`](sandbox-network.md) — the resolver-pinned dynamic-allowlist layer for sandbox egress.
- [`egress-sandbox-tooling.md`](egress-sandbox-tooling.md) — build-vs-adopt for the rootless egress connector: **swap slirp4netns → pasta (passt)** (Podman's default; doesn't need the tun tap-attach that fails on GH-hosted runners); nsjail/firejail/gVisor/Landlock assessed and rejected; how others pass egress tests in CI.
- [`readme-revamp-concepts.md`](readme-revamp-concepts.md) — five whole-README revamp directions (the post-`audit` cohesion problem), the decision (**Concept 5, proof/demo-led**), and the dogfood proof inventory (real `audit` catches on SHA-pinned upstream plugins) that backs it.
- [`audit-adoption-ux.md`](audit-adoption-ux.md) — how the audit report creates specs: the browser-can't-write constraint, why the default CREATES specs (not previews/stash), and the command-emission bridge (the report emits `vigiles init` / `init --target=`, the CLI writes). Backs the shipped skill/subagent adoption.
- [`audit-serve-design.md`](audit-serve-design.md) — the `vigiles audit --serve` one-click-local adoption server: why it's opt-in, the Jupyter-grade security model (token + Origin + allowlist + own-repo), and the prior-art survey (Jupyter/Prisma/Nx/Dependabot).
- [`oss-audit-render-findings.md`](oss-audit-render-findings.md) — what `audit` actually catches in the wild: official plugins are clean (0/39 graded), reference issues are rare even in community OSS (the richest real catch is claude-flow's 45 description overlaps → Triggering F), and why (deep cross-ref needs adopt+strengthen). Grounds the demo + positioning honesty.
- [`audit-eval-thickening-and-gate.md`](audit-eval-thickening-and-gate.md) — the 2026-06-28 session record: audit's behavioral tier went from one eval to three (fire/collide/hold); the **adversarial-gate eval** (shipped, skill-gate half) design + LIVE findings (hold/cave is stochastic → 3 trials; the eval→enforce bridge; the hook-gate half deferred for an awake greenlight); the **benchmark-corpus headroom constraint** (compression-calibrated → correctness-lift needs harder tasks); plus the audit competitive ranking (B+) and idea backlog. Also: model auth WORKS in the CC-web sandbox (corrects the old "env-blocked" note).
