---
status: active
topic: linters
---

# The enforcement model: prevention is a gradient bounded by decidability

> Internal design record. The user-facing rules matrix lives in
> `docs/verifying-instruction-files.md`; this is the WHY behind each rule's
> severity and why "make it all impossible by construction" is not achievable.
> Companion to `harness-state-space.md` (the minimize-the-state-space thesis)
> and `install-enforcement-dx.md` (the rule GROUPS that ship this).

## The question this answers

Recurring confusion, asked three ways:

- "Can't we make all the rules impossible by construction (types)?"
- "Why are some rules warnings and others errors?"
- "Some rules seem to be about specs, some about markdown/json — weird
  fragmentation?"

All three have one answer: **prevention is a gradient, and where a given defect
can sit on it is fixed by how decidable the defect is.** You push each defect as
far toward prevention as its nature allows — and no further, because going
further is itself a bug (false confidence or crying wolf).

## The gradient

```
unrepresentable → won't-typecheck → won't-build → error → warning → measured
   (strongest)                                                      (weakest)
```

Each step is weaker because the thing it checks is less decidable or less
self-contained than the step to its left.

## Three best-practice principles that bound it

1. **"Make illegal states unrepresentable"** (Yaron Minsky / type-driven design).
   Real and powerful — but only for properties that are **structural and
   decidable from the value itself**. `NonEmpty<T>` is a type; "a list of paths
   that all exist on disk" is not — that needs the filesystem.

2. **"Parse, don't validate"** (Alexis King). The validation doesn't disappear;
   it's relocated to one boundary and turned into a typed token. There is still a
   check for anything touching the outside world — it just runs once and
   downstream code can't reintroduce the bad state. (vigiles does exactly this at
   `src/core/hook-normalize.ts`: parse `settings.hooks` once into a typed
   `HookRegistration[]`, so the detectors stop re-walking `unknown`.)

3. **Rice's theorem** (decidability). Any non-trivial _semantic/behavioral_
   property of a program is undecidable statically. "Does this skill description
   actually fire the model?" is behavioral — nothing static proves it; it can
   only be _measured_. This is why vigiles has a model-gated tier at all.

## The three decidability buckets

Every deterministic check sits in exactly one. The bucket sets the ceiling.

| Bucket                       | What it is                                                                                                                                              | Ceiling                                                           | Severity          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------- |
| **A · structural-closed**    | decidable from the artifact's own content over a CLOSED vocabulary; a TYPE could make it impossible for authors who route through the typed constructor | unrepresentable / won't-typecheck                                 | **error**-capable |
| **B · external-decidable**   | decidable, but needs the EXTERNAL world (filesystem, linter catalog, another file/server) — no type can read those                                      | won't-build / **error** (compile cross-ref or lint), never a type | **error**-capable |
| **C · heuristic-behavioral** | undecidable or a fuzzy proxy ("are these too similar?", "does this fire?")                                                                              | **warning** or model-MEASUREMENT                                  | **warn**-only     |

The crucial nuance, and the fix for "ideally everything is a type":

- Bucket **A** → a type is the ideal, yes.
- Bucket **B** → a type is **flat-out impossible** (the external world), but the
  right ceiling is still a **hard error**, just later (compile/lint). Not a
  downgrade — equally gating.
- Bucket **C** → a **warning** (or measurement) is the **correct** answer, not a
  compromise. Forcing it to error cries wolf; pretending a type could catch it is
  false confidence.

So "make it all impossible by construction" fails on B (needs the world) and C
(undecidable). Only A is type-shaped.

## Severity tracks confidence, not importance

A bucket-A or -B check is a clean fact → it can be an **error**. A bucket-C check
is a proxy that can false-positive → it must be a **warning**. `description-
overlap` is a warning because NCD is a similarity _guess_; `frontmatter-valid` is
a warning because js-yaml is stricter than some real loaders. Making those errors
would block correct plugins. That is correct calibration, not a gap. This is the
basis of the `structural` (error) vs `nudge` (warn) split in
`install-enforcement-dx.md`.

### Bucket is the ceiling; severity is where it sits today

A bucket-A/B rule may sit at `warn` during ROLLOUT (don't-cry-wolf on a new
deterministic rule, e.g. `lethal-trifecta`). That is a deployment choice, not a
confidence statement. So the gap between `bucket` and `defaultSeverity` is a
useful signal:

- bucket A/B at `warn` → a **promotion candidate** (deterministic, could be
  `error`).
- bucket C at `warn` → **permanent** (can never be `error`).

`src/core/rule-meta.ts` records both per rule, so the gap is inspectable.

## Why this is NOT "spec rules vs markdown rules"

There are three enforcement STAGES, each owning a different artifact at a
different time. **No lint rule reads a `.spec.ts`'s content** — the entire rule
set is artifact-targeted, plus two meta-rules. That mismatch between the feeling
and the reality is the whole "fragmentation" confusion.

| Stage                         | Fires                         | Reads                                                         | Validates                                                            | Covers        |
| ----------------------------- | ----------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------- | ------------- |
| **1 · TYPE** (prevent)        | edit-time, the user's `tsc`   | the `.spec.ts` source                                         | spec content — tool vocab, typed purity, handoffs, dangling delegate | spec-adopters |
| **2 · COMPILE** (cross-ref)   | build-time, `vigiles compile` | spec + real catalogs/fs                                       | refs types can't see — rule exists & enabled, path exists            | spec-adopters |
| **3 · LINT / AUDIT** (detect) | commit-time / anywhere        | the shipped artifact (md/json/hooks) — what the harness loads | structural defects                                                   | **everyone**  |

Spanning rules: `require-instructions-spec` checks Stage-1 _adoption exists_;
`integrity` checks Stage-2 _output wasn't hand-edited_. Neither reads spec
content.

**A lint rule is artifact-targeted by definition** — it reads what ships. Spec
correctness is Stages 1–2, which fire earlier and harder; a lint rule that
re-checked the spec would just duplicate `tsc`. So we never "move a rule onto
specs." The same defect can live in two stages on purpose: `skill-missing-fence`
is _prevented_ at Stage 1 for spec-users (the compiler always emits the fence)
and _detected_ at Stage 3 for everyone else. Defense-in-depth across two
populations, not duplication. This is what the `RuleMeta.upstreamPrevention`
field records: the Stage-1/2 construct (if any) that makes the same defect
impossible for authors who route through it.

## The hook asymmetry (the one real gap)

Map the surfaces onto the stages:

- **instruction file / skill / subagent** — all three stages (typed
  `claude()`/`skill()`/`agent()` + an `adopt` on-ramp in `init`, compile, lint).
- **hooks** — Stage 1 _exists_ as a feature (`vigiles/hook` compiled hooks) but
  is **not auto-adopted** (no `adoptHook`, `prefer-compiled-hooks` defaults off,
  not wired into `init`). So for the 99% case (hand-written shell) **only Stage 3
  detectors apply.**

Consequence, twice over: parking the hook lint rules would leave hooks with
**zero** verification on the surface with the worst false-confidence pain. So
they stay on. The named fix for the asymmetry is an **`adoptHook`** — convert a
hand-written shell hook into a compiled `vigiles/hook` program during `init`,
giving hooks the Stage-1 on-ramp every other surface has. It is parked because
shell → typed is lossy/undecidable in the general case. That is _why_ hooks
legitimately lean on detection today. (Roadmap: `research/roadmap.md`.)

## How to use this when adding or calibrating a rule

1. Classify the defect into a bucket (A/B/C). That fixes the ceiling.
2. Set `defaultSeverity` ≤ the ceiling — `warn` during rollout for A/B, `warn`
   permanently for C, `error` once an A/B rule is proven FP-safe.
3. Record it in `src/core/rule-meta.ts` (the `Record<RuleName, RuleMeta>` forces
   you to — `tsc` fails otherwise) with its `detector` and any
   `upstreamPrevention`.
4. If it's bucket A and the surface has a construct path, consider also adding
   the Stage-1 prevention (keep the Stage-3 detector as the floor for non-spec
   repos).

The audit you can now run over the whole rule set: **is each rule as far left on
the gradient as its bucket allows?** A bucket-A/B rule stuck at `warn` with no
rollout reason, or a bucket-A defect with no `upstreamPrevention` though its
surface has a construct path, is the actionable signal.
