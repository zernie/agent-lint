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

**This session (2026-07-21): site polish + shared `@vigiles/report-view` (merged #80–#99, deployed) + the
NODE-FREE in-browser audit engine + the LIVE-any-repo demo + README-parity content + MANY rounds of Codex review
fixes + a LIVE UX-REVIEW pass (founder drove) — all on `claude/click-not-working-s9apfb`, PR #100 (OPEN, iterating).**

**PR #100 latest (034d797), CI green — do NOT auto-merge, founder is live-iterating.** UX-review round shipped
(commits d8a2d71 → 034d797): (1) report copy plain-language — the inherits-all safety finding now NAMES + explains
the "lethal trifecta (reads data, reaches the web, runs commands), so a prompt injection could exfiltrate" (engine
copy in `src/audit-score.ts`, ships in CLI report too; baked demo fixtures regenerated). (2) MARKETPLACE repos →
honest "use the CLI" state (was a false zero-surface F). (3) real PROGRESS BAR in the loading step-log. (4) demo
report FOOTER gated off via `showFooter` prop (kept on the standalone HTML report). (5) analytics `track()` sends
OUTCOME KIND only, never the typed slug (privacy; `track()` is still a no-op shim — no Plausible installed). (6)
transient error/rate-limit no longer cached (retry works). (7) root nameless SKILL.md named after the repo (threaded
`repoName` into `scanFiles`), + fetch its bundled resources (`references/`/`assets/`). (8) **PERSISTENT GRADE-CACHE**
(`feat`, Fable-designed): `site/src/demo/gradeCache.ts` on **idb-keyval** (adopted over the reactive
useLocalStorage hooks — imperative dynamic-key + TTL/version/LRU needs); 24h TTL, version-namespaced key
(`AUDIT_SCHEMA_VERSION` + build-time git SHA via `__ENGINE_V__` Vite define), 30-LRU, parse-don't-validate; L1
in-memory Map layered over L2; "graded N ago · re-grade" header badge. Site browser tests 26/26 (real Chromium +
real IndexedDB), now **WIRED INTO CI** — a new `site` job in `ci.yml` builds root dist/, installs Chromium, runs
`npm run test:browser` (parity + interaction + grade-cache). Jobs are now test/check/harness/site/e2e; `test:e2e`
(Playwright) stays manual. The former "wire the site test job" loose end is DONE.

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

### 🎯 DO NEXT

- **PR #100 IS OPEN + AUTO-MERGING** (`feat(site): live in-browser "Grade any repo" audit demo + README-parity
content`, base `main`). Node-free engine + live demo + site content + 4 rounds of Codex-bot review fixes. CI
  green (validate/describe/harness/e2e/check/test). A `send_later` merge check squash-merges when the last CI
  run is green, then unsubscribes. **If picking up post-merge:** the branch is finished — new work restarts from
  `main` (see the merged-PR rule). Review fixes shipped: hook-script fetch (token + relative + manifest-declared)
  · dir-aware browser `mapExists` · Codex-scoped demo (CC-only) · harness-marker gate (git-hooks/src-hooks FP) ·
  truncated-tree state · `pages.yml` builds root `dist/` before the site (deploy-blocker). DEFERRED w/ rationale
  on the PR: `sharedDirs` in-browser (rare; needs a `scanFiles` param) + Windows path-ops (unsupported OS).
- **WIRE THE SITE TEST JOB INTO CI (only remaining loose end):** `site/` now has `test:browser` (vitest
  browser-mode: parity + interaction), `test:e2e` (playwright), `gen:parity`. `ci.yml` was NOT touched. Rec (from
  the wiring build): `test:browser` in the MAIN gate (fast, deterministic, closes the pako-vs-node gap) after
  `npx playwright install --with-deps chromium`; keep `test:e2e` opt-in/browser-gated. Regen the parity fixture
  after any intentional engine change: `npm run gen:parity`.
- **NODE-FREE ENGINE — DONE + PUSHED:** both browser entry points (`scanFiles` AND `buildAuditReport`) reach ZERO
  node builtins except `node:zlib`→pako. MODULE-SPLITTING, not stubs/dynamic-imports (decision +
  graph-trace method in `research/report-view-and-browser-demo.md`): leaves `scan-core.ts`, `core/ncd.ts`,
  `posix-path.ts`, `core/mcp-contract-message.ts`, `core/assert-never.ts`, `agent-tools.ts`, `score-core.ts`
  (the audit-report re-taint via leaderboard→scan→ast-grep, caught by the STEP-0 build gate). GATED by the
  byte-identical parity test `src/scan-files.test.ts` (unchanged + green; 100% cov; api no drift).
- **LIVE-ANY-REPO demo — SHIPPED + VERIFIED:** `DemoAudit.tsx` type-any-repo → live grade via built `dist/` CJS +
  pako. `site/src/demo/{fetchRepo,runAudit}.ts` (Trees API + `raw.githubusercontent.com`, harness paths only).
  3 test layers pass (browser-parity closes pako gap, interaction, one e2e); byte-identical to the CLI. Baked
  chips kept. Verified desktop + 390px.
- **SITE CONTENT — SHIPPED (README parity):** VerbMap ("One tool. Four questions." verb table + "your rules →
  enforced" card), Adoption (skills + hooks + copy-paste agent prompt), FAQ (3 net-new objections), promptfoo
  cost contrast in Debunk. Fable-reviewed + cut (dropped 2 restating FAQs + the 4th audit-command surface).
  Order Hero→Wedge→VerbMap→Debunk→DemoAudit→Adoption→FAQ→CTA.
- **Analytics (NOT built):** founder decision. GH Pages → GoatCounter rec (free, privacy-friendly). Prefilled-OSS
  chips are now moot (live-any-repo shipped). Fable's remaining P1/P2 on PRE-EXISTING sections (Wedge category
  trim, 3× reassurance, hero-subhead "references that nothing verifies") are un-actioned — optional polish.

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
