---
status: active
topic: positioning
---

# Scope: vigiles skills vs. dynamic workflows

<!-- vigiles:ignore-file -->

> Status: positioning capture (2026-06-08). Fixes a scope distinction that got
> blurred while reacting to Anthropic's **dynamic workflows** launch. Companion
> to `research/skill-as-pipeline.md` (the skill model) and
> `research/landscape-mid-2026.md` (the broader frame). Output of three research
> sweeps (Claude Code feature / landscape / applicability) plus a small live
> false-done benchmark.

## What happened

Anthropic shipped **dynamic workflows** (Claude Code + Agent SDK, research
preview, May 2026): Claude _writes a JavaScript orchestration script_ for a task
and a runtime executes it, spawning up to ~1000 subagents (16 concurrent), with
intermediate state in script variables rather than the context window. Invoked
via `ultracode` / `/effort ultracode`. The **control flow becomes
deterministic** (the script), while each subagent's reasoning and the
result-judgment ("is this claim reliable") stay **probabilistic** — verified by
prose cross-checking/voting, not a deterministic check.

This looked like it subsumed vigiles. It does not — but it sharpened the scope.

## The distinction (the thing to not blur)

Anthropic itself treats these as **different primitives** ("Skills = instructions
Claude reads; Workflows = executable scripts, not guidance"):

|          | **Dynamic workflow**             | **vigiles skill**                        |
| -------- | -------------------------------- | ---------------------------------------- |
| Origin   | Claude **generates** it per task | **authored once** by a human             |
| Lifetime | ephemeral (one run)              | **reusable, distributed** (marketplaces) |
| Scale    | orchestrate many subagents       | one curated unit of procedure            |
| Goal     | coordinate an ad-hoc task        | be **reliable across many invocations**  |

vigiles's skill niche — _make an authored, reusable skill reliable_ (verify its
references, enforce its result gate) — is **not** what dynamic workflows do. They
generate one-off orchestration; they neither author nor verify reusable units.
The overlap is only the shared thesis ("inject determinism where possible"); the
unit and use-case differ.

## What this corrects

An earlier read called vigiles's gated-**step** model "subsumed." That was too
strong. For **skills** — authored, reusable, and mostly-linear in practice (see
the corpus analysis in `research/skill-as-pipeline.md`) — gated steps are a valid
unit and dynamic workflows do not replace them. The "the step is the wrong unit"
claim applies only to **genuinely dynamic, runtime-generated orchestration**,
where there is no static plan to attach a step to.

## Two layers, kept separate

1. **Ours, narrow, uncontested — verified + enforced authored skills.**
   - The moat: a gate's reference (`cmd`/`file`/linter rule/`project`) is
     resolved at author time (exists + enabled), then run at runtime; the result
     gate blocks "done" until it passes. Reusable across every invocation.
   - This is the beachhead. Keep it.

2. **Adjacent, broad, optional — deterministic verification of dynamic
   workflows.** The field's _acknowledged open frontier_: nobody verifies a
   runtime-generated workflow deterministically (durable engines replay
   _execution_, not _decisions_; guardrails are probabilistic; the "stochastic
   gap" pass@k vs pass^k runs 25–60 points). vigiles's gate primitive **could**
   extend here, but only via a reframe — because there is no static plan:
   - **action-scoped gates** (`onWrite → lint passes`, `onShell → allowlist`),
     fired by a policy-enforcement point regardless of plan order, with the
     reference still resolved at author time;
   - the **final acceptance gate** (the existing result gate — transfers as-is,
     plan-independent);
   - **postconditions / invariants** over state, checked after any action.
   - i.e. the unit moves from _step_ → _action / invariant / acceptance_. This is
     a separate, larger bet, not a replacement for the skill niche.

## What the benchmark actually says

A small live false-done benchmark (real `claude`, strong model and Haiku, code

- edge-case + multi-step-wiring traps) found **0/12 false-done** — modern agents
  on clear tasks don't declare "done" with a red gate. So per-_single-run_
  enforcement is largely redundant for strong models.

The honest reading, given the scope distinction: a skill's value isn't one run —
it's **reuse**. A distributed skill runs thousands of times across many users; a
broken reference or an unenforced result compounds across _all_ of them. The
enforcement/verification payoff scales with **reuse and with agent weakness /
task ambiguity / external side-effects**, not with a single strong-model run.
That regime (reuse scale, side-effects, weak/cheap agents at volume) is where the
value is real — and it's narrower and more honest than "always worth it."

## Verdict

- **Keep the narrow skill niche** (verify + enforce authored reusable skills);
  it is distinct from dynamic workflows and uncontested.
- **Treat dynamic-workflow verification as an optional frontier**, reachable only
  by reframing the unit from step to action/acceptance — do not conflate it with
  the skill product.
- **Right-size the value claim:** determinism for skills pays off in _reuse_ and
  in _weak-agent / side-effect / ambiguous_ regimes, not in single strong-model
  runs.
