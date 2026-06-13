# Retargeting pillar 2 at code-defined agent SDKs?

> Status: research (2026-06-13). Adjacent to
> [harness-testing](../docs/harness-testing.md),
> [eval-api-landscape](eval-api-landscape.md) — does NOT re-cover the Claude-Code
> config-file tiers (runHook / runHarnessTest / runEval) or the real-model
> eval-runner field (promptfoo / DeepEval / Braintrust / LangSmith). This is
> about **code-defined** agents built with agent SDKs and whether they lack the
> deterministic, mock-model test tier that is vigiles pillar 2's whole bet.

## TL;DR — the gap is largely CLOSED (verdict: don't retarget)

The strategic premise was: code-first agent SDKs (tools/guardrails/handoffs/hooks
defined in code, not config files) might lack a cheap, deterministic, no-API-key
way to test the assembled agent — the exact thing vigiles' middle tier offers for
the Claude Code config-file harness. **That premise is mostly false in 2026.** The
deterministic mock-model tier is a _solved, first-party_ feature in the SDKs that
matter most:

- **Pydantic AI** ships `TestModel` + `FunctionModel` + `Agent.override()` +
  `capture_run_messages()` + an `ALLOW_MODEL_REQUESTS=False` global kill-switch —
  a purpose-built, documented deterministic test path that asserts _which tools
  were called with what args_, no key, no cost.
  [[pydantic]](https://pydantic.dev/docs/ai/guides/testing/)
- **Vercel AI SDK** ships `MockLanguageModelV3` (+ `simulateReadableStream`,
  `mockValues`, `mockId`) under `ai/test` — a deterministic, key-free mock
  provider.
  [[ai-sdk]](https://ai-sdk.dev/docs/ai-sdk-core/testing)
- **LangGraph / LangChain** ships `FakeListChatModel` / `GenericFakeChatModel`,
  and the graph is deliberately built from deterministic nodes you can drive with
  an in-memory checkpointer.
  [[langchain]](https://docs.langchain.com/oss/python/langchain/test)
- **LlamaIndex** ships `MockLLM`; **Mastra** ships a `mockModel` built on the
  Vercel SDK's `ai/test`.
  [[llamaindex]](https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/llms/__init__.py)
  [[mastra]](https://github.com/mastra-ai/mastra/issues/5990)

So the headline value prop ("assert tool calls / blocks deterministically without
burning model calls") is **table stakes** in the Python+TS SDK ecosystem, not a
wedge. A blanket "retarget pillar 2 at agent SDKs" bet is **weak** — several
frameworks already ship exactly the thing.

There is one narrow, real residual: a couple of high-adoption SDKs ship their mock
as an **internal test fixture, not public API** (OpenAI Agents SDK's `FakeModel`
lives in `tests/`), and the _assembled-machine + deterministic guardrail/tool-
contract_ framing (vigiles' actual differentiator) is thinner everywhere than the
mock-model primitive. That's a feature-sized opening, not a pillar-sized one. See
[Bold verdict](#bold-verdict).

## Landscape 2026 — the code-first SDKs and their adoption

Code-defined agents are genuinely how serious agents ship in 2026 (not just
no-code platforms): LangGraph reports ~34.5M monthly downloads and the marquee
production list (Klarna, Uber, LinkedIn, BlackRock, JPMorgan, Replit); CrewAI
passed ~52k★; OpenAI, Google, Microsoft and Pydantic all shipped first-party
SDKs in the 2025–2026 wave; Gartner projects 40% of enterprise apps carry
task-specific agents by end-2026 (from <5% in 2025).
[[alicelabs]](https://alicelabs.ai/en/insights/best-ai-agent-frameworks-2026)
[[firecrawl]](https://www.firecrawl.dev/blog/best-open-source-agent-frameworks)
So premise (a) — "are serious agents actually built in SDK code?" — is **yes**.
The bet fails on premise (b), the testing gap, not on adoption.

How the harness is expressed in code, per SDK (the surfaces vigiles would target):

| SDK                             | Lang      | Harness-in-code surfaces                                          |
| ------------------------------- | --------- | ----------------------------------------------------------------- |
| Claude Agent SDK                | TS + Py   | tools, **hooks** (in-process callbacks), subagents, MCP, settings |
| OpenAI Agents SDK (Swarm)       | Py + TS   | tools, **guardrails** (in/out), **handoffs**, agents-as-tools     |
| LangGraph / LangChain           | Py + TS   | graph nodes/edges, tools, checkpointer state, interrupts          |
| Google ADK                      | Py + Java | tools, callbacks, sub-agents, `InMemoryRunner`                    |
| MS Agent Framework (AutoGen+SK) | .NET+Py   | agents + deterministic workflow orchestration, middleware         |
| Pydantic AI                     | Py        | tools, output types, **typed deps**, instrument hooks             |
| Mastra                          | TS        | agents, tools, workflows, memory, scorers                         |
| Vercel AI SDK                   | TS        | tools, `stopWhen`/steps, middleware (`LanguageModelV3Middleware`) |
| CrewAI                          | Py        | agents, tasks, crews, tools, flows                                |
| LlamaIndex agents               | Py + TS   | tools, workflows, query engines                                   |
| Letta                           | Py/HTTP   | stateful agents, memory blocks, tools (server model)              |
| VoltAgent                       | TS        | agents, tools, workflows + VoltOps observability                  |

## Testing affordances — per-framework (the crux)

The question that decides the bet: does each ship a **deterministic, cheap
(mock-model, no-API-key) way to assert tool calls / guardrail blocks / handoffs**,
or does it punt to real-model evals / ad-hoc mocking / nothing?

| Framework               | Harness-in-code? | First-party deterministic mock-model test tier?                                                                                              | What they point you to                                       |
| ----------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Pydantic AI**         | ✅               | ✅ **Strong** — `TestModel`/`FunctionModel`, `override()`, `capture_run_messages`, `ALLOW_MODEL_REQUESTS=False`                              | built-in testing docs; Pydantic Evals for real-model         |
| **Vercel AI SDK**       | ✅               | ✅ `MockLanguageModelV3` + `simulateReadableStream` (mock provider; no agent-flow asserts)                                                   | `ai/test`; bring your own trajectory assertions              |
| **LangGraph/LangChain** | ✅               | ✅ `FakeListChatModel`/`GenericFakeChatModel` + in-memory checkpointer (deterministic nodes)                                                 | LangChain test docs; LangSmith for real-model                |
| **LlamaIndex**          | ✅               | ✅ `MockLLM` (`IS_TESTING` env auto-swaps)                                                                                                   | core test utils; cost analysis                               |
| **Mastra**              | ✅               | 🟡 `mockModel` (wraps Vercel `ai/test`; flagged as leaning on an unstable test API)                                                          | Vitest + Mastra scorers/evals; Studio                        |
| **Google ADK**          | ✅               | 🟡 `InMemoryRunner` + `unittest.mock`; **no first-party "fake model"** primitive                                                             | `AgentEvaluator` golden-dataset evals (real model)           |
| **OpenAI Agents SDK**   | ✅               | 🟡 `FakeModel` exists but is **`tests/` internal fixture, not public API**                                                                   | Guardrails docs; "the handoff is the test" → evals           |
| **MS Agent Framework**  | ✅               | 🟡 .NET `Microsoft.Extensions.AI` test doubles; no agent-level fake-model story surfaced                                                     | debugging/tracing; Foundry evals                             |
| **CrewAI**              | ✅               | 🔴 no first-party mock-model; community pattern = DI-mock the LLM yourself                                                                   | DeepEval shims; trace `crew.kickoff`                         |
| **Letta**               | ✅ (server)      | 🔴 explicitly **anti-mock** — Letta Evals runs replicas "exactly as in production"                                                           | Letta Evals (real model), ADE simulator                      |
| **VoltAgent**           | ✅               | 🔴 offline evals over fixed datasets (deterministic _scores_, real model)                                                                    | VoltOps observability + offline evals                        |
| **Claude Agent SDK**    | ✅               | 🟡 hooks are in-process callbacks (unit-testable as fns); **no SDK-level mock model** ships — third-party `paultyng/testagent` fakes the CLI | vigiles (config-file harness); promptfoo provider; testagent |

Reading the table: **the top tier of the ecosystem by adoption (Pydantic AI,
Vercel AI SDK, LangGraph, LlamaIndex) already ships the deterministic mock-model
primitive as a first-class, documented feature.** The 🟡/🔴 rows are real but
they're mostly "ships a mock but it's internal/unstable" or "philosophically
prefers real-model evals" — not "no way to do it."

## The gap (or: why there isn't a big one)

What is genuinely _solved_ (so vigiles would be re-building, not pioneering):

- **Deterministic model substitution.** Mock/fake model classes are first-party
  in the four highest-adoption SDKs. This is the literal core of vigiles' Tier 2.
- **Asserting tool calls / args.** Pydantic AI (`capture_run_messages`),
  LangGraph (stream the steps), and the trajectory-assertion pattern across the
  field all cover "did it call tool X with args Y."
  [[langwatch]](https://langwatch.ai/scenario/testing-guides/mocks/)

What is _thinner_ everywhere — the only places a vigiles-shaped contribution could
matter:

1. **Mock-as-public-API vs internal fixture.** OpenAI Agents SDK's `FakeModel`
   sits in `tests/fake_model.py`; users re-roll their own. A small, framework-
   blessed mock + assertion helper for that SDK is a real (small) gap.
   [[openai-fake]](https://github.com/openai/openai-agents-python/blob/main/tests/fake_model.py)
2. **Deterministic _guardrail / tool-contract enforcement_ testing, not just the
   model.** The 2026 research consensus is that text-level alignment doesn't
   transfer to tool-call safety — you need a deterministic layer that decides
   _which actions are currently eligible_ and test it as such ("behavioral
   contracts", "tool eligibility").
   [[contracts]](https://arxiv.org/html/2602.22302v1)
   [[eligibility]](https://www.chenyezhu.com/writing/tool-eligibility-deterministic-guardrails-ai-agents/)
   This is _exactly_ vigiles' existing differentiator on the CC side — the
   PreToolUse tool-contract rail in `src/agent-runtime.ts` (declared `tools:` is
   documentation; the hook is the rail). The mock-model primitive proves "the
   model asked for tool X"; it does **not** prove "the assembled guardrail would
   have blocked X." The SDKs ship the former, not a turnkey deterministic test of
   the latter across the assembled machine.
3. **The _assembled machine_, not one node.** SDK mocks test _your code calling
   the model_. They do less to answer "load the agent as it ships (its
   guardrails + handoff graph + middleware) and assert it stays in contract" —
   the framing vigiles already has for plugins (`plugin-loader`). But this is a
   harder sell in code (there's no `plugin.json` to load; the harness _is_ the
   user's import graph), so it's more "a testing library/convention" than a
   loader.

Net: the gap is **not** "no deterministic tier exists." It's "the deterministic
tier they ship stops at the model boundary; deterministic _contract/guardrail_
testing of the assembled agent is under-served." That's a feature, possibly a
cross-framework library — not a reason to relocate pillar 2.

## Fit with vigiles pillar 2 — what a retarget would actually look like

If (despite the above) we chased it, the honest shape is **not** "port runHook /
runHarnessTest to SDKs." vigiles' tiers are built on the Claude Code _process
contract_ (a hook is a child process fed event JSON; a mock model speaks the
Anthropic SSE wire via `ANTHROPIC_BASE_URL`). Code-defined SDKs have **no such
out-of-process seam** — the harness is in-process callbacks and an import graph,
and each SDK already owns the in-process mock seam (`override()`,
`MockLanguageModelV3`, `FakeListChatModel`). There is nothing for vigiles' wire-
level mock to attach to that the SDK hasn't already attached to better.

The only transferable asset is the **idea**, not the code: the assembled-machine

- deterministic-contract framing (`agent-runtime.ts`'s "declared ≠ enforced" rail,
  `assertToolNotUsed`-style safety negatives, regression gating via Welch +
  committed baseline). A plausible minimal wedge would be a per-SDK thin layer:
  "load the agent's declared tool/guardrail contract, drive it with the SDK's _own_
  mock model, assert it never leaves contract + gate the trajectory in CI." That
  rides each SDK's mock instead of replacing it.

Note: one SDK is genuinely in vigiles' lane — the **Claude Agent SDK** ships the
same hook _events_ as Claude Code but as in-process callbacks and **no SDK-level
mock model**; the community filled it with `paultyng/testagent` (a deterministic
fake claude CLI).
[[testagent]](https://github.com/paultyng/testagent)
That overlaps vigiles' existing CC work far more than the Python/TS agent SDKs do —
if anything is worth a look, it's deepening the Claude-family story, not chasing
LangGraph/Pydantic where the seam is already owned.

## Bold verdict

**Do NOT retarget pillar 2 at the general agent-SDK ecosystem.** The deterministic
mock-model tier — the heart of the bet — is already a first-party, documented
feature in the most-adopted SDKs (Pydantic AI is the clearest counter-example: it
ships _everything_ vigiles' middle tier offers, natively). Relocating there means
re-implementing a solved primitive against an in-process seam the framework
already owns, with worse ergonomics than the native tool.

**Smallest first step IF you want to test the water without a strategic bet:**
write _one_ probe — a deterministic, contract-enforcement test (not a mock-model
test) for **one** SDK where the contract layer is real and the mock is _not_
public: the **OpenAI Agents SDK** (guardrails + handoffs + internal-only
`FakeModel`). Use its own model double, assert a guardrail _blocks_ and a handoff
goes to the _right_ agent, and gate the trajectory with vigiles' significance +
baseline machinery. If that probe feels like it's adding something the SDK can't,
revisit. It almost certainly won't — but it's a day, not a quarter, and it tests
the actual residual (contract enforcement) rather than the solved part (the mock).

Stay focused on the config-file Claude Code harness, where vigiles is
differentiated (assembled-machine load + sandboxed untrusted-plugin execution +
the declared-vs-enforced tool-contract rail), and treat "deterministic agent
testing for SDKs" as **interop/idea-borrowing**, not a port.

## Honest case against (i.e., reasons the gap could still be worth a bet)

- **Mock ≠ assembled-machine test.** Every SDK mock substitutes the _model_;
  none ship a turnkey "load my agent's guardrail+handoff graph and prove it stays
  in tool-contract" the way vigiles loads a plugin. If the market converges on
  "behavioral contracts / tool eligibility" as the real safety unit (the 2026
  research direction), a cross-framework deterministic _contract_ tester is
  unclaimed — and that's vigiles' actual moat, not the mock.
- **Internal/unstable mocks are a real papercut.** OpenAI's `FakeModel` is
  private; Mastra's `mockModel` is flagged for leaning on an unstable
  `ai/test` API that has shipped runtime regressions (ai@5.0.27,
  provider-utils@3.0.10). A stable, framework-agnostic mock+assertion helper has
  a (small) audience.
  [[mastra-issue]](https://github.com/mastra-ai/mastra/issues/5990)
  [[ai-8356]](https://github.com/vercel/ai/issues/8356)
- **TS-side fragmentation.** Vercel/Mastra/VoltAgent/LangGraph-JS each have their
  own (or borrowed) mock; a runner-agnostic trajectory-assertion library (vigiles
  already ships `vigilesMatchers` for vitest/jest) could unify TS-side. But
  that's a testing-utility play, not a pillar relocation.
- Counter-counter: all three of these are _features adjacent to pillar 2_, not a
  reason to move it off Claude Code. The bet only becomes strong if the
  contract-enforcement framing (#2 in [The gap](#the-gap-or-why-there-isnt-a-big-one))
  proves to be a category — and that's testable cheaply via the one-probe step
  above before committing.

## See also

- [`docs/harness-testing.md`](../docs/harness-testing.md) — vigiles' three tiers
  for the Claude Code _config-file_ harness (not re-covered here).
- [`research/eval-api-landscape.md`](eval-api-landscape.md) — the real-model
  eval-runner field (promptfoo/DeepEval/Braintrust/Inspect).
- [`research/promptfoo-deep-dive.md`](promptfoo-deep-dive.md) — promptfoo's 2026
  agentic providers (incl. `anthropic:claude-agent-sdk`) and the one axis that
  still separates vigiles.
- `src/agent-runtime.ts` — the declared-vs-enforced PreToolUse tool-contract rail,
  the differentiator that maps onto the "behavioral contracts" direction above.

## Sources

- Pydantic AI testing (TestModel/FunctionModel/override/ALLOW_MODEL_REQUESTS):
  https://pydantic.dev/docs/ai/guides/testing/ ·
  https://ai.pydantic.dev/api/models/test/
- Vercel AI SDK testing (MockLanguageModelV3, simulateReadableStream):
  https://ai-sdk.dev/docs/ai-sdk-core/testing ·
  https://ai-sdk.dev/docs/reference/ai-sdk-core/simulate-readable-stream ·
  regression issues: https://github.com/vercel/ai/issues/8356 ·
  https://github.com/vercel/ai/issues/8994
- LangChain/LangGraph testing (FakeListChatModel, deterministic graphs):
  https://docs.langchain.com/oss/python/langchain/test ·
  https://andrew-larse514.medium.com/how-we-unit-test-langgraph-agents-29f5d6ef82c6
- LlamaIndex MockLLM:
  https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/llms/__init__.py
- Mastra mockModel (on ai/test) + unstable-API issue:
  https://github.com/mastra-ai/mastra/issues/5990
- OpenAI Agents SDK: guardrails https://openai.github.io/openai-agents-python/guardrails/ ·
  internal FakeModel https://github.com/openai/openai-agents-python/blob/main/tests/fake_model.py ·
  "the handoff is the test" https://futureagi.com/blog/evaluating-openai-agents-sdk-2026/
- Google ADK testing/eval (InMemoryRunner, AgentEvaluator):
  https://google.github.io/adk-docs/evaluate/ ·
  https://deepwiki.com/google/adk-samples/15.3-testing-and-evaluation
- Microsoft Agent Framework v1.0 (AutoGen+SK convergence):
  https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/
- CrewAI testing patterns (DI-mock the LLM; DeepEval shims):
  https://deepeval.com/integrations/frameworks/crewai ·
  https://callsphere.ai/blog/unit-testing-ai-agents-mocking-llm-calls-deterministic-tests
- Letta Evals (anti-mock, run-as-production): https://github.com/letta-ai/letta-evals ·
  https://www.letta.com/blog/letta-evals
- VoltAgent offline evals: https://voltagent.dev/evaluation-docs/
- Claude Agent SDK testing / testagent fake CLI: https://github.com/paultyng/testagent ·
  https://www.morphllm.com/claude-code-hooks
- Adoption 2026: https://alicelabs.ai/en/insights/best-ai-agent-frameworks-2026 ·
  https://www.firecrawl.dev/blog/best-open-source-agent-frameworks
- Deterministic contracts / tool eligibility direction:
  https://arxiv.org/html/2602.22302v1 ·
  https://www.chenyezhu.com/writing/tool-eligibility-deterministic-guardrails-ai-agents/ ·
  https://langwatch.ai/scenario/testing-guides/mocks/
