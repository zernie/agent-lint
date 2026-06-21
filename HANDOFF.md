# HANDOFF — volatile cross-session state

> Overwrite each session; keep ≤120 lines. The durable map is `research/roadmap.md`;
> this is the cheap pointer to it. The SessionStart hook (`.claude/hooks/session-handoff.sh`)
> injects this file so a new session starts oriented WITHOUT re-reading CLAUDE.md +
> the research docs. Read this first, then open only what "Next move" points at.

## Now

Pivot = **measurement-authority** (`research/measurement-authority.md`): vigiles = the
empirical authority on what makes agentic coding work (measurement → typed contracts →
linting). This multi-session run went DEEP on the **typed-spec MOAT**: _"the harness
becomes a compilable, analyzable formal object — vigiles is a compiler/verifier for
agent harnesses; everyone else is a linter for prose."_ Full record + every research
finding: **`research/typed-spec-moat.md`**.

## Status & gaps (READ — the honest 2026-06-21 self-assessment)

Thesis is A-tier + real features shipped, BUT the work leaned **maker-cool (the moat)
over user-pull (the measurement identity)**, and vigiles has ~no users. Near-term
priority = the **ADOPTION ENGINE** (the at-scale ecosystem benchmark "what works vs
hype" + zero-friction `scan`/measure that needs NO typed spec), NOT more moat depth.
The moat is the depth users discover after. Bridge bet = **capability-diff (#2), now
P1**. Full: `research/measurement-authority.md` § "Status & gaps".

## Next move (pick — none started)

1. **ADOPTION: the at-scale ecosystem benchmark (A1)** — the viral artifact, still
   ~v0 / not run at scale. The flywheel. (Real-model, needs sub auth; pilot tiny.)
2. **capability-diff (#2, P1, the bridge)** — needs the UNBUILT **effect-row (M1) +
   cross-step accumulation** engine (compute the capability surface), then the v1→v2
   diff (already prototyped, fp-theory T2). Carry a loud sign-off hatch (don't cry wolf).
3. **V1 nesting bug** — found + TLC-certified-fix-in-hand, NOT fixed (depth-aware
   active-agent stack; a live contract-escape in EXPERIMENTAL agent-runtime). Orthogonal.
4. **Lethal trifecta as a TYPE (F1, P0 in roadmap)** — rides typed purity's machinery.

## Shipped (this session — all pushed, tree clean, HEAD==origin)

- **feat:** typed purity (`pure`+`Bash` won't tsc) · typed composition (pipeline won't
  compile if handoffs misalign) · `generate-harness` (one `tsc` over the WHOLE harness —
  dangling-`delegate` + duplicate-name + capability lattice) · cross-file typed
  composition (handoff mismatch ACROSS files won't compile) · scaffold-test now consumes
  the typed contract (`assertAgentOk` + tools→safety check).
- **research:** 9 cross-linked docs + runnable tsc/runtime prototypes (typed-spec-power /
  frontier / effects-monads / formal-verification / refinement / covering-arrays /
  fp-theory / whole-harness-codegen + the **typed-spec-moat** synthesis). Headlines: the
  Applicative/Selective/Monad boundary THEOREM (never add a monadic `bind` — the shipped
  `pipe` is already applicative); a REAL nesting bug found by running TLC; covering-array
  eval = 99.4% fewer real-model runs; effect-row generalizes the purity ladder.
- **docs/positioning:** moat framing folded into README + CLAUDE.md + measurement-authority;
  status/gaps + sequencing recorded; capability-diff added as P1; fixed broken
  `examples/railway/*.spec.ts` imports (`src/spec.js` → `src/core/spec.js`).

## In flight

Nothing. All subagents complete; tree clean; local == remote.

## Gotchas (carry forward)

- **Subagents must NOT use worktree isolation**; VERIFY their output (git diff + build +
  tests + run the thing) — don't trust "done". Apply their reported keyFiles deltas to
  `CLAUDE.md.spec.ts` yourself + recompile.
- **The recurring TS-encoding rule:** per-edge / per-entry check → a SHALLOW generated TS
  type (O(N)); whole-set cardinality (uniqueness) → the JS generator (O(N) exit-non-zero).
  Variadic/recursive types hit **TS2589** (~N=1000). `pipe`/`Supplies`/`KnownAgentName`/
  `Handoff` all follow this — keep it.
- Real-model tiers (A1/evals) need sub auth + are slow — pilot tiny; deterministic work
  needs neither.
- Conventional-commit subjects; `build` + `vitest` + `lint` + `fmt:check` before commit;
  recompile `CLAUDE.md` after editing `CLAUDE.md.spec.ts`; `api:report` when the public
  surface changes; cross-link new research docs (orphan-docs lint); **NO session links /
  model IDs in commits**.

## Budget protocol

- Read THIS file, not the docs, to orient; open a doc only when a step needs it.
- **Delegate** searches/reads + big builds to subagents (keep file dumps out of main
  context); verify their output. Bounded commits; **refresh this file after each
  shippable commit** so state is always current.

## Don't re-read unless the task needs it

- `research/roadmap.md` — the ordered map (per-item status; capability-diff **P1**,
  trifecta F1 **P0**, the See-also index to every research doc).
- `research/typed-spec-moat.md` — the moat synthesis: every finding, the build order,
  the adoption-tension catalog.
- `research/measurement-authority.md` — the pivot + the "Status & gaps" section.
- `bench/corpus/coding-tasks.mjs` + `bench/evals/caveman-claim.eval.mjs` — the
  measurement substrate for A1.
