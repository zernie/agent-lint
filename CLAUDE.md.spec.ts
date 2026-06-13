/**
 * CLAUDE.md specification for the vigiles project.
 *
 * This is the source of truth. CLAUDE.md is a compiled build artifact.
 * Run `npm run compile:spec` to regenerate CLAUDE.md from this spec.
 */
import { claude, enforce, guidance, guard } from "./src/spec.js";

export default claude({
  sections: {
    positioning: `vigiles verifies the rule references in agent instruction files — that each linter rule exists AND is enabled, that file paths and scripts are real. It is markdown-first: meet the user at three commitment levels — inline \`<!-- vigiles:enforce -->\` comments (Level 0), a \`vigiles:\` YAML frontmatter block (Level 1), or a typed \`.spec.ts\` compiled to markdown (Level 2). Markdown is the on-ramp; the typed spec is the source of truth when you want compiler-grade guarantees, and the markdown becomes a build artifact. Nobody else does this — other tools lint markdown after the fact. vigiles eliminates the problem at the source. See \`docs/markdown-mode.md\` for the level ladder.

Positioned in the harness engineering frame coined early 2026: Agent = Model + Harness. The harness has two enforcement modes — probabilistic compliance (prompts, instructions) and deterministic constraints (linters, types, hooks). vigiles is the deterministic-constraints layer for instruction files. See \`research/landscape-mid-2026.md\` for the full positioning.

The cross-referencing engine is the core moat: \`enforce("@typescript-eslint/no-floating-promises")\` verifies the rule exists AND is enabled in your linter config. Same for ESLint, Ruff, Clippy, Pylint, RuboCop, Stylelint, and Cedar policies (for AWS Bedrock AgentCore and other Cedar-using runtimes). No other tool resolves rules across 7 catalog APIs.

Authoring-time feedback comes two ways: \`generate-types\` emits a \`.d.ts\` so the TS compiler PROVES \`.spec.ts\` references at edit time, and \`generate-schema\` emits a JSON Schema so a YAML LSP autocompletes and squiggles \`vigiles:\` frontmatter rule names — same guarantee, no TypeScript required. Both scan all 7 catalog APIs, package.json, and project files.

Second pillar — testing the harness. Beyond verifying instruction files, vigiles tests the harness itself (hooks, settings, skills) as an assembled machine, not one hook at a time: \`runHarnessTest\`/\`runEval\` take a \`plugin\` path that loads the real harness (hooks with \`\${CLAUDE_PLUGIN_ROOT}\` resolved, CLAUDE.md, skills) from \`.claude-plugin/plugin.json\` or \`.claude/settings.json\` (\`src/plugin-loader.ts\`), so you test what ships. Three tiers, lowest cost first: \`runHook\` pipes a synthesized event JSON straight to a hook process (no \`claude\`, no model) and checks the block/allow decision — the cheap base of the pyramid, and the only tier that reaches every event incl. Edit/Write, PreCompact, Notification, SessionEnd, SubagentStop (\`src/run-hook.ts\`); \`runHarnessTest\` runs the real \`claude\` CLI against a scripted mock model for deterministic, key-free checks that a hook is wired into the assembled machine and fires (\`src/harness-test.ts\`, \`src/mock-model.ts\`); and \`runEval\` drives the real model across A/B arms × trials, aggregating mean ± se so a gap can be read for significance (\`src/eval.ts\`). The loader materializes hooks, CLAUDE.md, skills, subagents and commands, and flags via \`loadPlugin().warnings\` any surface only a real model can drive — so loading a whole plugin never silently tests an empty machine. The API is runner-agnostic (node:test, vitest, jest) via plain async functions plus helpers/matchers in \`src/harness-assert.ts\` and an optional LLM-as-judge in \`src/judge.ts\`; a zero-dep CLI fallback runs them as \`vigiles test\` (\`*.harness.mjs\`) and \`vigiles eval\` (\`*.eval.mjs\`), with canonical examples under \`examples/harness/\`. Unlike reference verification (bounded by undecidability), this pillar has no ceiling: a test measures reality, so there is nothing to game. See \`docs/harness-testing.md\` and \`research/harness-testing.md\`.

vigiles does NOT do architectural linting. Use ast-grep, Dependency Cruiser, Steiger, or eslint-plugin-boundaries for that. vigiles can reference their rules via \`enforce()\`.`,

    architecture: `Three rule types in specs:

- \`enforce()\` — delegated to external tool (linter, ast-grep, dependency-cruiser). vigiles verifies the rule exists and is enabled.
- \`guard()\` — a path→command guard (e.g. \`*.spec.ts\` → \`npx vigiles compile\`), compiles to \`**Guard:**\` and wires spec-driven automation into hook engines.
- \`guidance()\` — prose only, compiles to \`**Guidance only**\` in markdown.

Architectural linting (file pairing, import boundaries, AST patterns) belongs in external tools — reference them via \`enforce()\`.

Template literal types ensure linter names (\`eslint/\`, \`ruff/\`, etc.) are type-safe. Branded types (\`VerifiedPath\`, \`VerifiedCmd\`, \`VerifiedRef\`) distinguish verified references from raw strings.

Compilation: spec.ts → compiler reads spec, validates references (file paths via existsSync, npm scripts via package.json, linter rules via linter APIs), generates markdown with SHA-256 integrity hash.

Core modules: \`src/spec.ts\` (types + builders), \`src/compile.ts\` (compiler), \`src/linters.ts\` (7-catalog cross-referencing engine), \`src/generate-types.ts\` (type generator), \`src/proofs.ts\` (proof algorithms for self-evolving specs), \`src/evolve.ts\` (evolution engine).`,
  },

  keyFiles: {
    "src/spec.ts":
      "Type system and builder functions (enforce, guidance, claude, skill, agent, file, cmd, ref; result/railway/delegate for railway-oriented subagents)",
    "src/compile.ts":
      "Compiler: spec → markdown with SHA-256 hash, linter verification, reference validation; compileClaude/compileSkill/compileAgent (subagents: frontmatter + verified tool contract + body marks + result-contract Output section) + compileRailway/validateRailway (orchestrator command over flat workers; delegate-target resolution + bounded recovery)",
    "src/linters.ts":
      "Cross-referencing engine (ESLint, Stylelint, Ruff, Clippy, Pylint, RuboCop, Cedar)",
    "src/cedar.test.ts":
      "Cedar policy resolution tests — filesystem-based @id() lookup with filename fallback",
    "src/generate-types.ts":
      "Type generator: scans linters/package.json/filesystem → emits .d.ts",
    "src/generate-schema.ts":
      "JSON Schema generator: emits .vigiles/schema.json from real linter config so YAML LSP autocompletes frontmatter rule names",
    "src/cli.ts":
      "CLI: init, compile, audit, test, eval (primary commands + generate-types plumbing)",
    "src/run-scripts.ts":
      "Script runner for `vigiles test` / `vigiles eval`: discover `*.harness.mjs` / `*.eval.mjs`, run each as a child node process, aggregate exit codes (CI command, not just `node x.mjs`)",
    "src/run-scripts.test.ts":
      "Script-runner test suite (node:test): discovery, exit-code aggregation, env forwarding, summary formatting",
    "src/inline.ts":
      "Inline-mode parser: `<!-- vigiles:enforce ... -->` comments in markdown for gradual adoption",
    "src/frontmatter.ts":
      "Frontmatter-mode parser: `vigiles: enforce:` YAML frontmatter rules in markdown (Level 1 adoption)",
    "src/frontmatter.test.ts": "Frontmatter parser test suite (node:test)",
    "src/action.ts": "GitHub Action wrapper",
    "src/spec.test.ts": "Spec + compiler test suite (node:test)",
    "src/agent.test.ts":
      "Subagent compilation test suite (node:test): agent() builder + compileAgent — frontmatter, tool-contract verification (built-in/MCP/never-available/did-you-mean), body-ref validation, Rules section, hash, adoptDiff round-trip",
    "src/agent-runtime.ts":
      "Agent PreToolUse tool-contract rail — the differentiator that closes the declared-vs-enforced gap (#54898): tools: is documentation, so a PreToolUse hook (vigiles agent-hook) blocks any tool outside the active subagent's contract. parseAgentTools reads the compiled .md frontmatter (the single source of truth the hook enforces), decidePreToolUse is the pure allow/deny, and .vigiles/active-agent.json tracks the dispatched agent — mirrors the skill Stop-hook (src/skill-runtime.ts)",
    "src/agent-runtime.test.ts":
      "Agent-runtime test suite: pure parse/decide logic, active-agent round-trip, hook ⇄ allowlist agree (the declared contract IS the enforced rail), the real built CLI hook driven deterministically via runHook (the unit tier reaches PreToolUse where a live tool call is flaky), and grounding on the REAL vendored wshobson ui-visual-validator (ships no tools: line → inherits all; the spec adds the rail it omits)",
    "src/agent-result.ts":
      "Railway result parser: a subagent with a result() contract ends its turn with a vigiles:ok/err block; parseAgentResult turns that text into a discriminated outcome (ok | err | malformed) and validates it against the contract shape. Pure text→Result<S,E>, the primitive the orchestrator + the assertAgentOk/Err/Result test helpers both reuse",
    "src/agent-result.test.ts":
      "Railway result-parser test suite: ok/err/malformed tracks, last-block-wins, JSON + shape validation across every field type (string/number/boolean/string[]), both success and error tracks",
    "src/railway.test.ts":
      "Railway surface test suite: result() Output-contract rendering in compileAgent, delegate()/railway() builders, compileRailway orchestrator output, validateRailway static checks (unknown delegate target, empty railway, bounded recovery — the sub-Turing guarantees)",
    "src/validate.test.ts": "Validation test suite (node:test)",
    "src/cli.test.ts": "CLI integration + E2E test suite (node:test)",
    "src/integrity.ts":
      "Integrity check: SHA-256 hash verification for compiled markdown (detects hand-edits)",
    "src/sidecar.ts":
      "Per-spec sidecar manifests at .vigiles/<target>.inputs.json, used by session audit",
    "src/sidecar.test.ts":
      "Tests for sidecar manifests, per-file hashes, and integrity check",
    "src/coverage.ts":
      "Spec coverage analysis: linter rule coverage + npm script coverage with configurable thresholds",
    "src/coverage.test.ts": "Coverage test suite (node:test)",
    "src/session.ts":
      "Post-session audit: git diff analysis against spec surface area",
    "src/session.test.ts": "Session audit test suite (node:test)",
    "src/hash.ts":
      "Shared SHA256Hash branded type and assertNever exhaustive check helper",
    "src/orphans.ts":
      "Orphan-docs detector: finds .md files under docs/ and research/ that no other .md references",
    "src/orphans.test.ts": "Orphan-docs detector test suite (node:test)",
    "src/doc-refs.ts":
      "Markdown code-block ref validator: enforce()/file()/cmd()/ref() calls inside ```ts blocks, with vigiles:ignore opt-out",
    "src/doc-refs.test.ts": "Doc-refs validator test suite (node:test)",
    "src/symbols.ts":
      "Cross-language symbol extractor (ast-grep): defines symbols a file declares (functions/classes/methods/constants) across JS/TS/Python/Ruby/Rust/CSS; fileDefinesSymbol with .d.ts/.rbi fallback",
    "src/symbols.test.ts": "Symbol extractor test suite (node:test)",
    "src/refs.ts":
      "Symbol reference verification: the `vigiles:symbol path#name` mark (verify the named file defines the symbol) + unmarkedCodeRefs enforcement for the refs-hook",
    "src/refs.test.ts": "Symbol reference verification test suite (node:test)",
    "src/mock-model.ts":
      "Scriptable, dependency-free Anthropic Messages SSE mock (startMock/scriptModel) — point real claude at it via ANTHROPIC_BASE_URL for deterministic harness tests; extractRequest + onRequest capture each request into trace.modelRequests",
    "src/harness-test.ts":
      "Deterministic Claude Code harness testing: runHarnessTest runs real claude + real hooks/settings against a scripted mock model (Stop-hooks reliable; tool-event hooks via the eval tier); safe-by-default — an external plugin/pluginDir is confined per src/sandbox.ts",
    "src/harness-test.test.ts":
      "Harness-test suite (node:test, skips without claude)",
    "src/sandbox.ts":
      "Safe-by-default confinement: decideSandbox is the pure policy (untrusted plugin code never runs unconfined unless sandbox:false), runSandboxed co-launches the mock + claude inside one bubblewrap network namespace (loopback-only — mock reachable, egress blocked); specTrusted/bwrapArgs/setenvArgs/parseRequestLog are the pure, tested seams (setenvArgs adds a hook's configured env back after --clearenv, reused by the unit-tier sandbox in run-hook.ts)",
    "src/sandbox.test.ts":
      "Sandbox test suite: pure policy/trust/args/log-parse coverage + a gated end-to-end test proving a sandboxed run blocks network egress while the in-sandbox mock stays reachable (skips without bwrap/claude)",
    "src/mock-entry.ts":
      "In-sandbox mock entry: run as a subprocess inside the bwrap netns so the scripted mock lives on the isolated loopback; streams captured requests to a file the parent reads back for trace.modelRequests",
    "src/run-hook.ts":
      'Hook unit tier: runHook pipes a synthesized event JSON to a hook process (no claude, no model) and reports exit code + normalized block/allow decision — the cheap base of the pyramid, and the only tier that reaches every event (Edit/Write, PreCompact, Notification, SessionEnd, SubagentStop); parseHookOutput/decideHook are the pure, testable decision logic; opt-in sandbox: "auto"/"strict" confines an untrusted hook command under bubblewrap (reusing sandbox.ts) via the injectable runHookWith seam (direct/sandboxed/refuse all unit-tested with fakes); egress: { allow } adds the allowlisted real-egress path (src/egress.ts) for hooks whose setup needs a registry and nothing else',
    "src/run-hook.test.ts":
      "Hook unit-tier test suite (node:test): pure decision logic + real shell hooks across exit codes, stdin event passthrough, env injection, JSON permission decisions, runHookWith sandbox + egress routing (fake spawners) + gated bwrap confinement + a gated egress: { allow } integration (allowed host reached, off-list + raw socket dropped) and the OMC session-start dogfood (reaches the npm registry, drops nothing else)",
    "src/egress.ts":
      "Allowlisted real egress (egress: { allow }): the in-between between deny-all and recordEgress — let a hook reach ONLY the listed hosts, boundary at the packet layer (an nft policy-drop chain on slirp4netns-provided egress, so a raw socket off-list is dropped too, unlike a proxy allowlist). Pure seams: resolveAllow/parseGetent (host→IPs), buildEgressNft (the ruleset), buildEgressBwrapArgv (caps + info-fd + `VIG_*` env), parseNftCounters/countersToResult (read-back → r.egress allowed hosts + r.egressDropped), egressAvailable (bwrap+slirp4netns+nft gate). Resolves to IPs at launch; the resolver-pinned dynamic set is the next layer (research/sandbox-network.md)",
    "src/egress-entry.ts":
      "Allowlisted-egress orchestrator subprocess: runHook is sync (spawnSync) but egress needs bwrap + slirp4netns alive at once, so the parent spawnSyncs this entry — it spawns bwrap (--info-fd → child PID), attaches slirp4netns --configure --ready-fd to that netns, touches netready to release the in-netns wrapper (which loads nft, runs the hook, dumps counters before exit), then writes a result file the parent reads back. v8-ignored; the testable logic is in egress.ts",
    "src/egress.test.ts":
      "Egress allowlist test suite: pure helpers — parseGetent family split, resolveAllow (injected resolver), parseResolvers, buildEgressNft (policy drop, DNS allow, per-host v4/ip6 rules, comment sanitize, log+drop tail), buildEgressBwrapArgv (caps/info-fd/`VIG_*` env/sh -c tail), parseNftCounters (v4+v6 sum, drop aggregate), countersToResult, probeEgressAvailable short-circuit",
    "src/eval.ts":
      "Harness eval API: runEval drives the real claude CLI across arms x trials and aggregates mean ± se (variance) + cost/latency/token usage; bounded concurrency (runPool) + rate-limit backoff + maxCostUsd budget cap; record/replay cache (cache:readwrite) replays runs so editing measure re-scores for free; measureTriggerRate measures how reliably a skill's description FIRES across varied prompts (recall) and — with irrelevantPrompts — its precision (falsePositiveRate + precision, so a too-broad description that hijacks unrelated work fails too); the empirical half of testing your harness (generalizes bench/)",
    "src/eval.test.ts":
      "Eval aggregation/formatting + variance + usage/cache test suite (node:test)",
    "src/eval-cache.ts":
      "Eval record/replay cache: cacheKey hashes the model-affecting inputs (task, resolved files+settings, model, tools, trialIndex) but NOT measure, so re-scoring replays for free; snapshotDir/restoreDir round-trip the post-run filesystem so ctx.file()/ctx.sh() stay sound on replay",
    "src/eval-cache.test.ts":
      "Eval-cache test suite (node:test): key stability/sensitivity, record round-trip + malformed-record tolerance, filesystem snapshot/restore",
    "src/stats.ts":
      "Significance testing for eval A/B arms: Welch's t-test over the per-arm summary stats (mean/se/n, no raw rows) → two-sided p-value + verdict (Numerical-Recipes incomplete beta); compareArms computes the noise floor instead of the assertImproves({by}) hand-fed gap — behind assertSignificant/significantlyBeats",
    "src/stats.test.ts":
      "Stats test suite (node:test): incomplete-beta vs known closed forms, p-values vs t-table critical values, Welch significant/noise/deterministic cases",
    "src/plugin-loader.ts":
      "Plugin/repo harness loader: loadPlugin reads real hooks (inline plugin.json, a hooks string path, the hooks/hooks.json convention e.g. obra/superpowers, or .claude/settings.json) with ${CLAUDE_PLUGIN_ROOT} resolved, plus CLAUDE.md + skills + agents + commands materialized; .warnings flags surfaces the deterministic tier can't drive (subagents/commands/MCP, an empty machine, or dangling intra-plugin file refs e.g. a partial vendor) so a plugin load never silently tests nothing; resolveHarness layers inline settings/files on top so a test/eval runs the assembled machine",
    "src/plugin-loader.test.ts":
      "Plugin-loader test suite (node:test): CLAUDE_PLUGIN_ROOT resolution, CLAUDE.md/skills/agents/commands materialization, surface + empty-machine + MCP warnings, settings merge, in-repo dogfood",
    "src/vendor.test.ts":
      "Conformance suite over REAL vendored plugins under examples/harness/vendor/: model-free, in-gate, table-driven loadPlugin invariants (loads a surface, ${CLAUDE_PLUGIN_ROOT} resolves, skills materialize, surface + dangling-ref warnings accurate) — grounded in reality (pinned by SHA, offline, no API key), the shape that caught the superpowers partial-vendor",
    "src/skills-dogfood.test.ts":
      "Dogfood conformance over vigiles's OWN shipped skills (.claude-plugin/): loadPlugin materializes every skills/<name>/SKILL.md and each has a name + non-empty description (the trigger surface) — the free, model-free floor under the paid trigger-rate eval (a skill that won't load can never fire). Caught a real bug (generate-logo had no frontmatter name). Trigger/precision itself is the eval tier (examples/harness/dogfood/), needs model auth",
    "src/harness-assert.ts":
      "Runner-agnostic harness helpers: withHarness (auto-cleanup), throwing `assert*` helpers incl. assertHookBlocked/assertHookAllowed and assertAgentOk/Err/Result (test a subagent's railway outcome via parseAgentResult — the testing-framework payoff of the result contract), and vigilesMatchers (toHaveCreated/toBlock/toBeatBaseline) for vitest/jest expect.extend",
    "src/harness-assert.test.ts":
      "Harness-assert test suite (node:test): eval delta helpers + matcher pass/fail logic",
    "src/judge.ts":
      "Thin LLM-as-judge for the eval tier: judge() grades an output against a rubric with a model (synchronous, for use inside measure); parseJudgeOutput is the pure, testable verdict parser",
    "src/judge.test.ts":
      "Judge verdict-parsing test suite (node:test): result-field unwrap, prose-wrapped JSON, threshold, clamping, unparseable fallback",
    "src/vitest.mts":
      "Opt-in vitest integration entry (ESM, since vitest is ESM-only): registers vigilesMatchers + augments @vitest/expect Matchers so toHaveCreated/toBeatBaseline type-check; vitest is an optional peer dep",
    "src/jest.ts":
      "Opt-in jest integration entry (CJS): registers vigilesMatchers + augments @jest/expect Matchers; jest is an optional peer dep",
    "test/types/smoke.vitest.ts":
      "Type-level constraint: `vigiles/vitest` makes the matchers type-check on vitest's expect (tsc --noEmit via npm run test:types)",
    "test/types/smoke.jest.ts":
      "Type-level constraint: `vigiles/jest` makes the matchers type-check on jest's expect",
    "test/runners/matchers.vitest.mjs":
      "Cross-runner constraint: vigilesMatchers + helpers register and pass under vitest (proves runner-agnostic; `src/*.test.ts` excluded via vitest.config.mjs)",
    "test/runners/matchers.jest.cjs":
      "Cross-runner constraint: the same vigilesMatchers register and pass under jest (CommonJS dist required natively; scoped via jest.config.cjs)",
    "src/test-utils.ts":
      "Shared test utilities: makeTmpDir, makeSpec, cleanupTmpDir, initGitRepo",
    "src/types.ts":
      "Shared types: RulesConfig, VigilesConfig, FreshnessMode, CoverageThresholds",
    "src/proofs.ts":
      "Deterministic proof algorithms (monotonicity lattice, NCD, Bloom filter, Merkle DAG, fixed-point, property testing)",
    "src/evolve.ts":
      "Evolution engine: mutation operators, fitness function, proof-gated selection",
    "src/proofs.test.ts": "Proof system + evolution engine tests (node:test)",
    "CLAUDE.md.spec.ts": "This file — the source of truth for CLAUDE.md",
    "examples/SKILL.md.spec.ts": "Example SKILL.md spec",
    "examples/railway/ship-pr.md.spec.ts":
      "Dogfood: a railway() over five flat agent() workers (planner→implementer→reviewer, bounded fixer recovery, reporter error track), each with a result() contract. Compiles via the real `vigiles compile` to ship-pr.md (orchestrator command) + one .md per agent (with vigiles:ok/err Output contracts); every delegate() target is resolved against the sibling agent specs at compile time",
    "examples/harness/hook-unit.harness.mjs":
      "Canonical hook unit-tier example (runHook): test a hook's logic in isolation with no claude CLI — the cheap base of the pyramid; runs in CI for free",
    "examples/harness/policy-gate.harness.mjs":
      "Canonical deterministic harness test (runHarnessTest): a PreToolUse Bash policy gate (block-no-verify shape) + a SessionStart setup hook (obra/superpowers shape)",
    "examples/harness/skill-outcome.eval.mjs":
      "Canonical skill-outcome eval (runEval): does a skill change the agent's output? — the question you ask of any SKILL.md",
    "examples/harness/skill-trigger-rate.eval.mjs":
      "Canonical trigger-rate eval (measureTriggerRate): does a skill's description actually FIRE across varied prompts? — installs a real pinned plugin via pluginDir and reuses the skillResolved predicate",
    "examples/harness/dogfood/test-harness.trigger.eval.mjs":
      "Dogfood trigger eval — vigiles's OWN test-harness skill: fires on harness-testing requests (recall) AND stays quiet on unrelated coding (precision via irrelevantPrompts), gated by assertTriggerRate({ min, maxFalsePositive }). One of only 2 model-invocable vigiles skills; the other 7 are disable-model-invocation (user-invoked), covered by the free load gate in src/skills-dogfood.test.ts. Write-don't-run without model auth",
    "examples/harness/dogfood/generate-logo.trigger.eval.mjs":
      "Dogfood trigger eval — vigiles's OWN generate-logo skill (the 2nd model-invocable one): a NARROW skill, so the risk is recall collapse not over-firing; checks both recall + precision against logo vs nearby-asset prompts",
    "examples/harness/skill-compression.eval.mjs":
      "Worked eval verifying a token-compression claim (e.g. Caveman telegraphic style): two arms (verbose/caveman) over one task, measure outputTokens (the optimization target) AND correct (the fact that must survive) — proves the saving is real AND didn't regress behaviour. The on-brand framing for the compression-tool cluster: vigiles measures the claim + the blast radius, it doesn't compress",
    "examples/harness/plugin-cohesion.harness.mjs":
      "Canonical cohesion test (runHarnessTest with plugin:): load a whole plugin (.claude-plugin/plugin.json + CLAUDE.md) and assert multiple hooks fire together",
    "bench/evals/refs-hook.eval.mjs":
      "Worked eval reproducing benchmark #4 (forcing symbol marks → verifiable references?) as a runEval library call",
    "research/adoption-strategy.md":
      "Adoption strategy: zero-config setup, progressive enforcement, agent workflows",
    "research/competitive-landscape.md":
      "Competitive landscape: rule-porter, rulesync, vibe-cli, Ruler",
    "research/executable-specs.md": "Design doc: executable spec system",
    "research/feature-ideas.md":
      "Feature ideas: plugin API, custom rules, exhaustive coverage",
    "research/ai-code-quality.md": "Research: AI code quality patterns",
    "research/self-evolving-specs.md":
      "Design doc: self-evolving spec system (proofs, Merkle history, evolution engine)",
    "research/subagent-compilation.md":
      "Research + roadmap: compiling typed subagent definitions (agent() → agents/<name>.md) — the real Claude Code frontmatter, the declared-vs-enforced gap (tools: is documentation; PreToolUse hook is the rail, issue #54898), the empirical no-iterator survey (~100 subagents), prior-art agent contracts, and the prioritized next layers (generated enforcement hook, handoff resolution, trigger-rate for dispatch)",
    "research/railway-subagents.md":
      "Design exploration: railway-style orchestration over flat subagents — verified plan-as-code as the counterpart to ultra-plan/dynamic-workflows, the Temporal analogy (workflow/activity/gate/durable-state), and three options (manual marks / workflow() TS-spec compilation / a thin Temporal-like deterministic driver over the harness's Task+hooks+state)",
    "research/code-search-for-agents.md":
      "Research: code search approaches (grep vs embeddings vs AST-grep)",
    "research/runtime-enforcement.md":
      "Research: spec-derived runtime enforcement via hooks, skill contracts, session audit",
    "research/agent-integration.md":
      "Research: deterministic backstop for AI agents — hooks, proofs, static checks anchored at the spec",
    "research/fp-for-deterministic-ai.md":
      "Research: FP techniques (pure functions, exhaustive matches, Result types) for AI-written code",
    "research/fp-for-agent-harness.md":
      "Research: Railway/algebraic-effect structure for Claude Code skills, hooks, and tool-use loop",
    "research/architecture-platform.md":
      "Research: architecture-aware agent platform (FSD/DDD/hexagonal presets, meta-validation)",
    "research/formal-proofs-for-agents.md":
      "Research: formal verification via Lean 4 / Dafny, Cedar pattern, Leanstral integration",
    "research/enforce-over-guidance.md":
      "Design doc: deterministic upgrade gates — snapshot-gated downgrades + Merkle diff vs upstream catalog",
    "research/landscape-mid-2026.md":
      "Mid-2026 landscape: ContextCov, Harness Engineering, AgentProof, AWS Bedrock + Cedar, Compiled AI — deep dives and next-step proposals",
    "research/sync-landscape-analysis.md":
      "Rule-sync landscape analysis: per-tool breakdown, what's worth absorbing, block() and domain-preset proposals",
    "research/distribution-strategy.md":
      "Why nobody uses vigiles yet: funnel diagnosis + scan demo proposal as highest-leverage intervention",
    "research/reference-verification-limits.md":
      "Synthesis: the conceptual boundary of reference verification — proxy-vs-judgment gap, prose undecidability (active mark vs passive symbol-table sweep), the doc-format landscape (explicit-link = marking; identity-based = the real fix), and the delegate/ignore/own rule for existing tools (Sphinx etc.)",
    "research/harness-testing.md":
      "Testing the Claude Code harness — the three-tier design (unit runHook + deterministic runHarnessTest + real-model runEval), the assembled-machine plugin loader, and a coverage assessment against real plugins (protect-mcp, obra/superpowers, block-no-verify, wshobson agents/skills)",
    "src/eval-baseline.ts":
      "Eval regression gating (Phase C): record a run's EvalReports to a committed .vigiles/eval-baseline.json, then flag any arm×metric that moved SIGNIFICANTLY in the bad direction vs that baseline — reusing welchTTest from stats.ts (current vs baseline), so sampling noise doesn't trip the gate. Pure diff/serialize/JUnit (toBaselineFile/parseBaselineFile/diffReports/formatBaselineDiff/diffToJUnit) + the readBaseline/writeBaseline fs helpers; behind assertNoRegression",
    "src/eval-baseline.test.ts":
      "Eval-baseline test suite (node:test): baseline round-trip + version/shape validation, regression vs improvement vs unchanged classification, lowerIsBetter direction flip, skip of absent arms/metrics/reports, console + JUnit formatting (counts, failure element, xml escaping), readBaseline null + writeBaseline round-trip",
    "research/eval-api-landscape.md":
      "Eval-API landscape: the LLM/agent eval field (promptfoo, DeepEval, Braintrust, Inspect, LangSmith, OpenAI Evals) summarized then scored against our eval API — strengths (harness A/B arms, pass^k, se/std, unified Trace predicates), gaps (cost/concurrency/caching, significance testing, regression gating), and the B→A→C roadmap (defer D)",
    "research/skill-eval-landscape.md":
      "Agent-skill eval landscape: AWS sample-agent-skill-eval scored against our eval pillar (near 1:1 — validates the bet) with the absorb-list — trigger precision (DONE: irrelevantPrompts → falsePositiveRate/precision), unified A-F scorecard + cost-Pareto (deferred candidates), skill security scan (delegate, don't build); plus the token-compression cluster (RTK/Caveman/Claw/Context-Mode/pinchtab/CodeGraph) framed as a use case for runEval (verify the % claim + the behavioural blast radius), demoed in skill-compression.eval.mjs",
    "research/promptfoo-deep-dive.md":
      "promptfoo deep dive: what it is in 2026 (eval + red-team + guardrails + agent-skills), the agentic update that makes the old scorecard stale (Tier 0/1/2 SDK providers incl. anthropic:claude-agent-sdk, trajectory:\\* + cost/latency assertions), the one axis that still separates us (harness-arm A/B loaded as it ships + the two sub-model tiers + significance/pass^k), and the recommendation (interop bridge via ProviderFunction/AgentRunner, lead with the cheaper tiers + regression gating, ship a vigiles Agent Skill, correct the stale claims)",
    "research/skill-authoring-pains.md":
      "Research: pains authoring agent skills (triggering, drift, testing, distribution) + strategic note on documentation-vs-procedure split and verifying SKILL.md references",
    "docs/harness-testing.md":
      "Harness-testing guide: three layers (verify refs / deterministic / eval), test the whole machine via plugin:, runner-agnostic usage (node:test/vitest/jest) + matchers, variance, LLM-judge, CLI fallback",
    "docs/testing-matrix.md":
      "Testing matrix: every harness-testing use case mapped to its test tier (unit / cross-runner / type / integration-CI) and file, plus why the CLI examples are .mjs and the API is TypeScript",
    "docs/agent-workflows.md":
      "Agent-specific workflows (Claude Code, Codex, multi-agent, Cursor)",
    "docs/agent-setup.md":
      "Non-interactive agent setup guide (hooks via settings.json)",
    "docs/spec-format.md": "Spec format reference (target, sections, rules)",
    "docs/linter-support.md":
      "Linter support details (7 catalogs + generate-types/generate-schema)",
    "docs/comparison.md":
      "Before/after tables (Claude Code, Codex), determinism breakdown, flow diagram",
    "docs/rules/require-spec.md":
      "Rule doc: require .spec.ts for CLAUDE.md/AGENTS.md",
    "docs/rules/require-skill-spec.md":
      "Rule doc: require .spec.ts for SKILL.md files",
    "docs/rules/integrity.md":
      "Rule doc: integrity check (SHA-256 hash verification for compiled markdown)",
    "docs/rules/coverage.md":
      "Rule doc: spec coverage thresholds (scripts, linter rules)",
    "docs/inline-mode.md":
      "Inline mode: `<!-- vigiles:enforce ... -->` comments for gradual adoption without a .spec.ts",
    "docs/markdown-mode.md":
      "Markdown mode: inline `<!-- vigiles:enforce -->` comments (Level 0) and `vigiles:` YAML frontmatter (Level 1) for adoption without a .spec.ts",
    "skills/linter-docs/eslint.md":
      "ESLint reference: plugin table, AST selectors, type-aware rules, auto-fix, edge cases",
    "skills/linter-docs/rubocop.md":
      "RuboCop reference: gem table, node pattern DSL, auto-correct, custom cops",
    "skills/linter-docs/pylint.md":
      "Pylint reference: plugin table, astroid AST, type inference, custom checkers",
    "skills/linter-docs/ruff.md":
      "Ruff reference: 800+ reimplemented rules, rule selection, auto-fix, pyproject.toml config",
    "skills/linter-docs/stylelint.md":
      "Stylelint reference: plugin table, PostCSS AST, custom rules, CSS-in-JS, SCSS",
    "skills/strengthen/SKILL.md":
      "Strengthen skill: upgrade guidance() → enforce() by finding existing linter rules",
  },

  commands: {
    "npm run build": "Compile TypeScript to dist/",
    "npm test": "Build and run all tests",
    "npm run fmt": "Format with prettier",
    "npm run fmt:check": "Check formatting",
    "npm run lint": "Run ESLint on src/",
    "npm run test:harness":
      "Build + run the deterministic harness tests (`*.harness.mjs`) on the in-repo CLI — needs the claude CLI, no API key",
    "npm run test:eval":
      "Build + run the real-model harness evals (`*.eval.mjs`) on the in-repo CLI — needs claude + model auth",
    "npm run test:vitest":
      "Build + run the cross-runner matcher constraints under vitest (`test/runners/*.vitest.mjs`)",
    "npm run test:jest":
      "Build + run the cross-runner matcher constraints under jest (`test/runners/*.jest.cjs`)",
    "npm run test:types":
      "Build + type-check the vitest/jest matcher augmentation (tsc --noEmit on test/types/)",
  },

  rules: {
    "no-non-null-assertion": enforce(
      "@typescript-eslint/no-non-null-assertion",
      "Use proper narrowing instead of ! assertions.",
    ),

    "no-floating-promises": enforce(
      "@typescript-eslint/no-floating-promises",
      "Always await or return promises. Unhandled rejections crash the process.",
    ),

    "cognitive-complexity": enforce(
      "sonarjs/cognitive-complexity",
      "Keep functions under 15 cognitive complexity. Split complex logic into helpers.",
    ),

    "never-skip-tests": guidance(
      "All tests must pass. If a test requires a CLI tool (pylint, rubocop, ruff, clippy), install the tool, don't skip the test.",
    ),

    "zero-config-by-default": guidance(
      "`vigiles compile` should work with just a .spec.ts file. Config exists only for overrides (maxRules, maxTokens).",
    ),

    "dont-reimplement-linters": guidance(
      "Architectural linting belongs in ast-grep/Dependency Cruiser/Steiger. Per-file code rules belong in ESLint/Ruff/Clippy. vigiles owns: spec compilation, linter cross-referencing, type generation, stale reference detection, and proof-based spec evolution.",
    ),

    "smooth-adoption": guidance(
      "`npx vigiles init && npx skills add zernie/vigiles` must work on first run with zero config. The wizard auto-detects the project, creates specs, generates types, compiles, and wires CI. After install the agent edits specs automatically — no workflow change required. Start permissive (guidance rules, `require-spec: false` available), tighten over time. Hesitant adopters can use inline mode (`<!-- vigiles:enforce ... -->` comments) without a .spec.ts — see `docs/inline-mode.md`. See `research/adoption-strategy.md`.",
    ),

    "format-before-commit": guidance(
      "Run `npm run fmt:check` before committing. Inline code spans in markdown need surrounding spaces to render correctly.",
    ),

    "progressive-adoption": guidance(
      "vigiles must be adoptable incrementally, like TypeScript. Three on-ramps, zero friction: (1) inline mode — add `<!-- vigiles:enforce ... -->` comments to an existing CLAUDE.md, no new files; (2) spec mode with `guidance()` only — `npx vigiles init` creates a .spec.ts, compiles to markdown, zero linter setup; (3) strict mode — `enforce()` rules, CI gating, `--strict` flag. Each level adds value without requiring the next. Never gate basic functionality on advanced setup. README examples should always show the simplest path first.",
    ),

    "no-session-links": guidance(
      "This is a public repo. Claude Code session URLs are private and must not appear in commits or PRs.",
    ),

    "doc-per-rule": guidance(
      "Every validation rule in .vigilesrc.json must have a corresponding doc in docs/rules/<rule-name>.md. The doc covers configuration, severity levels, options, what the rule checks, and why. README links to each rule doc from the rules table.",
    ),

    "readme-brevity": guidance(
      "README.md should be a concise pitch + quick start, not a reference manual. Extract detailed sections into docs/ and link with `[Details →](docs/X.md)`. Target ~300 lines max.",
    ),

    "ts-essentials": guidance(
      "Prefer branded types over plain strings for semantic values (hashes, file paths, rule IDs). Use discriminated unions over boolean flags that gate optional fields. Add exhaustive `default: assertNever(x)` to every switch on a union type. These patterns convert runtime bugs into compile-time errors.",
    ),

    "no-orphan-docs": enforce(
      "vigiles/orphan-docs",
      "Every `.md` under `docs/` and `research/` must be referenced from at least one other markdown file — README, a compiled spec's Key Files, or another doc. Orphan docs rot silently because nothing tells the agent they're still load-bearing. Inverse of stale-reference detection: stale-ref catches specs pointing at missing files, orphan detection catches existing files that no spec points at. Mechanical check in `src/orphans.ts`, surfaced by `vigiles audit`.",
    ),

    "recompile-on-spec-change": guard(
      { watch: "*.spec.ts", run: "npx vigiles compile" },
      "Recompile instruction files when any spec changes.",
    ),

    "regen-types-on-config-change": guard(
      {
        watch: ["eslint.config.*", "package.json", "pyproject.toml"],
        run: "npx vigiles generate-types",
      },
      "Regenerate type definitions when linter configs or package.json change.",
    ),

    "format-check": guard(
      { watch: "**/*.ts", run: "npm run fmt:check" },
      "Verify formatting on TypeScript file changes.",
    ),
  },
});
