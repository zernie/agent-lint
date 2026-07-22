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

**DEMO UX REDESIGN is FULLY MERGED (PRs #100–#105, all squashed to `main`).** The live in-browser "grade any repo"
demo + `@vigiles/report-view` + the founder-driven cohesive overhaul all shipped. Branch
`claude/click-not-working-s9apfb` is now MERGED history — **restart it from `main` for any follow-up**
(`git fetch origin main && git checkout -B claude/click-not-working-s9apfb origin/main`).

**This session (2026-07-22): the cohesive demo overhaul + CI-hardening (landed via #102–#105).**

- **Credibility fix** — the report REVEALS every finding (not just names it) + a real verdict engine
  (`src/audit-verdict.ts`): only claims "clean" at `overall===100`, else "A — nothing blocks, but N X flagged".
  Added an additive `brokenReferences?: string[]` (from `report.danglingRefs`) so the report shows the concrete
  broken path (e.g. superpowers → `skills/using-superpowers/SKILL.md`).
- **Folded the model-gated tease into the report** (`LockedRow` in `report-view/src/Report.tsx`), stacks on mobile,
  copies a `TRIGGER_RATE_PROMPT` (runs `measureTriggerRate`, not the read-only audit).
- **Live stars on featured chips** (mini-leaderboard); source-tagged frame header (`example` vs `your repo`).
- **VerbMap** explains audit/lint/test/eval (expandable `<details>` + examples); "example" tag on the
  "Your rules → enforced" card (illustration, not a scan).
- **Site e2e now runs in CI** (`site` job, per founder "whattt it should be ci") + a **390px mobile-overflow gate**
  (`site/e2e/mobile.spec.ts`) — fails on horizontal page bleed or an unwrapped `<pre>`. Verified GREEN on #105.
- **Verb-map alignment fix** — the model note needed `sm:col-start-3`; without it, on desktop it collided with the
  answer's grid cell and bumped the answer to a middle-indented second row. Skill now carries the responsive-grid
  cell-collision lesson (check BOTH breakpoints — the bug hides at 390px, it's the `sm:` layout that breaks).
- **Docs** — new `docs/commands-and-how-they-relate.md` (audit/lint/test/eval/init model + why measuring skills
  uses `init`, not `audit`), linked from README/cli.md/index.
- **Roadmap** — added (Later) a **backend with rate-limited LLM access** running the real `vigiles audit`
  server-side: the ONLY way to close the demo's reference/behavioral gap (client-side prose-ref parsing is
  undecidable; trigger-rate needs a model). Public-repo only, vigiles-funded LLM. Interim: a muted demo caveat.

**GATE-FAILURE RULE (founder, standing): if a skill/hook/rule DIDN'T CATCH an issue the founder had to spot,
FIX THE GATE FIRST.** This session's applications: the mobile-overflow CI gate (layout bugs reached a real phone —
S23 Ultra), and the responsive-grid alignment lesson added to `.claude/skills/landing-site`. When founder feedback
exposes a class of bug, encode the catch (a test, a checklist item, a rule) BEFORE/ALONGSIDE the one-off fix.

**FLAG (founder's call):** the PR-CREATION harness auto-appends a `claude.ai/code/session_…` URL to PR bodies
(public no-session-links rule). Using the GitHub MCP `create/update_pull_request` (as this session did) AVOIDS it —
those bodies are clean. If a PR is opened another way, edit the body to end at the `claude.com/claude-code` line.

**FETCH-TAIL DOCUMENTED — do NOT keep chasing Codex's `fetchRepo` P2s.** The browser demo's `fetchRepo` does a
BOUNDED, SELECTIVE fetch (harness-shaped paths + refs, to respect GitHub's 60-req/hr limit), NOT the CLI's
whole-repo read. The safety invariant (NEVER GRADE PARTIAL DATA → bail to `too-large`/`error`) + closed edge cases

- non-goals are in the `fetchRepo.ts` header + `research/browser-demo-fetch-limits.md` (canonical). Founder's call:
  DOCUMENT, don't fix piecemeal — unless a new case is a genuine WRONG GRADE not covered by the bail-outs.

**TOP GOAL (codified in `.claude/skills/landing-site`): maximize the % of visitors who RUN `npx vigiles audit`.**
Every site decision serves that ONE conversion. HOLD every `site/` change against the skill; **screenshot desktop
AND the FULL mobile page** (390px); the mobile-overflow e2e is now the deterministic backstop but the visual pass
still matters; run a Fable cold-visitor pass on anything nontrivial and ACT on its P0/P1 cuts.

### 🎯 DO NEXT

No open founder task in flight — the demo overhaul + CI-hardening are merged. Candidate next work (founder's call):
wire an analytics provider (`track()` funnel instrumented, no GoatCounter/Plausible script yet); the roadmap
backend-audit-service item; Codex trigger-rate promotion (below). Durable record of the demo work is in
`research/report-view-and-browser-demo.md` + `research/browser-demo-fetch-limits.md`.

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
