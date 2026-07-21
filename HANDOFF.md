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

**This session (2026-07-21): site polish + the shared `@vigiles/report-view` package — merged #80–#96, deployed.**

**TOP GOAL (codified in `.claude/skills/landing-site`): maximize the % of visitors who RUN `npx vigiles audit`.**
Every site decision serves that ONE conversion; the CTA must be GREAT. HOLD every `site/` change against the
skill; **screenshot desktop AND the FULL mobile page** (390px, global playwright `$(npm root -g)/playwright` +
`vite preview`); run a Fable pass on anything nontrivial and ACT on its P0/P1 cuts.

SITE — done this session (all merged + deployed): command-first hero around `npx vigiles audit` (the CC
`claude-cli://` deeplink is DESKTOP-ONLY, `hidden sm:block`, lives in RepoPicker `#try`); the 724KB hero PNG
replaced by native `HeroReport.tsx`; ruthless subtraction (Fable-driven). Latest polish (#95/#96): hero shield
icon top-aligned, GitHub links open new-tab, the five-category explainer FOLDED into "The problem" (`Wedge`;
`Rings.tsx` deleted), seven linter catalogs shown as a name strip, and — the mobile-dup fix — the whole `#try`
section is now `hidden sm:block` (it collapsed to the SAME command as the CTA on phones). The `landing-site`
skill now has an explicit rule to catch cross-section mobile duplication.

**SHARED REPORT VIEW SHIPPED (#96):** `packages/report-view` (`@vigiles/report-view`, source-only/private) now
holds the presentational report components + the `AuditReport` schema + band tokens + `theme.css`. `report/`
consumes it (its `src` is just the app shell). Wired as **npm WORKSPACES** (root `workspaces:[packages/*,report,
site]`) — the clean monorepo the founder asked for; deps hoist to root. Kept the published `vigiles` CI green via
four aligned changes: root lockfile regen, `pages.yml` builds `site` via the workspace, `build-report.mjs`
install-guard checks root `node_modules`, per-package lockfiles deleted. Design + rationale + the Stage-2 demo
brief in `research/report-view-and-hosted-demo.md`. Also fixed a PRE-EXISTING latent coverage bug it exposed:
`egress.ts`/`sandbox.ts` used `/* v8 ignore next -- reason */`, a form `@vitest/coverage-v8` 4.1.8 silently
DROPS — converted to `/* v8 ignore start/stop */` (the reliable form; the `next -- reason` form is the trap).

### 🎯 DO NEXT

- **Stage 2 — the hosted "Grade a repo" demo** (the big one; UNBLOCKED now that report-view is shared). Full
  Fable design-of-record in `research/report-view-and-hosted-demo.md`: zero-click BAKED report on open (featured
  repo) + 3 cached chips; a real streaming audit log; grade + truthful "N fixes from a B"; an HONEST gate (real
  numbers NEVER blurred; the model-gated part shows real skill names with dashed `──%` + "your CLI can, free" —
  no paywall words); every edge case routes back to `npx vigiles audit`. Deterministic detectors must run
  IN-BROWSER (scan.ts is node-fs-coupled today → porting the pure detectors is the meat). Render via
  `@vigiles/report-view` so browser == CLI artifact. Likely a new `apps/demo` (or `packages/*`) workspace +
  `site` consuming report-view — that adds `site` to the report-view consumer set, the point to reconsider a
  shared `@vigiles/ui` split (rule-of-three).
- **Analytics — founder decision + NOT built:** instrument the funnel (command copies, chip clicks, repo
  submits). GitHub Pages, NOT Vercel → **Vercel Analytics N/A**. Rec: **GoatCounter** (free, privacy-friendly,
  no cookie banner); Plausible/Fathom paid. Needs the founder's account/site-code, then a script tag + events.
- **Prefilled popular-OSS chips — NOT built:** depends on Stage 2 (a real report needs the in-browser compute);
  a lighter "prefill the repo picker for anthropics/claude-code" is desktop-only.

### Codex trigger-rate is EXPERIMENTAL (shipped earlier)

Deterministic Codex audit = full parity (KEEP). Real-model **trigger-rate** on Codex is NOT trustworthy
(no skill-fire event → `codexSkillFired` infers from `SKILL.md` reads → wrong either way); marked
`⚠ EXPERIMENTAL` across the API + formatters + `docs/harness-testing-codex.md`. Promote only after a LIVE
oracle-accuracy run (needs `codex` + quota).

### STILL OPEN

- **Multi-harness audit DX** — DEFERRED (audit is CLAUDE-CODE-FOCUSED); design in `research/audit-harness-dx.md`,
  scope entry in `roadmap.md` (Later). (The monorepo refactor is DONE — #96; the hosted demo is now DO NEXT.)
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
