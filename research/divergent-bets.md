# Divergent bets (2026-06-13) — beyond "extend the pillars"

> Status: roadmap / live triage. Follow-up to
> [strategic-synthesis-2026-06](strategic-synthesis-2026-06.md), which
> over-anchored on "extend, don't pivot" (all four research agents were briefed
> on the two-pillar frame, so they rationalized back to it). This doc drops that
> frame and records genuinely divergent directions, triaged with the founder's
> live reactions. Adjacent: [distribution-strategy](distribution-strategy.md),
> [feature-ideas](feature-ideas.md); the self-improving bet leans on the existing
> `src/evolve.ts` + `src/proofs.ts`.

## Triage table

| #   | Idea                                       | Founder reaction        | Status                   |
| --- | ------------------------------------------ | ----------------------- | ------------------------ |
| 9   | Plugin/skill leaderboard (data/media)      | wow                     | **strong**               |
| 10  | Harness cost/ROI optimizer                 | wow                     | **strong**               |
| 3   | Sell to harness vendors (B2B)              | interesting             | explore                  |
| 4   | Compliance/attestation buyer               | cool                    | explore                  |
| 8   | CI for model upgrades                      | cool                    | explore                  |
| 7   | Self-improving harness (evolve+proofs)     | cool but hard           | **roadmap**              |
| 1   | Compiler-not-linter (generate, not verify) | "seems useless"         | **killed**               |
| 5   | vigiles-as-MCP oracle                      | "don't get the benefit" | demoted → fold into scan |
| 6   | SDK bet (harness-as-code)                  | "do research" → done    | **no** (gap closed)      |
| 2   | One typed source → every tool's format     | no                      | killed                   |
| 11  | Contrarian: measure model × harness        | (no reaction)           | parked                   |

## Strong (the "wow"s)

### 9. Plugin/skill leaderboard — distribution by data, not installs

- **Bet.** Run the existing sandbox + eval over the public marketplace and publish
  _"which of the N skills/plugins actually trigger, work, and are safe?"_ —
  Rotten-Tomatoes / npm-trends for agent extensions. The marketplace has a real
  discovery + trust problem; vigiles has the machinery to rank it.
- **Why it's different.** Inverts the funnel. People don't have to install vigiles
  to feel its value — the _published data_ is the product, and it pulls them to
  the tool. Directly attacks the Stage-1 problem in distribution-strategy.
- **Smallest first step.** Pick 20 popular marketplace skills, run trigger-rate +
  load-conformance + `recordEgress`, publish a single scored table as a blog post.
  Reuses `measureTriggerRate`, `loadPlugin`, the sandbox — no new mechanism.
- **Started.** The structural column is shipped (`scan`/`leaderboard`, now with
  marketplace traversal — wshobson/agents ranks 80+ plugins from one root); the
  behavioral column has its first real finding in
  [plugin-behavioral-findings](plugin-behavioral-findings.md) (superpowers'
  `brainstorming` recall ≈20–30% despite a structurally-clean description).
- **Risk.** Ranking others publicly invites disputes; trigger-rate is model- and
  prompt-dependent (must publish methodology + confidence). Cost of scanning at
  scale (mitigate: sample, cache).

### 10. Harness cost/ROI optimizer — a money story, not a correctness story

- **Bet.** Measure what a CLAUDE.md / skill set costs in tokens per session, find
  the dead weight (rules that never fire, context that never changes behaviour —
  vigiles already detects orphans + untested surfaces), and quantify the cut with
  measured behaviour-impact: _"43% of your CLAUDE.md never changes an outcome and
  costs ~$X/month — here's the proof it's safe to drop."_
- **Why it's different.** Sells on ROI, where a correctness pitch stalls. Turns the
  eval machinery (cost capture already exists in `eval.ts`) into a budget tool.
- **Smallest first step.** An A/B eval: full CLAUDE.md vs a trimmed arm, measure
  `outputTokens`/`costUsd` (saving) AND a correctness metric (no regression) —
  exactly the shape of `examples/harness/skill-compression.eval.mjs`, retargeted
  at the instruction file itself.
- **Risk.** "Never changes behaviour" needs honest measurement (a rule can matter
  on rare inputs the eval set misses); frame as evidence, not proof.

## Explore (the "cool"/"interesting"s)

### 3. Sell to harness vendors (B2B, escapes the funnel)

- **Bet.** The buyers with budget are the teams _shipping_ harnesses (model labs,
  Cursor, high-install marketplace authors), not end devs. "Deterministic CI infra
  for people building agent tooling." Escapes the pre-adoption funnel entirely.
- **First step.** Find one vendor shipping a plugin/skill suite, offer to stand up
  their harness-test + trigger-rate gate; turn it into a case study.
- **Risk.** Long enterprise sales cycle; few such buyers today (timing bet).

### 4. Compliance / attestation buyer (EU AI Act, SOC2-for-agents)

- **Bet.** The same observed-vs-declared / signed-attestation machinery
  (synthesis Tier 2 #6), aimed at regulated buyers who _have_ a mandate and a
  budget, where "deterministic + provable" is worth real money.
- **First step.** A one-pager: map vigiles attestations to a concrete control
  (e.g. "agent tool-use stayed within declared scope, signed"). Validate demand
  before building.
- **Risk.** Compliance is slow, trust-heavy, and pre-adoption is the wrong stage
  (same caution as the security-vendor pivot in agent-supply-chain-security).

### 8. CI for model upgrades — a recurring, unowned pain

- **Bet.** Every Claude/Cursor model update can silently break a harness (a hook
  stops firing, a skill stops triggering). Nobody tests that. vigiles
  regression-tests _your harness against a new model_: "Opus 4.9 broke your
  block-no-verify hook and dropped skill X's trigger-rate 40%."
- **Why it's different.** A new _trigger_ for the eval+significance machinery —
  not a new build, a new _reason to run_ (the model changed, not the code).
  `eval-baseline.ts` already does current-vs-baseline; this points it at a model
  bump instead of a code diff.
- **First step.** A `--model` matrix over an existing eval baseline; diff
  trigger-rate / outcome across two model versions, fail on significant drop.
- **Risk.** Needs model auth + cost per upgrade; value scales with how often
  models ship (which is: often).

## Roadmap

### 7. Self-improving harness — most differentiated, assets idle

- **Bet.** Auto-tune the harness: mutate skill descriptions / hook configs, run the
  eval, **keep only changes that significantly beat baseline**, proof-gate the
  rest. "Your CLAUDE.md and skills get measurably better while you sleep." Nobody
  auto-optimizes the harness via measured evolution, and `src/evolve.ts` +
  `src/proofs.ts` already exist but sit unused.
- **Why roadmap, not now.** Founder's read: cool but pretty hard. Real risks:
  search space is huge, each eval trial costs a real model call (expensive loop),
  and "significantly better" must survive overfitting to the eval set. Needs the
  cost/cache/significance plumbing (already shipped) plus a bounded mutation
  operator over real harness surfaces (partially in `evolve.ts`).
- **First milestone when picked up.** Single-axis: auto-tune one skill's
  `description` for trigger-rate over a fixed prompt set, proof-gated by
  `assertSignificant`, capped by `maxCostUsd`. Prove the loop on one knob before
  generalizing.

## Resolved this round

### 5. vigiles-as-MCP oracle — DEMOTED (fold into `scan`)

- **Resolved framing.** The check stays 100% deterministic regardless of caller;
  MCP is just a delivery channel. **Oracle, not gate** — an agent _asks_ "is this
  safe / are these refs real?" and gets a deterministic answer; a _hook_ enforces.
- **Disposition.** Not a standalone bet. For anything that's a file edit, a
  PreToolUse hook enforces without the agent's cooperation (strictly better). The
  only additive slice is an agent **vetting external code before trusting it**
  (no edit to hook yet) — which is just `scan` (#9-family) exposed as an MCP tool.
  So: if/when `scan` ships, offer it as both a CLI and an MCP tool surface; don't
  pursue "MCP oracle" as its own line.

### 6. SDK bet (harness-as-code) — NO (the gap is largely closed)

- **Researched:** [sdk-harness-testing](sdk-harness-testing.md). Premise (a)
  holds — serious agents _are_ built in SDK code in 2026 (LangGraph ~34.5M
  monthly downloads, real enterprise deployments). But premise (b) **fails**: the
  deterministic, no-API-key mock-model test tier — the literal core of vigiles's
  middle tier — is already **first-party** in the top SDKs: Pydantic AI
  (`TestModel`/`FunctionModel`/`Agent.override`/`capture_run_messages`/
  `ALLOW_MODEL_REQUESTS=False`), Vercel AI SDK (`MockLanguageModelV3`),
  LangGraph/LangChain (`FakeListChatModel`), LlamaIndex (`MockLLM`). No greenfield
  gap to port pillar 2 into.
- **The one residual (idea-borrow, not a port).** Every SDK mock stops at the
  _model_ boundary; deterministic **guardrail / tool-contract enforcement**
  testing of the assembled agent is under-served — which maps onto vigiles's
  existing `src/agent-runtime.ts` "declared ≠ enforced" rail. Treat as borrowed
  insight, not a strategic port. **Smallest probe:** a one-day contract-enforcement
  test for the OpenAI Agents SDK using its own model double, to test the water
  before any bet.

## Killed

### 1. Compiler-not-linter (generate the skeleton)

- Founder: **seems useless.** The part vigiles _could_ generate (the rule /
  script / file-index skeleton) is the small part; the judgment prose people
  actually want help with is exactly what can't be generated. Not worth a reframe,
  and no more than the existing compiler already does. Dead.

### 2. One typed source → every tool's format

- Founder: **no.** (Would drag vigiles toward the generic rule-sync / multi-backend
  compiler lane it already rejected; breadth over depth.)

## Parked

### 11. Contrarian — measure model × harness (the premise has a clock)

- As models approach near-perfect instruction-following, "deterministic backstop
  for sloppy models" erodes. Hedge that keeps the assets: pivot from _constrain_
  to _measure_ — become the measurement authority for `Agent = Model + Harness`
  (what each model breaks, where instruction-following actually fails today).
  No founder reaction yet; recorded so the long-shot isn't lost. (Overlaps #8,
  which is the concrete near-term slice of the same instinct.)

## See also

- [strategic-synthesis-2026-06](strategic-synthesis-2026-06.md) — the
  extend-don't-pivot synthesis this doc deliberately pushes past.
- [distribution-strategy](distribution-strategy.md) — why #9 (data, not installs)
  attacks the real bottleneck.
- [feature-ideas](feature-ideas.md) — the incremental backlog (this doc is the
  divergent/strategic one).
