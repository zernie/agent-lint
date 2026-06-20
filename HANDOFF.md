# HANDOFF — volatile cross-session state

> Overwrite each session; keep ≤120 lines. The durable map is `research/roadmap.md`;
> this is the cheap pointer to it. The SessionStart hook (`.claude/hooks/session-handoff.sh`)
> injects this file so a new session starts oriented WITHOUT re-reading CLAUDE.md +
> the research docs. Read this first, then open only what "Next move" points at.

## Now

Working the **measurement-authority pivot** (`research/measurement-authority.md`):
vigiles → the empirical authority on what makes agentic coding work. THREE layers —
**measurement (offense)** → **typed contracts (substrate)** → **linting (free pre-filter)**.
Don't tunnel on the benchmark; the full scope is all three + distribution.

## Next move

SPEC + DOCS + TESTING-HARNESS + the core EVALS are DONE (this autonomous run — see
below). The does-our-spec-help A/B gave its VERDICT: **the spec HELPED** (quality
identical 100%/100%, parseable-outcome payoff 0%→100% prose→spec — typed-contracts
thesis validated on our own contract). Remaining pivot work (real-model evals RUN
here — auth is available):

1. **A1 — ecosystem benchmark v0** (the viral artifact): A/B 10–20 hyped skills on
   `bench/corpus/coding-tasks.mjs`; pilot tiny first; lead with the debunks (caveman
   is the template — measured ≪ claimed). Reuses `runEval`. ⚠ LARGE (sourcing skills +
   real-model cost + a PUBLISH decision = outward-facing, get user sign-off first).
2. **A2 measured optimize half / distribution / P2 trifecta** — later. Full map in
   `research/roadmap.md`.

## AUTONOMOUS RUN — forks & decisions (2026-06-20 night, user asleep)

Mandate: "continue spec hardening, evals, rest of pivot autonomously; flag forks
in handoff." Decisions I made (reverse me if you disagree):

- **FORK — auth IS available here (BIG correction).** Earlier "no auth" was WRONG:
  the env has an OAuth token FD + `ANTHROPIC_BASE_URL` + proxy; `claude -p --model
claude-sonnet-4-6`/`claude-haiku-4-5-20251001` run real turns. So I'm RUNNING
  real-model evals here, mindful of sub cost. (`claude-3-5-haiku-20241022` is RETIRED.)
- **DECISION — fp lib for railway: NONE.** The railway is compile+parse-time, not a
  runtime monad — own discriminated `Result` (`parseAgentResult`) stays, zero-dep.
  If runtime combinators are ever built → neverthrow (NOT Effect/fp-ts). Recorded in
  `research/spec-syntax-and-railway-scope.md` Decision 3.
- **SHIPPED — context:fork (`b19febd`)** + agent fields (`95ce25f`) + adopt rename
  (`6137008`). Spec hardening P1 is DONE.
- **FORK (open) — the A/B eval's subagent won't reliably DISPATCH.** `reviewer-ab.eval.mjs`
  measures "does our spec help a subagent" but sonnet reviews INLINE instead of
  delegating (0% dispatch at n=1,2 even with "DELEGATE, don't review yourself").
  Mitigation in flight: `allowedTools:["Task"]` to force delegation (lead can't read,
  must dispatch). If still flaky at n=3, the HONEST finding is "subagent-dispatch in
  an eval is unreliable" — I'll record it and not rabbit-hole; the contract's payoff
  (parseable outcome) only shows once dispatch happens. See the eval's FINDING block.
- **Our own CLAUDE.md/helpers (user Q):** verdict — leave it (keyFiles already carries
  verified refs; plain-string sections are narrative). Higher-value dogfood = convert
  our shipped skills to specs with effect()/purity — deferred.

## In flight

Everything committed & pushed to `claude/rules-editor-autocomplete-01cjr2`. Spec +
docs of the pivot are DONE. Real evals ran (caveman-sonnet, the A/B). Full per-item
status in `research/roadmap.md`.

## Shipped (this multi-part session)

- **Spec hardening (all shipped):** length-guard (`989791e`), agent `color`/
  `disallowedTools` (`95ce25f`), `migrate`→`adopt-spec` rename (`6137008`),
  `context:fork` + gated forked-skill `output` (`b19febd`); earlier B1/B2/B3 +
  dir()/glob(). `doc()` DROPPED, `section()` helper rejected, B4 presets + trifecta
  DEFERRED (all user-confirmed).
- **Docs:** `docs/spec-format.md` now COMPLETE (subagent section, full skill/agent
  field tables, purity & effects) (`44a8d54`); `docs/railway-subagents.md` (`bae46ad`);
  `tools` vs `disallowedTools` clarified — use ONE not both (`ad09ed2`, user Q);
  two research decisions recorded in `research/spec-syntax-and-railway-scope.md`.
- **Testing harness:** FIXED subagent nested-trace recovery under `--plugin-dir`
  (`212869d`) — namespaced `subagent_type` + the sub's RETURN captured as
  `SubagentTrace.output`; CC discoveries documented inline. Unlocks subagent-contract evals.
- **Measurement (real runs):** caveman debunk HARDENED on sonnet — −23%/−20%, gets
  stronger (`4783464`); the does-our-spec-help A/B DONE — **the spec HELPED**
  (quality 100%/100%, payoff 0%→100%; thesis validated on our own contract) (`b25218e`).
- **Decisions:** railway = subagents-only; spec syntax already the right hybrid
  (restraint > more helpers); fp-lib = none (neverthrow if ever); see the forks list above.

## Environment note (CORRECTED 2026-06-20)

**Real-model runs DO work here** — earlier "no auth" was WRONG. There's no API-key
file, but the env carries an OAuth token FD + `ANTHROPIC_BASE_URL` + a proxy, so
`claude -p "..." --model claude-sonnet-4-6` (or `claude-haiku-4-5-20251001`) returns
real output (verified). `claude-3-5-haiku-20241022` is RETIRED — use current models.
So the **measurement tiers (A1/A2/A4/evals) CAN run here** — pilot tiny (1 trial)
first, mind the subscription cost. Deterministic work needs no model regardless.

## Gotchas (carry forward)

- **I can't read my own context %** mid-session (no tool for it). So the budget
  discipline is "always-current handoff + bounded work", NOT self-monitoring a number.
- **Subagents must NOT use worktree isolation** — last session one branched off an old
  base, deleted ~5700 lines in a stray worktree, and falsely reported "done". Implement
  directly in the main tree; verify any subagent output with `git diff` + build + tests.
- **Real-model tiers (A1/A2/A4/evals) are slow + need subscription auth** — pilot small,
  don't kick them off blind. Deterministic work (corpus, explainer, lint) needs neither.
- **Conventional-commit subjects**; build + `npx vitest run <touched>` + lint + `fmt:check`
  before committing; recompile `CLAUDE.md` after editing `CLAUDE.md.spec.ts`; cross-link
  docs (orphan-docs lint); no session links / model IDs in commits.

## Budget protocol (stay under ~40%)

- Read THIS file, not the docs, to get oriented; open a doc only when a step needs it.
- **Delegate searches/reads to the `Explore` subagent** so file dumps stay out of the
  main context.
- Work in **bounded commits**; **refresh this file after each shippable commit** so the
  state is always current regardless of when the session ends/compacts.
- Keep this file a **pointer** (link roadmap/research), never paste their contents in.

## Don't re-read unless the task needs it

- `research/roadmap.md` — the ordered map (P0✅ · P1 measurement/typed-contracts · P2 linting · distribution).
- `research/measurement-authority.md` — the pivot's home doc (the 3 layers + "what becomes of linting").
- `research/benchmark-methodology.md` — the metric triple (bill/target/blast-radius).
- `bench/evals/caveman-claim.eval.mjs` — the P0 worked instance + the FINDING block.
