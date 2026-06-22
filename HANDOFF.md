# HANDOFF — volatile cross-session state

> Overwrite each session; keep ≤120 lines. The durable map is `research/roadmap.md`.
> The SessionStart hook injects this file so a new session starts oriented WITHOUT
> re-reading CLAUDE.md + research. Read first, then open what "Next move" points at.

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

⚠️ **COMPETITIVE READ (2026-06-21, web-verified + market-corrected).** "Typed-spec moats
commoditizing" was a MARKET CONFLATION — fancy capabilities live in ADJACENT markets
(app-building Mastra/promptfoo; infra riftmap; MCP-security AgentAuditKit), NOT vigiles's.
In-market rivals are pure static surface linters (claudelint/cclint/`claude plugin validate`,
NO cross-ref/typed/eval); field WIDE OPEN (biggest = agnix 296★, no cross-ref/eval). So:
**LEAD WITH CROSS-REFERENCING** ("valid≠true", unique + plain-markdown) + test/eval. The
valuable cross-check is HARNESS-NATIVE (tools/MCP `server#tool`/events/paths/delegates), NOT
more linter catalogs. Full record: `typed-spec-moat.md` + `landscape-mid-2026.md`.
**SHIPPED live MCP tool resolution** (`6edd6a0` `verifyMcpContractTools` + `2982510`
`scan --verify-mcp`) — starts the declared server, checks each `mcp__server__tool` exists
w/ did-you-mean. DOGFOOD found a REAL bug (`d813d82`): MadAppGang tester.md lists 3 dead
chrome-devtools tools, invisible to every static linter (plugin-structural-findings.md).

**SHIPPED (`adeec45`): plugin SELECTION-COLLISION matrix** (`scan --collisions`) — the
behavioral CONFIRMATION of the deterministic `description-overlap` rule, and the eval
improvement chosen from the OSS gap analysis. Runs each model-invocable skill's prompts
against the WHOLE installed plugin, records WHICH skills fired (`whichSkillsFired` +
`runSkillSelectionTrial` in eval.ts; pure `buildSelectionReport` + `measurePluginSelection`
in scan-behavioral.ts) → N×N matrix (diagonal=recall, off-diagonal=a sibling HIJACKING the
prompt). The cross-skill precision per-skill trigger-rate CAN'T see; the leaderboard's
blast-radius column; nobody else has it. CC-only (needs a discrete skill-selection event).
Bodies stubbed (stops at selection, cheap). DOGFOODED on the sub: vigiles's own 3 skills
collision-FREE (clean bill); bonus signal edit-spec under-fired (recall 33%). superpowers
slice can't fire (missing gateway skill). Detection proven by CI fake-driver test (foo↔baz
50%). See `research/plugin-selection-collision.md`.

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
  ~0.7% of session. Audited their OWN benchmarks (FINDINGS §methodology audit): single-shot
  Q&A, output-tokens-only, vanilla baseline, no correctness gate → why they report a win.
  ⚠️ **caveman debunk is SATURATED** (Kuba Guzik/GrowwStacks/HN/Decrypt + author conceded) —
  do NOT lead with a caveman article. **NEXT on A1: the LEADERBOARD** (reproducible +
  claim-vs-measured + correctness + head-to-head — the open slice; position on
  claim-gap/reproducibility/correctness, "sort real from hyped" not blanket-debunk).
  Benchmark prior-art in landscape-mid-2026.md.
- **V1 nesting bug FIXED (`c50b826`):** active-agent now a depth-aware STACK (push/pop/
  gate-on-top); TLC counterexample is a regression test. Still EXPERIMENTAL/not auto-wired.
- **Strategy docs (this session's main output):** `spec-value-model.md` (NEW — spec vs
  markdown: capability axis, two-oracle, leg-grading, require-\*-spec defaults); the
  full **market-segmented competitive matrix** + agnix find + poach list in
  `landscape-mid-2026.md`; corrected reality-check in `typed-spec-moat.md`; bsuh
  control-flow article; per-file note in `adoption-strategy.md`. See COMPETITIVE READ above.
- **Ideas captured (roadmap §Explore + distribution-strategy):** tiered README badge
  (lint→test→eval growth loop); viral debunk articles (method-first, caveman SATURATED);
  PUBLIC plugin leaderboard (the open slice); open-core + AI-lab-acquisition posture;
  Zod-schema'd `result()` (feature-ideas §14b); benchmark prior-art + moat ranking.

## In flight

Nothing. Tree clean; local == remote.

## Gotchas (carry forward)

- **Subagents must NOT use worktree isolation**; VERIFY their output (git diff + build +
  tests + run the thing) — don't trust "done". Apply their reported keyFiles deltas to
  `CLAUDE.md.spec.ts` yourself + recompile.
- **TS-encoding rule:** per-edge check → SHALLOW generated type (O(N)); whole-set
  uniqueness → JS generator (variadic/recursive types hit TS2589 ~N=1000). See typed-spec-moat.md.
- Real-model tiers (A1/evals) need sub auth + are slow — pilot tiny; deterministic work
  needs neither.
- Conventional-commit subjects; `build` + `vitest` + `lint` + `fmt:check` before commit;
  recompile `CLAUDE.md` after editing `CLAUDE.md.spec.ts`; `api:report` when the public
  surface changes; cross-link new research docs (orphan-docs lint); **NO session links /
  model IDs in commits**.

## Budget protocol

- Orient from THIS file; open a doc only when a step needs it. **Delegate** searches +
  big builds to subagents (verify their output). Bounded commits; **refresh this file
  after each shippable commit**.

## Don't re-read unless the task needs it

- `research/roadmap.md` — the ordered map (per-item status; capability-diff **P1**,
  trifecta F1 **P0**, the See-also index to every research doc).
- `research/typed-spec-moat.md` — the moat synthesis: findings, build order, tensions.
- `research/measurement-authority.md` — the pivot + the "Status & gaps" section.
- `bench/ecosystem/` — A1 engine + manifest + FINDINGS + archived runs (the leaderboard substrate).
