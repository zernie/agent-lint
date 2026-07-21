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

**This session (2026-07-21): landing-site UX overhaul — all merged to `main` (#80–#84), deployed.**
The site was built around the Claude Code `claude-cli://` deeplink as the PRIMARY CTA, which
dead-ends silently on mobile / CC Web / desktop-without-CC ("type repo → tap → nothing"). Reworked
around the action that works for everyone — the command:

- **Command-first hero** (`site/src/components/AuditWidget.tsx`, now much simpler): `npx vigiles
audit` is the single primary action + one-line "runs in any terminal — auto-detects Claude Code
  or Codex, nothing uploaded" + a quiet "Have Claude Code? Audit a specific repo →" link to `#try`.
  No repo input / deeplink / CC-first paragraph on the fold; the report shot reaches the fold.
- **Deeplink demoted to the RepoPicker (`#try`), DESKTOP-ONLY** (`hidden sm:block`). On mobile that
  section shows an honest "Claude Code runs on a computer — `cd <repo>` and run the command" note
  instead of a dead button. Button relabeled **"Audit this repo in Claude Code"** (was the
  mis-framed "Test my skills…" — audit grades the WHOLE harness, not skills).
- **Mobile hero** = native readable report card (`HeroReportCard` in `Hero.tsx`) since the full PNG
  is unreadable at 390px. **Rings section = FIVE** (Truthfulness/Triggering/Structure/Safety/Tested,
  100/92/92/80/88) matching the report PNG. Wedge badge "The wedge"→"The problem".
- Removed an earlier auto-clipboard-write on the deeplink fallback — it triggered a scary "wants to
  see your clipboard" permission prompt on mobile. `lib/toast.ts` + `ui/toaster.tsx` = a tiny toast.
- **CI fix (#81):** the API-surface gate had been RED on main since #79 (Codex-experimental added
  public API without regenerating snapshots). Ran `npm run api:report`, committed the additive diff.

Deeplink verified via headless Chromium (global playwright at `$(npm root -g)/playwright`, serve
with `vite preview`, `claude-cli://` never resolves there so the fallback path is exercisable).

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

- **Hosted public-repo audit (mobile "wow", teed up, NOT built)** — user wants it; the LLM part is
  the blocker (rate limits/quota). RESOLUTION: do the **deterministic-only** rings (Truthfulness/
  Structure/Safety-via-lethal-trifecta/description-overlap — NO model), skip the model-gated
  trigger-rate. Plan: serverless fn fetches a public repo's files via the GitHub API (no clone) →
  runs the existing `scan`→`AuditReport` JSON → renders the EXISTING `report/` UI. Serverless > pure
  in-browser (CORS + GH rate limits + needs a browser-safe fs shim). Server-side GH token for limits.
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
