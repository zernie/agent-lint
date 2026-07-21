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
NODE-FREE in-browser audit engine (pushed, NOT yet a PR) + the LIVE-any-repo demo wiring (in progress).**

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

- **BAKED demo SHIPPED (#99):** `DemoAudit.tsx` renders REAL `AuditReport`s (baked via `audit --json` on
  `test/dogfood/*`) through `@vigiles/report-view` + repo chips + an honest one-row model-gated tease. Fixes the
  old mobile `#try` dead-end.
- **NODE-FREE ENGINE — DONE, PUSHED (not yet a PR):** the browser audit engine `scanFiles(files)` +
  `test-coverage-files.ts` now reach ZERO node builtins except `node:zlib` (dist require-graph = 29 files;
  pkgs @iarna/toml/js-yaml/mvdan-sh, all browser-bundleable). Achieved by MODULE-SPLITTING (not bundler stubs /
  not dynamic imports — see the decision in `research/report-view-and-browser-demo.md`): `scan-core.ts` (pure
  detectors; `scan.ts` re-exports via `export *`), `core/ncd.ts`, `posix-path.ts`, `core/mcp-contract-message.ts`,
  `core/assert-never.ts`, `adapters/claude-code/agent-tools.ts`, + required-injected-IO in
  hook-block-ineffective/plugin-dir-layout/skill-resources. GATED by the byte-identical parity test
  `src/scan-files.test.ts` (verified unchanged + green; full unit suite 100% cov; api no drift).
- **LIVE-ANY-REPO demo wiring — IN PROGRESS (background subagent):** Vite bundle (consume built `dist/` CJS +
  ONE `node:zlib`→`pako` alias — the site runs the literally-same compiled code as the CLI), in-browser GitHub
  fetch (Trees API + `raw.githubusercontent.com`, harness paths only), the Fable live-typing UX
  (`scratchpad/fable-live-typing-brief.md`), + 3 test layers (engine parity ✓, Vitest browser-mode
  interaction+parity, one Playwright e2e). Brief: `scratchpad/wiring-subagent-brief.md`. THEN: verify + commit +
  screenshot + Fable, and wire a `site` test job into CI.
- **SITE CONTENT ADDITIONS — APPROVED, NOT YET BUILT (do after the demo wiring lands, avoids site/ conflicts):**
  founder flagged the site is "missing tons from the README." All 4 approved: (1) verb-map "one tool, four
  questions" (audit/lint/test/eval table + the "your rules → enforced" card), (2) adoption "your agent does the
  rest" (init + skills test-harness/strengthen/edit-spec + hooks + the copy-paste agent prompt), (3) FAQ
  (framework?/markdown-linter?/TS?/stability), (4) promptfoo cost contrast folded into Debunk. Copy is drafted;
  re-derive from README.md (the durable source) — order Hero→Wedge→VerbMap→Debunk→DemoAudit→Adoption→FAQ→CTA.
  Fable + 390px screenshot each; hold against `.claude/skills/landing-site` (brevity still applies).
- **Analytics (NOT built) + prefilled-OSS chips (NOT built):** founder decisions. GH Pages → GoatCounter rec
  (free, privacy-friendly); prefilled chips now moot once live-any-repo lands.

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
