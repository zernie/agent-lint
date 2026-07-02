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
> `doc-tiers` rule.)

## RESUME HERE

**Branch `claude/unencrypted-filenames-commits-f4lj9l`.** No PR opened.

**VAULT SECURITY FIX: DONE.** All 20 startup/ docs renamed from descriptive names
to opaque IDs (s01–s20). vault README.md + CLAUDE.md indexes updated to s-numbers.
Root CLAUDE.md gained `vault-commit-hygiene` rule (recompiled from spec). HANDOFF
scrubbed of vault filenames. Going-forward hygiene only — old commit history still
has descriptive names (cleaning requires `git filter-repo` + force-push; separate op).

**PIVOT GATE: DONE (2026-07-02).** Research ran. Verdict in vault (see `gate-synthesis-2026-07.md`
via vault README.md). **CONDITIONAL-GO.** Framing shift is the critical finding.
Next build step: see vault s14.md (pivot-decision) for the recommended sequence.

**RESEARCH DEEPENED + PERSONAL-STRATEGY (2026-07-02, later).** Added vault docs `s21`–`s24`
(see vault README/CLAUDE index for what each holds): a wider VC/market + demand-side research
pass, plus one personal-strategy doc with its own open loose ends tracked INSIDE the vault. All
strategy/personal content stays vault-only — do NOT restate here. Possible next-session action a
user may request lives in the vault, not this public file.

**OPEN FOLLOW-UPS (from prior session, still pending):**

1. **`research/roadmap.md` ~37 DANGLING relative refs** to the 6 docs moved research/→`startup/`
   in a prior session. Scattered across ~10 sections; roadmap also has strategic sections
   (Explore/GTM @~830) needing de-strategization. Needs a focused whole-doc pass.
   No test catches these (prose links), won't fail CI meanwhile.
2. **Broader research-corpus de-strategization** — `research/README.md` "Strategy & bets"
   leftovers, `research/CLAUDE.md` Scope text. Lower urgency (already-public).

**Business direction: SEE THE VAULT.** All competitive/monetization strategy + the leading thesis
live in `startup/` (vault README.md has the ID→name index). Do NOT restate any of it here.

**Technical direction (public-safe):** vigiles = ONE LOOP — declare (typed spec) → check reality,
via four instruments: VERIFY (lint/cross-ref), GATE (compiled hooks), MEASURE (evals on your sub),
OBSERVE (local `.vigiles/runs.jsonl` flight recorder). Full record: `CLAUDE.md` +
`research/harness-observability-direction.md`.

### What landed this session (all pushed; suite green except known env-only dialect-drift)

- **VAULT FILENAME SECURITY** — all 20 vault docs renamed to opaque IDs (s01–s20);
  vault README.md + CLAUDE.md indexes updated; CLAUDE.md.spec.ts gained `vault-commit-hygiene`
  rule; HANDOFF scrubbed of vault filenames; vault unlocked + re-encrypted on commit.
- **PIVOT GATE RESEARCH** — 4-agent research fan-out (Sonnet) + Opus synthesis; full raw
  findings (gate-raw-a1–a4) + synthesis saved to vault. Gate verdict: CONDITIONAL-GO.
- **DEEP-DIVE RESEARCH (later same day)** — multiple Sonnet fan-outs (VC/YC keyword landscape,
  uncovered funds, demand-side buyer+analyst validation, distro delta) → vault `s21`–`s23`
  (synthesis + appendix), plus a personal-strategy doc `s24`. Strategy stays vaulted.
- **Earlier sessions:** capability-diff PR comment shipped; observe layer built; doc-tiers
  rule fixed; 41-company competitor research vaulted; 6 research docs migrated to vault.

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
- **WORKFLOW FRAGILITY (post-mortem):** wide fan-out self-throttles on ONE rate-limit bucket; and
  SESSION-COMPACTION INTERRUPT kills a background workflow. FIX: batch (2×2 = peak 2), narrow+fast.

### Decisions of record (don't relitigate)

- Repo is PUBLIC → strategy is VAULT-ONLY (doc-tiers rule fixed). HANDOFF/research/CLAUDE.md = public.
- Vault filenames MUST be opaque IDs; commit messages for vault changes MUST be generic.
- Capability-diff PR comment shipped; observe layer built (frozen). Guards KEPT (hidden runtime kind).
- Competitor research (41 cos) + synthesis + distro thesis are vaulted; the LEADING direction is in the vault.

## Don't re-read unless the task needs it

- vault `startup/` — unlock + read `startup/README.md` for the ID→name index; strategy is in there.
- `research/roadmap.md` — the front-door (technical) roadmap.
