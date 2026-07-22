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
via `pages.yml` on push to main. Demo UX + real-F default MERGED (PRs #100–#106).

**Branch `claude/click-not-working-s9apfb`: 31 UNMERGED commits (pushed, NO PR yet).** Restart from `main`
if needed (`git fetch origin main && git checkout -B claude/click-not-working-s9apfb origin/main`). It carries an
adoption batch (VerbMap red→green · OG card b1 · 4a share deep-link · dismissible nudge · full-HTML rules honesty ·
leaderboard drill-in · value-framed nudge), the `--ci-only` opt-in + discoverability, the `cohesive-feature-delivery`
rule's (8) DISCOVERY + (9) OUTPUT-PARITY additions, and the DOGFOOD batch below.

**DOGFOOD BATCH is the LIVE WORK.** A 4-agent Sonnet fan-out found **14 verified, source-traced bugs**; founder's
call is **FIX, not file** (a deterministic traced bug needs no issue — file only when the fix is ambiguous).
**8/14 FIXED + pushed** (see DO NEXT for the exact remaining 6 + Vlad's #107/#109–#113, all traced with the fix):

- **#108** — `marketplace.json` `owner` field (CC v2.1.x install was broken for EVERYONE) + a regression guard.
- **#112 + C3/C4/C5** — one config fix: `loadConfig` now parses-don't-validates via `normalizeSeverity`
  (`"off"`/`0`/`1`/`2` → canonical) + `asStringArray` (`exclude`/`sharedDirs`/`orphans.include|exclude`) in
  `src/core/validate.ts`; unit-tested in `validate.test.ts`. No more silent no-ops / garbage "orphan" output.
- **I2** — the Codex skills install is `-s`-scoped to `SHIPPED_SKILLS` (`src/setup-plan.ts`), so it no longer leaks
  the 11 contributor skills; a drift-guard test (`skills-dogfood.test.ts`) keeps the list == the `skills/` dirs.
- **D2** — `hook-block-ineffective` strips full-line comments before scanning, so an `exit 2` merely MENTIONED in a
  comment/shebang isn't a false "block" (`src/core/hook-block-ineffective.ts` `stripFullLineComments`).

Each fix has a regression test; all suites green; working tree clean.

**GATE-FAILURE RULE (founder, standing): if a skill/hook/rule DIDN'T CATCH an issue the founder had to spot,
FIX THE GATE FIRST.** (e.g. the mobile-overflow CI gate + the responsive-grid lesson in `.claude/skills/landing-site`.)

**FLAG (founder's call):** the PR-CREATION harness auto-appends a `claude.ai/code/session_…` URL to PR bodies
(public no-session-links rule). Using the GitHub MCP `create/update_pull_request` (as this session did) AVOIDS it.
If a PR is opened another way, edit the body to end at the `claude.com/claude-code` line.

**FETCH-TAIL DOCUMENTED — do NOT chase Codex's `fetchRepo` P2s.** Demo fetches a BOUNDED set; invariant = NEVER GRADE
PARTIAL DATA. Canonical: `research/browser-demo-fetch-limits.md`.

**TOP GOAL (`.claude/skills/landing-site`): maximize visitors who RUN `npx vigiles audit`.** HOLD every `site/` change
against the skill (READ it before touching `site/`); screenshot desktop AND full 390px mobile.

### 🎯 DO NEXT

0. **DOGFOOD BATCH — finish the remaining 6 fixes** (all traced to file:line, fix known; FIX directly, don't file):
   - **A / C1+I3** — `audit` AND `init` ignore `.vigilesrc.json` `harness` (route both through `resolveHarnessSelection`
     like lint/compile). cli.ts audit case (~6926) + `resolveHarnesses` (~3323).
   - **E1 (P0)** — agent/skill diagnostics + GH annotations print a phantom `.claude/<surface>/…` path (thread
     `sources` into `scanAgents`; use the real on-disk path in `ScanAgent/ScanSkill.path`). scan-core.ts + plugin-loader.ts.
   - **E2** — default `lint` integrity sweep skips subagents (`findInstructionFiles` globs only CLAUDE/AGENTS/SKILL;
     add the resolved adapter's `agentDir`). cli.ts ~4630.
   - **D1** — `hook-script-exists` FP on `find -name "*.js"` glob (narrow SCRIPT_RE to command-head / known-prefix). scan-core.ts ~65/478.
   - **E3** — `init --target` silently drops unmapped frontmatter keys on malformed YAML (`unmappedFrontmatterKeys`
     bails on `!fm.data`; add raw-key-scan fallback). adopt.ts ~346.
   - **I1 / I4** — scaffolded CI workflow `npm install` ENOENT on no-package.json (gate on package.json); `--test`-only
     still wires a lint job (gate on `plan.lint`). cli.ts `vigilesWorkflow` ~2609.
   - **C2** — unknown harness → raw stack-trace crash (top-level try/catch in `main()` → err.message + exit 2). cli.ts.
   - Vlad's #107 (compile frontmatter data-loss) + #110 (skill-resource/dangling FPs) + #113 (testGlobs docs) + #109/#111 remain too.
1. **Codify the dogfood process as a skill** (`.claude/skills/dogfood-cli`) — the expert find+fix fan-out, with the
   lesson: worktree-isolate, and serialize/merge fixes that touch shared files (cli.ts/scan-core.ts). Founder asked for this.
2. **Open the PR** for the 31 commits — founder hasn't given final go; multiple real bug fixes worth shipping.
   (Founder deprioritized item 6 GHA PR-comment grade — GHA is later-adoption AND not guaranteed after gate-first init.)
3. **Item 4b b2 (per-grade OG card)** — the ONLY remaining share-loop piece: a card showing `owner/repo · actual grade`.
   Needs a SERVERLESS OG endpoint (GitHub Pages is static, can't vary `<meta>` by `?repo=`) → bundles with **4c**
   (time-boxed upload, needs backend). b1 (generic card) is SHIPPED (`site/public/og.png` + tags in `site/index.html`).
4. **Item 5 (one opt-in README badge)** — after the share loop; badge-fatigue data says exactly one.
5. **STRENGTHEN THE IN-REPORT INVITATION (the real growth lever, per adoption-design.md §1 reasoning).** The terminal
   nudge is now value-framed (why a spec), but the HTML report's adoption surface (Adopt/adoptability preview) deserves
   its OWN focused pass with screenshots + a Fable cold-visitor review — "make a skeptic WANT a spec/eval by showing
   what it'd catch". This is where richer-feature adoption is won (gate is opt-in, so the invitation must carry it).
6. **davila7-F reconciliation** — featured at F but not MIT-vendored/opted-in; prefer the live `?repo=` grade or apply
   the vendoring policy before the leaderboard hardens.

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
- **`add_repo` is same-owner only** — fetch external files via
  `curl https://raw.githubusercontent.com/OWNER/REPO/BRANCH/PATH` (through the proxy).
- Commits/PR: NO session links / NO raw model-id strings. Conventional-Commit titles;
  a public-API removal/rename needs `!` (drives the semantic-release major bump).

## Don't re-read unless the task needs it

- strategy KB — PRIVATE `zernie/mine` repo under `vigiles/` (`add_repo zernie/mine`).
- `research/roadmap.md` — the front-door (technical) roadmap.
