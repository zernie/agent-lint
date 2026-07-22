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

**PR #100 is MERGED + released** (squash-merged to `main` as `1094720`). The live in-browser "grade any repo"
demo + `@vigiles/report-view` shipped there (demo wired into CI via the `site` job). Fetch-tail DOCUMENTED (below).

**PR #101 is OPEN** (`claude/click-not-working-s9apfb` → `main`, the DEMO UX REDESIGN; branch cleanly ahead of main,
a NEW pr since #100 is merged). CI running/green when last checked (validate/describe/check/test/e2e/harness/site).
Session is SUBSCRIBED to watch it. Branch history was filter-branch'd to strip `Claude-Session:` URL trailers
(public-repo no-session-links rule) + force-pushed — commits are `Claude <noreply@…>`-authored (CI still triggered).

**This session (2026-07-22): founder-driven DEMO UX REDESIGN (PR #101).** Shipped on the branch:
(1) SELLING COPY — demo H2 "What's broken in your agent setup?" + benefit subhead (replaced the meaningless
"same report / deterministic" framing). (2) SHAREABLE GRADES — `ShareRow` (native share on mobile, copy the
`?repo=owner/repo#try` deep-link that auto-runs) — the growth loop; written into the `landing-site` skill as a
first-class goal + a staleness pass. (3) LETHAL-TRIFECTA PLAIN LANGUAGE — hoisted to ONE shared `TRIFECTA_LABEL`
in `src/score-core.ts` (Safety card + verdict can't drift), de-jargoned to "can read data, reach the web, and run
commands — the lethal trifecta, so a prompt injection could exfiltrate secrets"; ships in the CLI report too; baked
madappgang fixture regenerated. (4) REPO COMBOBOX (`site/src/components/sections/RepoCombobox.tsx` +
`site/src/demo/searchRepos.ts`): type an owner→autocomplete its public repos with LIVE stars; **and a bare repo
name searches across GitHub (no org needed — most people remember the repo, not the owner)**; owner/repo+Enter
still grades directly; degrades to the direct path on rate-limit; injectable search seam for tests + the
api.github.com-blocked sandbox (screenshot via Playwright route-mock). Star counts are LIVE-fetched, never
hardcoded. Two tiny hand-rolled hooks (`site/src/lib/hooks.ts`) instead of a dep.

**IN FLIGHT / PENDING (founder picked "build all four" + more):**

- **Next.js EVAL running in a subagent** (isolated worktree) — deciding whether the dedicated per-check explainer
  pages (`/checks/<slug>`, "React-errors-have-a-page") are a signal to migrate the Vite site to Next.js / Astro /
  Vite-MPA-or-router. Report pending; DO NOT wire routing until it lands. `site/src/checks/checks.ts` (8 finding
  detectors + lethal-trifecta concept, plain what/why/fix) is written + committed, framework-agnostic, unwired.
- **Findings explainer** (detector labels → `/checks/<slug>` pages) — GATED on the routing decision above.
- **Strengthen the locked trigger-rate tease** + **leaderboard framing** ("how does your setup rank") — queued.
- **PALETTE** (softer, "material-oceanic" vibe) — founder wants it LAST; a shared token change across
  `site/src/index.css` and the `report-view` theme = one win for the site AND the local audit HTML report.
- DECIDED: untested skills stay ADVISORY in the grade (don't game the score to nudge adoption — protects the
  honest-grader trust); the locked tease is the nudge instead.

**FETCH-TAIL DOCUMENTED — do NOT keep chasing Codex's `fetchRepo` P2s.** The browser demo's `fetchRepo` does a
BOUNDED, SELECTIVE fetch (harness-shaped paths + their refs, to respect GitHub's 60-req/hr limit), NOT the CLI's
whole-repo read — so Codex keeps flagging "file X outside the harness dirs isn't fetched." The INVARIANT that
makes this safe (NEVER GRADE PARTIAL DATA → bail to `too-large`/`error`, advisory-only data best-effort) + the
closed edge cases + the non-goals (Codex repos, sharedDirs, Windows, extensionless scripts) are now documented in
the `fetchRepo.ts` MODULE HEADER (Codex-facing) + `research/browser-demo-fetch-limits.md` (canonical, indexed).
Founder's call (2026-07-21): DOCUMENT the limitation, don't fix piecemeal. Unless a new case is a genuine WRONG
GRADE not already covered by the bail-outs, it's the accepted cost of the rate-limit-safe approximation — reply
"documented in research/browser-demo-fetch-limits.md", don't code.

**TOP GOAL (codified in `.claude/skills/landing-site`): maximize the % of visitors who RUN `npx vigiles audit`.**
Every site decision serves that ONE conversion; the CTA must be GREAT. HOLD every `site/` change against the
skill; **screenshot desktop AND the FULL mobile page** (390px, global playwright `$(npm root -g)/playwright` +
`vite preview`); run a Fable pass on anything nontrivial and ACT on its P0/P1 cuts.

SITE — merged + deployed this session (#80–#99): command-first hero around `npx vigiles audit`; native
`HeroReport.tsx` (dropped a 724KB PNG); five-category explainer folded into `Wedge`; linter-catalog name strip;
the desktop-only `#try`/RepoPicker is `hidden sm:block` (mobile-dup fix). **`@vigiles/report-view` (#96):**
source-only shared report components + `AuditReport` schema + `theme.css`, wired as npm WORKSPACES
(`workspaces:[packages/*,report,site]`) — the clean monorepo; four CI-critical changes + the coverage-bug fix
(`/* v8 ignore next -- reason */` → `start/stop`, the reliable form) recorded in
`research/report-view-and-browser-demo.md`.

### 🎯 DO NEXT — see the "IN FLIGHT / PENDING" list above (top of RESUME HERE)

Current next-steps live in RESUME HERE. Durable historical record of #100 (node-free engine, live demo, site
content, README parity, the site CI job) is in `research/report-view-and-browser-demo.md`. Analytics: `track()`
funnel is instrumented, no provider script wired yet (GoatCounter/Plausible rec).

### Codex trigger-rate is EXPERIMENTAL (shipped earlier)

Deterministic Codex audit = full parity (KEEP). Real-model **trigger-rate** on Codex is NOT trustworthy
(no skill-fire event → `codexSkillFired` infers from `SKILL.md` reads → wrong either way); marked
`⚠ EXPERIMENTAL` across the API + formatters + `docs/harness-testing-codex.md`. Promote only after a LIVE
oracle-accuracy run (needs `codex` + quota).

### STILL OPEN

- **Multi-harness audit DX** — DEFERRED (audit is CLAUDE-CODE-FOCUSED); design in `research/audit-harness-dx.md`,
  scope entry in `roadmap.md` (Later). (The monorepo refactor is DONE — #96; the in-browser demo is now DO NEXT.)
- **Codex trigger-rate promotion** — the live oracle-accuracy run above (blocked on codex + quota).
- Personal/launch/calendar follow-ups → PRIVATE `zernie/mine` only (branch `claude/adoption-playbook-s49`,
  pushed, needs squash-merge). Do not restate here.
- Cloned this session: `zernie/zernie.github.com` (blog) + `zernie/mine` (private KB).

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
