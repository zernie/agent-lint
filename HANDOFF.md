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

🚀 **BIG-MOAT DIRECTION (2026-06-22).** `research/harness-protocol-flow-moat.md`: type the
harness's DYNAMIC structure (ORDER/FLOW/REPLAY) a capability SET discards — a deterministic
reliability RUNTIME, not a lint rule. Grounded: #32163 "@enforce", SDK #172, trifecta 98%.
🎯 **HOOKS DEEP-DIVE (2026-06-22) — see `research/hook-pain-points.md`.** 5-pass verified
research: #1 hook pain = FALSE CONFIDENCE (a guard silently doesn't block: exit 1≠2, wrong
field; "3 teams believed they'd blocked force pushes"; RFC #45427 not-planned). TWO threads:

- VERIFY (SHIPPED `a5abf70`): "prove your guardrail blocks" — `src/guardrail-check.ts` on
  `vigiles/unit` (DISASTER_CATALOG + verifyGuardrail + assertBlocksDisasters + neutral map);
  dogfooded on disler/cc-hooks-mastery (blocks rm/.env, no-ops vs force-push/ssh-read). Honest
  reassessment: useful but NOT a moat — it's a thin catalog+runHook wrapper / a lint-ish check.
- COMPILE (the moat, probed — see Shipped). GATE work (`959e88c`/`4336f4a`) DEMOTED MED (CC
  bugs #34692/#24327 undercut any PreToolUse gate). Prefer VERIFY/COMPILE over GATE.

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

- **Guardrail VERIFY killer feature (`a5abf70`):** `src/guardrail-check.ts` on `vigiles/unit`
  (catalog + verifyGuardrail/assertBlocksDisasters/neutral-map) + scaffold-test wiring. THE bet.
- **5-pass hook research (`d24bfa6`):** `research/hook-pain-points.md` (verified corpus); roadmap
  updated (VERIFY = HIGH, GATE = MED). The evidence base for everything above.
- **hook-spec spike (`d3471c0`):** typed/effect-classified hooks (`src/core/hook-spec.ts`) —
  wrong-field & mutating-observe-hook = compile errors. EXPERIMENTAL, parked (correctness win).
- **COMPILED-HOOKS probe (`bd33aa4`/`3c00be5`/`890aa3e`):** `src/core/hook-program.ts` — hook =
  pure typed fn vs a closed `vigiles/hook` API. P1: 5 claims (pure/testable, AST match via new
  `bash-effects.leafCommands` beats glob #30519+grep, compiles to CC, capability=API surface,
  tamper-evident STAMP). P2/P3: the vocabulary is a SOUND role-keyed FAMILY — gate(Decision,pure)/
  inject(Injection,pure)/react(Reaction,bounded+effect-classified); each role's output type makes
  its wrong-output bug (exit-code/wrong-field/block-on-wrong-event) unrepresentable. The real
  compiled-hooks moat ("a hook is a formal object"). Open Q is now ADOPTION economics
  (buy-in vs node latency vs payoff), NOT coverage. Not on public API.
- **guard-hook GATE (`959e88c`/`4336f4a`):** typed guards + runnable gate + ledger; ORDER axis
  live. EXPERIMENTAL; demoted MED (CC bugs undercut any gate). Don't build more.
- **Prior (don't rebuild):** A1 sonnet (caveman −18% / token-efficient −10%, both debunked —
  SATURATED); V1 nesting STACK fix (`c50b826`); leaderboard v0.

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
