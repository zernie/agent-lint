---
status: rejected
topic: security
---

# Runtime Guardrails & the Observability Bridge

> Status: research (2026-06-13). Adjacent to [runtime-enforcement](runtime-enforcement.md), [agent-integration](agent-integration.md), [landscape-mid-2026](landscape-mid-2026.md) — does NOT re-cover the **dev-loop** runtime story (spec-derived Claude Code hooks, skill contracts, post-session git-diff audit) those docs already own. This doc covers the **production/online runtime** and the **observability/tracing** markets, and asks whether the same spec extends past commit-time into either.

## TL;DR

vigiles is a commit-time tool: it verifies references and tests the harness before code ships. Two adjacent markets sit downstream of where vigiles stops — **online guardrails** (block/validate at inference time) and **agent observability** (trace/telemetry in production). Both are crowded, well-funded, and largely a different business: becoming a guardrails vendor (PII/injection/output-schema filtering) or an observability vendor (a trace store + UI) would dilute vigiles into a category where it has no moat and ML-heavy incumbents.

But there is **one defensible bridge that is neither of those businesses**: the spec is already the single source of truth for what the agent is allowed to do, and the harness-test tiers already drive the agent. So vigiles can (1) **emit OpenTelemetry GenAI spans from harness tests** so the test-time trace and the prod-time trace speak one vocabulary, and (2) ship a **"verify your traces match your spec"** check that consumes prod OTel-GenAI traces and flags drift against the declared contract. vigiles does not _store_ traces or _block_ requests — it owns the **contract** that the guardrail enforces and the observability stack records against. That is the same compile-time-truth play, extended one hop downstream, without becoming either incumbent.

Verdict: **mostly stay out, with one surgical bridge.** Ship OTel-GenAI emission from the eval/harness tiers first (small, on-brand, makes existing tests more valuable); treat spec→Cedar policy codegen as a _reference_ play (already proposed in landscape-mid-2026), not a runtime-engine build; explicitly refuse to build a guardrail filter or a trace UI.

## Landscape 2026

### Guardrails market (online, inference-time)

The guardrails category has consolidated into a recognizable stack. The 2026 comparison set is **NVIDIA NeMo Guardrails, Guardrails AI, Lakera Guard, Llama Guard, OpenAI Moderation, and General Analysis GA Guard**. What they enforce splits cleanly:

- **Input guards** — prompt-injection / jailbreak detection, PII redaction, topic denial. ML-classifier-heavy (Lakera, Llama Guard, OpenAI Moderation). Probabilistic.
- **Dialog / flow control** — NeMo Guardrails uses Colang to define a state machine over the conversation and to restrict tool access. Programmable, partly deterministic.
- **Output validation** — Guardrails AI's `Guard` is a composable pipeline of validators that intercept the model response and enforce **output schema, field validation, structured-output constraints**. This is the most deterministic corner of the market.
- **Tool-use policy** — tool allowlists + parameter validators that block an agent from invoking a tool it shouldn't, with arguments it shouldn't pass. This is the corner closest to vigiles's `agent-runtime.ts` PreToolUse rail — but **at production runtime**, not in the Claude Code dev loop.

The most important 2026 shift is **policy-as-code authorization** moving _outside_ the agent. The pattern: decouple authorization from the LLM and hand it to a deterministic engine — **OPA (Rego)** for data-intensive joins, **Cedar** for formal verification / type safety / compliance artifacts. AWS **Bedrock AgentCore Gateway** chose Cedar for exactly this (principal × action × resource → allow/deny, auto-logged). An arXiv preprint ("Before the Tool Call: Deterministic Pre-Action Authorization for Autonomous AI Agents") formalizes the pre-tool-call gate. OWASP's 2026 Agentic Top 10 puts Goal Hijacking at #1 and NIST opened an AI Agent Standards Initiative (Feb 2026). The whole field is converging on the same thesis vigiles already holds — _deterministic rails outside the model_ — but applied to the **runtime** edge.

### Observability / tracing market

Six platforms anchor 2026: **LangSmith** (LangChain-native), **Langfuse** (open-source leader, self-hostable), **Arize Phoenix** (ML-grade, OTel-native via OpenInference), **Helicone** (drop-in proxy), plus **Datadog LLM** and **Honeycomb LLM Observability**. Braintrust sits at the eval/observability seam.

The decisive 2026 development is **standardization on OpenTelemetry GenAI semantic conventions**. Status as of mid-2026:

- **GenAI client spans (`gen_ai.client.*`) are STABLE** — they exited experimental in early 2026.
- **GenAI agent spans + framework spans + MCP tool spans are still in Development (experimental)** — not yet stable; gated behind `OTEL_SEMCONV_STABILITY_OPT_IN`.
- The **procurement question of 2026** is explicitly: "does this platform implement the OTel GenAI conventions and commit to the spec when it stabilizes?" Phoenix is OTel-native; Langfuse/Arize/LangSmith ingest OTel; Helicone's proxy predates the conventions.

So: there is now a **standard wire format** for what an agent did (model calls, tool calls, agent steps), it is partly stable / partly settling, and every serious platform is converging on it. That is the substrate any bridge would ride.

### The one deterministic corner — and why it's the only one that matters to vigiles

Of everything above, exactly two slices are deterministic rather than ML-probabilistic, and they are the only slices where vigiles's identity (compile-time truth, no model) even applies:

1. **Tool-use policy** (allowlist + parameter validation) and **policy-as-code authorization** (Cedar/OPA). A request either matches the policy or it doesn't — no classifier, no threshold.
2. **Output-schema validation** (Guardrails AI's structured-output `Guard`). A response conforms to a schema or it doesn't.

Everything else — injection detection, PII, toxicity, topic denial — is a classifier with a confidence score and a false-positive rate. vigiles has no business there and no model to do it with. So if vigiles touches the guardrails market at all, it touches **only** the tool-policy / authorization corner, and **only** as the thing that authors and verifies the policy, never as the thing that scores the request. That single corner happens to be precisely what `agent-runtime.ts` already does at dev-loop time — which is why it's the natural extension and the others aren't.

## The gap / whitespace

Both markets answer "what is the agent doing right now?" Neither answers **"does what the agent is doing match the declared, version-controlled contract that was tested at commit time?"**

- Guardrails enforce **a policy**, but that policy is authored separately from the instruction file / spec. Nothing guarantees the online tool-allowlist equals the `tools:` contract the subagent was tested against. The declared-vs-enforced gap (#4740/#21460, SDK #172) that `agent-runtime.ts` closes _in the dev loop_ re-opens _in production_ under a different engine.
- Observability records **what happened**, but the trace is interpreted by humans/dashboards. There is no machine check that the trace conforms to the spec — no "this run touched a tool outside the contract" assertion derived from the same source of truth the tests used.

The whitespace is the **contract that both downstream layers should share**: one declaration that (a) the dev-loop hook enforces, (b) the production policy engine enforces, and (c) the production trace is verified against. vigiles already owns (a) and owns the source of truth. Nobody owns the _binding_ between commit-time truth and runtime reality.

## Relation to vigiles's two pillars (the commit-time → runtime boundary)

|                                       | vigiles today (commit/test time)                                                  | The runtime edge (this doc)                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Pillar 1 — reference verification** | Rule/file/script/symbol refs exist & are enabled, in the spec                     | A prod **policy engine** (Cedar/OPA) enforces the same rule online                  |
| **Pillar 2 — testing the harness**    | `runHook`/`runHarnessTest`/`runEval` drive the agent against a mock or real model | A prod **trace** records the real agent; verify it conforms to the spec             |
| **The artifact**                      | markdown + `.d.ts` + JSON Schema + sidecar hashes                                 | OTel-GenAI spans + a policy file, both **derived from / verified against** the spec |

The boundary is sharp and worth stating: **vigiles produces and verifies contracts; it does not sit in the request path.** Everything in [runtime-enforcement.md](runtime-enforcement.md) is the _dev-loop_ runtime (Claude Code hooks fire while _you_ code). The _production_ runtime is a separate process, often a separate machine (Bedrock AgentCore, a deployed agent service), where vigiles has no hook to install. So the only honest way vigiles reaches production is **by exporting a contract** (codegen) or **by importing a record** (trace verification) — never by being the inline filter.

This is the same move as `generate-types` / `generate-schema`: vigiles doesn't _be_ the TypeScript compiler or the YAML LSP — it emits the artifact they consume. Runtime is the same shape: emit the policy the engine runs; verify the trace the platform stored.

### One contract, three enforcement points (the worked picture)

Concretely, take one declaration in a subagent spec — `tools: [Read, Grep, Bash("npm test")]`. Today it enforces at exactly one point. The bridge makes it enforce at three, all from the **same source**:

```
agent.spec.ts  (tools contract)
      │  vigiles compile / generate
      ├─▶ agents/x.md frontmatter ──▶ PreToolUse hook (agent-runtime.ts)   [dev loop — SHIPPED]
      ├─▶ x.cedar policy            ──▶ AgentCore/OPA gate                  [prod authz — idea #3]
      └─▶ expected-tool span set    ──▶ vigiles verify-trace (OTel-GenAI)   [prod lint — idea #2]
                                              ▲
runEval/runHarnessTest ──▶ traceToOtel ──▶ emitted spans  [test — idea #1]
```

The payoff is that the **test-time emitted trace and the prod-time recorded trace are the same shape**, both checkable against the same contract by the same `decidePreToolUse` logic. A regression where production starts calling a tool the spec forbids is then catchable two ways — the prod gate denies it live, and `verify-trace` flags it in the lint — both grounded in the one declaration the harness test already exercised. That binding is the whitespace from the previous section, made mechanical.

## Bold ideas (ranked: improvement → new direction → pivot)

### 1. OTel-GenAI span emission from the harness/eval tiers — **IMPROVEMENT** (highest leverage)

- **Bet.** `runEval`/`runHarnessTest` already capture `trace.modelRequests`, tool calls, cost, latency, token usage (`src/eval.ts`, `src/mock-model.ts`). Emit that captured trace as **OpenTelemetry GenAI spans** (`gen_ai.client.*` stable today; agent/tool spans opt-in). Now the artifact your _test_ produces is the _same wire format_ your prod observability platform ingests. A harness test and a Langfuse/Phoenix production trace become diffable. Zero new category — it makes the Pillar-2 output portable.
- **Risk.** Agent/MCP span conventions are still experimental; the schema may churn. Mitigate by emitting behind a flag and pinning the `OTEL_SEMCONV_STABILITY_OPT_IN` version; lead with the _stable_ client spans.
- **Smallest first step.** A `traceToOtel(trace)` pure function in a new `src/otel.ts` that maps the existing `Trace` to OTLP JSON; opt-in `runEval(..., { emitOtel: true })` writes a spans file. No exporter, no collector — just the file. One test asserting the span shape against the conventions.

### 2. "Verify your traces match your spec" — `vigiles verify-trace` — **NEW DIRECTION**

- **Bet.** Consume a production OTel-GenAI trace (file or OTLP) and check it against the compiled spec: every tool span ∈ the subagent's `tools:` contract; every model/step conforms to declared limits; flag spans that touched undeclared surface. This is **post-hoc, read-only, deterministic** — the production analogue of the post-session git-diff audit in [runtime-enforcement.md](runtime-enforcement.md), but driven by traces instead of git. It closes the declared-vs-enforced gap in _production_ without vigiles being in the request path. Reuses `parseAgentTools`/`decidePreToolUse` from `src/agent-runtime.ts` — the same allow/deny logic, now fed by a trace instead of a hook event.
- **Risk.** Requires the user to wire OTel (most serious shops already have). Trace volume → run it sampled/in CI on captured fixtures, not as a live stream (don't become a stream processor = don't become an observability vendor).
- **Smallest first step.** Accept the spans file from idea #1 as input; `decideTraceConformance(spans, parsedAgentTools)` returning the same allow/deny outcomes. Dogfood: feed an `examples/harness` eval's emitted trace back through it.

### 3. `vigiles compile --policy` → Cedar/OPA codegen — **NEW DIRECTION** (reference-first, not engine)

- **Bet.** The spec already declares `enforce("cedar/...")` tool/command allowlists (landscape-mid-2026 §Cedar). Generalize: compile the spec's tool-contract + command allowlist to a **Cedar policy** (or OPA Rego) the production engine runs. The dev-loop PreToolUse rail and the prod Cedar gate are then **one declaration, two backends** — exactly the gap in §Whitespace. Pairs with idea #1 of landscape-mid-2026 (Cedar as the 7th cross-referenced "linter"): vigiles already _verifies_ a Cedar policy matches the spec; this _emits_ it.
- **Risk.** Codegen tempts scope creep toward "owning the policy engine." Hard line: vigiles **emits and verifies** the policy file; AWS/OPA **runs** it. Never ship a runtime evaluator. Cedar's grammar is stable + has a Rust reference parser, so emission is bounded.
- **Smallest first step.** A `specToCedar(agentContract)` that emits one `forbid`/`permit` policy per declared tool; round-trip it through the existing Cedar resolver in `src/linters.ts` (`cedar.test.ts`) to prove emit→verify is consistent.

### 4. Become a guardrails or observability vendor — **PIVOT** (do NOT do this)

- **Bet (rejected).** Build an inline filter (PII/injection/output-schema) or a hosted trace store + UI.
- **Risk.** Wrong business entirely. Inline guardrails are ML-classifier-heavy (vigiles has no model and shouldn't); a trace UI is a SaaS data-store play against Langfuse/Arize/Datadog with no vigiles moat. Both put vigiles in the request path / data path, breaking the "deterministic compile-time truth, never in the hot loop" identity. See Honest case against.

## Honest case against (any runtime move at all)

1. **vigiles's moat is the source of truth, not the runtime.** Everything good about vigiles is that it operates _before_ code ships, where checks are cheap, total, and ungameable. The moment it touches a live request it inherits the runtime's problems (latency budget, false positives, ML fuzziness) and loses its determinism guarantee.
2. **The runtime edge is owned and well-funded.** Cedar+AgentCore (AWS), OPA, NeMo, Guardrails AI, Lakera on guardrails; six+ platforms on observability. vigiles cannot out-build any of them and shouldn't try.
3. **No production hook exists.** In the dev loop vigiles has Claude Code's PreToolUse — an unbypassable point. In production there is no equivalent vigiles controls; it would be one of N middlewares, easily bypassed, providing a _false sense of security_ (the exact risk runtime-enforcement.md §Risk already names).
4. **Adoption cost.** The bridge ideas require the user to have OTel and/or a policy engine wired. Most current vigiles users are at adoption Level 0–1 (inline comments / frontmatter). Building for the runtime edge serves the few mature shops while the on-ramp is where growth is.
5. **The conventions aren't stable yet.** Agent/MCP OTel spans are experimental. Building deep on a moving schema risks rework. Emit-behind-a-flag is the only defensible posture until they stabilize.

**Where the case-against loses:** idea #1 (OTel emission) costs almost nothing, adds no runtime surface, and makes the _existing_ Pillar-2 tests strictly more valuable (portable traces) — it's an improvement, not a market entry. Ideas #2/#3 are read-only / emit-only and keep vigiles out of the hot path. The line that must not be crossed is idea #4.

## See also

- [runtime-enforcement.md](runtime-enforcement.md) — spec-derived hooks / skill contracts / post-session audit **in the dev loop** (this doc is the production-runtime + observability complement).
- [agent-integration.md](agent-integration.md) — deterministic backstop via hooks/proofs/static checks; package hallucination, secrets, hook anti-patterns.
- [landscape-mid-2026.md](landscape-mid-2026.md) — Cedar as the 7th cross-referenced catalog + AWS Bedrock AgentCore positioning (idea #3 builds on this); ContextCov, Harness Engineering, Compiled AI.
- [harness-testing.md](../docs/harness-testing.md) — the three test tiers whose captured traces idea #1 would export as OTel-GenAI.
- [eval-api-landscape.md](eval-api-landscape.md) — eval-API field; observability platforms (Braintrust/LangSmith) overlap the eval seam.
- `src/agent-runtime.ts` / `src/eval.ts` / `src/mock-model.ts` — the existing trace-capture + allow/deny logic the bridge ideas reuse.

### External (2026)

- [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — client spans stable, agent/MCP spans experimental.
- [Why Bedrock AgentCore chose Cedar for agentic workflows](https://aws.amazon.com/blogs/security/why-policy-in-amazon-bedrock-agentcore-chose-cedar-for-securing-agentic-workflows/) — policy-as-code at the tool layer.
- [Why OPA is the missing guardrail for AI agents](https://codilime.com/blog/why-use-open-policy-agent-for-your-ai-agents/) — deterministic authorization outside the agent.
- [Before the Tool Call: Deterministic Pre-Action Authorization for Autonomous AI Agents](https://arxiv.org/pdf/2603.20953) — formal pre-tool-call gate.
- [Guardrails AI + NeMo Guardrails layered approach](https://guardrailsai.com/blog/nemoguardrails-integration) — dialog control + output-schema validation split.
- [Agent observability: LangSmith / Langfuse / Arize 2026](https://www.digitalapplied.com/blog/agent-observability-platforms-langsmith-langfuse-arize-2026) — OTel-compliance as the 2026 procurement axis.
