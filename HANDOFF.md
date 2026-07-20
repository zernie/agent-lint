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

**Branch `claude/os-audit-adoption-3m528s`** — audit CALIBRATION + adoption research + a
landing page. **6 commits, pushed, tree clean, NO PR opened** (task was investigation +
fixes, not a PR). If any already merged, restart from `origin/main`, don't stack.

### What this branch contains (all built + green locally)

- **fix(dialect-drift)** `a85228b` — the freshness alarm read a STALE leftover claude-code
  npm package (2.1.42) instead of the running native binary (2.1.211) and cried wolf; now
  reconciles with `claude --version` + suppresses on mismatch. (This FIXES the old
  "dialect-drift fails locally" gotcha → now a LOUD SKIP, not a failure.)
- **fix(skill-resources)** `5c761db` — skill-resource-resolves flagged example paths in a
  skill's TEACHING PROSE as missing resources → graded official `skill-development` F(0).
  Tightened to high-precision (act-on-it refs only) → A(100). Don't-cry-wolf, in code.
- **fix(audit) trifecta** `1d0f93b`→`c1141aa` — lethal-trifecta was fail-grading official
  plugins to F; now GRADED at HALF weight (W_TRIFECTA 20→10, a ding not a fail:
  feature-dev F40→C70). Inherits-all stays advisory. Spec keyFile + rule doc updated.
- **docs(research)** `89a5818` — new `research/feature-index.md` = the CAPABILITY map (what
  vigiles can DO per feature, status + entry point) — the internal feature index that was missing.
- **docs(site)** `e8b5ad5` — landing page as an isolated `@vigiles/site` Vite+React+shadcn
  package (dark, zernie.com-styled), NOT wired into the CLI. `.github/workflows/site.yml` is
  build-only/manual so it can't race the TypeDoc Pages deploy.

### OPEN DECISIONS (user, not yet answered — ASK before more work)

- **Landing STACK**: user EXPECTED Next.js (like zernie.com); I built Vite (matches `report/`).
  Pending: keep Vite (lighter) OR redo as Next.js lifting zernie.com's theme/components. Don't
  build more landing until decided.
- **GH-Pages routing**: one Pages site per repo — landing on a separate host (`vigiles.dev`,
  recommended) vs at root with docs moved to `/api`. Undecided; nothing clobbered yet.
- **Direction lean (from this session)**: LEAD the pitch with skill-TESTING (`measureTriggerRate`
  "does your skill fire?") for skill authors — audit stays the zero-config front door. Aligned
  with s46/s47.

### Off-repo work this session (pointers only)

- Adoption strategy (8-agent research + this session's calibration rationale) captured PRIVATELY
  in `zernie/mine` → `vigiles/s49.md` + a visa-doc pointer (branch `claude/adoption-playbook-s49`,
  pushed, needs squash-merge). **Contents are STRATEGY → private only; do not restate here.**
- Cloned this session: `zernie/zernie.github.com` (the zernie.com blog, Next.js) + `zernie/mine`.

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
