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

ORDERED NEXT (founder: "all needed, order up to u"): **#1 detection-correctness ✅** (mirror-collapse
done; lone-AGENTS.md-agnostic + audit-both still deferred). **#2 LOCK THE WEBSITE ← NEXT** — remaining
polish (simplify RepoPicker on mobile, footer self-link, spacing rhythm) + a final Fable pass. **#3 big
items** — `apps/` + `packages/report-view` monorepo refactor (npm workspaces; root `vigiles` CI stays
green; unblocks the demo) → hosted deterministic-only browser demo (tease/blur the LLM part + progress
bar). Verify UI via headless Chromium (global playwright `$(npm root -g)/playwright` + `vite preview`).

### Codex behavioral tier is EXPERIMENTAL, not "supported" (SHIPPED this session)

Deterministic `vigiles audit` on Codex is **full parity** (proven live + `scan-cli.test.ts`) — KEEP it.
But the real-model **trigger-rate** on Codex is NOT trustworthy: Codex has no skill-fire event, so
`codexSkillFired` infers firing from whether the model READ `SKILL.md` — cache → false-negative,
exploration-read → false-positive, so the NUMBER can be wrong either way. A wrong measurement violates
the precision/don't-cry-wolf brand, so we don't claim Codex trigger-rate. DONE:
`EvalDriver.experimental` caveat on `codexEvalDriver` (CC stays supported) → copied onto
`TriggerRateReport`/`BehavioralReport`; `measureTriggerRate` warns on stderr + the formatters print
`⚠ EXPERIMENTAL` (audit --harness=codex too); documented in `docs/harness-testing-codex.md` +
`research/harness-capabilities.md`; tests added. REMAINING gate to promote it: a LIVE Codex run that
MEASURES the oracle's accuracy vs ground truth (needs `codex` on PATH + quota; not installed here).

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
