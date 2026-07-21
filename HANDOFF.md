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

**This session (2026-07-21): landing-site UX overhaul + audit scope decision — merged #80–#90, deployed.**

SITE (command-first + subtraction, #80–#88): the site led with the CC `claude-cli://` deeplink as the
PRIMARY CTA → dead-ends on mobile ("type repo → tap → nothing"). Reworked around the universal action
`npx vigiles audit`. Command-first hero; deeplink DEMOTED to the RepoPicker (`#try`), DESKTOP-ONLY
(`hidden sm:block`); honest mobile note. Two Fable passes drove ruthless SUBTRACTION:

- **PNG DELETED** → `site/src/components/HeroReport.tsx` (native, responsive, DATA-DRIVEN report slice:
  verdict + category strip + top fix; ONE component serves desktop AND mobile). No more 9px screenshot.
- Killed say-it-5× redundancy; cut "FREE & OPEN SOURCE" badge (GitHub link implies it) + the weak
  "Have Claude Code?" fold link → a desktop-only **"Grade a repo"** NAV link. Rings dropped the repeated
  scores (name+question only, "One score, five categories"). Wedge badge → "The problem". CTA = one
  primary action ("View on GitHub" demoted to a text link). Removed an auto-clipboard-write that
  triggered a scary mobile permission prompt (`lib/toast.ts` + `ui/toaster.tsx` = a tiny toast).
- **Design skill codified**: `.claude/skills/landing-site` (model-invocable) — "design by subtraction",
  cut-what's-implied, actionable-CTAs, hosted-demo direction (TEASE the locked LLM part + a real
  progress bar). HOLD every `site/` change against it; screenshot desktop+mobile; run a Fable pass.
- **CI fix (#81):** the API-surface gate had been RED on main since #79 — ran `npm run api:report`.

AUDIT SCOPE (#89–#90): **`vigiles audit` is CLAUDE-CODE-FOCUSED for now** (founder descope — multi-harness
DX too complex for this bite). Deferred design + sourced research in `research/audit-harness-dx.md`
(AGENTS.md is an AAIF cross-tool standard read by 20+ tools, NOT Codex; CLAUDE.md near-exclusive;
explicit-config-first per Ruler/rulesync). SHIPPED the safe slice: **mirror-collapse** (#90) — a
`CLAUDE.md`⇄`AGENTS.md` mirror collapses to one harness in `detectAdapterResult` (top===1 + a mirror,
no independent `.codex/config.toml` → drop codex; no false "matches both"). Genuine different content
stays ambiguous. Codex deterministic audit still works via `--harness=codex`.

ORDERED (founder: "all needed, order up to u"): **#1 detection ✅** (mirror-collapse; lone-AGENTS.md-agnostic
and audit-both deferred). **#2 website locked ✅** (#92/#93, Fable 8.5/8) — BUT a fresh MOBILE-POLISH +
STRATEGY batch landed after; IN PROGRESS as #94 (below). **#3** = `apps/` + `packages/report-view` monorepo
refactor (npm workspaces; root `vigiles` CI stays green; unblocks the demo) → hosted deterministic-only
browser demo (tease/blur the LLM part + progress bar). Verify UI via headless Chromium (global playwright
`$(npm root -g)/playwright` + `vite preview`).

### 🎯 TOP GOAL + WEBSITE POLISH (post-compact — DO NEXT, before #3)

**TOP GOAL (now codified in `.claude/skills/landing-site`): maximize the % of visitors who RUN
`npx vigiles audit`.** Every site decision serves that ONE conversion; the CTA must be GREAT.

- **Analytics — NOT built:** instrument the funnel (command copies, Grade-it/deeplink clicks, prefilled
  tries). Site is on GitHub Pages, NOT Vercel → **Vercel Analytics N/A**. Use Plausible/Fathom/GoatCounter
  (or GTM) — a static-hosting script tag; pick one, add the snippet, define events.
- **Prefilled popular OSS — NOT built:** one-click "grade this" chips (e.g. an official Anthropic plugin)
  so a visitor sees a real report without typing / owning a repo.
- **Mobile — #94 IN FLIGHT (partly done, uncommitted at compact):** ✅ mobile `#try` = command-only (was a
  weird sparse card, "…or" dangled); ✅ blog link new-tab (`Debunk`); ✅ `.reveal` @supports guard
  (the "empty screenshots" is a scroll-reveal capture artifact, NOT a user bug — Fable concurred). STILL
  TODO: hero trust-line **shield icon mis-placed** (floats between the 2 wrapped lines → align to top);
  **CTA buried low / no mobile quick-link** (StickyCTA shows the command on scroll — make the CTA GREAT
  and reachable); make **other external links (GitHub) open new-tab** too.
- **Content — TODO:** fold "One score, five categories" (`Rings`) INTO "The problem" (`Wedge`) to be more
  practical; add **linter icons** to the Wedge "7 linter catalogs" line.
- Process: hold every change against the skill; screenshot desktop+mobile; Fable pass; deploy = Pages on push.

### Codex trigger-rate is EXPERIMENTAL (shipped earlier)

Deterministic Codex audit = full parity (KEEP). Real-model **trigger-rate** on Codex is NOT trustworthy
(no skill-fire event → `codexSkillFired` infers from `SKILL.md` reads → wrong either way); marked
`⚠ EXPERIMENTAL` across the API + formatters + `docs/harness-testing-codex.md`. Promote only after a LIVE
oracle-accuracy run (needs `codex` + quota).

### STILL OPEN

- **Multi-harness audit DX + hosted demo + monorepo refactor** — the ORDERED-NEXT #2/#3 above;
  full design + research in `research/audit-harness-dx.md`; scope entry in `roadmap.md` (Later).
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
