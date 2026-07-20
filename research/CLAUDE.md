<!-- vigiles:sha256:6bba84de339e36d2 compiled from research/CLAUDE.md.spec.ts -->

# CLAUDE.md

## Scope

The `research/` corpus is the INTERNAL record (design rationale, competitive analysis, the moat/positioning narrative) — tier 2 in the doc-tiers rule, NEVER linked from public docs. This file is its INDEX. Each doc carries `status:`/`topic:` frontmatter: STATUS is one of `active` (current thinking), `shipped` (built — the doc is the design record), `idea` (proposed, not built), `superseded` (replaced — see the newer doc), `rejected` (decided against). TOPIC groups by area (spec, hooks, eval, testing, adapters, audit, compiler, sandbox, linters, positioning, roadmap, proofs, skills, security, docs, benchmark, misc). Query the corpus deterministically: `grep -l 'status: shipped' research/*.md`, `grep -l 'topic: eval' research/*.md`. READ-FIRST keystones: `roadmap.md` (the front door) and `harness-state-space.md` (the organizing thesis). The ROOT `CLAUDE.md` keyFiles map the CODE; this maps the RESEARCH.

### Canonical answers — question → the ONE doc (do NOT re-derive; these recur + get mis-stated)

- "How much of a real CLAUDE.md/AGENTS.md can vigiles enforce? is a rule with NO off-the-shelf linter rule still enforceable?" → `rule-enforceability.md` (~65% mechanizable; **no off-the-shelf rule ≠ not enforceable** — custom AST synthesis covers project-specific rules).
- "How does synthesis work — does vigiles run or pay for a model?" → `rule-enforceability.md` + `audit-rule-compile-tier.md` (opt-in copy-prompt → the USER's own sub → deterministic trust-gate; **$0 to vigiles**, it never calls a model).
- "Which linters does prose ROUTING support (ESLint/Ruff/Pylint/Clippy)?" → `rule-enforceability.md` linter-support table (**ESLint + Pylint + Ruff route-only; Clippy = GAP**). NB `docs/linter-support.md` is the DIFFERENT `enforce()` 7-catalog *verification*, not routing.
- "What is `@vigiles/rule-enforcer` vs `vigiles compile`? are they the same?" → `rule-enforceability.md` naming section: **NO** — `rule-enforcer` = the prose→enforceable-rule ENGINE (route/synthesize/gate, dir `rule-enforcer/`); `vigiles compile` = the SPEC compiler (`.spec.ts`→`.md`). Different systems.
- "Why is a rule warn vs error / can't everything be a type?" → `enforcement-model.md` (the severity gradient, decidability buckets A/B/C).
- "What's the committed adoption direction?" → `adoption-direction.md` (audit-first, markdown = source of truth).

## Key Files

- `research/adapter-api-design.md` — [active] Survey of core+adapter packaging patterns (unplugin/Drizzle/AI SDK); verdict for vigiles's subpath-export relayout
- `research/code-adapter-architecture.md` — [shipped] Plan for decoupling vigiles from Claude Code via ports/adapters (format vs runtime axes); import-based harness selection
- `research/codex-prototype-findings.md` — [shipped] Records Codex adapter validation; transport tier proven against real codex binary, shipped as vigiles/codex
- `research/harness-capabilities.md` — [active] Exhaustive Claude Code vs Codex capability inventory stating vigiles's verify/test/record-only/n-a stance per capability
- `research/harness-landscape.md` — [active] Mid-2026 research into Codex internals unblocking the hook-protocol and model-mock adapter ports for the Codex adapter
- `research/multi-harness-compile.md` — [active] How vigiles compiles/verifies a repo targeting multiple harnesses (CC+Codex) per-surface
- `research/opencode-prototype-findings.md` — [shipped] OpenCode adapter prototype validates the AdapterCapabilities tier (mockable, no shell hooks)
- `research/adoption-direction.md` — [active] THE committed adoption direction (2026-07-15, supersedes spec-first): audit is the front door; markdown is source of truth; code-quality rules enforced in NATIVE linter config, typed spec = optional authoring layer for harness-structure only; audit-as-score is the vehicle. Includes the reconciliation ledger of docs still asserting the old framing.
- `research/adoption-gateway-preview.md` — [idea] Proposes an audit preview showing newcomers what vigiles would catch; extraction=LLM, verification=deterministic moat
- `research/audit-rule-compile-tier.md` — [shipped] Design spec for the audit rule-compile tier: the deterministic rule-inventory teaser (prose→off-the-shelf-rule + config-state) and the opt-in model-gated compile path — makes CLAUDE.md rules real from the report
- `research/audit-adoption-ux.md` — [shipped] Design record for how audit report drives spec creation (init flow); default creates specs, no browser file writes
- `research/audit-eval-thickening-and-gate.md` — [shipped] Records audit's behavioral tier expanding to three evals (fire/collide/hold) plus the adversarial-gate eval build
- `research/audit-lighthouse-design.md` — [shipped] Locked design for vigiles audit as "Lighthouse for your harness" — rings, HTML report, battery, --deep tier
- `research/audit-serve-design.md` — [idea] Design for an opt-in audit --serve local server enabling one-click spec creation from the HTML report
- `research/audit-wow-ideas.md` — [active] Research on what audit findings create genuine "wow" tension beyond saturated markdown-linter checks
- `research/haretrail-eval-ideas.md` — [idea] Captures new deterministic audit checks and eval ideas found while dogfooding audit on the haretrail Codex skills repo; not yet built
- `research/harness-checkup-and-lanes.md` — [active] Decision record for the "Lighthouse for your harness" zero-config audit funnel vs authored tests/evals lanes
- `research/oss-audit-render-findings.md` — [active] Rendering the audit report + hunting ~170 OSS plugins for graded issues; official plugins are clean
- `research/oss-pr-drafts.md` — [idea] Ready-to-file OSS issue/PR drafts for real bugs vigiles scan found in third-party plugins
- `research/plugin-structural-findings.md` — [active] Live log of deterministic scan across ~650 plugin entries; mostly clean, some scanner FPs fixed
- `research/scan-lint-unification.md` — [idea] Proposal to unify scan and lint into one shared rule engine with two frontends (ESLint-style), not yet built
- `research/benchmark-methodology.md` — [active] Defines the A/B-over-real-task method behind vigiles's "what actually works" measurement claims
- `research/dogfood-corpus.md` — [active] The dogfood-corpus index + vendoring policy (SHA-pin/MIT-only/provenance/CI-enforced): maps every dogfood artifact → is-it-CI-enforced → by-what
- `research/benchmarks-runtime-gates.md` — [rejected] Empirical finding that runtime enforcement gates don't improve capable-agent behavior; redirected focus to verification
- `research/rule-enforcer-design.md` — [active] Rule-enforcer DESIGN-OF-RECORD (the crisp front door) — STATUS: ALPHA. The multi-linter model (enumerate each linter → merge → per-linter provenance; FROZEN at 2, ESLint+Pylint), the undecidable rule-vs-not-rule problem (heuristic segmenter, precision-first), the pipeline diagram + the rescue-ladder / no-signal-fold decisions + the category↔lane↔glyph (LANE_META) table, all shipped 2026-07-15. §8 is load-bearing: the SCOPE-FREEZE + BALANCE (feasibility/skill-quality/token-cost/human-in-loop/codebase-research) + MARKED backlog (broaden dogfood #1, Ruff, recall tuning, …) — READ IT before "improving" the map (tuning is infinite); default answer is NO unless corpus-breadth or a measured win. §9 answers the OSS-e2e/LLM-in-CI question: the MAP is model-free → CI-dogfooded on real OSS today (rule-routing-oss/rule-catalog-oss); only synthesis/behavioral tiers are model-gated → on-sub + manual, never CI. Points to the two build-logs below
- `research/compiler-end-to-end-flow.md` — [design] End-to-end rule-enforcer flow (prose rule → enforced, at scale): segment → classify → reuse/synthesize/hook/prose route, blind adversarial gate, suppressions ratchet, harvest-at-scale — the @vigiles/rule-enforcer opt-in tier design of record
- `research/rule-enforcer-multilang-design.md` — [active] Multi-language (Ruff+Pylint) design for the rule-compile tier + a segmentation model, grounded in a 20-repo OSS corpus: Intent→Realization data model, per-linter ConfigProbe port (ruff select-replaces-default, pylint inverted polarity), both-keys language scoping, intent-verdict fold (ruff-absorbs-pylint is not a contradiction), the segmentation tier-ladder + reject-first negative signals; AGENTS.md is the #1 code-norm carrier, CLAUDE.md a redirect stub
- `research/adoption-strategy.md` — [superseded] Early adoption-wizard design (vigiles setup, adoption levels); superseded by later init/setup-plan mechanics
- `research/install-enforcement-dx.md` — [shipped] Design record for vigiles init's rule-group enforcement model (structural/workflow/nudge), landscape-grounded in Clippy/Biome/Ruff conventions
- `research/readme-revamp-concepts.md` — [idea] Five distinct whole-README redesign concepts/positioning options to resolve audit-vs-instruments front-door tension
- `research/cache-invalidation.md` — [shipped] Research behind the eval CACHE (local speed) vs eval LOCK (CI staleness) mechanisms, grounded in Bazel/Turborepo/ccache practice
- `research/covering-arrays-for-harness.md` — [idea] Pairwise/covering-array sampling over typed spec config space for interaction-testing evals
- `research/eval-api-landscape.md` — [active] vigiles's eval API vs promptfoo/DeepEval/Inspect; fidelity (real harness) is the differentiator
- `research/eval-coverage-and-isolation.md` — [active] The R1/R2/R3 rung model: what vigiles tests deterministically vs via containers
- `research/eval-architecture.md` — [shipped] The eval system design-of-record: the two testing verbs reconciled with what ships, the cost model, the eval lock, model strategy, and the ranked build roadmap
- `research/r3-disposable-services.md` — [idea] Build spec for the R3 disposable-service tier (real side-effect testing) — the experimental vigiles/experimental surface + ContainerRuntime port, composing sandbox.ts/egress.ts
- `research/isolated-vs-whole-harness-eval.md` — [active] Eval skills both isolated (cheap loop) and whole-harness (release gate); isolated-only overstates recall
- `research/plugin-behavioral-findings.md` — [active] Live log of measureTriggerRate findings on popular plugins (superpowers under-triggers; haretrail refuted)
- `research/plugin-selection-collision.md` — [active] Design + findings for measuring cross-skill selection collisions (does A hijack B's prompt)
- `research/promptfoo-deep-dive.md` — [active] promptfoo's 2026 agentic pivot vs vigiles's harness-arm A/B + sub-affordability differentiation
- `research/skill-eval-landscape.md` — [active] Scores AWS sample-agent-skill-eval framework against vigiles's eval pillar; also frames token-compression tools as runEval use case
- `research/agent-context-delivery.md` — [shipped] Verified answer: plugins deliver context via skills+hooks (SessionStart/PostToolUse inject), never by editing user's CLAUDE.md
- `research/agent-integration.md` — [idea] Proposes deterministic backstops (hooks/proofs/static checks) anchored on the spec to catch AI agent failure modes
- `research/compiled-hooks-codex.md` — [shipped] Compiled-hooks Codex TOML emit + shared exit-2 gate runtime, built and confirmed for inject
- `research/fp-for-agent-harness.md` — [idea] Proposes applying Railway/effect-system FP structure to Claude Code's skills, hooks, and tool-use loop; ideas marked NOT BUILT
- `research/harness-protocol-flow-moat.md` — [idea] Proposes typing the harness's dynamic structure (ORDER/FLOW/REPLAY via session types, IFC, linear types) beyond static capability sets
- `research/hook-context-providers.md` — [shipped] Design for how compiled hooks read external state (git branch etc.) via declared context providers without breaking capability=API-surface; v1+v2 shipped
- `research/hook-modes-and-testing.md` — [shipped] Landscape analysis of hook modes/testing vs OPA/Guardrails/NeMo; documents shipped observe-mode, prompt/stop gates, and react response
- `research/hook-oss-comparison.md` — [shipped] CI-verified head-to-head proving compiled hooks close evasion/precision/protocol/capability gaps vs hand-written OSS hook guards
- `research/hook-pain-points.md` — [shipped] Verified failure corpus (exit-1-vs-2, silent config failures) grounding the shipped guardrail-check and compiled-hooks features
- `research/runtime-enforcement.md` — [shipped] Three-layer runtime enforcement design (passive audit, hook-based PreToolUse policy, skill contracts) — now built as hooks
- `research/side-effect-separation.md` — [shipped] Research showing PreToolUse capability-gate + declared effect boundary robustly separates pure/side-effecting skill code
- `research/ai-native-linting.md` — [active] Surveys the 2026 AI-code-review wave (CodeRabbit etc.) and proposes extending enforce() to AI-linter catalogs plus a judge() rule kind
- `research/deterministic-rule-ideas.md` — [idea] Backlog of next cross-reference lint rules from the OSS plugin sweep
- `research/enforcement-model.md` — [active] Why rule severity follows a gradient bounded by decidability
- `research/rule-enforceability.md` — [active] THE cohesive answer to "how much of a real user CLAUDE.md/AGENTS.md can vigiles enforce, and how" — the 4 enforcement homes (off-the-shelf config / synthesized custom / ref-verification / prose), the measured real-OSS distribution (~65% mechanizable, off-the-shelf ≠ enforceable-ceiling), how synthesis works (opt-in copy-prompt → user's sub → deterministic gate, $0 to vigiles), the AST-not-regex soundness rule, and linter support (eslint/ruff/pylint/clippy-gap). Read this to stop re-deriving it. Distinct from enforcement-model.md (severity gradient of vigiles's OWN checks).
- `research/code-search-for-agents.md` — [active] Compares grep/AST/embeddings/LSP/graph-DB code search approaches for AI coding agents
- `research/scoped-session-github-access.md` — [active] What a Claude-Code web session can reach on GitHub (token-bound proxy blocks cross-repo search) + the proven in-session sourcegraph+raw discovery workaround
- `research/fp-for-deterministic-ai.md` — [idea] Surveys FP techniques (Result types, exhaustive matching, property testing) for AI-written code; proposes 10 vigiles features
- `research/ai-code-quality.md` — [active] Collected empirical data (CodeRabbit, ETH Zurich, GitGuardian) on AI code-quality failure modes that shaped vigiles v2
- `research/competitive-landscape.md` — [active] Catalogs 20+ competing tools across linters, staleness detectors, rule-sync, and runtime policy engines
- `research/competitor-rule-matrix.md` — [active] Matrix comparing vigiles's rules against agnix/claudelint/claude-plugin-validate/eval tools; vigiles alone on cross-referencing
- `research/dynamic-workflows-and-scope.md` — [active] vigiles skills (authored, reusable) distinct from Anthropic's ephemeral generated dynamic workflows
- `research/instruction-file-linter-landscape.md` — [active] 2025-26 CLAUDE.md/AGENTS.md linters are now a crowded "validate" category, not an empty niche
- `research/landscape-mid-2026.md` — [active] Deep dives on ContextCov, Harness Engineering, AgentProof, Bedrock+Cedar, Compiled AI + next steps
- `research/oss-lane-sweep-2026-06.md` — [active] GitHub/npm/PyPI sweep: vigiles's cross-ref/harness-testing/trigger-eval lanes are unoccupied
- `research/positioning-funnel.md` — [active] Moat is the category + distribution, not individual checks; axes as funnel stages, leaderboard wedge
- `research/reference-verification-limits.md` — [active] Synthesis of what reference verification can/can't do deterministically: proxy-vs-judgment gap, prose undecidability, delegate rule
- `research/standards-conformance.md` — [active] Assesses AGENTS.md/SKILL.md/MCP standardization wave; recommends extending format-neutral reference verification, not pivoting
- `research/strategy-verdict.md` — [superseded] Ranked verdict for viral leaderboard + zero-config installer + cross-harness testing moat; superseded by a later strategy synthesis
- `research/sync-landscape-analysis.md` — [active] Per-tool breakdown of Ruler/ai-rulez/etc, deciding what to absorb vs delegate vs skip
- `research/sync-tool-compatibility.md` — [shipped] Verified Ruler/rulesync formats and the compatibility contract vigiles holds via src/core/compose.ts
- `research/zero-config-mother-harness.md` — [active] Argues vigiles should be a persistent verifier (not a scaffolder) composing a curated bundle
- `research/agentic-harness-evolution-poach.md` — [idea] Poaches ideas from an academic "Agentic Harness Engineering" paper for vigiles's optimize/measure/evolve roadmap line
- `research/formal-proofs-for-agents.md` — [idea] Surveys Lean/Coq/Dafny/F*; recommends narrowly shipping a dafny() enforce target, not full evolution-engine proof gating
- `research/self-evolving-specs.md` — [shipped] Design for self-evolving specs: LLM proposes mutations, deterministic proof suite (monotonicity, NCD, fixed-point) disposes
- `research/architecture-platform.md` — [rejected] Vision for vigiles-as-architecture-platform (FSD/DDD presets); superseded/rejected direction vs current scope
- `research/feature-ideas.md` — [active] Detailed catalog of 14 pillar-1 verification feature ideas mapping FP/CS techniques to product features; status tracked in roadmap.md
- `research/feature-index.md` — [active] The CAPABILITY map (what vigiles can DO, per feature) vs the root keyFiles CODE map: every feature → one-line what-it-does → status (✅shipped/🟡partial/🧪experimental/⬜unbuilt) → entry point (CLI verb/API/skill/file), grouped by the four instruments (VERIFY/GATE/MEASURE/OBSERVE) + cross-cutting layers (typed-spec authoring, multi-harness, skills, CLI/GHA). The internal feature index that was missing
- `research/handoff-pr40.md` — [active] Handoff record for open PR #40 shipping the OSS-bug-adoption deterministic rule suite (tool-contract, mcp, frontmatter rules) and scanner
- `research/harness-state-space.md` — [active] States the "minimize harness state-space" organizing thesis (construct/verify/gate/test) and ranks moat-hunting bets via analogical transfer
- `research/pre-release-focus.md` — [active] Pre-launch triage: freeze VERIFY+MEASURE as the two public pillars, park/polish the rest
- `research/roadmap.md` — [active] Consolidated front-door roadmap ranking all open items Now/Next/Later/Backlog/Explore/Rejected across the project
- `research/harness-observability-direction.md` — [active] Tech direction of record: the four-instrument loop (verify/gate/measure/observe), the deterministic-vs-behavioral precision principle, the local agent-readable runs.jsonl flight-recorder ledger, promote-prose, and the per-surface map
- `research/bash-effect-classification.md` — [shipped] Design for the deterministic (no-LLM) Bash command effect classifier — decidable read-only subset, fail-closed residue
- `research/cross-platform-sandboxing.md` — [active] bwrap (Linux) + sandbox-exec (macOS) native backends behind one os-isolation port
- `research/egress-sandbox-tooling.md` — [active] Recommends swapping slirp4netns for pasta to fix egress-sandbox CI failures on GH runners
- `research/os-isolation-port.md` — [idea] Design-of-record for a vigiles/os-isolation port (bwrap/nft vs sandbox-exec), not yet implemented
- `research/sandbox-network.md` — [shipped] Sandbox egress design: deny-all → recordEgress → allowlisted real egress via slirp4netns/nft — all three shipped
- `research/agent-supply-chain-security.md` — [active] Assesses plugin/MCP supply-chain risk landscape; recommends a thin vigiles-specific security scan, not a generic scanner
- `research/plugin-capability-governance.md` — [active] Landscape of plugin capability governance (mid-2026): the DECLARE-manifest gap (MCP hints unenforced, CC subagent tools:/#4740/#172 not enforced) + org-imposed policy prior art (Chrome runtime_blocked_hosts, K8s admission control, Cedar) + funded MCP-gateway market + the RUNTIME-POLICY gap adjacent to vigiles's tool-contract/purity/compiled-hook primitives
- `research/runtime-guardrails-observability.md` — [rejected] Evaluates online guardrails/observability markets; verdict: stay out except one OTel-GenAI emission bridge
- `research/skill-as-pipeline.md` — [idea] Design capture modeling a skill as Guidance-or-Pipeline control-flow graph with deterministic harness-owned gates
- `research/skill-authoring-pains.md` — [active] Research on real-world SKILL.md authoring pain points: triggering non-determinism, frontmatter pitfalls, volume tradeoffs
- `research/effect-boundary-design.md` — [superseded] effect() region marker; sub-region boundary dropped for purity floor + SubagentStop tracking
- `research/end-to-end-walkthrough.md` — [idea] A release skill's journey from prose through typed contract, boundary, compile, gate, measurement
- `research/enforce-over-guidance.md` — [idea] Deterministic gates (snapshot-gated downgrades, Merkle diff) to pressure guidance() toward enforce()
- `research/executable-specs.md` — [shipped] Original v2 design doc for the spec.ts→markdown compilation model now built as vigiles's core architecture
- `research/lightweight-spec-authoring.md` — [active] Sweep of 16 real instruction files: current claude() spec is too heavy; value is composition/templates
- `research/railway-subagents.md` — [active] Railway-orchestration design over flat subagents: Temporal analogy, marks vs typed workflow() vs driver options
- `research/shareable-presets.md` — [idea] Design sketch for publishable npm-package typed presets that other repos extend, bundling rules + evals
- `research/composable-instruction-files.md` — [active] Mid-2026 survey of composable/modular instruction files: only Claude Code + Gemini CLI have true @import; AGENTS.md standard has no imports (open proposal); demand real+dated (openai/codex#17401); the unmet gap is multi-repo registry-distributed versioned rule packages; maps onto vigiles's preset()/extends() + compose.ts
- `research/spec-api-design.md` — [active] Best-practice synthesis for spec.ts API: doc()/section() split, preset()/extends() merge model, strict-typing upgrades
- `research/spec-syntax-and-railway-scope.md` — [shipped] Settles two decisions: railway/Result is subagent-only (not skills), and the plain-object+helpers spec syntax is correct as-is
- `research/spec-value-model.md` — [active] Reference answer for when a typed .spec.ts earns its keep per capability (lint/test/eval/whole-harness typing) vs plain markdown
- `research/subagent-compilation.md` — [shipped] Why/how vigiles compiles typed subagent specs to agents/*.md with tool-contract enforcement via PreToolUse hook
- `research/symbol-verification.md` — [shipped] Design for vigiles:symbol path#name marks verified against ast-grep-extracted symbols, enforced by refs-hook
- `research/typed-claude-md-poach.md` — [active] Catalogs mechanics to steal from Mastra/LangGraph/Pydantic AI for a typed CLAUDE.md's compile-time + runtime moat
- `research/typed-contracts-for-agents.md` — [active] Argues specs' purpose under measurement-authority is making skills/agents testable via Result/railway contracts
- `research/typed-spec-effects-monads.md` — [active] Round-2 research on algebraic effect rows/handlers as a generalization of the pure/bounded/unrestricted purity ladder
- `research/typed-spec-formal-verification.md` — [shipped] Model-checking research that found and fixed a real nesting contract-escape bug in agent-runtime.ts's stack
- `research/typed-spec-fp-theory.md` — [active] Round-3 theorem: typed pipeline effect analyzability holds only while composition stays selective-applicative, not monadic
- `research/typed-spec-frontier.md` — [active] Round-1.5 PL-theory transfer survey ranking compile-time vs runtime vs hyperproperty (A/B eval) placements
- `research/typed-spec-power.md` — [shipped] Ranks non-replicable wins of typed .spec.ts over markdown; typed handoff composition and typed purity, both now shipped
- `research/typed-spec-refinement-types.md` — [active] Round-2 taxonomy of refinement/dependent/session types, sorting properties into TS-encodable vs runtime-guard vs impossible
- `research/whole-harness-codegen.md` — [shipped] Design+prototype for a generated whole-repo registry giving tsc cross-spec checks (dangling delegate, duplicate name, handoff)
- `research/harness-testing-coverage-matrix.md` — [active] Gap-analysis matrix of unit/integration/eval test coverage across every harness surface, prioritizing what to build next
- `research/harness-testing.md` — [shipped] Design doc for the three-tier harness testing pyramid (runHook/runHarnessTest/runEval); explicitly marked "Status: shipped"
- `research/sdk-harness-testing.md` — [rejected] Investigates retargeting pillar-2 testing at code-defined agent SDKs; verdict: gap already closed, don't retarget
- `research/testing-api-design.md` — [shipped] Proposes the unified Trace + declarative check vocabulary + strict/scored evaluators design, now built
- `research/testing-nondeterministic-ai.md` — [active] Surveys how the field tests non-deterministic agents (trace-centric, deterministic-first) and implications for vigiles

## Rules

### Keep Research Index Synced

**Guidance only** — Every `research/*.md` (except `README.md`) MUST have a `keyFiles` entry in this spec AND `status:`/`topic:` frontmatter. When you add a research doc, add its line here (topic-grouped, one-line summary prefixed with its `[status]`) and give it frontmatter; when you rename/delete one, update this spec (the compiler verifies each path exists, so a stale entry fails `vigiles compile`). The `research-index-complete` dogfood test asserts the docs↔index set match. This is the `research/` analog of the root keyFiles map — the index is only useful if it stays complete.
