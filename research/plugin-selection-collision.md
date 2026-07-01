---
status: active
topic: eval
---

# Plugin selection-collision: the behavioral confirmation of `description-overlap`

> Internal design + findings record. The user-facing pitch lives in the eval docs;
> this holds the why, the schema, and the dogfood data.

## The gap this closes

vigiles already measures skill **triggering** two ways:

- **Deterministic** (`src/core/description-overlap.ts`, free, no model): flags two
  model-invocable skills whose descriptions are near-identical (NCD proxy, cutoff
  0.2) — a static _proxy_ for "the selector can't tell them apart → the wrong one
  fires."
- **Per-skill trigger-rate** (`measureTriggerRate`, model-gated): for one named
  skill, recall (fires on its prompts) + precision (quiet on its _author-supplied
  irrelevant_ prompts).

Both miss the failure that actually breaks a **multi-skill** plugin: one skill
**hijacking a SIBLING's prompt**. Per-skill trigger-rate asks each skill in
ISOLATION against its own irrelevant set; it never feeds skill B's _relevant_
prompt to the whole plugin to see whether skill A wrongly fires. The description-
overlap rule flags the _risk_ deterministically but reports no _rate_.

**Selection-collision** is the measured confirmation: install the whole plugin,
run each skill's own prompts, record **which** skills fired, and read off an N×N
matrix — diagonal = recall, off-diagonal mass = collision.

This bridges the deterministic↔behavioral columns the `score-explainer` already
draws conceptually (`wrong-skill-fires ← description-overlap`): the lint rule says
"these two look confusable," the eval says "they collide X% of the time."

## Why nobody else has this

Per-skill trigger-rate (recall/precision of ONE skill) is the table-stakes thing
SDK eval harnesses do. The cross-skill _selection_ matrix over an installed
plugin — "when I ask for skill i's job, does ONLY skill i fire?" — is unique to a
tool that (a) loads the harness as it ships and (b) reads which skill the real
selector chose. It's the precision/blast-radius column the leaderboard needs.

## Design

- **Primitive** (`src/eval.ts`): `whichSkillsFired(trace) → string[]` (namespaced
  ids of `Skill` calls that resolved without error — the multi-skill generalization
  of `skillResolved`) + `runSkillSelectionTrial(...)` — runs ONE prompt against an
  installed plugin and returns the fired-skill SET. One pass over the prompts yields
  the whole matrix (N× cheaper than re-running per skill pair).
- **Orchestration** (`src/scan-behavioral.ts`, sibling of `probePluginTriggers`):
  - `buildSelectionReport(skills, runs)` — PURE fold of per-run fired sets into the
    matrix + per-skill recall/collisionRate/collidesWith + plugin-level collisionRate
    (unit-tested with synthetic runs, no model).
  - `measurePluginSelectionWith(dir, promptSet, probe, opts)` — injectable core.
  - `measurePluginSelection(dir, promptSet, opts)` — real-`claude` wrapper.
- **CLI**: `vigiles scan <dir> --collisions --prompts=<file.json>` (reuses the
  `--trigger` prompts file; only each skill's `prompts` array is read, `irrelevant`
  is ignored). Model-gated, opt-in — the structural scan stays deterministic/free.
- **Scope**: **Claude Code only.** Collision is a property of the model's discrete
  skill-SELECTION event (the `Skill` tool); Codex has no such event, so it reports
  `available: false` honestly rather than faking a matrix.
- **Needs ≥2 model-invocable skills** (collision is meaningless for one) — reported
  as a note, not a crash.

### Report shape

```
SelectionReport {
  available, skills[], matrix[i][j] (j fired when i intended),
  perSkill: { skill, recall, collisionRate, n, collidesWith: {skill,rate}[] },
  collisionRate (plugin-level), n, note?
}
```

## Dogfood (live, on the subscription, 2026-06-22)

### Attempt 1 — superpowers (obra): a measurement artifact (root cause verified)

`superpowers@6fd4507` ships `test-driven-development` ("…any feature or **bugfix**…")
and `systematic-debugging` ("…any **bug**, test failure…") — selectors that overlap
on a bugfix prompt (the textbook collision; prompt set
`examples/harness/dogfood/superpowers-collision.prompts.json`). But the live run
showed **recall 0% for BOTH skills** — 0 fires across 12 `--collisions` runs AND 6
`--trigger` runs (so it's not collision-specific). You can't measure collision when
nothing fires.

**Root cause (verified from source, not guessed):** superpowers does NOT rely on the
model spotting a skill description. It activates skills via a **SessionStart hook**
(`hooks/session-start` + `hooks/hooks.json`) that reads `skills/using-superpowers/
SKILL.md` and injects it as `<EXTREMELY_IMPORTANT> You have superpowers … for all
other skills, use the 'Skill' tool`. That injection is what PRIMES the model to
proactively invoke skills; the terse descriptions alone don't pull the model to the
`Skill` tool (it just does the coding task directly). The priming never reaches the
model in our harness for **two compounding reasons**:

1. Our vendored SLICE is missing `skills/using-superpowers/SKILL.md` (the hook would
   `cat … || echo "Error reading…"` → inject an error string). `scan` flags it:
   `skills/using-superpowers/SKILL.md referenced but MISSING`.
2. **More fundamentally — a measurement limitation we own:** the trigger/collision
   tier STUBS the plugin to skills-only via `packageSkillsDir` (src/eval.ts), which
   writes a fresh skills-only `plugin.json` and **drops the `hooks/` dir entirely**.
   So the SessionStart gateway hook never runs _regardless of #1_.

So the 0% is a **measurement artifact, not evidence superpowers is broken.** vigiles's
own skills (Attempt 2) fire because their descriptions map directly to the request;
superpowers' process-skills ("use TDD when implementing") need the hook's nudge.

**Limitation surfaced — Layer 1 SHIPPED, Layer 2 deferred.** Our trigger/collision tier
can't faithfully measure a **hook-primed plugin** — it strips the very SessionStart hook
that drives selection. The fix is layered, honesty before fidelity:

- **Layer 1 (SHIPPED):** never present a misleading clean `0%`. When a STUBBED run on a
  plugin that declares a **SessionStart hook** shows EVERY measured skill at recall 0,
  that's the dropped-hook artifact — `hasSessionStartHook` + `isStubbedHookArtifact`
  (scan-behavioral.ts) relabel it `ⓘ hook-primed … likely a measurement artifact; re-run
against the full plugin install` on BOTH columns. The **all-zero gate** is the
  precision guard: a genuine single-skill miss (siblings fired → the hook ran or wasn't
  needed) stays reported as real, so the label can't mask a true 0%. Verified on the live
  superpowers run + CI fake-driver tests (hooked→labeled; non-hooked 0%→stays real).
- **Layer 2 (deferred, roadmap):** the faithful path — a `--no-stub` whole-plugin
  install, with auto-fallback to it on a 0%-recall hook-bearing plugin — so the result
  is either measured faithfully or honestly marked, never a silent 0%.

The discipline holds: `scan`'s broken-ref column flags the missing gateway up front, so
the null result is explainable, not mysterious.

### Attempt 2 — vigiles's OWN plugin: clean, + a recall signal

`scan . --collisions --prompts=examples/harness/dogfood/vigiles-collision.prompts.json
--trials=2` over the three model-invocable shipped skills (`strengthen` / `edit-spec`
/ `test-harness`), 18 stubbed runs:

| skill        | recall | collision | top collider |
| ------------ | ------ | --------- | ------------ |
| strengthen   | 100%   | 0%        | —            |
| test-harness | 100%   | 0%        | —            |
| edit-spec    | 33%    | 0%        | —            |
| **plugin**   | —      | **0%**    | —            |

- **No cross-skill collision** — even `strengthen` ("harden my **rules**") vs
  `edit-spec` ("add/change a **rule** in CLAUDE.md"), which share vocabulary, never
  steal each other's prompts. The clean bill (the FP-guard direction, like
  `scan-vendor`'s clean plugins): we measured, our skills don't collide.
- **Bonus signal: `edit-spec` under-fired (recall 33%).** On 2 of its 3 prompts
  ("remove a rule", "change the testing guidance") NOTHING fired — not a collision, a
  RECALL miss (the agent edited directly without invoking the skill). Actionable
  (sharpen the description / verify against the fuller 7-prompt eval set), though 6
  runs is a weak base. The matrix surfaces recall AND collision in one pass.

POSITIVE-collision DETECTION is proven deterministically by the CI fake-driver test
(`measurePluginSelectionWith catches a sibling hijack` — foo↔baz 50%), so the live
dogfood's job was to prove the real-model path runs (it does) + grade a real plugin
(clean). A real-OSS positive collision remains a future dogfood — needs a plugin with
overlapping skills that actually FIRE (superpowers minus the vendoring gap).

## See also

- `src/core/description-overlap.ts` — the deterministic proxy this confirms.
- `research/plugin-behavioral-findings.md` — the trigger-rate dogfood findings.
- `research/measurement-authority.md` — the leaderboard this column feeds.
