---
status: active
topic: roadmap
---

# Direction: the four-instrument harness + the local observability ledger

> Tech direction of record (2026-07-01). The architecture decision behind the next build
> phase. This is the TECHNICAL half only — product/GTM specifics are kept out of the
> public record by design. Companion to `harness-state-space.md` (the organizing thesis)
> and `measurement-authority.md` (the measurement pivot); `roadmap.md` sequences it.

## The frame: the typed spec is the declared ground truth

vigiles is ONE loop, not a bag of features: **declare what the harness should do (the typed
spec), then check reality against that declaration.** Four instruments do the checking, each
a facet of the same loop — not a menu to assemble:

| Instrument | When | Cost | Checks |
| --- | --- | --- | --- |
| **Verify** (lint / cross-ref / compile) | author-time | free, no model | refs resolve, spec compiles, tool-contracts valid, capability-diff at PR |
| **Gate** (compiled hooks) | loop-time | free | unsafe states can't be entered |
| **Measure** (evals on your sub) | pre-ship | your sub | does the skill fire, does behaviour move |
| **Observe** (the flight recorder) | real sessions | free, local | what actually happened, vs the declaration |

The spine that keeps this coherent (and stops it becoming a kitchen-sink framework): **the
typed spec is the ground truth every instrument measures against.** A feature belongs only
if it's a facet of declare→check. If it isn't, it doesn't ship.

## The precision principle (why observability is precise here and not for a black box)

Passive observability has an asymmetry: **what DID happen is precisely observable; what
SHOULD have happened needs an intent label.** So split by decidability:

- **Deterministic surfaces** (hooks, tool-contracts, references, capability/effects): the
  "supposed to" is DECLARED by the typed spec, so "did reality match?" is deterministic —
  precise, free, no judge. A tool-contract says "reviewer may only Read/Grep" → "did it
  violate?" is a fact. A compiled hook says "deny force-push" → "did it wrongly allow?" is a
  fact. **The typed spec is what makes observability precise.** Against a black box (no
  declared contract) this is impossible — you'd need a model to guess intent.
- **Behavioral surfaces** (skill triggering — "should this FIRE here?"): undecidable
  statically (Rice). Passive obs precisely catches false-positives, collisions, and
  drift-vs-baseline; catching a MISS needs a label from either (a) authored expectation
  (`measureTriggerRate` — you supply the prompts that SHOULD fire it, on your sub) or (b) a
  behavioral proxy (user rephrase/retry/undo — fuzzy heuristic). Never claim passive obs
  precisely catches a miss.

This mirrors how the pre-deploy testing tools work (they AUTHOR ground-truth scenarios; none
catch a miss from passive prod observation) — minus the cloud.

## Per-surface map — which instrument fits which surface

The right instrument depends on whether the surface is deterministic or behavioral:

| Surface | Core property | Typed spec? | Observe? | What we do |
| --- | --- | --- | --- | --- |
| **Subagents** | deterministic (composition/contracts) | ✅ big (railway, tool-contract, result) | ✅ typed outcomes | compile-time handoff checks + typed ok/err in the ledger |
| **Hooks** | deterministic (a decision) | ✅ big (compiled hooks) | ✅ every decision logged | author `(event)=>Decision`; observe-mode + guardrail-check |
| **Skills** | behavioral (triggering) | ◑ thin proxies only (description-overlap, metadata) | ✅ main lever | fire-rate/collision from sessions + `measureTriggerRate` on-sub |
| **CLAUDE.md** | prose → behavioral | ◑ references only, not behaviour | ✅ find the noise | verify refs + observe which rules are ignored → PROMOTE |

Rule underneath: **you can type a decision; you cannot type "does this fire."** Forcing
types onto behaviour would cry wolf. Existing instruments all STAY — the ledger is the new
connective tissue that records what each of them decides, not a replacement.

## The local flight-recorder ledger

The new connective layer: **one local, versioned, append-only, agent-readable ledger** at
`.vigiles/runs.jsonl`. It unifies today's scattered artifacts (`hook-observations.jsonl`,
eval reports, guard-ledger) into one record every instrument appends to:

```jsonc
{"v":1,"ts":"…","kind":"hook","rule":"no-force-push","decision":"deny","cmd":"git push -f"}
{"v":1,"ts":"…","kind":"agent","name":"reviewer","tool":"Bash","allowed":false,"reason":"outside contract"}
{"v":1,"ts":"…","kind":"skill","name":"commit-helper","fired":true}
{"v":1,"ts":"…","kind":"capability-diff","pr":42,"added":["Bash"],"widened":true}
```

Read three ways, one schema: (1) `vigiles audit` / a timeline renders it; (2) **the agent
reads the raw JSONL directly** to debug the harness ("commit-helper fired 2/9; save-work
hijacked it — descriptions overlap"); (3) [an aggregation surface consumes the same JSON].
The defining property is **agent-readability** — the data is local and open, so the model
can interrogate it. Data locked in a cloud dashboard is agent-hostile; that's the failure
mode to avoid.

**Feasibility per harness** (from the CC/Codex surfaces): tool calls, decisions, subagent
activity, and cost are cleanly observable via a `PostToolUse` logging hook on BOTH. The one
soft spot is **skill-fire detection** — clean-ish on Claude Code, heuristic-only on Codex
(no skill-selection event; inferred from the `SKILL.md` read). So the deterministic surfaces
record precisely everywhere; skill-triggering leans on measurement, not passive obs — a loud,
documented per-harness gap, not a silent CC-only path.

## Promote-prose (the bridge between observe and construct)

The loop that connects the halves: **observe → find the ignored, decidable rule → promote it
from prose to a typed gate → the gate emits to the ledger → repeat.**

| Prose rule (~80% compliance) | Promoted to (100%) |
| --- | --- |
| "run tests before committing" | Stop-gate hook (deny stop until tests pass) |
| "never force-push" | compiled Bash hook (deny `git push -f`) |
| "no `var` / no `console.log`" | `enforce("eslint/...")` |
| "reviewer must not write files" | subagent tool-contract / purity floor |
| "don't touch `.env`" | compiled file-gate hook |

Only the DECIDABLE slice promotes; "write clean code" stays prose (undecidable). The
`strengthen` skill already does the linter case; promotion generalizes it to hooks +
contracts. Observability tells you WHICH rule is both ignored and decidable.

## Prior art (tech only) — steal vs inspiration

The funded space splits two ways (both cloud/runtime): observability (OTel span ingestion +
LLM-judge) and pre-deploy simulation (record-replay + authored scenarios + judge). The
app-frameworks (Mastra/LangGraph/Pydantic) have typed step-handoffs but leave the
instruction prose untyped and cross-agent handoffs runtime/manual.

- **Port directly:** record-replay (R2 PATH-shadow), scenario+postcondition testing
  (authored ground truth = the miss-precision fix), LLM-judge (`judged()`), root-cause→fix
  (`score-explainer`), close-the-loop feedback (frame `--json` as agent-consumable),
  shadow/observe mode (have it).
- **Inspiration / compose, don't build:** stateful twins + per-PR sandboxes (compose for
  R2/R3), self-healing tests (app-DOM, doesn't map), visual DAG builders (we do typed),
  dashboards/dataset-mgmt/red-team.

## Build sequence

1. **Unify the scattered `.vigiles/` records into one agent-readable `runs.jsonl` ledger** —
   the flight recorder's core; most of it is already emitted.
2. **A "debug-my-harness" skill** that reads the ledger — the agent-readable payoff.
3. **Capability-diff PR comment** — the deterministic blast-radius check at review time.

## Scope decision: everything existing STAYS

This is additive. Verify, compiled hooks, and evals are the SENSORS that feed the ledger;
the ledger is connective tissue. vigiles is not a pick-your-tools framework — it's one loop
(declare→check) applied across four surfaces via four instruments, adoptable incrementally
(the Level 0/1/2 ladder) but with a single spine. Breadth without that spine is the failure
mode; the spine is "the typed spec is the ground truth everything checks against."

## See also

- `harness-state-space.md` — the construct/verify/gate/test organizing thesis.
- `measurement-authority.md` — the measurement pivot this observability layer serves.
- `roadmap.md` — where this sequences against the rest.
- `typed-claude-md-poach.md` — the typed-composition mechanics (subagents/railway half).
