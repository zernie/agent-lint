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
   ~v0. ENGINE READY + manifest now 5 skills (2 cleanly-A/B compression debunks:
   caveman + token-efficient). REMAINING: run the full manifest at scale (real-model,
   needs sub auth — spend decision) + publish a findings writeup. The flywheel.
2. **capability-diff (#2, P1, the bridge)** — needs the UNBUILT **effect-row (M1) +
   cross-step accumulation** engine (compute the capability surface), then the v1→v2
   diff (already prototyped, fp-theory T2). Carry a loud sign-off hatch (don't cry wolf).
3. **V1 nesting bug** — found + TLC-certified-fix-in-hand, NOT fixed (depth-aware
   active-agent stack; a live contract-escape in EXPERIMENTAL agent-runtime). Orthogonal.
4. **Lethal trifecta as a TYPE (F1, P0 in roadmap)** — rides typed purity's machinery.

## Shipped (this session — pushed to `claude/what-now-umafgi`, tree clean, HEAD==origin)

Picked **A1 (the adoption flywheel)**. Deterministic, zero-budget prep — left the
real-model pilot as a one-command spend decision for the user.

- **chore(bench)** `dd80681`: A1 manifest expanded 4→5 — added **token-efficient**
  (`drona23/claude-token-efficient@0d30a6d`, MIT, 5.7k★), a 2nd cleanly-A/B compression
  entry (injectable CLAUDE.md). Its viral "63%" is a WORD cut over 4 prompts; the repo's
  OWN token benchmark admits ~4–12% — a self-documented claim≫measured debunk. Vendored
  the real file + MIT LICENSE; full provenance + the follow-on (RTK/CodeGraph/Claw —
  needs-binary) + license-blocked (Context Mode/Elastic) cluster map in SOURCES.md/
  FINDINGS.md. Also: leaderboard now surfaces **per-task spread** (output-cut range +
  helped/hurt split + MIXED-direction flag) instead of hiding it behind one mean.
- Web research (verified GitHub-API stars + licenses + verbatim claims) classified the
  whole compression cluster; only drona23 was a clean new A/B add (rest are CLI/MCP
  binaries → follow-on, or Elastic-licensed → reject; pinchtab dropped, not compression).

## Next move on A1 (none started)

- **RUN the pilot** (spend decision): `claude` CLI + sub auth ARE present in this env, so
  `VIGILES_SKILLS=caveman,token-efficient VIGILES_TASKS=2 VIGILES_TRIALS=2 node bench/ecosystem/benchmark.mjs`
  (cheap haiku) validates the 5-skill engine end-to-end + fills token-efficient's row.
  Then a fuller sonnet pass + a gated findings writeup.
- Build the **needs-binary follow-on tier** (RTK/CodeGraph/Claw) if the cluster debunk
  is worth the install cost — bigger lift, deferred.

## In flight

Nothing. Research subagent complete + verified; tree clean; local == remote.

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
