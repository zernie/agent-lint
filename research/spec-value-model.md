<!-- vigiles:ignore-file -->

# When does a typed spec earn its keep? — the spec-value model

> The settled answer (2026-06-21) to a recurring question: in a repo where SOME
> skills/agents/CLAUDE.mds have a `.spec.ts` and some don't, what does the spec
> actually BUY over plain markdown — per capability, per surface — and therefore
> what should the `require-*-spec` rules default to? This supersedes the scattered
> per-file note; it is THE reference. See also
> [`typed-spec-moat.md`](typed-spec-moat.md) (the three moats) and
> [`measurement-authority.md`](measurement-authority.md) (the pivot).

## The reframe: capability is the axis, not spec-vs-no-spec

The instinct "specs are for skills/agents, markdown is for instruction files" is
wrong on both ends. The right axis is **capability**. vigiles has four
post-pivot capabilities; only ONE of them actually requires a spec.

| Capability                                                                                                                    | Needs a `.spec.ts`?      | Works on plain markdown?                                                                                             | What the spec adds (if anything)                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lint / reference verification** (rule exists+enabled, path/cmd/symbol real)                                                 | No                       | Yes — L0 inline `<!-- vigiles:enforce -->`, L1 `vigiles:` frontmatter, the surface lint rules, marked-ref validation | Edit-time (tsc/LSP) feedback instead of commit-time + an **integrity hash** (tamper/drift detection). A _latency + drift-protection_ upgrade, not a new capability. |
| **Testing** (`runHook` / `runHarnessTest`; isolation or whole-harness)                                                        | No (to RUN)              | Yes — loads & tests the real shipped `.md`/hooks                                                                     | A **deterministic, judge-free ORACLE** for the things the spec declares (see "two oracles").                                                                        |
| **Evaluation** (`measureTriggerRate` / `runEval`; firing & behavior)                                                          | No                       | Yes — fully spec-agnostic                                                                                            | **Nothing.** A real-model behavioral eval is byte-identical whether the surface is hand-written or compiled.                                                        |
| **Whole-harness TYPE checking** (`generate-harness`: cross-file typed handoffs, typed purity/composition, capability lattice) | **Yes — spec-exclusive** | **No** — markdown is inert prose; a `.spec.ts` is a _program_                                                        | The entire moat: a multi-agent pipeline whose handoffs don't line up **won't compile**.                                                                             |

Lint, test, and eval all run on markdown. Only whole-harness type checking is
spec-exclusive — and even there the sub-checks split: a _dangling delegate target_
(does agent X exist) is an existence check replicable on markdown (`danglingRefs`-shaped),
whereas _typed handoff alignment_ (does step N's `ok` supply step N+1's `needs`, with
the right field TYPES) and _typed purity_ (`pure`+`Bash` is a `tsc` error) need a type
system across files — that is the only thing markdown genuinely cannot replicate.

## The two oracles (the part that's easy to get wrong)

"Does testing/eval need a spec?" is the wrong question — it conflates RUNNING a test
with the **oracle** ("how do you know the answer is right?"). There are two oracles,
and the spec only matters for one:

| Oracle                 | Question                                                                                                                        | Needs a spec?                              | Cost                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| **Behavioral**         | Did the skill _fire_? Did behavior _move_ vs off? Is the output _good_?                                                         | **No** — spec-agnostic                     | Model-gated (LLM judge / trigger-rate) — metered, non-deterministic |
| **Contract / outcome** | Did the agent produce the declared **result shape**? Stay within its declared **effect surface**? Follow the declared **flow**? | **Yes** — the typed contract IS the oracle | **Deterministic, judge-free, free, repeatable**                     |

This is what the pivot meant by "specs unlock testing markdown can't replicate": not
the _ability_ to test, but a **deterministic, model-free oracle**. A hand-written agent
can still be tested — but to check "did it return the right shape" you fall back to an
**LLM judge** (tokens + noise) or hand-written asserts. The spec's `result()` contract
compiles to `vigiles:ok/err` blocks that `assertAgentOk` validates mechanically, no
judge. It is the affordability story at the _oracle_ layer, parallel to how the
subscription makes the _behavioral_ eval affordable.

## Honest grading: which "control" legs held?

A spec lets you control flow / results / shape / side effects. They did NOT hold
equally — record this so we don't overclaim:

| Leg                                                                           | Verdict                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Result shape** (`result()` → `assertAgentOk`)                               | ✅ Held, shipped                  | Deterministic outcome test, no judge; the reviewer A/B eval showed prose 0% → spec 100% parseable outcome                                                                                                                                                                                                                                                                                                    |
| **Control flow / composition** (`railway`/`pipe`/`delegate` → typed handoffs) | ✅ Held — the spec-exclusive moat | `generate-harness`: a pipeline whose handoffs misalign won't compile                                                                                                                                                                                                                                                                                                                                         |
| **Purity floor** (`pure`/`bounded`, whole-unit)                               | ✅ Held                           | Enforced edit-time (`tsc`, typed purity) + compile (`purityViolations`) + runtime (`decidePurityGate`)                                                                                                                                                                                                                                                                                                       |
| **Side-effect surface**                                                       | ⚠️ Split                          | **Unit** granularity ✅ — `effectSurface(tools)` auto-derives `notTool`/`didNotWrite` safety checks (shipped in `scaffold-test`). **Sub-region** granularity (`effect()` — "these lines write, the rest read-only") ❌ **dropped** — a deterministic in-flow boundary has no harness signal; collapsed back into the unit-level purity floor (see [`effect-boundary-design.md`](effect-boundary-design.md)). |

So the leg that genuinely did not pan out is the **positional `effect()` sub-region**;
side-effect _testing_ survives at whole-unit granularity (derived from the tools
allowlist).

## Surface ranking (the corrected "why")

The two spec-exclusive powers — (1) whole-harness composition type-check and (2) the
deterministic contract/outcome oracle — determine where a spec earns its keep:

- **Agents (that compose / declare `result()` / a purity floor)** — **highest**. Both
  spec-exclusive powers land here. A standalone agent gets only the oracle; a composing
  agent also gets the cross-file type-check.
- **CLAUDE.md / AGENTS.md** — **lowest spec-EXCLUSIVE value**. No `delegate` graph (no
  whole-harness type-check) and no `result()` contract (no deterministic oracle). Their
  spec value is purely L1's — edit-time ref typing + integrity + one-source multi-target
  mirror — all replicable-ish on markdown. (Note: this is the surface that benefits most
  from vigiles _overall_, because it's the densest reference surface — but that benefit
  is **lint**, available at every level, NOT a spec benefit.)
- **Skills** — **low**. Mostly freeform prose; the real testing tool is the _behavioral_
  oracle (`measureTriggerRate`), which is spec-agnostic. A spec adds little.

## Settled design: the `require-*-spec` split + defaults

1. **Split — yes.** Consistent with the `untested-surface` → per-kind precedent. Keep
   `require-spec` (instruction files), add `require-agent-spec`, retire the already-
   deprecated `require-skill-spec`.
2. **All default OFF — and now _principled_, not just cautious.** Since lint/test/eval
   don't need a spec, requiring one is requiring the _latency/typing/oracle upgrade_,
   never a capability. Forcing it contradicts the zero-friction pivot and the
   progressive-adoption + don't-cry-wolf rules.
3. **The nudge is CAPABILITY-TRIGGERED, which kills cry-wolf.** Don't nudge "write a
   spec" by surface. Nudge it only when a spec-exclusive capability would actually fire:
   - an agent participates in a `delegate`/handoff chain → "this composes; a spec lets
     `tsc` verify the handoffs" (the cross-file type-check is unavailable on markdown);
   - an agent/skill you want a **deterministic** outcome test for is being judged by an
     LLM → "a `result()` contract makes this test judge-free."
     That fires precisely when markdown can't catch the bug, and stays silent for
     standalone agents, plain CLAUDE.mds, and the scan-only / hand-written crowd.

**Bottom line:** post-pivot, specs are not an adoption axis — capability is. Push
everyone onto lint + test + eval on plain markdown (the adoption engine); specs are the
opt-in upgrade for the two things markdown can't do — **type-checking a multi-agent
harness as one program**, and a **deterministic, judge-free contract oracle**.

## See also

- [`typed-spec-moat.md`](typed-spec-moat.md) — the three moats (the depth specs unlock).
- [`measurement-authority.md`](measurement-authority.md) — the pivot; why lint/test/eval
  on markdown is the adoption engine.
- [`adoption-strategy.md`](adoption-strategy.md) — progressive adoption & the per-file
  mixed-repo behavior (points here for the capability model).
- [`effect-boundary-design.md`](effect-boundary-design.md) — why the `effect()`
  sub-region leg was dropped.
- [`landscape-mid-2026.md`](landscape-mid-2026.md) § "Market-segmented competitive
  matrix" — the COMPETITIVE complement to this capability matrix: who else is in
  vigiles's actual market (cc/codex-harness linters) and what they don't do. The two
  matrix hubs: this doc = "what a spec buys"; that one = "who competes".
