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
Bridge bet = **capability-diff (#2)**. Full: `research/measurement-authority.md` § "Status & gaps".

⚠️ **COMPETITIVE READ (2026-06-21, web-verified + market-corrected) — read before
re-pitching the moat.** First pass said "typed-spec moats are commoditizing" — that was a
**MARKET CONFLATION**, now corrected. The fancy capabilities (typed handoffs, det.
oracle, capability-diff) live in ADJACENT markets — **app-building** (Mastra/promptfoo,
zero CLAUDE.md contact), **infra** (riftmap), **MCP-server security** (AgentAuditKit) —
NOT vigiles's market. In vigiles's ACTUAL market (verify a coding-agent harness) the only
competitors are **pure static surface linters**: **claudelint** (114 rules), **cclint** ×2,
**`claude plugin validate`** — confirmed via their docs to do NO cross-referencing, NO
typed specs, NO compile-time, NO test/eval, NO capability-diff. So in-market vigiles
UNIQUELY owns cross-ref + typed + test/eval; it is NOT differentiated on surface linting.
**Adoption pass DONE: field is WIDE OPEN — no incumbent, near-zero mindshare.** Biggest
competitor = **agnix** (296★, ~414 rules, Rust, 7-harness + LSP — crowds vigiles's
multi-harness/LSP words but does NOT do cross-ref/typed/eval); rest 6–41★; none in
awesome-claude-code (47k★); npm downloads CI-inflated (agnix Show HN = 1 pt). Only
entrenched thing = Anthropic `claude plugin validate` (shallow manifest floor). So: don't
out-rule-count agnix or match its LSP; **LEAD WITH CROSS-REFERENCING** ("valid≠true": only
vigiles checks the named rule EXISTS + is ENABLED — unique in-market, works on plain
markdown = zero adoption barrier) + the test/eval tier. **The real battle is
DISTRIBUTION/mindshare, not capability** → reinforces A1/adoption-engine. Full:
`landscape-mid-2026.md` §"Market-segmented competitive matrix" + `typed-spec-moat.md`
§"Competitive reality check". Caveat: #8 (static purity) + destructive-actions unverified.

## Next move (pick — none started)

1. **ADOPTION: the at-scale ecosystem benchmark (A1)** — the viral artifact, still
   ~v0. ENGINE READY + manifest now 5 skills (2 cleanly-A/B compression debunks:
   caveman + token-efficient). REMAINING: run the full manifest at scale (real-model,
   needs sub auth — spend decision) + publish a findings writeup. The flywheel.
2. **capability-diff (#2, P1, the bridge)** — needs the UNBUILT **effect-row (M1) +
   cross-step accumulation** engine (compute the capability surface), then the v1→v2
   diff (already prototyped, fp-theory T2). Carry a loud sign-off hatch (don't cry wolf).
3. ~~V1 nesting bug~~ **FIXED this session (`c50b826`)** — depth-aware active-agent
   STACK shipped (push/pop/gate-on-top + both Task/Agent spawn tools); TLC
   counterexample is now a regression test. Still EXPERIMENTAL/not auto-wired.
4. **Lethal trifecta as a TYPE (F1, P0 in roadmap)** — rides typed purity's machinery.

## Shipped (this session — pushed to `claude/what-now-umafgi`, tree clean, HEAD==origin)

- **A1 (`dd80681`,`f609d00`):** manifest 4→5 (added **token-efficient** drona23@0d30a6d,
  MIT, 5.7k★, injectable CLAUDE.md; full cluster map in SOURCES/FINDINGS) + per-task
  spread in the leaderboard. **Pilot RAN (haiku, $0.29):** token-efficient DEBUNKED
  (claim 63% vs −2%); caveman noisy on haiku. **SONNET PASS DONE (`da08504`, $3.43,
  5 trials):** caveman 75%→**−18%** (stable; bill +8%; review-doc −55%), token-efficient
  63%→**−10%** (bill +3%; worse than its own ~12% sonnet claim); both 0-regress, output
  ~0.7% of session. CREDIBLE + publishable. NEXT on A1: publish v0 leaderboard + the
  "caveman is vaporware" debunk article (numbers now in FINDINGS.md).
- **V1 nesting bug FIXED (`c50b826`):** active-agent now a depth-aware STACK
  (push/pop/gate-on-top, SubagentStop POPS to parent; both Task/Agent spawn tools);
  TLC counterexample Open;Open;Stop;Call(Bash) is a regression test. Suite green (1426).
  Still EXPERIMENTAL/not auto-wired.
- **Strategy docs (this session's main output):** `spec-value-model.md` (NEW — spec vs
  markdown: capability axis, two-oracle, leg-grading, require-\*-spec defaults); the
  full **market-segmented competitive matrix** + agnix find + poach list in
  `landscape-mid-2026.md`; corrected reality-check in `typed-spec-moat.md`; bsuh
  control-flow article; per-file note in `adoption-strategy.md`. See COMPETITIVE READ above.
- **New ideas captured (roadmap §Explore + distribution-strategy):** (1) **tiered README
  badge** (lint→test→eval funnel as a growth loop) — top distribution lever; (2) **viral
  debunk articles** ("caveman is vaporware" = measurement-as-marketing); (3) **open-core +
  build-on-top + AI-lab-acquisition** posture; (4) **Zod-schema'd `result()`** poached from
  Mastra/Pydantic (one schema → type+validator+JSON-schema), feature-ideas §14b.

## In flight

Nothing. Tree clean; local == remote.

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
