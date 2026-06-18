# Coverage scorecard — superpowers@6fd4507

> Dogfood of the three-rung model (`research/eval-coverage-and-isolation.md`) on a
> real vendored plugin. Rungs: **R1** cheap/deterministic (no model) · **R1-MG**
> model-gated trigger/behavior (runs on the sub) · **R2** record-replay shell-out
> (PATH stub) · **R2-MG** model decides to shell out · **R3** real service. The
> pinned snapshot is never modified.

## Artifacts → rung → what a proper eval needs → tested?

| Artifact                                     | Kind      | Rung   | What a proper eval needs                                                                | Test written?                       |
| -------------------------------------------- | --------- | ------ | --------------------------------------------------------------------------------------- | ----------------------------------- |
| `session-start` (SessionStart)               | hook      | R1     | run it; assert it injects the "You have superpowers" preamble (fallback when ref absent)| ✓ `vendor-coverage.test.ts`         |
| `session-start` w/ resolved skill            | hook      | R2     | reconstruct a complete plugin root; assert the REAL `using-superpowers` body is embedded| ✓ `vendor-coverage.test.ts`         |
| `find-polluter.sh` (debugging tool)          | skill aux | R2     | shell out to `npm test` per file; stub `npm` on PATH; assert the bisection runs to end  | ✓ `vendor-coverage.test.ts`         |
| `test-driven-development` skill (description) | skill     | R1-MG  | `measureTriggerRate`: fires "before writing implementation code", quiet otherwise       | model-gated (description present ✓) |
| `systematic-debugging` skill (description)    | skill     | R1-MG  | `measureTriggerRate`: fires on "any bug / test failure", quiet otherwise                 | model-gated (description present ✓) |
| TDD / debugging skill *behavior* (prose)      | skill     | R1-MG  | judged: does following the prose change the agent's output toward test-first / root-cause| model-gated                         |
| `using-superpowers` skill                     | skill     | —      | absent in the slice (the known dangling ref) — surfaced by `loadPlugin` warnings         | ✓ flagged by `vendor.test.ts`       |
| `loadPlugin` invariants                       | structure | R1     | layout parses, `${CLAUDE_PLUGIN_ROOT}` resolves, the one dangling ref flagged (no more)  | ✓ `vendor.test.ts`                  |

## Distribution + testability grade

- **Free / deterministic (R1 + R2, no model): ~50%** — the SessionStart hook (both
  the fallback-injection R1 and the resolved-skill R2 reconstruction), the
  `find-polluter.sh` shell-out via the PATH stub, and the structural/dangling-ref
  facts. These RUN in CI today.
- **Model-gated (R1-MG, runs on the sub): ~50%** — superpowers is, by design, a
  **prose skills library**: TDD and systematic-debugging are *workflows the model
  reads and follows*. Their value (does the agent actually go test-first? find root
  cause before patching?) is purely behavioral — trigger + judged-quality — so it
  needs a model.
- **Needs a container (R3): ~0%** — nothing in this slice requires a real service.

**Grade: B (honest C+ on the *behavioral* half).** The hook and the one shell-out
script are fully testable for free, but the bulk of superpowers' *worth* is prose
guidance whose effect is only measurable by running a model. That is a real finding:
a prose-skill library is mostly model-gated; the cheap tiers verify it *loads and
fires its hook*, not that the guidance *works*.

## R3 shortlist

- **None** in the vendored slice. (`find-polluter.sh` shells out to `npm` + `find`,
  both faithfully replayable at R2.)

## Verdict

vigiles can comprehensively test superpowers' **mechanical surface for free** — the
SessionStart context injection (fallback and resolved-skill paths), the
`find-polluter.sh` bisection logic via a recorded `npm` stub on PATH, and the
load/dangling-ref invariants. But superpowers is fundamentally a *prose workflow
library*: roughly half its surface is skill guidance whose effectiveness is
behavioral and only measurable with a model (trigger-rate + judged quality, run on
the subscription). The deterministic tiers prove it *installs, loads, and fires*;
proving the guidance *changes behavior* is the model-gated eval tier. Cheap tiers
can't substitute for that — and shouldn't pretend to.
