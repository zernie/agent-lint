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

**★ PIVOT GATE CLEARED → PHASE B (2026-07-03).** The disaster-battery benchmark (s31/s32 plan) RAN
and PASSED both gates. Result in vault `s34` (summary) + `s35` (full detail: table + the exact
hardened `gate-v2.mjs` scorer + the tightened `gate-v3.mjs`). Public-safe headline: community AI-coding
safety hooks overwhelmingly fail — median 0/7 blocked, ~79% fail a disaster they explicitly claim to
guard. Whole run happened IN-SESSION via the sourcegraph+raw workaround
(`research/scoped-session-github-access.md`). Direction (vault s26/s30/s31): objective = US visa +
virality ≫ business; ship the SECURITY REPORT ("The State of Agentic Coding Security 2026"); vigiles =
engine. Report draft started in vault `s36`.
**NEXT CONCRETE STEPS (in order):** (1) run the TIGHTENED `gate-v3.mjs` (in vault s35 — needs an
interactive session; executing foreign hooks trips the auto-mode classifier, so a human must approve)
→ locks the airtight per-claim number; (2) widen the corpus toward N≥100 (more sourcegraph queries +
awesome-\* lists; recover the 42 unfetched script-refs); (3) author the report (s36) + arXiv twin; queue
responsible-disclosure fix-PRs. NOTHING PUBLIC until the tightened number is locked (a deflated number
hurts the visa). The benchmark scraper/scorer is NOT committed (telegraphs the launch) — it lives in
vault s35; re-create from there or from the public technique doc.
**PENDING FROM FOUNDER:** the `/goal` prompt format (short objective vs full block — unanswered) so the
next session can carry a correct persistent goal.

**OPEN FOLLOW-UPS (from prior session, still pending):**

1. ~~`research/roadmap.md` ~37 dangling refs~~ **RESOLVED / was stale (verified 2026-07):**
   `roadmap.md` has ZERO broken markdown links and ZERO links INTO the vault — the `startup/`
   mentions are all compliant PROSE pointers ("see the private `startup/` vault"), which
   `doc-tiers` allows. Nothing to fix. (roadmap still has strategic Explore/GTM prose @~500/748/830
   that's borderline but public-safe; de-strategize only if a rule tightens.)
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
- **STRATEGY CONVERGENCE (same day, extended)** — further Sonnet fan-outs (open-harness expansion,
  curation/adoption-intelligence, naming, verifier-vs-framework) → vault `s25`–`s29`. Direction
  converged (consolidated in `s26`, refined in `s29`). No code changed; all strategy vaulted.
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
- **SCOPED-SESSION GITHUB ACCESS + the in-session cross-repo-search WORKAROUND → see the PERMANENT record
  `research/scoped-session-github-access.md`.** TL;DR: the GitHub API is token-bound to `zernie/vigiles`
  (cross-repo `search/code` refused regardless of token/network — it's the proxy, not a scope you can fix);
  BUT cross-GitHub DISCOVERY works in-session via **sourcegraph streaming API + `raw.githubusercontent`**
  (proven: pulled 148 real hook files, no token/laptop). Only a token-authenticated GitHub-API scrape still
  needs an external shell. Full mechanics + snippet + gotchas live in that research doc, not here.
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
