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

## Strategic direction (2026-06-19): measurement authority

> The pivot (`measurement-authority.md`): vigiles is the **empirical authority on what makes
> agentic coding actually work** — benchmark the ecosystem (viral) + auto-optimize your harness
> (adoption), powered by the only real-model A/B eval stack cheap enough to run it (the sub).
> Three layers, one machine, each makes the next affordable: **measurement (offense) → typed
> contracts (cheap-to-test substrate + the spec's new purpose) → linting (free pre-filter)**.
> Specs are reframed as the progressive, zero-friction on-ramp to testability
> (`typed-contracts-for-agents.md`).
>
> **Reality check (2026-06-21):** a heavy typed-spec moat push shipped real features
> (typed purity + composition + `generate-harness`) and a coherent "compiler for
> harnesses" category — but the work has leaned **maker-cool (the moat) over user-pull
> (the measurement/benchmark identity)**, and vigiles still has ~no users. Near-term
> priority is the **adoption engine** (the at-scale ecosystem benchmark + zero-friction
> `scan`/measure that needs no typed spec), with the moat as the depth users discover
> after. The bridge bet = **capability-diff (#2)** (serves both). Full status & gaps:
> [`measurement-authority.md`](measurement-authority.md#status--gaps-2026-06-21--honest-read-of-where-the-pivot-stands).

**P0 — validate the thesis before building (cheapest, do first):**

- [x] **Measure one hyped skill vs its claim — DONE (2026-06-20), thesis VALIDATED.**
      caveman over 5 real coding tasks (real haiku, 3 trials, on the subscription,
      [`bench/evals/caveman-claim.eval.mjs`](../bench/evals/caveman-claim.eval.mjs)):
      claims ~65% output cut, measured **−5% output / −4% cost**, output only
      **~1.1% of session tokens**, 0 correctness regressions. "Measured ≪ claimed",
      stark. **SONNET follow-up DONE (2026-06-20, caveman's TARGET model, pilot
      2×2): the debunk STRENGTHENS — −23% output / −20% cost (the bill went UP),
      0 regressions.** Rules out the "haiku underuses the style" caveat. Widen to
      5×3 for tighter CIs; direction is clear. → `measurement-authority.md`, `benchmark-methodology.md`

**P1 — measurement (the identity):**

- [ ] **Ecosystem benchmark v0** — A/B 10–20 most-hyped skills/plugins on a small real-task
      corpus; publish "what works vs hype" (lead with the debunks). Reuses `runEval` /
      `measureTriggerRate` + the ROI-optimizer bet. → `measurement-authority.md`, `divergent-bets.md`
- [x] **Does-our-spec-help A/B — DONE (2026-06-20), the spec HELPED.** First real-model
      A/B of vigiles's OWN typed contract: [`examples/harness/dogfood/reviewer-ab.eval.mjs`](../examples/harness/dogfood/reviewer-ab.eval.mjs)
      (prose vs spec code-reviewer, controlled, sonnet 2×). **Result: quality identical
      (bug caught 100% both arms — no regression), payoff a categorical win (parseable
      `vigiles:ok` outcome 0% prose → 100% spec).** So the typed contract adds
      deterministic testability (assertAgentOk, no LLM judge) at ZERO quality cost — the
      "typed contracts make measurement affordable" thesis, validated on our own contract.
      → `measurement-authority.md`, `typed-contracts-for-agents.md`
- [x] **FIX: subagent nested-trace recovery under `--plugin-dir` — SHIPPED (`212869d`).**
      Two real CC behaviors fixed + validated against a captured live dispatch: (1) a
      `--plugin-dir` agent's `subagent_type` is namespaced `plugin:agent` → match the bare
      name; (2) the sub's `result()` block lands in its RETURN (the dispatch's top-level
      `tool_result`) → captured as `SubagentTrace.output`. Unlocks
      `subagent(name,[output(/vigiles:ok/)])` — any subagent-contract eval.
- [x] **Per-repo optimizer v0 — DETERMINISTIC SPINE DONE (2026-06-20), shipped as
      `scan --fix-plan`.** [`src/optimize.ts`](../src/optimize.ts) (`optimize` /
      `formatOptimize`, 6 vitest + 2 e2e cases) surfaced as the **`vigiles scan <dir>
--fix-plan`** lens (`--json`, `--harness=`, documented in `docs/cli.md`). The free
      half: a structural-health score (reuses `scoreReport`/`gradeFor`) + a typed, ranked
      `Recommendation[]` reusing `explainScore` (one-detector-no-drift) — `FIX` /
      `DIFFERENTIATE`, likely dead-ends first — that you clear BEFORE spending a token,
      then it hands off to the measured layer. **Folded into `scan` (NOT a standalone
      `optimize` verb)** because, until the measured half lands, an optimizer that only
      re-prints scan's findings is a third command on one report — see P2 below.
      **Remaining (the measured half):** wire the real-model A/B so each add/drop/swap
      carries a measured delta (`runEval` over `bench/corpus`, gated on the subscription).
      → `measurement-authority.md`, `divergent-bets.md`
- [x] **Benchmark methodology + task corpus — v0 DONE (2026-06-20).** The method
      doc: [`benchmark-methodology.md`](benchmark-methodology.md) (the metric triple —
      bill/target/blast-radius — grounded in the P0 caveman measurement). The
      **reusable task-corpus module shipped:** [`bench/corpus/coding-tasks.mjs`](../bench/corpus/coding-tasks.mjs)
      (5 neutral real coding tasks, each self-contained + checkable + agentic) +
      [`verify.mjs`](../bench/corpus/verify.mjs) (a no-model self-check that every
      correctness oracle discriminates good/bad). The P0 eval now consumes it, and
      the ecosystem benchmark (A1) + `vigiles optimize` (A2) A/B over the SAME corpus.
      Remaining: per-repo-variance handling (report the distribution across tasks,
      not one mean). → `measurement-authority.md`

**P1 — typed contracts / spec-as-testability (substrate + adoption ramp):**

- [x] **Test-gen from free-form — SHIPPED (2026-06-20)** as `vigiles scaffold-test`
      ([`src/scaffold-test.ts`](../src/scaffold-test.ts) + CLI). Free-form in, a runnable
      starter test out, per kind at the untested-detector's suggested path. →
      `typed-contracts-for-agents.md`
- [ ] **Auto-derive `interceptTools` from the tools allowlist in `scaffold-test`** — the
      salvaged nugget from the rejected `effect()`-as-test-seam reframe (2026-06-21): read a
      skill/agent's declared `tools` + `effectSurface(tools, dialect)` (which already buckets
      read-only vs side-effecting deterministically) and emit a ready `interceptTools` entry
      per side-effecting tool, so a side-effecting agent's "hole" is mocked/denied in a
      generated test with **zero new spec surface**. Bounded — reuses `src/core/effects.ts` + the existing scaffold paths. → `effect-boundary-design.md` (the salvage section),
      `typed-contracts-for-agents.md` · **MEDIUM**
- [x] **Typed purity — SHIPPED (2026-06-21, `249aead`).** Compile-time half of the
      purity floor: `vigiles/claude-code`'s `agent()`/`skill()` make `purity:"pure"` +
      `"Bash"` a `tsc` error at edit time (core `vigiles/spec` stays open, backwards-compatible).
      A strict addition to the runtime `decidePurityGate`. → `typed-spec-power.md`
- [x] **Typed composition — SHIPPED (2026-06-21).** `agent()`/`result()` preserve the
      `result()` field shapes as types; `pipe(producer, pipeStep(agent, needs({…})))` (+ the
      `start`/`andThen` fold) cross-references at `tsc` time that step N's `ok` SUPPLIES step
      N+1's `needs` — a missing field / wrong type / out-of-order handoff **won't compile**.
      The headline non-replicable typed-spec win. Additive over the string-based `delegate()`
      path; shallow `Supplies<>` encoding (TS2589-safe). → `typed-spec-power.md`, `typed-spec-moat.md`
- [ ] **Semantic capability-diff at PR time (Moat #2) — the bridge bet.** A
      permissions-diff for your agent: on a PR, compute the harness's capability surface
      before/after and tell the reviewer what the agent can now **DO** that it couldn't —
      "this PR gives `summarizer` network access / removes the review gate / opens a
      cross-step exfil path" — off the spec's **effect surface**, not a text diff. Markdown
      gives a text diff; only a typed spec gives a capability diff. **The bridge that serves
      BOTH moat and adoption** (a free PR comment — partial on plain plugins via `scan`,
      richer on specs — so value without authoring a typed spec). Built on: the
      whole-harness **capability lattice** (`computeHarnessCapabilities`, SHIPPED in
      `generate-harness`) + the **effect-row (M1) + cross-step accumulation** engine
      (unbuilt — the surface to diff); the v1→v2 diff itself was **prototyped** as an
      abstract-interpreter (fp-theory T2). MUST carry a loud sign-off hatch
      (`vigiles:allow-net` / `allowTrifecta`) so an intentional widening doesn't cry wolf.
      A **Snyk/Dependabot-for-harnesses** trajectory bet — early to the market, but the one
      moat feature that also pulls adoption. → `typed-spec-moat.md` (Moat #2),
      `measurement-authority.md` (the bridge), `typed-spec-fp-theory.md` (T2) · **P1**
- [ ] **Lethal trifecta as a forbidden TYPE (F1) — the dangerous tool combo is
      unrepresentable.** An agent with untrusted-input + secret-access + exfil legs in one
      `tools` contract won't compile without a typed `allowTrifecta` sign-off the compiler
      demands. Rides typed purity's EXACT machinery (the same `const` tools tuple → a typed
      capability lattice). Defense-in-depth: the type tier (config, edit-time) sits above the
      planned `scan` check (config, CI) + the runtime egress wall (behaviour) + F4's
      hyperproperty (the true noninterference question). Honest limit: the type sees the
      capability COMBINATION, not the data FLOW (that's runtime). → `typed-spec-frontier.md`
      (F1, prototyped) · **P0**
- [x] **Elevate railway/Result contracts — SHIPPED (2026-06-20)** (docs + worked example).
      `assertAgentOk/Err/Result` existed but were invisible; added
      [`examples/harness/railway-result.harness.mjs`](../examples/harness/railway-result.harness.mjs)
      (Part A pure, Part B a real mock turn) + a `docs/harness-testing.md` section. →
      `typed-contracts-for-agents.md`, `railway-subagents.md`
- [x] **Side-effect boundaries for skills — SHIPPED (2026-06-20).** The deterministic
      side-effect-boundary ASSERTION (rung 2): added `didNotWrite()` (the symmetric no-write
      sibling of `wrote()`) to the check vocabulary +
      [`examples/harness/effect-boundary.harness.mjs`](../examples/harness/effect-boundary.harness.mjs)
      (`wrote`/`didNotWrite`/`notTool` over a constructed Trace AND a real mock turn, no key).
      The authoring half (`effect()`, the `purity:` floor) already shipped. The eval-tier
      `tool-intercept` (real-model prevention) stays as is. → `typed-contracts-for-agents.md`
- [ ] **Shareable typed templates (skills/agents) — DEFERRED (premature).** `preset()` /
      `extend()` only pay off at SCALE (an org standard or monorepo consuming one published
      preset), and vigiles has ~no consumers yet (`distribution-strategy.md`) — building the
      network-effect layer before the network. The `off()` primitive in the sketch is also
      mis-framed (it reads as "disable an eslint rule," but vigiles never touches eslint config
      — it can only drop an inherited rule from the compiled instruction file). Revisit once
      adoption exists and a real org wants a shared house style. → `shareable-presets.md`
- [x] **`dir()` + `glob()` lightweight authoring — SHIPPED (2026-06-20).**
      [`src/core/spec.ts`](../src/core/spec.ts) builders + compile-time verification
      (`validateDirRef` — exists AND is a directory; `validateGlobRef` — matches ≥1 path),
      7 vitest cases, docs in [`docs/spec-format.md`](../docs/spec-format.md). →
      `lightweight-spec-authoring.md`
- [✗] **`doc()` builder — DROPPED (2026-06-20).** It would duplicate `instructions\`\``(the existing tagged template already does typed prose-with-refs). Research-backed:
the spec syntax is already the correct hybrid (plain-object backbone + typed-value
helpers + tagged template for prose-with-refs) — the win is RESTRAINT, not more
helpers (also: NO`section()`helper — keep the object map). →`spec-syntax-and-railway-scope.md`
- [x] **Spec authoring polish — SHIPPED (2026-06-20).** Length-guard (`989791e`),
      agent frontmatter fields `disallowedTools`/`color` for clean round-trips +
      side-effect separation (`95ce25f`), and the `migrate` → `adopt-spec` rename
      (`6137008`). → `spec-syntax-and-railway-scope.md`
- [x] **Spec REFERENCE docs complete — SHIPPED (2026-06-20, `44a8d54`).**
      [`docs/spec-format.md`](../docs/spec-format.md) gained the entire subagent
      surface (`agent()` field table + example), the full skill field table
      (inputs/tools/purity/steps/result/context/output), a Purity & effects section,
      and result/railway/delegate/effect pointers. Pairs with the public railway guide
      [`docs/railway-subagents.md`](../docs/railway-subagents.md). Spec + its docs are
      now complete; remaining spec gaps are niche (agent `level`/`skills` frontmatter,
      a prose-command-file builder) — deferred. → `spec-syntax-and-railway-scope.md`
- [x] **Model `context: fork` on `SkillSpec` — SHIPPED (2026-06-20, `b19febd`).**
      `context?: "fork"` (rendered to frontmatter) + `output?: OutputContract` on a
      skill, gated: `output` without `context:"fork"` is a compile error
      (`output-without-fork`) — enforcing "a typed outcome needs the subagent
      boundary" from the research. A forked skill's Output contract renders via the
      SAME `renderOutputContract` the subagent uses (one-renderer-no-drift). →
      `spec-syntax-and-railway-scope.md`

**P2 — linting, repositioned (free pre-filter + diagnostic):**

- [ ] **Reconsider a standalone `optimize` verb — only once the MEASURED half exists.**
      The deterministic spine ships as `scan --fix-plan` (above), deliberately NOT its own
      command: today an "optimizer" that just re-prints scan's structural findings is a
      third verb over one `ScanReport` (`scan` reports / `explain` diagnoses one surface /
      fix-plan ranks the repo) — confusing, no new capability. Revisit promoting it back to
      `vigiles optimize` WHEN it genuinely optimizes: when each add/drop/swap recommendation
      carries a real-model before/after delta (the A2 measured half over `bench/corpus`).
      At that point "optimize" means something `scan` can't, and the verb is earned. The
      pure `optimize()`/`formatOptimize()` in `src/optimize.ts` are kept either way. →
      `measurement-authority.md` (A2)
- [ ] **Keep the high-signal cross-ref engine; drop the breadth race** (no beat-agnix-on-rule-count).
- [ ] **Capability / lethal-trifecta check** (`warn` + `vigiles:allow-trifecta` sign-off) — one
      column in the benchmark ("safe AND effective"), not the headline. → `harness-state-space.md`
- [ ] **Lint-as-hook + agent-consumable JSON** (see Now). → `instruction-file-linter-landscape.md`
- [x] **Score-explainer pairing — DONE (2026-06-20), core + CLI.** [`src/score-explainer.ts`](../src/score-explainer.ts)
      (`explainScore` / `explainSurface` / `formatExplanations`, 12 vitest cases):
      pure over the `ScanReport` the linter already computes (one-detector-no-drift),
      it maps each cross-ref finding to the behavioral SYMPTOM a benchmark observes
      (wrong-skill-fires / skill-never-fires / agent-underperforms / hook-never-runs /
      subagent-never-dispatches) + a one-line fix — so the optimizer says "underperforms
      BECAUSE its description overlaps X — differentiate them", not just "drop it".
      Shipped as **`vigiles explain <dir> [name]`** (deterministic, `--json` for the
      agent-consumable array; 4 e2e cases in `scan-cli.test.ts`, documented in
      `docs/cli.md`). Now also consumed by **`scan --fix-plan`** (A2) — each
      recommendation IS an explanation reshaped with an action verb. →
      `measurement-authority.md`

**Distribution:**

- [ ] **The "what actually works" benchmark report** = the viral artifact (follows P0/P1).
- [ ] **Zero-config installer reframed** — "apply the empirically-best setup"; resident not
      scaffolder; compose not curate. → `zero-config-mother-harness.md`

## Shipped recently (don't rebuild)

- **Effect-surface + purity contract + Bash classifier (2026-06-20)** — the
  deterministic side-effect substrate. `src/core/effects.ts` (`classifyToolEffect`
  / `effectSurface` / `purityViolations` + the pure/bounded/unrestricted ladder,
  `dialect.sideEffectingTools`); the **`purity:` floor** on skill/agent
  (`"pure" | "bounded" | "dangerously-unrestricted"`, enforced at compile —
  absent tools = inherits-all = violation); the **scan effect-surface column**
  (per-unit purity + `N pure · M bounded · K unrestricted` audit); and the
  standalone **deterministic Bash-effect classifier** (`src/core/bash-effects.ts`,
  `mvdan-sh` AST + catalog + fail-closed residue, zero-false-read-only gate). Two
  design calls locked in: the enum mirrors the analysis vocabulary
  (declare/report symmetry), and `dangerously-unrestricted` is loud at the
  _declaration_ site but neutral `unrestricted` in the _report_ (no cry-wolf).
  See [`side-effect-separation.md`](side-effect-separation.md) +
  [`bash-effect-classification.md`](bash-effect-classification.md).
- **Runtime purity gate — the per-call FLOOR, wired (2026-06-20)** — `purity` is
  no longer compile-only. `decidePurityGate` (`src/core/effects.ts`) is the
  per-call gate, folded into the agent `PreToolUse` rail
  (`src/adapters/claude-code/agent-runtime.ts` via `parseAgentPurity`); the
  tool-contract rail fires first, then the purity gate, refining `Bash` by the
  live command with `isReadOnlyBash`. `compile` emits a
  `<!-- vigiles:purity:LEVEL -->` marker into a compiled agent's `.md`
  (`dangerously-unrestricted` → neutral `unrestricted`). KEY ladder change:
  `bounded` now **admits command-gated `Bash`** (read-only allowed as
  observation, mutating denied) — `pure` still bars `Bash` entirely; the static
  `effectSurface`/`scan` still reports any `Bash` as `unrestricted` (can't see
  the command — the runtime gate is where the refinement lands). **Skill-parity
  shipped same day** — skills now carry the SAME per-call gate
  (`src/adapters/claude-code/skill-runtime.ts`: `parseSkillPurity` +
  `evaluateSkillPreToolUse`, the `skill-tool-hook` CLI; the floor only, no
  tools-allowlist rail for skills yet). Remaining: the position-aware
  effect-BOUNDARY region mark (see "Effect-surface: the runtime half" under Now).
  See [`side-effect-separation.md`](side-effect-separation.md) +
  [`bash-effect-classification.md`](bash-effect-classification.md).
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

- **Harness-native cross-check — DEEPEN (2026-06-21, IN PROGRESS).** The moat refinement
  (see [`landscape-mid-2026.md`](landscape-mid-2026.md) §"Read of Market C" REFINEMENT):
  cross-referencing's value is the HARNESS-NATIVE references (tools, MCP `server#tool`,
  hook events, paths, delegates), NOT the linter-catalog leg (legacy/supporting — don't
  add more catalogs). **First build: live MCP tool resolution of the real
  `mcp__server__tool` contract refs** — the live engine exists (`src/core/mcp.ts`
  `listMcpTools`/`closest`) but is wired only to the explicit `vigiles:mcp` mark;
  bridge it to the actual `mcp__server__tool` references (subagent contracts + bodies)
  so a renamed/removed tool (`create_issue`→`issue_write`) is caught, not just an
  undeclared server (the static `mcp-tool-resolves` only checks the server is declared).
  Opt-in (starts the server, not a free CI default); test against the existing
  `examples/harness/fixture-mcp-server.mjs`.

- **Purity FLOOR gate — DONE + STABLE (2026-06-20).** The per-call floor
  (`decidePurityGate` wired into the agent + skill `PreToolUse` rails,
  `isReadOnlyBash` refining `Bash` by the live command, the `vigiles:purity:`
  marker) is the keeper: deterministic, whole-unit, shipped. See
  [`side-effect-separation.md`](side-effect-separation.md) +
  [`bash-effect-classification.md`](bash-effect-classification.md).
- **`effect()` sub-region BOUNDARY — EXPERIMENTAL, PARKED (P3, revisit).** The
  in-flow side-effect sub-region (`effect\`\``→`<!-- vigiles:effect -->`markers,
"pure outside / declared floor inside") is **dropped as a goal**, not a near-term
build. 2026-06-20 redesign + dogfood: the model-emitted`effect-enter`/`exit`
signal is a category error (a deterministic gate keyed on probabilistic model
compliance, fail-closed). For **skills** it's now a **compile error**
(`effect-in-skill`; a skill uses the floor + `context:'fork'`) — KEEP. For
**subagents** a deterministic tracker shipped (`PreToolUse(tool=Task)`open +`SubagentStop`close,`f045554`). It was flat (single slot) and not nesting-safe;
the depth-aware **STACK fix has since SHIPPED** (push on dispatch, pop on
`SubagentStop`back to the parent, gate on the top + recognize both`Task`/`Agent`spawn tools — TLC-certified,`AgentWindowStack.tla`; the `Open;Open;Stop;Call(Bash)`counterexample is now a regression test), closing the contract-escape CC v2.1.172
depth-5 nesting exposed. Still marked EXPERIMENTAL; **do NOT auto-wire**. Conclusion: a deterministic _in-flow_ sub-region has no
harness signal, and the subagent-split alternative is **weaker AND costlier** than
intended (whole-unit granularity, context-isolation, depth-5 cap, subagent spam) —
so the realistic safety story is the **whole-unit floor + a stateful pre-hook**.
  **Hidden from public docs** (removed from`spec-format.md`/`harness-testing.md`;
  `docs/safety.md` unlinked from the README + WIP-bannered) — don't re-surface until
  it's coherent end-to-end.
  - **Open inconsistency to reconcile (don't keep the skill special-case).** The
    `effect-in-skill` compile error's whole rationale was "the runtime sub-region gate
    needs a structural boundary a skill lacks" — but that gate is now parked, so
    erroring in skills while ALLOWING `effect()` in subagents treats it as a real
    subagent feature it no longer is (and a `context:'fork'` skill IS a subagent, yet
    still errors). When revisited, decide `effect()`'s fate **uniformly** —
    deprecate-everywhere / doc-marker-only / drop the builder — not special-case skills.
  - **When revisited, build the PRE-HOOK, not the split.** A stateful `PreToolUse` gate
    keyed on the tool stream (conntrack/eBPF-maps pattern): read-before-write ("no
    `Write` to a file not `Read` this run"), ordering invariants ("no mutating Bash
    until X"), state in a `.vigiles/` file or read from the transcript — no
    restructuring, no subagent spam. The `f045554` tracker's nesting-safety (depth-aware
    stack + both spawn tools recognized) has SHIPPED, so active-agent CONTRACT enforcement
    now holds under nesting independently of `effect()`.
  - **"effect() as a test/mock seam instead of an enforcement boundary" — considered, rejected (2026-06-21).**
    The reframe: forget position; for an agent a tight `tools` allowlist already pins the
    effect surface, so `effect()` could just NAME "the hole" — the one side-effecting op —
    to make it the mock point. Verdict: the hole already exists three ways without the
    primitive. (1) Enforcement: the `tools` allowlist + `purity` floor pin it. (2)
    Identification: `effects.ts` `effectSurface(tools, dialect)` / `classifyToolEffect`
    ALREADY bucket a tool list into read-only vs side-effecting deterministically — the hole
    is COMPUTED from the allowlist, no annotation. (3) Test seam: `interceptTools` + the
    `ArgMatcher` (`when:{command:/git push/}`) already mock the EXACT invocation at sub-tool
    granularity. So `effect()` would only move the matcher from the test into the spec
    (single-source-of-truth convenience, not a capability) — fails "earns its place" like
    `doc()`/`section()`. Honest limit on the framing too: `interceptTools` is
    intercept-and-PREVENT (deny + assert the attempt), right for a DESTRUCTIVE hole (push,
    charge); a hole that must RETURN a fake value is the record-replay/R2 tier, also not
    `effect()`. The useful NUGGET to keep: have `scaffold-test` read the existing tools +
    `effectSurface` and AUTO-DERIVE the `interceptTools` entry per side-effecting tool —
    delivers "the agent's hole is easy to test/mock" with zero new spec surface. → folds
    into the scaffold-test enhancement, NOT an `effect()` revival.
  - See [`effect-boundary-design.md`](effect-boundary-design.md). · **P3**
- **Authoring ergonomics — `dir()` / `glob()` SHIPPED (2026-06-20).** The two
  lightweight verification helpers (the `Ref` union extended → render + compile
  verification in every switch). `doc()` was the proposed next sibling but is now
  DROPPED (duplicates `instructions\`\``) — see
[`spec-syntax-and-railway-scope.md`](spec-syntax-and-railway-scope.md).
[`lightweight-spec-authoring.md`](lightweight-spec-authoring.md)

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
- **Dogfood popular plugins + emit a per-plugin `COVERAGE.md` scorecard** — run the
  rung classifier over popular community plugin collections and emit a per-plugin
  `COVERAGE.md` (R1/R2/R3 distribution + the R3 service shortlist + a testability
  grade). Validates the ~90% R1+R2 claim on real artifacts AND is a shareable
  distribution artifact (the leaderboard's testability sibling).
  [eval-coverage-and-isolation](eval-coverage-and-isolation.md) · **HIGH**
- **More deterministic lint rules — the next moat surfaces.** This session
  shipped 5 cross-referencing rules (agent-tool-contract, hook-events,
  agent-frontmatter, skill-frontmatter, mcp-config). The ranked, sweep-grounded,
  FP-calibrated backlog for the next batch — `mcp-tool-resolves`, `hook-shape`,
  `duplicate-names`, the novel `description-overlap` (NCD precision proxy),
  `frontmatter-valid`, `hook-matcher` — is in
  [deterministic-rule-ideas](deterministic-rule-ideas.md). Each is the same
  "valid is not true" cross-reference on a new surface, high-precision by design. · **P1**
- **Agent-native lint delivery — JSON-in-the-loop + lint-as-hook.** The lint
  consumer is shifting from a human in an editor to an _agent in a loop_, so deliver
  findings where the agent acts: (a) structured `--json` with did-you-mean fixes and
  minimal-token messages the agent applies directly, and (b) **lint-as-a-PostToolUse-hook**
  that gates the moment the agent writes a bad reference — extend the existing refs-hook
  from symbol marks to the whole cross-reference family (tool-contract, mcp-tool,
  hook-events). Corollary: **FP-calibration becomes a SAFETY property, not just UX** — a
  human ignores a noisy finding, but an agent _obediently "fixes" every one_, so a false
  positive makes it edit correct content. The "don't cry wolf" discipline is load-bearing
  once the consumer is a model. See [instruction-file-linter-landscape](instruction-file-linter-landscape.md)
  (the moat in an agent-authored world). · **P1**
- **Cross-platform confinement — macOS Seatbelt backend.** Confinement is
  Linux-only today (`bwrap`), so on a Mac foreign plugin/skill code forces the
  refuse-or-`sandbox:false` choice — unacceptable when most devs are on macOS.
  Extract the `vigiles/os-isolation` port and add a `sandbox-exec`/Seatbelt backend
  beside `bwrap`. Per-host egress stays Linux-only (Seatbelt can't packet-filter
  per host); macOS degrades honestly to deny-all-net. **Phased design is ready**
  (interface + layout + capability matrix + 4 green-keeping phases + the
  Seatbelt-blocks-localhost limitation): [os-isolation-port](os-isolation-port.md),
  decided in [cross-platform-sandboxing](cross-platform-sandboxing.md). **Note: the
  maintainer has no Mac**, so this needs a macOS CI runner (or a Mac-having
  contributor) to validate the backend end-to-end — the pure policy/args seams can
  still be unit-tested without one. · **P1**
- **AGENTS.md + SKILL.md as first-class verified inputs** — the engine is already
  format-agnostic; rides the 60k-repo / 32-tool wave.
  [standards-conformance](standards-conformance.md) · [synthesis T1#1](strategic-synthesis-2026-06.md) · **MED**
- **`scan` → observed-egress column** — boot each hook under `recordEgress`, list
  hosts reached; turns `scan` from static into behavioural, feeding the
  leaderboard and the supply-chain audit. [agent-supply-chain-security #1](agent-supply-chain-security.md) · **MED**
- **Wire `composeCollisions` into `vigiles lint`** — warn when a compile target
  is a file Ruler/rulesync regenerates (stales the integrity hash); suggest the
  source-slot redirect. Detector shipped (`src/compose.ts`); CLI wiring + a
  `compile --into <dir>` flag are the remaining steps.
  [sync-tool-compatibility](sync-tool-compatibility.md) · **MED**
- **"Valid is not true" positioning** — one comparison row vs structural linters
  (agnix); pure messaging, no build. [standards-conformance](standards-conformance.md) · **LOW**

## Next — differentiated, medium effort

- **Ephemeral run environment (not just CWD)** — every model-driven run already
  uses a throwaway `cwd`, but the direct/non-bwrap path inherits the real `$HOME` +
  env, so a model-driven `git push` / write to `~` escapes — even for a trusted
  plugin (the model, not the author, chose the action). Default every run to a
  fresh HOME + scrubbed env (re-inject only the harness's own auth). Needs no
  kernel features → lands on macOS today, ahead of the Seatbelt backend; the
  cheapest cross-platform side-effect protection. [cross-platform-sandboxing](cross-platform-sandboxing.md) · **HIGH**
- **Move the CC mock + driver physically into the adapter dir (structural cleanup).**
  `src/mock-model.ts` (the Anthropic-Messages mock) and `claudeCodeDriver` +
  `buildClaudeArgs`/`parseClaudeRun`/`claudeAvailable` (in `src/harness-test.ts`) are
  Claude-Code-specific but sit at the composition root, so the directory-based
  `agnostic-surface ⊄ adapter` lint can't see them by location. Today they're
  enforced by **glob-classifying `src/mock-model.ts` as `cc-harness`** in
  `eslint.config.mjs` (works, proven — reintroducing the leak errors). The
  principled end-state is to physically relocate them under
  `src/adapters/claude-code/` (mirroring `src/adapters/codex/{mock-model,driver}.ts`)
  so classification is by directory, not a glob exception — and so the symbol-level
  leak of `claudeCodeDriver` via a future `export *` is caught too. Bounded refactor
  (~8 files' relative imports + the `claudeCodeAdapter` wiring); update the eslint
  classification back to a plain directory pattern afterward. [code-adapter-architecture](code-adapter-architecture.md) · **MEDIUM**
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
- **Auto-applied known context for trigger-rate** — empty-context activation
  measurement is faithful for opening-move skills but biased-low for
  state-dependent ones (fires only mid-session — "about to claim done", "review
  arrived", "dirty git tree"), a blind spot the whole query-based field (AWS
  skill-eval included) shares. Two steps: (1) **DONE** — `TriggerRateSpec` gained
  `fixture` (seed repo state) + `concurrency` (parallelize the grid), reaching
  parity with the user-injected-context tools (prior-turn/history still open);
  (2) the differentiator, still open — auto-select a **curated preset context**
  from the skill's declared trigger phrases so it's measured in the state it
  claims to fire on. Preset SELECTION on explicit cues, not prose synthesis (stays
  out of the undecidable-prose trap). [plugin-behavioral-findings](plugin-behavioral-findings.md) · **P3 (MED)**
- **Per-model trigger-rate + context-rot curve** — two parts. (a) Report
  trigger-rate **per model** wherever we report it — already a capability
  (`EvalArm.model` makes a model comparison a harness A/B; Sonnet default +
  `minModel` floor), so this is "make it a standard column", near-free. (b) The
  study: measure how recall **rots as the skill roster grows** (5 → 20 → 80
  skills) and whether a stronger model rots slower — the concrete form of
  `divergent-bets` #11 (measure model × harness) and the buyer question "how many
  skills can I install before they stop firing, on model X?". A roster × model ×
  prompt matrix, so opt-in study, not a default gate; rides the existing isolated
  → near-neighbor → whole-harness (`installSet`) tiers crossed with model arms.
  Decisive cheap first probe: `brainstorming` recall at 2 roster sizes × 2 models
  (~20 stubbed runs) to confirm the curve is real + model-dependent before any
  matrix. Measure, don't claim. [plugin-behavioral-findings](plugin-behavioral-findings.md) · [divergent-bets #11](divergent-bets.md) · **P3 (MED)**
- **Observed-vs-declared, signed (the flagship)** — declare a contract, run
  confined, diff observed vs declared, sign with the SHA-256 chain. Only vigiles
  holds both the declaration model and the confined trace.
  [synthesis T2#6](strategic-synthesis-2026-06.md) · [supply-chain #2](agent-supply-chain-security.md) · **MED**
- **OTel-GenAI span emission** from the test tiers (`src/otel.ts`, opt-in) — make
  test-time traces speak prod-observability's wire format.
  [runtime-guardrails #1](runtime-guardrails-observability.md) · **P3**
- **`enforce()` over AI-linter catalogs** — a `semgrep/` resolver in `linters.ts`,
  then CodeRabbit/Greptile. [ai-native-linting #1](ai-native-linting.md) · **MED**
- **MCP-reference conformance** + a typed `mcp()` / `mcpConfig` harness hook —
  "does the cited `server#tool` still exist" via live or `.well-known`.
  [standards #3](standards-conformance.md) · [coverage-matrix](harness-testing-coverage-matrix.md) · **MED**
- **Unify `scan` + `lint` on one rule engine** — promote scan's hard-coded
  structural findings (no-description skill, no-tool-contract agent, missing hook)
  to documented, configurable, CI-gatable rules; scan becomes inventory + a
  rule-derived score. The ESLint model: one rule vocabulary, two frontends.
  [scan-lint-unification](scan-lint-unification.md) · **MED**
- **`compile --policy` → Cedar/OPA codegen** — one `tools:` declaration drives the
  dev-loop hook, the prod gate, and the trace check; emit-and-verify only.
  [runtime #3](runtime-guardrails-observability.md) · [landscape-mid-2026](landscape-mid-2026.md) · **P3**
- **Multi-harness compile & the mirror story** — `harness` in project config
  (select-by-config, not just auto-detect), a byte-identical `CLAUDE.md`⇄`AGENTS.md`
  copy-mirror when no sync tool fans out, and per-harness skill verify/compile.
  Kills the silent harness-mismatch footgun in `compile`.
  [multi-harness-compile](multi-harness-compile.md) · [sync-tool-compatibility](sync-tool-compatibility.md) · **MED**
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
    2026-06-17 section) · **LOW**

- **Per-check rate thresholds in `assertRates` (DONE — 2026-06-17, API review;
  additive, non-breaking).** The absolute oracle (`measure({ checks }) +
assertRates`) is the recommended path for testing one skill, but
  `assertRates({ min })` applied a single rate floor across _all_ checks. Now
  `assertRates({ min, per })` takes a per-check-KIND override, so "`skill` must
  fire every trial AND `judged` ≥ 0.8" gates in one call; the failure message
  reports each check's own min. The `judged` check's own `min` is a per-_run_
  score threshold (orthogonal — kept). [testing-api-design §Part 7](testing-api-design.md)

- **Single-arm ABSOLUTE behaviour path — first-class now (DONE — 2026-06-17, this
  PR).** Audit found A/B was over-privileged: the absolute path existed (single-arm
  `measure` + `judged` + `assertRates`, `examples/harness/dogfood/skill-quality.eval.mjs`)
  but README, `docs/harness-testing.md`, and the `test-harness` skill all led with
  the A/B `runEval` framing. Fixed (docs/skill only, no code change): the absolute
  oracle is now the **default** for testing a single skill across every front-door
  surface, with A/B reframed as the specialised relative/regression oracle (how
  promptfoo/DeepEval frame it). [testing-api-design §Part 7 #7](testing-api-design.md)

## Later — needs model auth (write-don't-run today) or bigger

- **Build the ONE polished front-door demo** — the deprecated demos (`examples/demo/`
  - `examples/plugin-test-demo.mjs` and their `demo`/`demo:plugin` scripts) have
    been **deleted**. What's still needed: ONE polished, reliably-passing demo plus a
    recorded GIF/asciinema, framed by the three "best"s — the stale-`enforce()`
    "lies" story as the one-sentence sell, and `vigiles scan` as the zero-setup wedge.
    [distribution-strategy](distribution-strategy.md) · feature-ideas #14 · **MED**
- **Leaderboard behavioural columns** — real trigger-rate + safety on top of the
  structural score. [divergent-bets #9](divergent-bets.md) · **LOW**
- **Harness cost/ROI optimizer** — A/B token-cost eval (full vs trimmed CLAUDE.md);
  a money story. [divergent-bets #10](divergent-bets.md) · **strong**
- **CI for model upgrades** — `--model` matrix over an eval baseline; catch the
  harness a new model silently breaks. [divergent-bets #8](divergent-bets.md) · **LOW**
- **Measured `judge()` rule — as an experiment first** — one `*.eval.mjs` that
  grades a code property + reports its FP rate; ship the rule kind only if the
  rate is publishable. [ai-native-linting #2](ai-native-linting.md) · [synthesis T2#8](strategic-synthesis-2026-06.md) · **LOW**
- **Sandboxed eval tier + non-Linux backend** — `runEval` still spawns `claude`
  unconfined; `sandbox-exec`/docker for non-Linux. [feature-ideas §13](feature-ideas.md) · **LOW**
- **Deterministic subagent / command wiring** — register + drive without a model.
  [coverage-matrix](harness-testing-coverage-matrix.md) · **LOW**

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
- **README STATUS BADGE for cc/codex plugins** (adoption flywheel, 2026-06-21 idea):
  a GitHub badge a plugin author drops in their README showing their harness is
  **verified / tested / evaled**, with TIERS (e.g. 🛡 lint-clean → ✅ tested (runHook)
  → 🎯 evaled (trigger-rate/behavior)). Same viral mechanic as build-passing/coverage
  badges — every badge is an ad + social proof, and the tiers pull authors UP the
  ladder (lint→test→eval, the exact funnel). Needs a `vigiles badge`/shield endpoint +
  a public verdict. The single highest-leverage distribution artifact tied to the
  product. See [distribution-strategy.md](distribution-strategy.md).
- **Viral debunk articles** (measurement-as-marketing) — but **method-first, NOT
  caveman-first.** The caveman take is SATURATED (~6mo old; Kuba Guzik/GrowwStacks/HN/
  Decrypt already covered it; the author conceded), so a "caveman is vaporware" piece is
  late and draws "already covered" pushback. The defensible angle is the **reproducible
  harness applied at SCALE** ("I built a re-runnable harness and measured N hyped skills'
  claims — here's the leaderboard"), where caveman is one VALIDATION row (agreeing with
  prior work proves the harness is sound) and the fresh content is the under-measured
  skills (token-efficient, the cluster) + head-to-head + the output-GROWS / best-case-is-
  worst finding. Ties A1 → adoption. See [measurement-authority.md](measurement-authority.md),
  `bench/ecosystem/FINDINGS.md` (§ saturation warning + methodology audit).
- **PUBLIC plugin leaderboard (site + GitHub) — the persistent viral artifact.** Promote
  A1 from internal findings to a public, always-on **ranking of real plugins/skills by
  claim-vs-measured + structural health**, with **head-to-head within a category** (e.g.
  compression: caveman vs token-efficient vs … on the same corpus). It's the durable
  home the debunk articles link into and the data moat accumulates in. Reuses what's
  already built: `src/leaderboard.ts` (structural-health score/grade) + `bench/ecosystem/`
  (A1 claim-vs-measured) — the new work is curation, a web surface, and a re-run cadence
  (sub-affordable, so it can stay current — the thing competitors can't afford). The
  README **badge** (above) is the per-plugin face of this leaderboard. The
  highest-leverage distribution bet; pairs with A1. See
  [measurement-authority.md](measurement-authority.md) (the two-products section),
  [divergent-bets.md](divergent-bets.md) (#9 leaderboard), `bench/ecosystem/`.
- **Build-business-on-top + acquisition posture:** position so (a) others can build on
  vigiles (open-core `agent()` + the `vigiles/adapter` authoring kit + the measurement
  DATA as the moat), and (b) it's an acquisition target for a top AI lab that wants to
  own the quality/safety-verification layer of its coding agent. Closed SaaS rivals
  (riftmap/SkillCheck/PolicyLayer) prove a business exists on this shape.
  [divergent-bets.md](divergent-bets.md), [landscape-mid-2026.md](landscape-mid-2026.md)

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
- **No (evaluated 2026-06-18):** [Sogen](https://sogen.dev/) as a sandbox backend
  — it's a syscall-level Windows/Linux _binary emulator_ (Unicorn/icicle/Hyper-V)
  for malware/DRM research, and its own docs say host isolation "might not be
  perfect". Wrong workload (we confine **Node + shell**, not compiled binaries),
  wrong guarantee (we need the containment to BE the boundary), wrong gap (our hole
  is macOS Seatbelt of native processes). The one transferable idea — **snapshot +
  deterministic replay** of full execution state — we already do at the right
  altitude (filesystem/trace: the eval record/replay cache, `snapshotDir` /
  `restoreDir`). Backend decisions live in
  [cross-platform-sandboxing](cross-platform-sandboxing.md) ·
  [egress-sandbox-tooling](egress-sandbox-tooling.md).

## See also

- [`typed-spec-power.md`](typed-spec-power.md) — the non-replicable wins of a
  typed `.spec.ts` over markdown (ranked + prototyped): typed handoff composition
  (`A.ok` must satisfy `B.needs`, checked by `tsc`) and typed purity (a `pure`
  agent can't be given `Bash` — a type error). The strongest "why a spec, not
  markdown" answer.
- [`typed-spec-frontier.md`](typed-spec-frontier.md) — the deeper PL-theory +
  formal-methods round (builds on `typed-spec-power.md`): the lethal trifecta as a
  forbidden compile-time TYPE (F1, the headline), a plan-before-mutate typestate
  protocol (F2), separation-logic disjoint-write runtime gates (F3), and
  noninterference as a 2-safety hyperproperty → an A/B eval pair (F4). All four
  prototyped against real `tsc` 5.9.3 / runtime in
  [`prototypes/typed-spec-frontier/`](prototypes/typed-spec-frontier/).
- [`typed-spec-effects-monads.md`](typed-spec-effects-monads.md) — round-2 cluster
  (algebraic effects / monads / interpreters): the granular effect ROW (generalize
  the 3-rung purity ladder to independent legs fs-read/fs-write/net/exec) + the
  handler-as-residual-shrinking-router (our egress recorder / tool-interceptor are
  already handlers without the abstraction). Prototyped in
  [`prototypes/typed-spec-effects-monads/`](prototypes/typed-spec-effects-monads/).
- [`typed-spec-formal-verification.md`](typed-spec-formal-verification.md) — round-2
  cluster (model checking). **Found a REAL shipping bug** by running TLC against the
  `agent-runtime.ts` active-agent window: under depth-5 nesting a nested subagent's
  Stop clears the whole flat slot → the parent inherits tools it never had
  (`Open(writer)→Open(writer)→Stop→Call(Bash)`, contract escape). The depth-aware
  STACK fix is TLC-certified. Verdict: model checking earns its keep ONLY for the
  harness author verifying the harness's OWN protocol, never per-user. Prototyped in
  [`prototypes/typed-spec-formal-verification/`](prototypes/typed-spec-formal-verification/).
- [`typed-spec-refinement-types.md`](typed-spec-refinement-types.md) — round-2 cluster
  (refinement / dependent / session types). The pick: **refinement → runtime guard**
  (parse-don't-validate — a `result()` brand minted only after a predicate passes, the
  payload-contract twin of typed composition's wire check); plus full branching/recursive
  session types for the railway ok/err arms (TS-encodable but a recursive walk hits TS2589,
  so the shipped typed `pipe` is fixed-arity). Key insight: the type-vs-runtime line is set
  by ARITY (literal shape → type, arbitrary value → runtime guard, protocol structure →
  shallow type). Prototyped in
  [`prototypes/typed-spec-refinement-types/`](prototypes/typed-spec-refinement-types/).
- [`covering-arrays-for-harness.md`](covering-arrays-for-harness.md) — the NIST
  pairwise / covering-array direction (`prune-the-timeline`). The pick: **eval
  interaction-testing as prune-then-sample** — the spec enumerates the config space,
  typed purity PRUNES the impossible configs (PICT-style constraints), a 2-way covering
  array SAMPLES the rest, and the subscription eval runs them; measured 3072 → 18 rows
  (99.4% fewer real-model runs) on a 10-skill × 3-model space. Non-replicable (markdown
  can't be fed to a CA generator) + ties the eval moat. Lint/scan is a crisp NO (free
  cells). Prototyped (real IPOG-style generator) in
  [`prototypes/covering-arrays/`](prototypes/covering-arrays/).
- [`typed-spec-fp-theory.md`](typed-spec-fp-theory.md) — round-3 deep FP/monad theory.
  Headline (a THEOREM): **Applicative / Selective / Monad is the boundary of static
  analyzability** — a selective-applicative pipeline's effect surface is a compile-time
  fold (the shipped `pipe`/`andThen` is ALREADY applicative — proven in `tsc`: monadic
  `bind` WIDENS the surface to all legs, precision provably lost), so the discipline is
  **never add a monadic `bind` combinator** (the one move that forfeits the moat). Plus
  T2 the spec-AST-as-abstract-interpreters (validated the #2 v1→v2 capability-diff) and
  T3 effect accumulation ≡ the `proofs.ts` join-semilattice. Prototyped in
  [`prototypes/typed-spec-fp-theory/`](prototypes/typed-spec-fp-theory/).
- [`whole-harness-codegen.md`](whole-harness-codegen.md) — the "wild idea", VALIDATED +
  perf-measured: a generated registry (`harness.gen.ts`, à la TanStack `routeTree.gen.ts`)
  imports every spec so `tsc` enforces the WHOLE harness as ONE program — cross-file typed
  composition, dangling-`delegate` + duplicate-name errors at edit time, and the repo-scale
  capability lattice that feeds the #2 capability-diff. **TS scales**: TS2589 only at N≈1000
  and ONLY in the naive O(N²) uniqueness encoding; the design uses per-edge O(N) types +
  uniqueness in the JS generator (~100ms at a realistic tens-of-specs harness). A MOAT lever
  (markdown- AND framework-impossible). Prototyped in
  [`prototypes/whole-harness-codegen/`](prototypes/whole-harness-codegen/).
- [`typed-spec-moat.md`](typed-spec-moat.md) — the consolidated synthesis of all
  five typed-spec research rounds + the founder-endorsed moat thesis: the harness as
  a compilable, analyzable formal object, the three concrete moats (unsafe harnesses
  don't compile / semantic capability-diff at PR / affordable interaction-testing),
  the type-safe pipelining keystone, the full ranked record of every finding, the
  adoption-tension catalog, and the proposed build order. The pick-what-to-build-later
  record.
- [`feature-ideas.md`](feature-ideas.md) · [`harness-testing-coverage-matrix.md`](harness-testing-coverage-matrix.md)
  — the two detailed backlogs.
- [`strategic-synthesis-2026-06.md`](strategic-synthesis-2026-06.md) ·
  [`divergent-bets.md`](divergent-bets.md) — the strategy behind the bets.
- [`distribution-strategy.md`](distribution-strategy.md) — why "Now" leads with
  distribution artifacts.
