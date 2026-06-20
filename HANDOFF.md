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

1. **A2 — the MEASURED half of `vigiles optimize`.** The deterministic spine SHIPPED
   this session (`src/optimize.ts` + the `vigiles optimize <dir>` CLI — health score +
   ranked free fixes, reusing `explainScore`). What's left: wire the real-model A/B so each
   add/drop/swap carries a MEASURED delta (`runEval` over `bench/corpus`). ⚠ Needs sub auth.
2. **A1 — ecosystem benchmark v0** (the viral artifact). Loop A/B over 10–20 hyped
   skills on `bench/corpus/coding-tasks.mjs`; table of bill/target/correctness; lead
   with the debunks. ⚠ Costly real-model run — needs the Pro/Max **subscription auth**;
   pilot tiny (`VIGILES_TASKS=2 VIGILES_TRIALS=2`) first. Reuses `runEval`.
3. **A4 (cheap, do anytime)** — `VIGILES_MODEL=sonnet node bench/evals/caveman-claim.eval.mjs`
   to harden P0 on caveman's target model. Also needs sub auth.

Then the other layers (all `[ ]` in roadmap): typed contracts B1–B4, linting C1–C3,
distribution D1–D3. The full ordered map + per-item status is in `research/roadmap.md`.

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

Everything committed & pushed to `claude/rules-editor-autocomplete-01cjr2`. A 3-trial
A/B eval is RUNNING (`/tmp/reviewer-ab-3trial.log`). Next pivot work queued: A4
(caveman on sonnet — cheap) then A1 (ecosystem benchmark) — both now runnable here.

## Decisions / shipped this session (spec-foundation review)

- **Two decisions SETTLED with web research + recorded** (`660d12c`,
  `research/spec-syntax-and-railway-scope.md`): (1) **railway/Result is a SUBAGENT
  contract, NOT skills** — skills run inline (no return/parse-point), so a typed
  outcome is a category error; `context: fork` is the bridge. The railway-for-skills
  edit I'd started was REVERTED. (2) **spec syntax is already the correct hybrid**
  (plain-object backbone + typed-value helpers like enforce()/file() + tagged
  template `instructions\`\``for prose-with-refs) — the win is RESTRAINT:`doc()`DROPPED (dups instructions``), NO`section()` helper (keep the object map).
- **Length-guard SHIPPED (`989791e`)** — `DEFAULT_MAX_SECTION_LINES = 200` in
  `validateSectionContent`, now on claude AND agent sections (was opt-in,
  claude-only), overridable via `maxSectionLines`. Generous on purpose
  (don't-cry-wolf: our dogfood has a 262-line Key Files + 8298-char paragraph).
  TS types CAN'T bound string length (confirmed: TS #52243); compile-time guard is
  the mechanism. +2 spec.test.ts cases; docs in spec-format.md.
- **Railway public docs SHIPPED (`bae46ad`)** — `docs/railway-subagents.md` (the
  full agent()/result()/railway() guide + assert-not-judge + the subagents-not-skills
  scope), cross-linked from harness-testing.md, indexed in CLAUDE.md. orphan-docs ✓.
- **OSS-plugin round-trip finding** — rewrote a real skill (oh-my-claudecode `verify`)
  as a spec: compiled output = byte-identical body + only the integrity stamp differs.
  Skills round-trip CLEAN; the real gaps are agent frontmatter fields (disallowedTools/
  color/level/skills) + no builder for prose command files (both follow-ups).

## Earlier this session

- **B3 — side-effect boundary deterministic test (`b7a121d`)** — `didNotWrite()`
  check + `examples/harness/effect-boundary.harness.mjs` + docs.
- **B4 presets + lethal-trifecta check: DEFERRED (user calls).** B4 premature
  (no consumers); trifecta deferred before any code. Both `[ ]` in roadmap.
- **(prev) B1/B2 (`0fb7f2c`/`9c3e69f`) + dir()/glob() (`42f0b5e`) shipped.**

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
