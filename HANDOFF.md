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

Per `research/roadmap.md` §"P1 — measurement", in order:

1. **A1 — ecosystem benchmark v0** (the viral artifact). Loop A/B over 10–20 hyped
   skills on `bench/corpus/coding-tasks.mjs`; table of bill/target/correctness; lead
   with the debunks. ⚠ Costly real-model run — needs the Pro/Max **subscription auth**;
   pilot tiny (`VIGILES_TASKS=2 VIGILES_TRIALS=2`) first. Reuses `runEval`.
2. **A2 — `vigiles optimize` v0** — measure the user's own skills/model/rules, recommend
   add/drop/swap with a measured delta. Calls `explainScore` (already shipped) for the WHY.
3. **A4 (cheap, do anytime)** — `VIGILES_MODEL=sonnet node bench/evals/caveman-claim.eval.mjs`
   to harden P0 on caveman's target model. Also needs sub auth.

Then the other layers (all `[ ]` in roadmap): typed contracts B1–B4, linting C1–C3,
distribution D1–D3. The full ordered map + per-item status is in `research/roadmap.md`.

## In flight

Clean — everything committed & pushed to `claude/rules-editor-autocomplete-01cjr2`.

## Decisions / shipped this session

- **A1 foundation** — `bench/corpus/coding-tasks.mjs` (reusable real-task corpus) +
  `verify.mjs` (no-model self-check that each oracle discriminates good/bad).
- **C4 score-explainer** — `src/score-explainer.ts` (+12 tests) AND the
  **`vigiles explain <dir> [name]`** CLI (deterministic WHY a skill/agent
  underperforms, with the fix; `--json`). Docs in `docs/cli.md`. The pairing A2 builds on.
- **This handoff system** — `HANDOFF.md` + the SessionStart hook + `src/session-handoff.test.ts`.

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
