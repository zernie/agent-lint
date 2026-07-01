---
status: active
topic: eval
---

# Isolated vs whole-harness skill/agent evaluation

> Research of record (2026-06-17). When you eval ONE skill/subagent, do you load
> it **isolated** (only that skill) or load the **whole harness** (the user's
> real skills + agents + hooks + CLAUDE.md, as they ship)? Companion to
> [`docs/eval-architecture.md`](../docs/eval-architecture.md) and the trigger-rate
> work in `src/eval.ts` (`measureTriggerRate`).

## Decision

**Both, as two named tiers — default isolated, gate whole-harness.** Isolated is
the cheap authoring inner-loop; whole-harness is the release gate and the genuinely
differentiated capability (no existing tool does it). Offer a **near-neighbor**
middle tier for when the full roster is too costly/noisy.

## Why isolated-only lies (the load-bearing finding)

Skill/subagent selection is **competitive**: only `name`+`description` metadata is
loaded, and the model routes on it. As the install set grows, selection degrades —
confirmed three independent ways:

- **Vendor-confirmed eviction.** Claude Code budgets all skill metadata to a small
  fraction of context (`skillListingBudgetFraction`, ~1%); on overflow, **the
  least-used skills' descriptions are dropped first**. A skill that fires alone can
  be _structurally unable_ to fire amid 30 peers — the model never sees it. (Exact
  constant is version-dependent; the mechanism is documented.)
- **Anthropic says it for subagents:** "flooding Claude with options makes
  automatic delegation less reliable… most teams settle on a handful."
- **Tool-overload research quantifies it:** RAG-MCP 13.6% → 43.1% selection
  accuracy (all-tools vs relevant-only); TaskBench ~96% → ~25-39% from 1 → 6-8
  tools; "context rot" degrades every frontier model as input grows.

**Therefore:** isolated trigger-rate **overstates recall** (the description may be
evicted or out-competed in the real harness) and **understates false-positives**
(with no sibling skills, a prompt can't be correctly routed _away_, so an
over-broad description's precision cost is invisible). The bias is one-sided —
which is what makes an isolated-only number dangerous.

## The competitive gap

**Every existing tool isolates, none populate.** promptfoo's `skills:` "narrows
the session to a single skill" ("everything else held constant… difference comes
from the skill text"); Anthropic's skill-creator runs "isolated agents in separate
contexts… no cross-contamination"; AWS sample-agent-skill-eval is single-skill-dir
A/B; OpenAI's cookbook is trigger + negative controls. **None deliberately
co-install the full set to measure interference/hijacking.** "Does my skill misfire
when 30 others are present?" is unaddressed — a defensible wedge for a tool whose
positioning is literally "test the harness as it ships."

Caveat that's easy to conflate: Anthropic's eval guidance says start each trial
from a **clean environment** (reproducible per-trial state) — that means no
leftover state, **not** an empty install set. Clean-environment and
isolated-install-set are orthogonal; don't confuse them.

## The trade-off

|                         | Isolated    | Near-neighbor             | Whole-harness |
| ----------------------- | ----------- | ------------------------- | ------------- |
| Selection realism       | none        | partial (real contenders) | full          |
| Recall estimate         | overstated  | ~faithful                 | faithful      |
| False-positive estimate | understated | ~faithful                 | faithful      |
| Attribution             | clean       | mostly clean              | confounded    |
| Cost / variance         | low         | medium                    | high          |

Maps onto the **test pyramid**: "test the skill alone" is a unit test that gives
the same false confidence as a mocked-everything unit test — selection contention
is an **emergent, integration-only failure** the isolated tier cannot see. So: many
cheap isolated checks, fewer expensive whole-harness checks, but the whole-harness
tier is **non-optional** because the failure it catches is invisible below it.

## Recommendation → vigiles shape

1. **Default isolated** trigger-rate (today's `measureTriggerRate` behavior) as the
   authoring inner-loop. **Label its output honestly** as an upper bound on recall /
   lower bound on false-positives.
2. **Add a whole-harness tier** (an `installSet` / `withHarness` arm): install the
   skill-under-test alongside the user's _real_ set and re-measure. The only tier
   that catches description-eviction + out-competition; pair with baseline gating so
   adding a 31st skill that evicts an existing one's description **fails loudly**.
3. **Offer a near-neighbor middle tier**: skill-under-test + its NCD-nearest
   competitors (reuse the existing `findSimilarRules`/`ncd` engine — best
   precision-per-token, deterministic selection of the contender set).
4. **When each:** isolated while authoring / fast CI; near-neighbor when the roster
   is large; whole-harness as the pre-release/regression gate.

**Over-engineering to avoid:** (a) per-skill Shapley/credit-assignment from
whole-harness runs — the isolated tier already gives clean attribution; (b)
_simulating_ Claude Code's eviction logic to predict firing — install the real set
and measure, the mechanism is version-dependent; (c) making whole-harness the
_default_ — it's noisier, costlier, and confounds attribution; it earns its place
as a gate.

## Affordability tie-in

This dovetails with the subscription-cost thesis (`docs/eval-architecture.md`):
isolated = small context = cheapest; near-neighbor = bounded; whole-harness =
priciest, so it's a **release gate you run deliberately** — not the per-PR loop.

Be precise about "gate," because evals do **not** run in (GitHub Actions) CI: the
per-PR / per-commit CI is the **free deterministic tiers** (`runHook`, mock-model
`runHarnessTest`, no token). The real-model eval runs where the **subscription**
already is — a **Claude Code session** (the agent loop / web / a scheduled
session) or locally — since vigiles drives the `claude` CLI. So "release gate"
means _run it deliberately_ on your sub, not a standalone CI workflow needing a
token. Whole-harness is the priciest tier, so it's the one you run least often.
