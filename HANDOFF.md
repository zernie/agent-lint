# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** nudges you at ≥5 commits without a refresh.
>
> ⚠️ **THIS FILE IS PUBLIC** (open-source repo). NO STRATEGY here — business
> direction / monetization / competitive framing live ONLY in the `startup/`
> vault. HANDOFF may POINT to the vault, never describe its contents. (See the
> `doc-tiers` rule — fixed this session.)

## RESUME HERE

**Branch `claude/tool-positioning-market-65fvvh`.** No PR opened. Long STRATEGY + BUILD +
DOC-HYGIENE session.

**DOC-MIGRATION: DONE (targeted-6).** measurement-authority, divergent-bets, distribution-strategy,
typed-spec-moat, strategic-synthesis-2026-06, eval-startups-positioning moved research/→`startup/`
(encrypted, verified `\0GITCRYPT`), index/keyFiles removed, specs recompiled, 54 tests green.
**Two follow-ups remain (next session):**

1. **`research/roadmap.md` still has ~37 DANGLING relative refs** to the 6 moved docs (the migration
   agent only neutralized `research/X.md`-style, not relative `X.md`-style — README + plugin-structural
   ARE clean now). They're scattered across ~10 sections; roadmap also still has strategic sections
   (Explore/GTM @~830) needing de-strategization. Needs a focused whole-doc pass (leak-sensitive; don't
   rush at session end). No test catches these (prose links), so they won't fail CI meanwhile.
2. **Broader research-corpus de-strategization** — `research/README.md` "Strategy & bets" leftovers,
   `research/CLAUDE.md` Scope text ("research/ = private record / moat narrative" — same public-repo bug
   as doc-tiers), and strategic framing inside individual kept docs. Lower urgency (already-public).

**Strategic next step (the real fork):** run the PIVOT VALIDATION GATE — see the vault (s14.md).
Batched 2×2 research, alone, full context headroom (workflow-fragility lesson).

**Business direction: SEE THE VAULT.** All competitive/monetization strategy + the leading thesis
live in `startup/` (vault README.md has the filename index). Do NOT restate any of it here.

**Technical direction (public-safe):** vigiles = ONE LOOP — declare (typed spec) → check reality,
via four instruments: VERIFY (lint/cross-ref), GATE (compiled hooks), MEASURE (evals on your sub),
OBSERVE (local `.vigiles/runs.jsonl` flight recorder). Full record: `CLAUDE.md` +
`research/harness-observability-direction.md`.

### What landed this session (all pushed; suite green except known env-only dialect-drift)

- **#2 CAPABILITY-DIFF PR COMMENT — SHIPPED.** `action.yml` gains `capability-diff` +
  `fail-on-widen` inputs; materializes the PR base with `git archive` (NOT a worktree — avoids
  checkout/smudge filters e.g. git-crypt), runs `audit --capability-diff --no-html --no-json`,
  extracts just the diff paragraph, folds it into the SAME sticky comment only when the surface
  changed. Dogfooded in `ci.yml` (`fetch-depth: 0` + `capability-diff: true`). Verified e2e.
  Docs: `docs/github-action.md`.
- **OBSERVE layer** (earlier this session) — `src/observe.ts` ledger + 5 emit kinds; `audit`
  renders it; `debug-my-harness` skill reads it. `.vigiles/runs.jsonl` gitignored.
- **DOC-TIERS RULE FIXED** (`CLAUDE.md.spec.ts` → recompiled `CLAUDE.md`): the rule wrongly
  treated `research/`+`CLAUDE.md` as a "private record" holding the moat/positioning narrative.
  The repo is PUBLIC, so they're not private. Corrected: those hold the TECHNICAL record only;
  ALL strategy → the `startup/` vault. Added the competitor-playbook test + fixed the sibling
  `public-vs-internal-docs` line ("strategic vocab → vault, not CLAUDE.md/research").
- **Competitor research → vault (encrypted).** 5 clusters / 41 companies, deep, + raw JSON
  appendix; synthesis + a Fable contrarian pass; leading distro thesis. Method-lesson recorded:
  gather cheap/parallel, then run ONE top-model synthesis pass over the full corpus.

### ALSO OPEN (separate track) + Gotchas

- **PR #54 on `claude/haretrail-dogfood-pvdo9t`** — watched by cron `5438c724`. Merge = user's call.
- **VAULT (`startup/`)** git-crypt, LOCKED at session start → `apt-get install -y git-crypt` +
  `git-crypt unlock <keyfile>` with the user's base64 key; verify a committed blob is `\0GITCRYPT`.
  Vault files are in `.prettierignore` (no fmt needed); a committed blob must read `\0GITCRYPT`.
  **⚠️ `git mv` INTO `startup/` DOES NOT ENCRYPT** (reuses the plaintext blob) — after moving,
  `git add --renormalize startup/` then VERIFY `git show HEAD:startup/<f>.md | head -c9`=`\0GITCRYPT`.
  **FILENAMES ARE PUBLIC** — use opaque IDs (s01.md, s02.json, …); the mapping lives in `startup/README.md`.
  **COMMIT MESSAGES ARE PUBLIC** — use generic messages like `chore: vault` for vault-only changes.
- `CLAUDE.md` (root + src/ + core/ + research/) COMPILED from `.spec.ts` — edit the spec + recompile
  (`node dist/cli.js compile <spec>`), NEVER hand-edit. Deleting a keyFiles-listed file → remove its
  keyFiles line first or compile FAILS.
- RUN ESLINT on new files (`no-confusing-void-expression`, unused imports = ERRORS; `[...str]`→Array.from).
- `dialect-drift.test.ts` fails LOCALLY (installed claude-code vs pinned 2.1.187); CI pins it. Env-only.
- Commits/PR: NO session links / NO raw model-id strings. Conventional-Commit titles.
- Background agents share the working tree → don't commit while one is running (race). A read-only
  research WORKFLOW doesn't touch the tree; a MUTATING migration agent does — stay off the tree while it runs.
- **WORKFLOW FRAGILITY (post-mortem):** a wide fan-out self-throttles on ONE shared rate-limit
  bucket (`429`/`529`/`503`); and the KILL SHOT is a SESSION-COMPACTION INTERRUPT (`[Request
interrupted by user]`) — a background workflow does NOT survive it. FIX: batch (2×2 = peak 2),
  keep fan-outs narrow+fast, don't leave a long fan-out as the only thing across a likely compaction.

### Decisions of record (don't relitigate)

- Repo is PUBLIC → strategy is VAULT-ONLY (doc-tiers rule fixed). HANDOFF/research/CLAUDE.md = public.
- Capability-diff PR comment shipped; observe layer built (frozen). Guards KEPT (hidden runtime kind).
- Competitor research (41 cos) + synthesis + distro thesis are vaulted; the LEADING direction is in the vault.

## Don't re-read unless the task needs it

- vault `startup/` — unlock + read `startup/README.md` for the filename index; leading thesis + strategy record are in there.
- `research/roadmap.md` — the front-door (technical) roadmap.
