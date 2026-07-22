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

**Branch `claude/click-not-working-s9apfb`: 26 UNMERGED commits (pushed, NO PR yet).** Restart from `main`
if needed (`git fetch origin main && git checkout -B claude/click-not-working-s9apfb origin/main`). What's on it:
earlier — percent-encoded-link false-positive fix (real bug, 92→100), blurred "preview" trigger-rate tease
(`LockedRow`), adoption docs. **Adoption batch (all SHIPPED):** VerbMap red→green · OG card (4b‑b1) · 4a share
deep-link · **1b** (dismissible nudge `"nudge":"dismissed"`) · **2b** (full-HTML rules honesty) · **3** (leaderboard
mode-header/drill-in/model-tier note) · value-framed adoption nudge.
**`--ci-only` SHIPPED + made DISCOVERABLE** (renamed from `--gate` on founder's call — "gate" = jargon): the
non-interactive gate-only opt-in (full stays default, no flip) + surfaced in help/summary/README/agent-prompt/internal-doc.
**RULE strengthened:** `cohesive-feature-delivery` gained (8) DISCOVERY/FRONT-DOORS + (9) OUTPUT-PARITY — a capability
isn't done until findable across every entry point (CLI/README/site/prompt/internal-doc) and rendered consistently
(audit HTML + site demo share `@vigiles/report-view`; the CLI terminal is the drift seam). Also clarified "plugin" =
the Claude Code plugin (skills+hooks), and fixed a stale keyFiles ref (api-docs.yml → pages.yml).
**#108 FIXED** (marketplace.json `owner` — CC v2.1.x install was broken for everyone; + a regression guard).
**Roadmap updated** with Vlad's dogfood issues #107–#113 + the blind-agent onboarding-dogfood idea.
**4 DOGFOOD AGENTS RUNNING (Sonnet)** — finding MORE issues the source-traced way across compile/eject · audit/lint FPs ·
init edge cases · config/CLI/test-eval. Synthesize + verify their findings on return, then fix/file the strong ones.
This session (2026-07-22 cont.):

- **Adoption docs DONE + signed off** — `research/adoption-goals.md` (G1–G5 + non-evil contract), `adoption-design.md`
  (6 build items + reputation-safe grading checklist), `adoption-personas.md`, `cli-command-model.md`; the
  `gate-first-adoption` rule distills the goals into root `CLAUDE.md`. Ethical-viral research → PRIVATE `zernie/mine`
  `vigiles/s50.md` (NOT here — strategy). davila7-F reconciliation noted (design item, not blocking).
- **Item 1 (gate-first `init`) — PARTIAL/SHIPPED** — `SetupPlan.scaffoldSpecs` decouples the lint GATE from the SPEC
  scaffold; wizard's new FIRST question is "gate vs full"; `gateOnlyInvitation` one-liner. NO new CLI surface (honors
  the high-bar). NON-INTERACTIVE gate is the DEFERRED half (needs a founder call: `--ci-only` flag vs default-flip that
  breaks ~16 "specs by default" tests).
- **Item 2 (Tested + rules honesty) — SHIPPED** — `detectOwnTestSignal` in `scan.ts` (`ScanReport.ownTestSignal`) +
  `audit-score.ts tested()` re-worded to "N surfaces with no vigiles test/eval" + credits your own test setup as
  OPTIONAL. `CliRulesRow` (demo/summary variant ONLY — NOT the real CLI report) notes rule-xref covers
  ESLint/Ruff/Pylint/Clippy/RuboCop.
- **VerbMap red→green — SHIPPED** (Vlad's idea, founder-approved) — each verb shows ✗ broken → ✓ green fix (honest:
  green = the fix, NOT an auto-fix). Site-only; 390px gate green.
- **Item 4a (share deep-link) — SHIPPED** — `audit` prints `Share this grade → vigiles.sh/?repo=owner/repo` for a
  GitHub `origin` remote (the demo re-runs live; zero upload/backend, closes "can't share from localhost"). Pure
  `src/share-link.ts` (100% cov, in the allowlist) + thin `readOriginRemote` in cli.ts. Offline — no public/private
  check, captioned "public repos". No new CLI surface.

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

0. **Synthesize the 4 dogfood agents' findings** (running now) — verify each is REAL (repro + source trace), then
   fix the strong ones and/or FILE them as GitHub issues (Vlad's style — the user said "find more issues using this
   way"). Confirm before mass-filing.
1. **Fix the remaining dogfood issues** in priority: #107 (compile frontmatter data-loss — `allowed-tools`/YAML-list/
   `context:fork`/dirty-tree), #110 (detector false-positives), #112 (`"off"` severity → normalizeSeverity), #113
   (testGlobs docs). #108 already FIXED.
2. **Open the PR** for the 26 commits — founder hasn't given final go; multiple real bug fixes worth shipping.
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
