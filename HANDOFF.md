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
LANDING SITE (`site/`). **12 commits, pushed, tree clean, NO PR opened.** If any already
merged, restart from `origin/main`, don't stack.

### What this branch contains (all built + green locally)

- **Audit calibration (don't-cry-wolf, in code), 3 fixes:** `dialect-drift` reconciles the
  freshness alarm with the running `claude --version` (stops crying wolf on a stale leftover
  npm pkg — the old "fails locally" gotcha is now a LOUD SKIP); `skill-resource-resolves` no
  longer flags example paths in a skill's teaching PROSE (official `skill-development` F0→A100);
  `lethal-trifecta` GRADED at HALF weight (W_TRIFECTA 20→10) not fail-to-F (feature-dev F40→C70,
  inherits-all stays advisory).
- **`research/feature-index.md`** — the CAPABILITY map (what vigiles DOES per feature, status +
  entry point), grouped by the 4 instruments. The internal feature index that was missing.
- **Landing site `site/`** — isolated `@vigiles/site` (Vite + React + shadcn, dark, zernie.com-
  styled), NOT wired into the CLI. Flow: hero → OUTPUT PREVIEW (real `vigiles-audit.png`, README
  parity) → rings → wedge → debunk (links the published zernie.com token-savings post) → REPO
  PICKER → CTA. The picker = the interactive demo: type a GH username → your PUBLIC repos
  (client-side GitHub API, no backend/OAuth) + a manual `owner/name` field for private → a
  `claude-cli://open?repo=…&q=…` deeplink that runs vigiles in the user's OWN local Claude Code
  (their sub, nothing uploaded), `npx vigiles audit` fallback.
- **`.claude/skills/screenshot/`** — dev skill to render+screenshot a local page (pre-installed
  Chromium, playwright-core, scroll-through for reveal animations).
- **`pages.yml`** — ONE combined GitHub Pages deploy (landing `/`, TypeDoc docs `/api`; replaced
  api-docs.yml + site.yml). Doc links repointed to `/api`. Domain placeholder → `vigiles.sh`.

### KEY ARCHITECTURE DECISION — the interactive demo needs NO server
The "input your repo → grade it" demo is STATIC if it uses the deeplink: the site builds a
`claude-cli://` URL and the user's OWN local Claude Code runs everything on their sub (secure —
code never leaves their machine). A server is ONLY for rendering a grade IN-BROWSER
(deterministic-only, cold visitors, shareable URLs) — a later "hosted dashboard", NOT the MVP.
Claude Code WEB has NO deeplink (#19023 not-planned); `claude-cli://` (CLI/Desktop) IS supported
— verify the exact format at code.claude.com/docs/en/deep-links before relying on it.

### RESOLVED this session
- Landing STACK = **Vite** (user chose keep-vite, not Next.js). GH-Pages = **combined deploy**
  (landing `/`, docs `/api`), done in pages.yml. Domain = **vigiles.sh** ($22/yr; .dev/.io TAKEN).

### STILL OPEN
- **One-time (repo admin, not code):** Settings → Pages → Source "GitHub Actions"; BUY `vigiles.sh`
  + set it as the Pages custom domain (GH writes the CNAME).
- **`mine` branch `claude/adoption-playbook-s49`** (adoption strategy s49 + visa pointer) — pushed,
  needs squash-merge. STRATEGY → private only; do not restate here.
- **No PR opened** on this branch. Direction lean: LEAD the pitch with skill-TESTING
  (`measureTriggerRate` "does your skill fire?"); audit stays the zero-config front door (s46/s47).
- Cloned this session: `zernie/zernie.github.com` (blog) + `zernie/mine` (private strategy KB).

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
