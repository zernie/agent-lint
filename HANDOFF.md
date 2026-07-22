# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** nudges you at ≥5 commits without a refresh.
>
> ⚠️ **THIS FILE IS PUBLIC** (open-source repo). NO STRATEGY here — business
> direction, monetization, competitive framing, and personal plans live ONLY in the
> private `zernie/mine` repo under `vigiles/` (migrated 2026-07-13 from the old
> git-crypt `startup/` vault). HANDOFF may say strategy exists there, never name or
> describe its contents. NEVER name a specific user/company/figure here (public). (See `doc-tiers`.)

## RESUME HERE

**`vigiles.sh` is LIVE** 🎉 — landing at `/`, TypeDoc docs at `/api`, valid TLS. Site auto-deploys
via `pages.yml` on push to main.

**DEMO UX REDESIGN + real-F default MERGED (PRs #100–#106, squashed to `main`).** The live in-browser demo, the
cohesive overhaul, the real F→C→B→A featured default (davila7 F → disler C → madappgang B → superpowers A, found via
`git clone` since codeload/api are proxy-blocked), and the site e2e + 390px mobile-overflow CI gate all shipped.

**Branch `claude/click-not-working-s9apfb` was rebuilt from `main` and has 5 UNMERGED commits (pushed, NO PR yet)** —
restart follow-ups from `main` (`git fetch origin main && git checkout -B claude/click-not-working-s9apfb origin/main`):

1. `fix(audit)` — a percent-encoded markdown link was flagged as a broken bundled resource (a real FALSE POSITIVE;
   verified a clean repo went 92→100). 2. `feat/fix(report)` — the trigger-rate tease is now a BLURRED "preview"
   (gated-content pattern, honest: blurred + labelled + sr-only truth; founder wanted the tease, NOT honest em-dashes —
   `LockedRow` in `report-view/src/Report.tsx`). 3–4. two research docs (below).

**IN FLIGHT (2026-07-22, post-#106): ADOPTION DESIGN.** Founder pain from a real existing-harness team (Kotlin/MD,
own eval loop, no JS linter): full `init` is friction, `Tested` reads as a failure, `rules→enforced` is silent on
non-JS. Decisions captured in `research/cli-command-model.md` (verbs: audit=read ⊄ init=write, NEVER merge — progressive
disclosure instead; init NUDGES spec adoption via the ask tool at install + gently later but is NOT evil — 1-keystroke
decline, no nag, no grade penalty, agent/CI never hangs) + `research/adoption-personas.md` (adoption mapped by team POV;
throughline: sell the integrity GATE — audit+lint — to everyone, INVITE specs/skills/eval on top). NEXT: writing
`research/adoption-design.md` (the buildable spec unifying init-gate-only + Tested/rules honesty + non-interactive
audit HTML-report/leaderboard-action-points + the LOCAL-RESULT SHARE loop) — a research agent on ETHICAL viral loops
(share mechanics without dark-pattern reputation damage) is RUNNING to ground the sharing section. GTM/growth STRATEGY
stays VAULT (zernie/mine), the spec is product mechanics only.

**GATE-FAILURE RULE (founder, standing): if a skill/hook/rule DIDN'T CATCH an issue the founder had to spot,
FIX THE GATE FIRST.** This session's applications: the mobile-overflow CI gate (layout bugs reached a real phone —
S23 Ultra), and the responsive-grid alignment lesson added to `.claude/skills/landing-site`. When founder feedback
exposes a class of bug, encode the catch (a test, a checklist item, a rule) BEFORE/ALONGSIDE the one-off fix.

**FLAG (founder's call):** the PR-CREATION harness auto-appends a `claude.ai/code/session_…` URL to PR bodies
(public no-session-links rule). Using the GitHub MCP `create/update_pull_request` (as this session did) AVOIDS it —
those bodies are clean. If a PR is opened another way, edit the body to end at the `claude.com/claude-code` line.

**FETCH-TAIL DOCUMENTED — do NOT chase Codex's `fetchRepo` P2s.** The demo fetches a BOUNDED, SELECTIVE set (not the
CLI's whole-repo read); invariant = NEVER GRADE PARTIAL DATA (bail to `too-large`/`error`). Canonical:
`research/browser-demo-fetch-limits.md`. DOCUMENT, don't fix piecemeal — unless a genuine WRONG GRADE past the bail-outs.

**TOP GOAL (`.claude/skills/landing-site`): maximize visitors who RUN `npx vigiles audit`.** HOLD every `site/` change
against the skill (READ it before touching `site/`); screenshot desktop AND full 390px mobile; the mobile-overflow e2e
is the backstop but the visual + Fable cold-visitor pass still matter — ACT on P0/P1 cuts.

### 🎯 DO NEXT

1. **Finish `research/adoption-design.md`** once the ethical-viral-loops research agent returns (it informs the
   share-loop section), then get founder sign-off on scope.
2. **Build in priority order** (founder-agreed): (a) `init` gate-only + non-evil spec nudge (`src/setup-plan.ts`
   `SetupPlan.gateOnly`; the nudge = TTY ask / headless one-liner + a `.vigilesrc.json` `nudge:"dismissed"` flag) —
   the adoption unblocker; (b) `Tested` + `rules→enforced` HONESTY (detect a repo's own test signal / re-word the ring;
   gate rules→enforced on `detectedLinters`); (c) non-interactive `audit` emits `vigiles-report.html` + prints path,
   leaderboard gets worst-finding + per-plugin link; (d) LOCAL-RESULT SHARE — for a repo with a public GH remote,
   `audit` prints `Share → vigiles.sh/?repo=owner/repo` (reuses the demo deep-link; private/local needs the backend).
3. **Open a PR** for the 5 committed fixes when founder OKs (they hadn't decided PR-now vs bundle-with-adoption).
   Other candidates (founder's call): analytics provider (`track()` instrumented, no script yet); roadmap
   backend-audit-service; Codex trigger-rate promotion (below).

### Codex trigger-rate is EXPERIMENTAL

Deterministic Codex audit = full parity (KEEP). Real-model **trigger-rate** on Codex is NOT trustworthy
(no skill-fire event → `codexSkillFired` infers from `SKILL.md` reads); marked `⚠ EXPERIMENTAL` across the API +
`docs/harness-testing-codex.md`. Promote only after a LIVE oracle-accuracy run (needs `codex` + quota).

### STILL OPEN

- **Multi-harness audit DX** — DEFERRED (audit is CLAUDE-CODE-FOCUSED); design in `research/audit-harness-dx.md`,
  scope entry in `roadmap.md` (Later).
- **Backend audit service (rate-limited LLM)** — `roadmap.md` (Later); the demo reference/behavioral-gap fix.
- **Codex trigger-rate promotion** — the live oracle-accuracy run above (blocked on codex + quota).
- Personal/launch/calendar follow-ups → PRIVATE `zernie/mine` only. Do not restate here.

## Design-of-record

- **`research/rule-enforcer-design.md`** — THE front door (STATUS: ALPHA). Pipeline
  diagram, the rescue-ladder/no-signal-fold decisions, the category↔lane↔glyph table,
  §8 scope-freeze+backlog, §9 testing. Read FIRST. (`rule-enforcer-multilang-design.md`
  is the older build-log; it defers to this doc.)
- **`research/dogfood-corpus.md`** — the dogfood map + policy (read before touching any
  dogfood artifact). The word "dogfood" covers FOUR different things — only
  `test/dogfood/` is the SHA-pinned vendored corpus; `examples/harness/dogfood/`=skill
  examples (model-gated MANUAL), `rule-enforcer/gold/`=package-internal, `research/audit-captures/`
  =captured audit OUTPUT (not tests).

## Gotchas (still live)

- **CI won't trigger on Claude-authored commits** — `ci.yml` fires on `pull_request` but
  GitHub suppresses workflow runs for commits authored by `Claude <noreply@…>`. If a PR's
  checks don't start: Approve-and-run-workflows in the PR UI, or Close→Reopen the PR.
  (`pr-title.yml` on `pull_request_target` always runs.)
- **Real-model evals run in-container on the SUBSCRIPTION** (`claude -p`; `$0` metered).
  Cold start ~20s+; a first probe may time out — retry longer.
- **A SKILL.md is NOT a skill unless registered** — bare `SKILL.md` in cwd never loads;
  use `arm.pluginDir`/`skillsDir`. `CLAUDE.md` DOES auto-load as memory.
- **The 100% coverage gate is an EXPLICIT allowlist** in `vitest.config.mjs`
  (`coverage.include`). A new pillar file must be added there + real-IO seams marked
  `/* v8 ignore */`.
- **`measure()` is SINGLE-arg** — `measure(spec)` where `checks`/`trials`/`model` live
  INSIDE the one object. (Root `CLAUDE.md` eval.ts desc still wrongly says
  "measure(spec, { trials, checks })" — fix the spec later.)
- `CLAUDE.md` (root + `src/` + `research/`) is COMPILED from `.spec.ts` — edit the spec +
  recompile (`node dist/cli.js compile <spec>`), NEVER hand-edit (a PostToolUse hook does).
- **COMMIT SIGNING is BROKEN in-container** (0-byte pubkey) → "Unverified"; email correct.
- `dialect-drift.test.ts` now SKIPS LOUDLY (not fails) when the located claude-code package ≠
  the running `claude --version` (the stale-leftover case) — fixed this session (`a85228b`). CI pins CC so it gates for real there.
- **`add_repo` is same-owner only** — fetch external files via
  `curl https://raw.githubusercontent.com/OWNER/REPO/BRANCH/PATH` (through the proxy).
- Commits/PR: NO session links / NO raw model-id strings. Conventional-Commit titles;
  a public-API removal/rename needs `!` (drives the semantic-release major bump).

## Don't re-read unless the task needs it

- strategy KB — PRIVATE `zernie/mine` repo under `vigiles/` (`add_repo zernie/mine`).
- `research/roadmap.md` — the front-door (technical) roadmap.
