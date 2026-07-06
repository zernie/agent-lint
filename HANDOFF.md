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

**Branch `claude/gate-release-completion-jh6j25`** (restarted off `main` this session after the
earlier vault PRs merged). This was a STRATEGY + external-ARTICLE session — **most substance is
in the `startup/` vault; do NOT restate or name topics here (public file — naming leaks it).**
Unlock `startup/`, read `startup/README.md` (ID→name index), then the newest docs.

**New/changed vault docs this session:** `s46`, `s47`, `s48` — all encrypted (verified
`\0GITCRYPT`), index synced in both `README.md` + `CLAUDE.md`. **`s48` is the most actionable**
(the execution log: what shipped + the next steps). Read `s46` → `s47` → `s48` in order; do NOT
re-run the research behind them.

**The main deliverable lives in a SEPARATE repo** — `zernie/zernie.github.com`, **PR #86 (DRAFT,
not deployed)**: a blog article. Its full state + the strategic *why* are in vault `s48`. To
continue it you need that repo + the vault (the article file, its `.audience-test-results.md`
ledger, and the screenshots are there). **Next steps for it are in s48** (apply the confirmation
audience-test's next-tier fixes — IN PROGRESS this session — close its publish gate, syndicate).

**Public vigiles code/docs largely unchanged.** The only in-repo changes here: the benchmark
DATA — `bench/ecosystem/FINDINGS.md` (a fresh run appended) + `bench/ecosystem/results-archive/`
(the canonical run behind the article, committed so it survives a reclaim). These are held data,
not a public story; `research/roadmap.md` state still holds.

### PR / merge state (this session)

- Vault PRs **#58, #59, #60** (all `chore: vault`) — MERGED into `main` (squash). The branch was
  restarted off `main` after each; force-with-lease only over already-merged history (verified
  tree-equal first). `main` is current.
- **zernie.github.com PR #85** (visa de-framing) — MERGED. **PR #86** (the article) — OPEN, DRAFT.

## Don't re-read unless the task needs it

- vault `startup/` — unlock + read `startup/README.md` for the ID→name index; strategy is there.
- `research/roadmap.md` — the front-door (technical) roadmap.

## Gotchas (still live)

- **VAULT (`startup/`)** git-crypt, LOCKED at session start → `apt-get install -y git-crypt` +
  `base64 -d key.b64 > key.bin && git-crypt unlock key.bin` with the user's base64 key (saved to
  the session scratchpad this session; not in the repo). A committed vault blob must read
  `\0GITCRYPT`. **`git mv` INTO `startup/` DOES NOT ENCRYPT** — `git add --renormalize startup/`
  then verify `git show HEAD:startup/<f>.md | head -c9` = `\0GITCRYPT`. **FILENAMES + COMMIT
  MESSAGES ARE PUBLIC** — opaque IDs (s01.md…); generic `chore: vault` messages.
- **Real-model evals run in-container on the SUBSCRIPTION** (`claude -p` works here; `apiKeySource:"none"`,
  `$0` metered). Cold start ~20s+ — a first probe may time out; retry with a longer timeout. The
  ecosystem benchmark: `VIGILES_SKILLS=… VIGILES_TASK_NAMES=… VIGILES_TRIALS=… VIGILES_MODEL=sonnet
  node bench/ecosystem/benchmark.mjs`. Do NOT `nohup … &` inside a `run_in_background:true` tool call
  (double-detach — the wrapper reports "done" while the real process orphans; use the tool's own
  backgrounding, or an `until ! ps -p <pid>` waiter).
- **zernie.github.com** is a separate Next.js repo (private repo, public site). Article content lives
  in `src/entities/article/content/*.md` (top-level only renders; gray-matter frontmatter). Its own
  skills under `.claude/skills/` (audience-test, writing-quality) are how you review a draft. **The
  site's markdown TABLES clip on mobile (390px) — use prose, not tables.**
- **SCOPED-SESSION GITHUB ACCESS** — WebFetch is blocked by the net policy; **WebSearch works**.
  Cross-GitHub discovery via WebSearch or sourcegraph + `raw.githubusercontent` (`research/scoped-session-github-access.md`).
- `CLAUDE.md` (root + src/ + core/ + research/) COMPILED from `.spec.ts` — edit the spec + recompile
  (`node dist/cli.js compile <spec>`), NEVER hand-edit.
- **COMMIT SIGNING is BROKEN in-container** (0-byte pubkey) — commits show "Unverified"; author/committer
  email correct. UNFIXABLE here; don't churn amends.
- `dialect-drift.test.ts` fails LOCALLY (installed claude-code vs pinned version); CI pins it. Env-only.
- Commits/PR: NO session links / NO raw model-id strings. Conventional-Commit titles.

## Decisions of record (don't relitigate)

- Repo is PUBLIC → strategy is VAULT-ONLY (`doc-tiers`). HANDOFF/research/CLAUDE.md/README = public.
- Vault filenames MUST be opaque IDs; commit messages for vault changes MUST be generic.
- Personal visa/immigration strategy lives in the SEPARATE private repo `zernie/mine` (via `add_repo`),
  NOT this vault (rule 7).
