# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** (`.claude/hooks/session-handoff-check.sh`) nudges you when
> ≥5 commits pile up without a refresh — it's live and dogfood-proven.

## RESUME HERE — surface freeze + markdown cut (NOT yet done; PR #47 merged WITHOUT it)

**State:** **PR #47 is MERGED** (commit `2747878` on `main`) — it shipped the README
overhaul + research consolidation + handoff hook + encrypted `startup/` vault, but **NOT**
the surface-freeze/markdown-cut that the prior handoff queued onto it. Verified this
session: no `STABILITY` statement, `Level 1` frontmatter mode still marketed
(`docs/markdown-mode.md`), `package.json` `exports` still expose the full unfrozen surface
(`linting`/`integration`/`e2e` + the experimental cluster). So the task below is **still
open** and now needs a **NEW branch + PR** (not #47).

This session's branch is **`claude/handoff-mylfen`** — even with `origin/main`, clean tree
(only this HANDOFF refresh on it). Start the freeze work on a fresh branch off it.

**THE TASK (read `research/pre-release-focus.md` first):**

1. **Un-export / `@internal`** the experimental cluster (`guards.ts`, `hook-spec.ts`,
   `effect()`/effect-region, `evolve.ts`, deep experimental typed-spec builders). Keep the
   code; remove from PUBLIC exports.
2. **Audit the surface via `api-extractor`** (`etc/*.api.md`). PUBLIC/frozen = the 8 CLI
   verbs + exit codes + `vigiles/{spec,testing,unit,claude-code,codex,adapter}`
   (`vigiles/hook` stays exported, un-headlined).
3. **Markdown cut:** KEEP inline `<!-- vigiles:enforce -->`; CUT frontmatter mode (Level
   1); collapse the ladder to 2 (markdown → typed spec). Stop marketing "Level 0/1/2".
4. **Ship a `STABILITY` statement** ("0.x — CLI stable; library API evolving").

**This is BREAKING** (removes `exports` subpaths / public symbols) → the PR title needs
`!` (e.g. `refactor!: freeze pre-release public surface`).

**ALSO PENDING (offered earlier, awaiting user go-ahead):** 3 small positioning edits —
(a) the **author-time-vs-runtime wedge** as the one-line differentiator; (b) citeable
harness-engineering quotes (Karpathy "automate what you can verify", OpenAI "the harness is
hard") into the launch positioning; (c) a roadmap A2 note for the AHE prediction-loop.
Public-safe; not yet done.

### SHIPPED most recently (don't rebuild) — landed via PR #47

- **README overhaul + research consolidation + handoff hook + encrypted `startup/` vault**
  all merged to `main`. The big 2026-06-25 harness-market fan-out is VAULTED in
  `startup/harness-market-2026.md` (+ `harness-players-appendix-2026.md` +
  `harness-sources-2026.md`), encrypted at rest.
- **`startup/CLAUDE.md` vault index** (dir-scoped, auto-loaded under `startup/`) + the
  `.vigilesrc.json` `startup/**` exclusion (vigiles dogfoods `require-spec`; the locked
  ciphertext vault file would otherwise fail CI).
- **`deep-research` skill** (`.claude/skills/deep-research/SKILL.md`, project-local, NOT
  shipped, `vigiles:ignore-test`) — mandates write-full-findings-to-disk + durable appendix
  so subagent transcripts aren't lost. Use it for future fan-outs.
- **PR #47 Codex-review doc fixes** (`docs/for-plugin-authors.md`): `scan --trigger` is
  per-plugin; ranking needs `marketplace.json` OR multiple dir args.

### SHIPPED earlier (don't rebuild)

- **🔐 git-crypt `startup/` vault** — VC/competitor/funding research ENCRYPTED at rest
  (`.gitattributes startup/** filter=git-crypt`; in `.prettierignore`; outside scan paths).
  Branch history was filter-repo-scrubbed + force-pushed to remove old plaintext. **The user
  has the base64 key saved** (NOT in repo). Next session the vault is LOCKED:
  `apt-get install -y git-crypt` → paste key → `git-crypt unlock`.
- **GitHub-diff note:** the `startup/` vault shows as `Bin 0 -> N bytes` on GitHub —
  content is committed + correct-size, just ciphertext-invisible by design.
- **CLI verb consolidation 13→8** (PR #46, merged) + **typed-spec moat** (PR #43, merged).
- **Stale-HANDOFF Stop hook** (`.claude/hooks/session-handoff-check.sh` + 5-case test) —
  jq→grep loop-guard fix landed.

### Decisions of record (don't relitigate)

- **The competitive wedge:** EVERY competitor — funded (BentoLabs/Salus/Braintrust) AND
  OSS (agnix @297★) — is **runtime/observability/post-hoc** or **structure-lint**. vigiles
  is the ONLY **author-time / deterministic / pre-run verification + typed-spec** play. The
  lane is empty; that's the positioning.
- **CORRECTION:** the "YC RFS describes vigiles" claim was WRONG — Bento/Lark/Salus are
  FUNDED YC COMPANIES, not RFS entries. (Details in the vault.)
- **Focus = VERIFY + MEASURE.** Launch = article-led MEASUREMENT (NOT caveman-headline);
  ecosystem-benchmark v0 is the one real pre-launch build.
- **Moratorium on net-new research + new instruments until after launch.**
- **Verb surface = 8 + hidden `hook-runtime`.** Public docs name the USER BENEFIT (no
  `moat`/`flywheel` vocab, no `research/` links, no VC/firm names — those live in the vault).

### Gotchas

- **No PR is open right now.** The old PR #47 watch subscription + hourly cron `42d90a74`
  are DEAD (session-only). When you open the surface-freeze PR, re-`subscribe_pr_activity`
  if you want it watched.
- CC-on-web: GitHub via `mcp__github__*` (NO `gh` CLI). Before commit: `npm run build` +
  `npx vitest run` + `npm run fmt:check`; `self-command-refs` fails CI on a stale
  `vigiles <cmd>` ref. Conventional commits + `!` on breaking. NO session links / model IDs
  in commits.
- This session's branch `claude/handoff-mylfen` was created fresh off `origin/main`; the
  local `main` ref is stale (27 commits behind origin) — trust `origin/main`.

## Don't re-read unless the task needs it

- `research/pre-release-focus.md` — THE plan for the resume task.
- `research/roadmap.md` — `🚀 Launch readiness` front door.
- `startup/` — git-crypt vault (locked; competitor + who-to-pitch intel; unlock with the
  saved key).
