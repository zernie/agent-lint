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

**The article deliverable lives in a SEPARATE repo** — `zernie/zernie.github.com`, **PR #86
(DRAFT, not deployed)**: `src/entities/article/content/token-savings-wrong-number.md` (+ its
`.audience-test-results.md` ledger). Strategic *why* in vault `s48`. Voice: FIRST-PERSON, use the
repo's `writing-quality` (prose) + `audience-test` skills; short paragraphs, ≤~15 em-dashes.

**AUTONOMOUS ARTICLE REWORK — LARGELY DONE (DRAFT only; user deploys).** A fable review + reading
caveman's README caught a BLOCKING eval-delivery bug + a framing error; both fixed and the article
is rewritten to CORRECTED data. What shipped:
- **vigiles guard** (`feat(eval)` 4655d85): `runEval`/`measureArms` warn on an unregistered
  `SKILL.md` in an arm's `files` (`unregisteredSkillFiles`, tested). A bare SKILL.md in cwd never
  registers as a skill — only `--plugin-dir`/`.claude/skills`/a SessionStart hook load it.
- **faithful caveman delivery** (skills.mjs + `skills/caveman-plugin/` WITH a repro of caveman's real
  SessionStart activation hook `hooks/caveman-activate.js` → auto-on from message one, per its
  README). Verified telegraphic (3.4 vs ~7–12 articles/100w). `caveman-compress` INPUT test added
  (`compress-test.mjs` + `compress/` fixtures). `analyze.mjs` = Welch + cost-share. Benchmark now
  restart-resilient (writes JSON per skill).
- **CORRECTED CANONICAL run** `results-archive/2026-07-07T01-43…_sonnet.json` (7 tasks×5×2×2, 140
  runs). FINDING (fairer + stronger than the invalid version): **caveman GENUINELY cuts output**
  (mean ~6%, 2 significant task cuts −31%/−28%) **but the pooled bill is FLAT (−1%, n.s.)** — output
  is ~20% of the $ bill + its ~1–1.5k input/turn eats the saving. Token-efficient bill +10%. Compress
  test: 68% smaller file, NO significant session saving, NO correctness cost. 0 regressions; gaps
  59/92. Lead COST-share (~20%) not token-share; a perfect 65% cut caps bill saving at ~13%.
- **article REWRITTEN + committed** to zernie PR #86 branch `claude/token-savings-article` (commit
  f6b1d66): new frame ("it cuts output and the bill still doesn't move"), input-tool section,
  honest "I got my delivery wrong, fixed the harness, re-ran" methodology footnote. Android-readable
  Artifact rendered for the user.
- **INVALID:** the `2026-07-06T23-54` (and earlier) CAVEMAN rows — delivery bug; their
  TOKEN-EFFICIENT rows are VALID (CLAUDE.md auto-loads, reproduces +10–13% bill). Flagged in
  FINDINGS + archive README.

**REVIEW GATES DONE (2026-07-07):** (a) audience-test Run 3 (5 personas) — median ~55% front-page,
+0.5 sentiment (vs Run 1 "eaten alive"); fixes applied (20%-as-measured, "nobody's being conned"
framing, caveman-shrink named, softened overreach). Full record in the article's
`.audience-test-results.md` ledger. (b) a FINAL fable fact-check verified every thesis number
airtight against raw data + caught 3 factual slips (slugify "40%" cited no valid run → reframed to
p=.27 noise; the −31% p=.002 cut is bugfix-offbyone not debounce; "harness refuses"→"verified on") —
all fixed. Article commit `b4be3ba` on `claude/token-savings-article`. **Verdict: publish-ready.**
All research + eval data saved in-repo: vigiles `bench/ecosystem/results-archive/` (JSONs + logs +
`2026-07-07_ANALYSIS-snapshot.md`), `FINDINGS.md`, `CAVEMAN-INVESTIGATION.md`; zernie ledger.

**REMAINING (user's call, not blocking):** (1) publish-gate: recount stars at publish, confirm
`npx vigiles eval` is published. (2) syndication package (HN/Reddit/X). Do NOT deploy — user deploys.

**NEXT STEPS (resume here):** (1) corrected re-run IN PROGRESS — bg task `bwynvdahs`, log
`scratchpad/rerun-sonnet.log`, 3 skills (caveman/caveman-forced/token-efficient) × 7 tasks × 5
trials sonnet; writes `bench/ecosystem/results/<stamp>_sonnet.json`. (2) then run `node
bench/ecosystem/trigger-rate.mjs` (neutral) + `TRIGGER=1 …` (control). (3) `node
bench/ecosystem/analyze.mjs <json>` for Welch + cost-share. (4) ARCHIVE the new json+log to
`results-archive/`, update FINDINGS + archive README (mark 23-54 caveman rows superseded/invalid).
(5) REWRITE the article to the corrected data — new frame: output≈20% of the $ bill (lead
cost-share not token-share); installed-normally caveman never fires; forced-on the cut is real but
variable & «65% never appears; token-efficient bill +12–13%. Add the honest "I caught my own
delivery bug + added a guard" methodology footnote. Own fable's #4 (be-thorough prompts) + #5
(metric counts code caveman exempts). (6) re-run the site `audience-test`. Full fable review saved
mentally; key hits: delivery(fixed), cost-share, Welch, activation, denominator.

### PR / merge state

- Vault PRs #58/#59/#60 — MERGED. **zernie.github.com PR #85** (visa de-framing) — MERGED.
  **PR #86** (the article) — **MERGED (squash) into `master` 2026-07-07 (commit 92713f5); Deploy
  workflow ran → article SHIPPED/LIVE.** CI was green (validate + quality); user said "merge green."

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
- **A SKILL.md is NOT a skill unless registered.** A bare `SKILL.md` in a run's cwd (an eval
  arm's `files`) never loads — use `arm.pluginDir` (`--plugin-dir`, real install) or `skillsDir`.
  `CLAUDE.md` DOES auto-load as project memory (that's why the token-efficient arm was fine, the
  caveman one wasn't). vigiles now WARNS on this (`unregisteredSkillFiles`). Verify activation with
  a style/`skillResolved` check, never assume a file was seen.
- **Transient proxy TLS** — individual `claude -p` trials sometimes fail with "Self-signed
  certificate detected / Unable to connect to API" (agent-proxy CA). It's flaky, not fatal; the
  trial returns 0 output tokens. Re-run; don't read a single 0-token trial as a real result.
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
