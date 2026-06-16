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
- **`scan` → observed-egress column** — boot each hook under `recordEgress`, list
  hosts reached; turns `scan` from static into behavioural, feeding the
  leaderboard and the supply-chain audit. [agent-supply-chain-security #1](agent-supply-chain-security.md)

## Next — differentiated, medium effort

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
  mocks. [sdk-harness-testing.md](sdk-harness-testing.md)
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
