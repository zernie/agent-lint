# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file as context so a new session starts
> oriented — **read it first.** It is git-TRACKED and the container is EPHEMERAL
> (repo re-cloned each session), so an update persists ONLY if you **commit + push**
> it. **REFRESH IT before you end the session** (and on any "handoff" request):
> rewrite the RESUME-HERE task + decisions, then commit. A **Stop hook**
> (`.claude/hooks/session-handoff-check.sh`) nudges you when commits pile up without a
> refresh, so a stale handoff can't silently ship.

## RESUME HERE — execute the pre-release SURFACE FREEZE + markdown cut (2026-06-24)

Branch **`claude/readme-review-formatting-k8108k`**, latest commit is this handoff,
tree clean once committed. All work pushed. This session was mostly docs/research
PLUS one infra hook (the stale-HANDOFF Stop hook + its test, `4ce443a`). Test baseline
otherwise unchanged (only `dialect-drift.test.ts` fails locally = environmental,
container CC newer than pinned `VALIDATED_CC_VERSION`; CI pins it → green; the new
`session-handoff-check.test.ts` passes 5/5). Continue on this SAME branch/PR after compaction.

**THE TASK (user wants it next session, same PR):** execute the surface-freeze +
markdown-ladder cut from **`research/pre-release-focus.md`** (read it first — it's the
full plan). Concretely:

1. **Un-export / `@internal` the experimental cluster** so a later breaking change
   burns nobody: `guards.ts`, `hook-spec.ts` (imported nowhere), `effect()`/
   effect-region, `evolve.ts`, and the deep experimental typed-spec builders. Keep the
   code; remove from the PUBLIC exports.
2. **Audit the public surface via `api-extractor`** (`etc/*.api.md`). PUBLIC/frozen =
   the 8 CLI verbs + exit codes + `vigiles/{spec,testing,unit,claude-code,codex,adapter}`
   (`vigiles/hook` stays exported but un-headlined — parked, not removed).
3. **Markdown-ladder cut:** KEEP the inline `<!-- vigiles:enforce -->` on-ramp (the
   README depends on it); CUT the redundant **frontmatter mode (Level 1 `vigiles:`
   block)**; collapse the ladder to 2 (plain markdown → typed spec). Stop marketing
   "Level 0/1/2."
4. **Ship a `STABILITY` statement** (README section + short doc): "0.x — CLI stable;
   library API 0.x, evolving; experimental surfaces marked."

**This makes the PR BREAKING** (removed public exports + the frontmatter cut) → the PR
title needs `!` (e.g. `refactor!: freeze pre-release public surface`).

### SHIPPED this session (don't rebuild)

- **Stale-HANDOFF Stop hook (`4ce443a`)** — `.claude/hooks/session-handoff-check.sh`
  (wired in `.claude/settings.json`) blocks the stop + nudges to refresh HANDOFF.md once
  ≥ `VIGILES_HANDOFF_THRESHOLD` (default 5) commits land since it was last committed.
  Loop-guarded, fail-open, silent while the handoff is being edited. Tested
  (`src/session-handoff-check.test.ts`, 5 cases). The "stop forgetting the handoff" fix.

#### Docs/research

- **README overhaul (committed `8ebc51c`→`f46d93b`,`038c297`).** Pain-first hero
  ("100x coder, 1x verifier", keeps Agent=Model); fixed the scare-off "No TypeScript?"
  line → "Start in plain markdown"; broke up wall-of-text sections (each opens with a
  bolded pain); audience router (own-repo dev vs plugin author); **Guard / compiled
  hooks PARKED** (table row + ④ section commented out behind `PARKED FOR LAUNCH`
  markers; three instruments now = Lint/Test/Eval); new `docs/for-plugin-authors.md`.
  A **README DIRECTION comment** (incl. new rule 1b: never open with a negative) is at
  the top of README.md — read before editing.
- **Competitor/VC/funding research → moved to the private `startup/` vault** (git-crypt
  encrypted; see `startup/README.md` once unlocked). Plus **`research/pre-release-focus.md`**
  (public, sanitized — the park/polish/add triage, THE plan for the resume task).
- **Roadmap reprioritized:** added the `🚀 Launch readiness (pre-HN)` section (top of
  `research/roadmap.md`) — article-led measurement launch, the YC-RFS callout, the
  surface-freeze + park decisions + the markdown cut + launch-blocker checklist.

### Decisions of record (don't relitigate)

- **Focus thesis = VERIFY + MEASURE.** One product story: "verify + measure your agent
  harness — deterministic/free where it can be, on your sub where it can't." Everything
  else parks (Guard, deep typed-spec moat, guards/hook-spec/effect/evolve, opencode).
- **Launch = article-led MEASUREMENT at scale**, repo as destination. NOT a bare repo
  drop, NOT caveman-as-headline (saturated; it's one validation row). Ecosystem-
  benchmark v0 is the one real pre-launch BUILD.
- **Positioning:** consumer hero "100x coder, 1x verifier"; analogy = "a test suite + CI
  for your CLAUDE.md/hooks/skills" (lead), "`strict` mode for your harness" (depth hook).
  The "deterministic shift-left guardrail + private on-your-sub measurement" framing +
  the full investor angle live in the private `startup/` vault (git-crypt).
- **Moratorium on net-new research + new instruments until after launch.** (Stop the
  scatter — that's what this whole reprioritization is for.)
- **Verb surface is 8 + hidden `hook-runtime`** (init/compile/lint/test/eval/scan/
  scaffold-test/generate). Freezing these is part of the resume task.
- Public docs name the USER BENEFIT — no `moat`/`measurement-authority`/`flywheel`
  vocabulary, no `research/` links.

### Gotchas

- CC-on-web remote env: GitHub via `mcp__github__*` (NO `gh` CLI). No PR opened by me
  this session — check/open one for this branch (BREAKING title once the freeze lands).
- Before commit: `npm run build` + `npx vitest run` + `npm run fmt:check`; recompile
  `CLAUDE.md` after editing `CLAUDE.md.spec.ts`; `self-command-refs` fails CI on a stale
  `vigiles <cmd>` ref. Coverage gate 100% lines/funcs/stmts, 90% branches.
- Conventional commits + `!` on breaking. NO session links / model IDs in commits.

## Don't re-read unless the task needs it

- `research/pre-release-focus.md` — THE plan for the resume task (park/polish/add + freeze).
- `research/roadmap.md` — `🚀 Launch readiness` is the front door; durable Now/Next/Later.
- `startup/` — the git-crypt vault: investor/competitor/funding research (locked; unlock
  with the saved key only when needed).
