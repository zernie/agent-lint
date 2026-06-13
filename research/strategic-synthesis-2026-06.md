# Strategic synthesis (2026-06-13): four deep researches, one throughline

> Status: synthesis (2026-06-13). Reads across four same-day deep researches —
> [agent-supply-chain-security](agent-supply-chain-security.md),
> [standards-conformance](standards-conformance.md),
> [runtime-guardrails-observability](runtime-guardrails-observability.md),
> [ai-native-linting](ai-native-linting.md) — and turns them into one ranked bet
> list. Deliberately did NOT re-open promptfoo / the eval landscape / harness
> testing (already deep in [eval-api-landscape](eval-api-landscape.md),
> [promptfoo-deep-dive](promptfoo-deep-dive.md),
> [harness-testing](../docs/harness-testing.md)); these four open fresh ground.
> Strategy anchors: [distribution-strategy](distribution-strategy.md),
> [reference-verification-limits](reference-verification-limits.md),
> [landscape-mid-2026](landscape-mid-2026.md).

## The convergent finding (and why it matters)

Four researchers, four adjacent markets, no shared draft — and **all four
independently returned the same verdict: extend the two pillars, reject the
market pivot, take one or two surgical bridges.** Each market (plugin security,
config standards, runtime guardrails, AI code review) turned out to be **crowded
and consolidating** — Snyk/Check Point/Palo Alto/Cisco bought the AI-security
startups; agnix shipped 423 config-lint rules; NeMo/Lakera/Guardrails AI own
runtime; CodeRabbit/Greptile own AI review. Entering any as "another X" is
entering a closing door.

What survived in every case was the **same unclaimed wedge**: vigiles holds the
_declared contract_ (the instruction file / spec) and can **bind it to reality**
— verify the references are real (pillar 1), prove the assembled machine behaves
(pillar 2), and — the recurring new idea — **attest that observed behaviour
matches what was declared.** No incumbent owns that binding, because the
scanners read files at rest, the firewalls watch traffic with no contract, and
the reviewers present judgments with no committed error rate.

A meta-caveat, stated honestly: four-for-four "reject the pivot" is either a
robust signal or a shared anchoring bias (every agent was briefed on the
two-pillar framing). I think it's mostly signal — the crowding/funding facts are
externally real — but the one place I'd _push back_ on the consensus is
positioning, below.

## The throughline: vigiles is a conformance layer, not a linter

Every "new direction" the four docs surfaced is the **same primitive** wearing
four costumes:

| Research     | The "new direction"                                      | The primitive                           |
| ------------ | -------------------------------------------------------- | --------------------------------------- |
| Supply-chain | observed-vs-declared manifest (run confined, diff, sign) | observed **≟** declared                 |
| Runtime      | `verify-trace` (prod OTel trace vs `tools:` contract)    | observed **≟** declared                 |
| AI-linting   | measured `judge()` rule (verdict + committed FP rate)    | judgment, but **falsified** not trusted |
| Standards    | MCP `server#tool` + "valid is not true" cross-ref        | declared **≟** real tooling             |

Read top to bottom, that is one capability: **does reality conform to the
declared, version-controlled contract — checked deterministically where
possible, and falsifiably-_measured_ where not?** That is not "a linter for
CLAUDE.md." It is a **conformance layer for the agent harness across its
lifecycle**: author-time (references real), test-time (machine behaves),
ship-time (observed matches declared). The deterministic creed survives intact —
the rule is _"never present a judgment as a fact,"_ not _"never touch judgment"_
(ai-linting §falsifiability) — and the no-undecidability-ceiling pillar
(measurement) is exactly what lets vigiles touch the judgment-shaped corners
nobody else can hold honestly.

## Ranked bets

### Tier 1 — ship now (cheap, rides an existing wave, no new identity)

1. **AGENTS.md + SKILL.md as first-class verified inputs** (standards #1). The
   engine is already format-agnostic; AGENTS.md is 60k+ repos and SKILL.md ~32
   tools. Nearly free distribution. _First step:_ `vigiles audit` verifies a
   hand-written AGENTS.md/SKILL.md's refs; scan one popular OSS repo's AGENTS.md
   and publish the findings (the distribution-strategy E1 lever, bigger corpus).
2. **`vigiles scan <plugin|mcp>`** (security #1) — a CLI face on `loadPlugin` +
   `recordEgress`: "I ran it, here's the egress + tool-contract drift + ref
   integrity," **delegating** secrets/typosquat/deps to gitleaks/semgrep/Socket.
   Zero new mechanism. _First step:_ boot each hook once under `recordEgress`,
   print `r.egress` + `.warnings` + pillar-1 findings as a table.
3. **OTel-GenAI span emission from the test tiers** (runtime #1). Map the
   existing `Trace` to OpenTelemetry GenAI spans so a harness test and a
   production Langfuse/Phoenix trace are the same shape. _First step:_
   `traceToOtel(trace)` in a new `src/otel.ts`, opt-in `emitOtel`, behind the
   semconv-version flag (client spans are stable; agent spans still experimental).
4. **`enforce()` over AI-linter catalogs** (ai-linting #1) — a `semgrep/`
   resolver in `src/linters.ts` (then CodeRabbit/Greptile): verify the
   `semgrep/sql-injection` a CLAUDE.md cites is real + enabled. A new,
   faster-drifting reference class nobody verifies. Extends `generate-types`.
5. **The "valid is not true" positioning** (standards #2) — one comparison row:
   structural validators (agnix) say your YAML is well-formed; vigiles says the
   rule it cites was deleted three commits ago. Pure positioning, converts a
   crowded field into a clarifying contrast.

### Tier 2 — the differentiated category (the conformance/attestation play)

6. **Observed-vs-declared, signed** (security #2 + runtime #2 unified). The
   genuinely novel artifact: declare a contract (tools, egress hosts,
   files-written), run confined, **diff observed against declared, sign with the
   existing SHA-256 chain**. Drive it from a captured trace in CI (`verify-trace`)
   _or_ a sandboxed boot (the supply-chain manifest). Reuses
   `decidePreToolUse`/`parseAgentTools` (`src/agent-runtime.ts`) and the
   `assertWroteOnly`/`assertEgressOnly` vocabulary. **No incumbent can issue this**
   — only vigiles holds both the declaration model and the confined-execution
   trace. This is the headline bet.
7. **`vigiles compile --policy` → Cedar/OPA** (runtime #3). One `tools:`
   declaration → dev-loop PreToolUse hook **and** prod Cedar gate **and**
   trace-conformance check, from one source. Emit-and-verify only; never ship a
   runtime evaluator. Builds on landscape-mid-2026's Cedar-as-7th-catalog.
8. **The measured `judge()` rule — as an experiment, not a feature** (ai-linting
   #2). Don't ship a rule kind. Write **one** `*.eval.mjs` that grades a code
   property ("error handled, not swallowed") across a labelled corpus and reports
   recall/FP via the existing `measureTriggerRate`/`stats` machinery. If the FP
   rate is publishable and stable across two model versions, the rule kind is
   justified; if not, the experiment _is_ the evidence that judgment stays
   delegated. Either outcome is publishable. **The deterministic move is to
   falsify the bet, not believe it.**
9. **MCP-reference conformance** (standards #3) — own "does the cited
   `server#tool` still exist," via live resolution or a `.well-known` Server Card
   fallback. Rides MCP's own registry/conformance momentum.

### Tier 3 — pivots, rejected (with the one exception)

Every market-entry pivot was independently rejected, and the reasons rhyme:
crowded + funded + (for security) trust-asymmetric + abandons the moat.

- **"The security layer for the agent harness"** — no (walks into the
  Snyk/Lakera funding gravity; security-grade trust before adoption is backwards).
- **Guardrails / observability vendor** — no (ML-classifier game with no model;
  puts vigiles in the request/data path, breaking "never in the hot loop").
- **The generic agnix-lane config linter** — no (commodity breadth race; drags
  back toward the rejected sync-tool positioning).
- **An AI PR reviewer** — no (8+ funded incumbents, precision-cursed, abandons
  the moat).

**The one pivot I'd actually put on the table — and it's a _positioning_ pivot,
not a market one:** lead with **"conformance / attestation for the agent
harness"** as the primary identity, demoting "linter for instruction files" to a
feature. _"Prove your agent did only what it declared"_ is a sharper, more
fundable, more defensible wedge than _"verify your CLAUDE.md references"_ — and
it's precisely where all four researches independently pointed (the
observed-≟-declared primitive). Same machinery, bolder story. The risk is
over-reaching the trust bar before the cheap-tier proof exists; the mitigation is
that Tier-1 ships the proof first and the reframe rides on top.

## Recommendation (if I'm betting)

1. **Now:** Tier 1 in order — #1 and #2 are the cheapest distribution rides; #3
   is near-free and makes existing tests more valuable.
2. **Next:** make **#6 (observed-vs-declared, signed)** the flagship — it's the
   one artifact nobody else can produce and it unifies the security + runtime
   threads. #7 (Cedar codegen) is its natural companion.
3. **In parallel, cheap:** run **#8's single experiment** — it either earns a
   genuinely novel "falsified-not-trusted" judge tier or proves the creed should
   hold. Don't pre-judge it.
4. **Reframe** around conformance/attestation once Tier 1 has shipped proof —
   the positioning pivot, not before.
5. **Refuse** all four market pivots. Keep harness-testing (pillar 2) deep and
   Claude-Code-anchored; let format-neutrality live only in pillar 1.

The unifying one-liner this earns: **vigiles is the conformance layer for the
agent harness — it verifies the contract is real, tests the machine behaves, and
proves reality matches what was declared. Deterministic where it can be,
falsifiably measured where it can't, never in the request path.**

## Confidence & verification note

The four docs are web-sourced (the agents reported live search). I verified
internal coherence and cross-links, **not** every external figure. Treat the
specific 2026 stats/incidents/IDs (e.g. the ToxicSkills percentages, agnix's
rule count, the Claude Code Action CVE date, the arXiv ID in the runtime doc) as
**claimed, not independently confirmed** — sanity-check any before quoting them
externally. The strategic conclusions don't hinge on any single figure; they
hinge on the market-structure pattern (crowded/consolidating) and the unclaimed
binding (observed-≟-declared), both robust across all four.

## See also

- [agent-supply-chain-security](agent-supply-chain-security.md) ·
  [standards-conformance](standards-conformance.md) ·
  [runtime-guardrails-observability](runtime-guardrails-observability.md) ·
  [ai-native-linting](ai-native-linting.md) — the four researches.
- [distribution-strategy](distribution-strategy.md) — the funnel the Tier-1 rides
  must clear.
- [reference-verification-limits](reference-verification-limits.md) — the
  proxy-vs-judgment boundary the measured-judge idea must respect.
- [landscape-mid-2026](landscape-mid-2026.md) — Cedar / AgentCore / Compiled-AI
  framing the runtime + policy bets build on.
