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

**`vigiles.sh` is LIVE** 🎉 — landing at `/`, TypeDoc docs at `/api`, valid TLS cert. The landing
site (`site/`) + combined `pages.yml` deploy + audit calibration are all **merged to `main`**
(#76/#77/#78). DNS (A → GitHub Pages) + Pages custom domain done. Site auto-deploys on push to main.

**Branch `claude/os-audit-adoption-3m528s`** now carries a **HERO REDESIGN (UNMERGED, ~6 commits,
pushed, tree clean, NO PR)** — this is the live task. If already merged, restart from `origin/main`.

### What the unmerged branch contains (built + green locally, screenshots shown to user)

- **Hero redesign** — killed the whitespace + buried-CTA problem: pulled the real audit-report
  screenshot onto the fold (folded away the old `OutputPreview` section), and collapsed the four
  competing CTAs to ONE. The CTA is a **merged "audit widget"** (`site/src/components/AuditWidget.tsx`):
  type `owner/repo` → **"Grade it"** = the `claude-cli://` deeplink (runs vigiles in the user's OWN
  Claude Code, their sub, nothing uploaded — a shield-marked security line says so) + **`npx vigiles
audit`** as the always-visible universal fallback + "browse my repos →" to the full RepoPicker.
- **`StickyCTA.tsx`** — sticky header reveals the `npx` copy command once the hero scrolls out (the
  always-reachable-action conversion lever). **`lib/deeplink.ts`** — shared `normalizeSlug`/`deeplink`
  (one source, reused by RepoPicker). Footer's redundant Lighthouse/npm-audit tagline cut.

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
