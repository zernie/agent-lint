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

## In flight

Clean — everything committed & pushed to `claude/rules-editor-autocomplete-01cjr2`.
**Awaiting direction** — the typed-contracts layer's useful half is done (B1/B2/B3);
B4 + the lethal-trifecta check were both DEFERRED by the user (see below). Don't pick
the next feature unilaterally; ask.

## Decisions / shipped this session

- **B3 — side-effect boundary as a deterministic test (SHIPPED, `b7a121d`).** Rung 2 of
  the typed-contracts ladder. Added `didNotWrite(path)` — the symmetric no-write sibling of
  `wrote()` — to the check vocabulary (auto-public on `vigiles/testing`+`unit`, +1
  `check.test.ts` case) + `examples/harness/effect-boundary.harness.mjs` (Part A asserts the
  boundary over a constructed Trace incl. catching an escape; Part B the same
  `wrote`/`didNotWrite`/`notTool` checks over a real scripted-mock `runHarness` turn — claude
  BINARY, NO key). Validated: passes via `vigiles test`. Docs: a sibling section in
  `docs/harness-testing.md`. The authoring half (`effect()`, `purity:` floor) already shipped.
- **B4 — shareable typed presets: DEFERRED (user call).** `preset()`/`extend()` only pay off
  at SCALE (org/monorepo consuming a published preset) and vigiles has ~no consumers yet —
  network-effect-before-the-network. The `off()` primitive was also mis-framed (it reads as
  "disable an eslint rule," but vigiles never touches eslint config — `enforce()` only
  documents+verifies a rule is already enabled; `off()` could at most DROP an inherited rule
  from the compiled instruction file). Roadmap P1 updated to `[ ] DEFERRED`.
- **Lethal-trifecta / capability check: DEFERRED (user call).** Was the proposed nearer-term
  P2 pick (deterministic, no-auth, the Analogical-Transfer forbidden-state moat example).
  User said defer before any code was written — nothing built, stays `[ ]` in roadmap P2.
- **(prev session) B1 + B2 shipped** — `vigiles scaffold-test` (`0fb7f2c`) + railway/Result
  docs+example (`9c3e69f`); roadmap P1 now marks both `[x]`.
- **`dir()` + `glob()` spec builders** (`42f0b5e`) — lightweight authoring helpers (research's
  #1 gap). `src/core/spec.ts` builders + compile verification (`validateDirRef` = exists AND
  is a dir; `validateGlobRef` = ≥1 match), 7 vitest cases, docs in `docs/spec-format.md`.
  Auto-public (the `.` export is spec.ts). `doc()` is the remaining sibling. NOTE:
  `src/core/doc-refs.ts` does NOT yet recognize `dir(`/`glob(` in ```ts doc blocks — optional.
- **`optimize` → folded into `scan --fix-plan`** (`24e24ee`, RESOLVED). User pushed on "what's
  optimize for" — it was a 3rd command on the same `ScanReport` (scan reports / explain
  diagnoses one / fix-plan ranks), no new capability until the measured half exists. Removed
  the `optimize` verb; `scan --fix-plan` is the lens; pure `optimize()` kept. **P2 roadmap item
  added** to reconsider an `optimize` verb once each rec carries a measured before/after delta.
- **(prev) `dir/glob` predecessor work** — A1 corpus (`bench/corpus/`), C4 explainer
  (`src/score-explainer.ts` + `vigiles explain`), the handoff system + SessionStart hook.

## Environment note (this session)

`claude` CLI is on PATH but there is **NO auth** (no API key, no creds file) — so the
real-model measurement tiers (A1/A2-measured/A4/evals) CANNOT run here. Deterministic work
(typed contracts, lint rules, corpus, docs) needs neither. Run the measurement layer yourself
on the Pro/Max subscription.

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
