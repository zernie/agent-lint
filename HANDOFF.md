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
**SHIPPED live MCP tool resolution** (`scan --verify-mcp`, `2982510`) — starts the declared
server, checks each `mcp__server__tool` exists; dogfood found a real MadAppGang dead-tools bug.

**SHIPPED: SELECTION-COLLISION matrix** (now `vigiles measure`) + Layer-1 hook-primed-artifact
honesty (`852a05d`); full in `plugin-selection-collision.md`. **CLI CONSOLIDATED (`2aedc5b`):**
scan 14→6 flags; NEW `vigiles measure <dir>` = model-gated behavioral front door; capability-diff
folded to `scan <after> --capability-diff=<before>`. OPEN (user floated): fold `scan` into `lint`
(directionally right, deferred — don't thrash).

🚀 **BIG-MOAT DIRECTION (2026-06-22, user steer "huge moat, way more reliable harness — not
small linter improvements").** Deep FP pass + web-verified failure corpus →
`research/harness-protocol-flow-moat.md`. Thesis: existing moats type the static capability
SET; the prize is typing the harness's DYNAMIC structure — the 3 things a set discards:
**ORDER** (typestate: destructive action unreachable until its guard step ran — kills
destroy-without-backup), **FLOW** (info-flow/noninterference: untrusted input can't reach a
sink — the trifecta as a real path), **REPLAY** (linear/idempotent: exactly-once side effects
— the unsolved duplicate-on-replay hole, ACRFence). Reframed as a CATEGORY: a deterministic
**reliability RUNTIME** (spec→PreToolUse gate, enforced OUTSIDE the context window so it
survives compaction), NOT a lint rule — "make the harness measurably more reliable," provable
via the eval layer (the face-wipe A/B). Grounded: prose-doesn't-bind (#32163 "@enforce"),
declared≠enforced (SDK #172/#162/#189), METR <10%@4h, trifecta 98% of prod agents. Companions
poached: `typed-claude-md-poach.md` (Mastra/Pydantic/Effect-TS).
**PROTOTYPE RUNS (`959e88c`,`4336f4a`):** `src/core/guards.ts` = typed safe-by-construction
guards (block/requireBefore/confine) + a runnable `vigiles guard-hook` PreToolUse gate —
loads `.vigiles/guards.json` + a session ledger (`.vigiles/guard-ledger.json`), runs
`decideGuards`, blocks (exit 2) or records the allowed call. **ORDER axis enforced LIVE**
(runHook e2e: destroy blocked before plan, allowed after — across hook invocations). The
command is vigiles's OWN gate, never user shell (closes the CVE-2025-59536 hook-RCE class).
EXPERIMENTAL, not on the public API. NEXT: the measured-reliability demo (eval A/B: guard
on vs off on a destroy-before-backup task) + decide whether to surface `guards` in a spec.

## Next move (pick)

0. **PUBLIC LEADERBOARD — v0 SHIPPED (`3011e08`), now BROADEN it.** chosen adoption
   bet. `scan <dirs> --md` = publishable Markdown table; `rankPlugins` labels by manifest
   name; `bench/leaderboard/{run.mjs,corpus.json,RESULTS.md}` = reproducible generator
   (clones public repos, ranks, scores-only). First run: 83 plugins (superpowers +
   wshobson/agents) → A:16 B:28 C:17 D:9 F:13, real outliers (dead tool, uncontracted/
   untested F-tier). NEXT: (a) broaden the corpus beyond 2 authors (wshobson-heavy);
   (b) add the BEHAVIORAL columns (trigger-rate/collisions) on top; (c) publish externally.
1. **A1 ecosystem benchmark** — claim-vs-measured (compression debunks); engine ready, sonnet pass done. Feeds the leaderboard's claim-gap column. (real-model spend.)
2. **capability-diff (#2) — v0 SHIPPED** (`scan <after> --capability-diff=<before>`,
   src/core/capability-diff.ts): WIDENED verdict + `--fail-on-widen`. v0 = tool-bucket
   lattice; RICHER per-step effect-row + cross-step accumulation (M1) = next.
3. **Lethal trifecta as a TYPE (F1, P0 in roadmap)** — rides typed purity's machinery.

## Shipped (this session — pushed to `claude/what-now-umafgi`, tree clean, HEAD==origin)

- **A1 (`dd80681`,`f609d00`):** manifest 4→5 (added **token-efficient** drona23@0d30a6d,
  MIT, 5.7k★, injectable CLAUDE.md; full cluster map in SOURCES/FINDINGS) + per-task
  spread in the leaderboard. **Pilot RAN (haiku, $0.29):** token-efficient DEBUNKED
  (claim 63% vs −2%); caveman noisy on haiku. **SONNET PASS DONE (`da08504`, $3.43,
  5 trials):** caveman 75%→**−18%** (stable; bill +8%; review-doc −55%), token-efficient
  63%→**−10%** (bill +3%; worse than its own ~12% sonnet claim); both 0-regress, output
  ~0.7% of session. Audited their OWN benchmarks (FINDINGS §methodology audit): single-shot
  Q&A, output-tokens-only, vanilla baseline, no correctness gate → why they report a win.
  ⚠️ **caveman debunk is SATURATED** — do NOT lead with a caveman article; position on
  claim-gap/reproducibility/correctness ("sort real from hyped"). Prior-art in landscape-mid-2026.md.
- **V1 nesting bug FIXED (`c50b826`):** active-agent now a depth-aware STACK (push/pop/
  gate-on-top); TLC counterexample is a regression test. Still EXPERIMENTAL/not auto-wired.
- **Strategy docs (this session's main output):** `spec-value-model.md` (NEW — spec vs
  markdown: capability axis, two-oracle, leg-grading); the **market-segmented competitive
  matrix** + poach list in `landscape-mid-2026.md`; reality-check in `typed-spec-moat.md`.
- **Ideas captured (roadmap §Explore):** tiered README badge; PUBLIC leaderboard; open-core.

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

- Orient from THIS file; open a doc only when a step needs it. **Delegate** searches + big
  builds to subagents (verify output). Bounded commits; **refresh this file after each commit**.

## Don't re-read unless the task needs it

- `research/roadmap.md` — ordered map (capability-diff **P1**, trifecta F1 **P0**, See-also index).
- `research/{typed-spec-moat,measurement-authority}.md` — moat synthesis + the pivot/"Status & gaps".
- `research/harness-protocol-flow-moat.md` — the reliability-runtime moat (ORDER/FLOW/REPLAY).
- `bench/ecosystem/` — A1 engine + manifest + FINDINGS + archived runs (leaderboard substrate).
