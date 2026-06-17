# Roadmap — the single front door

> Updated 2026-06-13. The scattered "next steps" sections across the research
> docs were sprawling, so this is the **one consolidated, current view** of what
> ships next. Each item is a one-liner + a link to the doc that holds the
> rationale; detail lives there, priority lives here. When you finish or kill an
> item, move it here first.
>
> Two backlogs feed this: [`feature-ideas.md`](feature-ideas.md) (pillar-1
> user features) and [`harness-testing-coverage-matrix.md`](harness-testing-coverage-matrix.md)
> (pillar-2 surface coverage). Strategy feeds in from
> [`strategic-synthesis-2026-06.md`](strategic-synthesis-2026-06.md) and
> [`divergent-bets.md`](divergent-bets.md).

## Shipped recently (don't rebuild)

- **`vigiles scan`** + **plugin health leaderboard** — deterministic per-plugin
  report + rank-by-structural-health (`src/scan.ts`, `src/leaderboard.ts`).
- **`untested-surface` rule** + **skills conformance gate** — third gap detector;
  every skill loads with a usable description (`src/test-coverage.ts`,
  `src/skills-dogfood.test.ts`).
- **Eval B→A→C** — cost/latency capture, record/replay cache, concurrency +
  budget, Welch significance + pass^k, regression gating vs committed baseline
  ([`eval-api-landscape.md`](eval-api-landscape.md): `src/eval.ts`, `stats.ts`,
  `eval-baseline.ts`).
- **Sandbox unit tier + allowlisted egress** — `runHook`/`runHarnessTest` confine
  untrusted code under bubblewrap; `egress: { allow }` ([`sandbox-network.md`](sandbox-network.md),
  feature-ideas §13 — partial).
- **Subagent tool-contract rail**, **MCP reference verification** (`vigiles:mcp`),
  **symbol refs**, **dead-enforcement / stale-ref** (pillar 1 core).

## Now — cheap, high-leverage, do next

- **Run the behavioral (eval) tier in CI as a gate** — today `vigiles eval` is
  manual-only and results are frozen as `FINDING:` comments (a snapshot is
  documentation, not protection). Wire the _cheap_ tier (`measureTriggerRate` /
  `measure` with `stubSkillBodies`, on **Sonnet** — the realistic selector, not
  haiku, which under-measures trigger-rate) as a per-PR gate, then the
  tool-call spy/fake keystone for side-effecting skills. Full model + ranked gap
  roadmap in [`docs/eval-architecture.md`](../docs/eval-architecture.md). · **HIGH**

- **PATH-shim / record-replay helper (fake-on-PATH)** — the R2 tier: a fake
  binary earlier on PATH that emits a result **recorded once** from the real tool
  and replayed deterministically (never model-synthesized — drift → false
  confidence), reusing the eval cache's record/replay machinery. **Explicitly
  ahead of real-service/testcontainers provisioning:** a survey of community
  collections + a ~90-artifact production audit put R1+R2 at ~90%+ of real plugin
  surface (R3 real-service ≤ ~9%), and every GitHub/issue-tracker/chat/CI/linter/
  test-runner integration is replayable at R2 with no Docker. Higher leverage than
  a container integration. [eval-coverage-and-isolation](eval-coverage-and-isolation.md) · **HIGH**
- **Native input/output/cache token + cost measurement** — split `tokens()` into
  `inputTokens`/`outputTokens`, capture cache tokens, and report a per-class A/B
  **delta** gated by Welch significance. A harness change trades input↔output (a
  CLAUDE.md/skill injection adds input every turn; a "compression" skill cuts
  output), so a single total can bless a net-negative change — SkillBenchmark's
  Caveman cut output yet 2–4×'d cost. The money story, and the data model is half
  there. [eval-architecture](../docs/eval-architecture.md) · [skill-eval-landscape](skill-eval-landscape.md) · **HIGH**
- **Adversarial-gate check + eval→enforce bridge** — a first-class "ask the agent to
  skip the enforcement gate, assert it refuses" check (`notTool` shape); when it
  fails, point at the deterministic rail (pillar 2 → pillar 1). The highest-value
  behavioral test for an enforcement skill. [skill-eval-landscape](skill-eval-landscape.md) · **HIGH**
- **#2 Reverse coverage** — "your CLAUDE.md documents 5 of 47 enabled rules": the
  one item that is both moat and a shareable distribution artifact.
  [feature-ideas #2](feature-ideas.md) · **HIGH**
- **AGENTS.md + SKILL.md as first-class verified inputs** — the engine is already
  format-agnostic; rides the 60k-repo / 32-tool wave.
  [standards-conformance](standards-conformance.md) · [synthesis T1#1](strategic-synthesis-2026-06.md)
- **Wire `composeCollisions` into `vigiles lint`** — warn when a compile target
  is a file Ruler/rulesync regenerates (stales the integrity hash); suggest the
  source-slot redirect. Detector shipped (`src/compose.ts`); CLI wiring + a
  `compile --into <dir>` flag are the remaining steps.
  [sync-tool-compatibility](sync-tool-compatibility.md)
- **"Valid is not true" positioning** — one comparison row vs structural linters
  (agnix); pure messaging, no build. [standards-conformance](standards-conformance.md)
- **Dogfood popular plugins + emit a per-plugin `COVERAGE.md` scorecard** — run the
  rung classifier over popular community plugin collections and emit a per-plugin
  `COVERAGE.md` (R1/R2/R3 distribution + the R3 service shortlist + a testability
  grade). Validates the ~90% R1+R2 claim on real artifacts AND is a shareable
  distribution artifact (the leaderboard's testability sibling).
  [eval-coverage-and-isolation](eval-coverage-and-isolation.md) · **HIGH**
- **`scan` → observed-egress column** — boot each hook under `recordEgress`, list
  hosts reached; turns `scan` from static into behavioural, feeding the
  leaderboard and the supply-chain audit. [agent-supply-chain-security #1](agent-supply-chain-security.md)

## Next — differentiated, medium effort

- **Ephemeral run environment (not just CWD)** — every model-driven run already
  uses a throwaway `cwd`, but the direct/non-bwrap path inherits the real `$HOME` +
  env, so a model-driven `git push` / write to `~` escapes — even for a trusted
  plugin (the model, not the author, chose the action). Default every run to a
  fresh HOME + scrubbed env (re-inject only the harness's own auth). Needs no
  kernel features → lands on macOS today, ahead of the Seatbelt backend; the
  cheapest cross-platform side-effect protection. [cross-platform-sandboxing](cross-platform-sandboxing.md) · **HIGH**
- **Cross-platform confinement (macOS is a must)** — extract a `vigiles/os-isolation`
  port and add a `sandbox-exec`/Seatbelt backend beside `bwrap`, so foreign code is
  confined on Mac (a large share of devs) instead of forcing the refuse-or-`sandbox:false`
  choice. Per-host egress stays Linux-only (Seatbelt can't packet-filter per host);
  Mac degrades honestly to deny-all-net. **Phased design ready** (interface + layout +
  capability matrix + 4 green-keeping phases + the Seatbelt-blocks-localhost limitation):
  [os-isolation-port](os-isolation-port.md). Decided in
  [cross-platform-sandboxing](cross-platform-sandboxing.md); `srt`/`nono` are documented
  fallbacks, not the default. · **HIGH**
- **Verify & test the harness's sandbox config** — `settings.json`'s `sandbox` block
  is a harness surface: verify `allowedDomains`/`allowWrite` are coherent (flag a hook
  that phones a blocked domain), and prove the configured sandbox blocks what it claims
  (reuse `recordEgress`/`egress:{allow}`). The "valid is not true" wedge applied to
  sandbox policy. [cross-platform-sandboxing](cross-platform-sandboxing.md) · **P3**
- **Near-neighbor trigger-rate tier** — between isolated (cheap, optimistic) and
  whole-harness (`installSet`, realistic but pricey/noisy), co-install the
  skill-under-test + its **NCD-nearest competitors** (reuse `proofs.ts` `ncd` /
  `findSimilarRules`) so a large roster gets faithful precision at a fraction of
  the cost. Decided + grounded; deliberately deferred (the two existing tiers
  cover the common cases). [isolated-vs-whole-harness](isolated-vs-whole-harness-eval.md) · **P3 (MED–LOW)**
- **Observed-vs-declared, signed (the flagship)** — declare a contract, run
  confined, diff observed vs declared, sign with the SHA-256 chain. Only vigiles
  holds both the declaration model and the confined trace.
  [synthesis T2#6](strategic-synthesis-2026-06.md) · [supply-chain #2](agent-supply-chain-security.md)
- **OTel-GenAI span emission** from the test tiers (`src/otel.ts`, opt-in) — make
  test-time traces speak prod-observability's wire format.
  [runtime-guardrails #1](runtime-guardrails-observability.md)
- **`enforce()` over AI-linter catalogs** — a `semgrep/` resolver in `linters.ts`,
  then CodeRabbit/Greptile. [ai-native-linting #1](ai-native-linting.md)
- **MCP-reference conformance** + a typed `mcp()` / `mcpConfig` harness hook —
  "does the cited `server#tool` still exist" via live or `.well-known`.
  [standards #3](standards-conformance.md) · [coverage-matrix](harness-testing-coverage-matrix.md)
- **Unify `scan` + `lint` on one rule engine** — promote scan's hard-coded
  structural findings (no-description skill, no-tool-contract agent, missing hook)
  to documented, configurable, CI-gatable rules; scan becomes inventory + a
  rule-derived score. The ESLint model: one rule vocabulary, two frontends.
  [scan-lint-unification](scan-lint-unification.md)
- **`compile --policy` → Cedar/OPA codegen** — one `tools:` declaration drives the
  dev-loop hook, the prod gate, and the trace check; emit-and-verify only.
  [runtime #3](runtime-guardrails-observability.md) · [landscape-mid-2026](landscape-mid-2026.md)
- **Multi-harness compile & the mirror story** — `harness` in project config
  (select-by-config, not just auto-detect), a byte-identical `CLAUDE.md`⇄`AGENTS.md`
  copy-mirror when no sync tool fans out, and per-harness skill verify/compile.
  Kills the silent harness-mismatch footgun in `compile`.
  [multi-harness-compile](multi-harness-compile.md) · [sync-tool-compatibility](sync-tool-compatibility.md)
- **Mock-ergonomics borrow-list (NEW — 2026-06-17 multi-SDK probe, this PR)** —
  concrete ergonomics to adopt from other SDKs' first-party mocks into `scriptModel`
  / the eval tier, surfaced by the current-evidence probe. Borrow: Pydantic
  `FunctionModel`'s contract-aware `(messages, info) -> ModelResponse` scripting
  (expose the loaded harness's tool defs to the mock script); Vercel
  `simulateReadableStream`'s delay-knob + `convertArrayToReadableStream` + `mockId`
  - `doGenerate`-accepts-array (a `scriptModel` array shorthand) + `doGenerateCalls`
    capture (≈ `trace.modelRequests`); LangChain's `langchain-tests` capability-flag
    conformance (≈ our adapter-conformance kit) + `langchain-replay` decision-level
    replay (mock the model's judgment, keep tool side effects real); Pydantic's
    `ALLOW_MODEL_REQUESTS=False` accidental-real-call guard; MS response-caching as
    replay-adjacent. Each is an ergonomics upgrade, not a retarget — the probe
    reaffirmed vigiles owns the gaps no SDK fills (tool-contract _enforcement_ of the
    assembled agent, trigger-rate recall+precision, record/replay caching,
    sub-affordability). [sdk-harness-testing.md](sdk-harness-testing.md) (the
    2026-06-17 section)

- **Single-arm ABSOLUTE behaviour path — is it first-class, or is A/B
  over-privileged? (NEW — flagged 2026-06-17, this PR)** — testing an _exact_ skill
  ("following it produces a test-first / root-cause output") wants an **absolute**
  judged assertion, not an A/B-vs-OFF-arm comparison (A/B is the right oracle only
  for relative/regression/noise-floor questions). The absolute path exists
  (single-arm `measure` + `judged` + `assertRates`,
  `examples/harness/dogfood/skill-quality.eval.mjs`); the open question is whether
  it's ergonomic + discoverable vs A/B (`runEval`/`measureArms`/`assertSignificant`)
  being over-privileged in the API surface, README, and the `test-harness` skill.
  Audit prominence; elevate the absolute path if needed.
  [testing-api-design §Part 7 #7](testing-api-design.md)

## Later — needs model auth (write-don't-run today) or bigger

- **Demo revamp (consolidate the deprecated demos)** — `examples/demo/`
  (`npm run demo`) and `examples/plugin-test-demo.mjs` (`npm run demo:plugin`) are
  now deprecated. Replace them with ONE polished, reliably-passing front-door demo
  plus a recorded GIF/asciinema, framed by the three "best"s: the
  stale-`enforce()` "lies" story as the one-sentence sell, and `vigiles scan` as
  the zero-setup wedge.
  [distribution-strategy](distribution-strategy.md) · feature-ideas #14
- **Leaderboard behavioural columns** — real trigger-rate + safety on top of the
  structural score. [divergent-bets #9](divergent-bets.md)
- **Harness cost/ROI optimizer** — A/B token-cost eval (full vs trimmed CLAUDE.md);
  a money story. [divergent-bets #10](divergent-bets.md) · **strong**
- **CI for model upgrades** — `--model` matrix over an eval baseline; catch the
  harness a new model silently breaks. [divergent-bets #8](divergent-bets.md)
- **Measured `judge()` rule — as an experiment first** — one `*.eval.mjs` that
  grades a code property + reports its FP rate; ship the rule kind only if the
  rate is publishable. [ai-native-linting #2](ai-native-linting.md) · [synthesis T2#8](strategic-synthesis-2026-06.md)
- **Sandboxed eval tier + non-Linux backend** — `runEval` still spawns `claude`
  unconfined; `sandbox-exec`/docker for non-Linux. [feature-ideas §13](feature-ideas.md)
- **Deterministic subagent / command wiring** — register + drive without a model.
  [coverage-matrix](harness-testing-coverage-matrix.md)

## Backlog — lower priority / niche

- Pillar 1: #12 annotation-typo (partial), #10 instruction diff (PR-time), #4
  snapshot, #1 custom-rule plugin API, #7 token budget, #8 skill coloring, #11
  dep graph, #9 hook validation (**partial** — `scan` already checks hook-script
  existence). [feature-ideas.md](feature-ideas.md)
- Pillar 2: property-based hook fuzzing, monotonic eval invariants.
  [coverage-matrix](harness-testing-coverage-matrix.md)
- Subagents: typed tool catalog for `tools:`, handoff resolution.
  [subagent-compilation.md](subagent-compilation.md)
- **#7 Self-improving harness** — auto-tune via `evolve.ts` + `proofs.ts` (idle).
  Differentiated but hard (cost, overfitting). [divergent-bets #7](divergent-bets.md)

## Explore — go-to-market / strategic (not code-first)

- **Sell to harness vendors** (B2B) · **Compliance/attestation buyer** (EU AI Act,
  SOC2-for-agents). [divergent-bets #3/#4](divergent-bets.md)
- **Positioning pivot:** lead with _"conformance/attestation for the agent
  harness"_, demote "linter for instruction files".
  [strategic-synthesis](strategic-synthesis-2026-06.md)

## Rejected / parked (don't relitigate)

- **Killed:** compiler-not-linter, one-source-many-backends.
  [divergent-bets](divergent-bets.md)
- **No (researched):** SDK pillar-2 retarget — gap closed by first-party SDK
  mocks; the 2026-06-17 multi-SDK probe relocates pillar-2 value to the Claude
  Agent SDK + Codex (no mock, unenforced/buggy tool contract) + a mock-ergonomics
  borrow-list. [sdk-harness-testing.md](sdk-harness-testing.md)
- **Demoted:** vigiles-as-MCP-oracle → fold into `scan`. [divergent-bets #5](divergent-bets.md)
- **Punted:** promptfoo interop (E) + dataset/scorer parity (D).
  [eval-api-landscape.md](eval-api-landscape.md) · [promptfoo-deep-dive.md](promptfoo-deep-dive.md)
- **Rejected pivots:** security vendor, guardrails/observability vendor, generic
  agent-config linter (agnix lane), AI PR reviewer. [strategic-synthesis](strategic-synthesis-2026-06.md)
- **Parked:** measure model × harness (overlaps "CI for model upgrades").
  [divergent-bets #11](divergent-bets.md)

## See also

- [`feature-ideas.md`](feature-ideas.md) · [`harness-testing-coverage-matrix.md`](harness-testing-coverage-matrix.md)
  — the two detailed backlogs.
- [`strategic-synthesis-2026-06.md`](strategic-synthesis-2026-06.md) ·
  [`divergent-bets.md`](divergent-bets.md) — the strategy behind the bets.
- [`distribution-strategy.md`](distribution-strategy.md) — why "Now" leads with
  distribution artifacts.
