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
> `startup/` vault. HANDOFF may POINT to the vault, never name or describe its
> contents (naming a topic still reveals it). (See the `doc-tiers` rule.)

## RESUME HERE

**Branch `claude/docs-linting-accuracy-4psb1g`.** No PR opened (open one only if asked).

**README OVERHAUL: DONE + pushed** (several commits this session). The front door was
rebuilt for clarity after repeated "it's confusing / so much stuff / what even is it"
feedback. **Product positioning locked (public-safe product/messaging, not business
strategy):**

- vigiles is **a TOOL you run** (ESLint / Lighthouse / `npm audit` class), NOT a
  framework and NOT a "collection of libs". The FAQ says this outright — it's the #1
  thing that scared people off.
- Front door flow: **felt-pain hook → Lighthouse-style A–F report card → 3 real
  (anonymized) proofs → the `audit`/`lint`/`test`/`eval` verb-map** ("one tool, four
  verbs", framed _vibes → verified_).
- **Codex/AGENTS.md is first-class** (instruction-neutral nouns everywhere).
- **Plain language**: "harness" defined on first use; "specs" made concrete
  (`CLAUDE.md.spec.ts` + init→compile→CLAUDE.md); security is ONE dev-native gotcha
  proof, never the brand.
- The **README top HTML comment holds all the direction rules — READ IT before
  editing the README** (tagline/proof-order/Codex/audit-vs-lint scope all pinned there).

**Method (repeatable):** validated via a **6-persona cold-read** (`review-docs` skill:
newcomer / power-user / plugin-author / skeptical-senior / decision-maker / Codex) +
two **Fable** positioning consults. Personas landed 4/5 except Codex 3/5; the last pass
targeted the Codex ceiling + the plain-language stumbles. A re-run to confirm scores
moved was offered, not yet done.

**Business / strategy direction: SEE THE VAULT.** The active initiative, its next
concrete steps, and all strategy live ONLY in `startup/` (unlock, then read
`startup/README.md` for the ID→name index). Do NOT restate — or name the topics of —
any of it in this file or any public doc.

**⚠️ CLEANUP DEBT (this session found it):** the PREVIOUS HANDOFF committed on `main`
LEAKED vault-tier strategy into this public file (specifics deliberately omitted here).
Scrubbed from HEAD this session. **History still holds it** (commit 74d5f15 and earlier)
— a full purge needs `git filter-repo` + force-push, the same separate op still owed for
the old vault descriptive filenames.

**OPEN FOLLOW-UPS (public-safe, still pending):**

1. `research/roadmap.md` de-strategization — some borderline Explore/GTM prose remains;
   de-strategize only if a rule tightens (currently public-safe).
2. `research/README.md` "Strategy & bets" + `research/CLAUDE.md` Scope text — lower
   urgency (already public, just tone).

**Technical direction (public-safe):** vigiles = ONE LOOP — declare (typed spec) → check
reality — via four instruments: VERIFY (lint/cross-ref), GATE (compiled hooks), MEASURE
(evals on your sub), OBSERVE (local `.vigiles/runs.jsonl` flight recorder). Full record:
`CLAUDE.md` + `research/harness-observability-direction.md`.

### What landed this session (all pushed; suite green)

- **README rebuilt** end-to-end (positioning above). fmt green, all links + `vigiles
<cmd>` refs resolve, body ~187 lines, footnotes balanced. README-only diffs.
- Fixed a real accuracy bug: **`audit` vs `lint` scope** now told ONE consistent way
  (lint = CI gate on the deterministic checks; audit = same + Safety ring + two opt-in
  live checks + the report). Don't reintroduce "lint is refs-only" or "lint gates the
  trifecta Safety flag".
- **HANDOFF.md scrubbed** of leaked strategy (this file).

### ALSO OPEN (separate track) + Gotchas

- **PR #54 on `claude/haretrail-dogfood-pvdo9t`** — watched by cron `5438c724`. Merge = user's call.
- **VAULT (`startup/`)** git-crypt, LOCKED at session start → `apt-get install -y git-crypt` +
  `base64 -d key.b64 > key.bin && git-crypt unlock key.bin` with the user's base64 key.
  It was UNLOCKED this session for direction context; nothing from it entered public files;
  it re-locks next session. Vault files are in `.prettierignore`; a committed blob must read `\0GITCRYPT`.
  **⚠️ `git mv` INTO `startup/` DOES NOT ENCRYPT** — after moving, `git add --renormalize startup/`
  then VERIFY `git show HEAD:startup/<f>.md | head -c9`=`\0GITCRYPT`.
  **FILENAMES + COMMIT MESSAGES ARE PUBLIC** — opaque IDs (s01.md…); generic `chore: vault` messages.
- **SCOPED-SESSION GITHUB ACCESS + cross-repo-search WORKAROUND → `research/scoped-session-github-access.md`.**
  GitHub API is token-bound to `zernie/vigiles`; cross-GitHub discovery works in-session via the
  sourcegraph streaming API + `raw.githubusercontent`. Full mechanics live in that doc.
- `CLAUDE.md` (root + src/ + core/ + research/) COMPILED from `.spec.ts` — edit the spec + recompile
  (`node dist/cli.js compile <spec>`), NEVER hand-edit. Deleting a keyFiles-listed file → remove its
  keyFiles line first or compile FAILS.
- RUN ESLINT on new files (`no-confusing-void-expression`, unused imports = ERRORS; `[...str]`→Array.from).
- `dialect-drift.test.ts` fails LOCALLY (installed claude-code vs pinned version); CI pins it. Env-only.
- Commits/PR: NO session links / NO raw model-id strings. Conventional-Commit titles.
- **WORKFLOW FRAGILITY:** wide fan-out self-throttles on ONE rate-limit bucket; session-compaction
  interrupt kills a background workflow. FIX: batch (2×2 = peak 2), narrow+fast. (6 background
  subagents at once worked fine this session for the persona reads.)

### Decisions of record (don't relitigate)

- Repo is PUBLIC → strategy is VAULT-ONLY (`doc-tiers`). HANDOFF/research/CLAUDE.md/README = public.
- **README = a TOOL you run, not a framework**; pain-first `vibes → verified`; Codex equal to
  Claude Code; security is a proof not the brand; the 2/7→7/7 hook battery stays PARKED for launch.
- Vault filenames MUST be opaque IDs; commit messages for vault changes MUST be generic.
- Capability-diff PR comment shipped; observe layer built (frozen). Guards KEPT (hidden runtime kind).

## Don't re-read unless the task needs it

- vault `startup/` — unlock + read `startup/README.md` for the ID→name index; strategy is in there.
- `research/roadmap.md` — the front-door (technical) roadmap.
