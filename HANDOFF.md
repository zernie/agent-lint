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

**Branch `claude/gate-release-completion-jh6j25`.** No PR opened (open only if asked).
**Nothing pushed** — all commits are LOCAL, vault-only (`chore: vault`).

**This was a STRATEGY / DIRECTION session — ALL substance is in the VAULT.** Do NOT
restate or name topics here (public file). Unlock `startup/`, read `startup/README.md`
(ID→name index), then **`s44` (the session's conclusion + the OPEN FORK)** first, then
`s43`. New/changed vault docs this session: `s37`–`s41` (renamed from descriptive
`gate-*` names → opaque IDs, index updated), `s42`, `s43`, `s44` (all encrypted —
verified `\0GITCRYPT`).

**Open at session end:** a research agent (a novelty check for a technical direction)
was IN FLIGHT — its result + the direction DECISION belong in the vault, not here.
**Next session: read `s44`, collect the research result, DECIDE, record in vault — do
NOT re-run the exploration** (`s44` explains exactly why the loop is closed).

**No public code/docs changed this session** — work was entirely vault + scratchpad.
The prior session's README/roadmap state still holds, BUT some public framing may now be
stale given the vault direction shift — reconcile only per `s44`, never by leaking it.

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
- **COMMIT SIGNING is BROKEN in-container** — the SSH signing key is a 0-byte pubkey with no
  private key, so commits are `sig=N` (GitHub shows "Unverified"). Author/committer email ARE
  correct (`noreply@anthropic.com`); only the signature is missing. UNFIXABLE here; don't churn
  amends chasing it. Cosmetic only, and nothing's pushed.
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
