# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** (`.claude/hooks/session-handoff-check.sh`) nudges you when
> ≥5 commits pile up without a refresh — it's live and dogfood-proven.

## RESUME HERE — execute the pre-release SURFACE FREEZE + markdown cut

Branch **`claude/readme-review-formatting-k8108k`** = **PR #47 (OPEN)**, latest commit
is this handoff. All work pushed. The branch history was **squashed to one commit on
main + follow-ups** (to scrub VC plaintext — see below), so it's clean. CI on #47 is
green (the only failures were stale `fmt:check` + a `validate` PR-title issue, both
fixed). Continue on this SAME branch/PR after compaction.

**THE TASK (do next, same PR #47):** execute the surface-freeze + markdown cut from
**`research/pre-release-focus.md`** (read it first):

1. **Un-export / `@internal`** the experimental cluster (`guards.ts`, `hook-spec.ts`,
   `effect()`/effect-region, `evolve.ts`, deep experimental typed-spec builders). Keep
   the code; remove from PUBLIC exports.
2. **Audit the surface via `api-extractor`** (`etc/*.api.md`). PUBLIC/frozen = the 8 CLI
   verbs + exit codes + `vigiles/{spec,testing,unit,claude-code,codex,adapter}`
   (`vigiles/hook` stays exported, un-headlined).
3. **Markdown cut:** KEEP inline `<!-- vigiles:enforce -->`; CUT frontmatter mode (Level
   1); collapse the ladder to 2 (markdown → typed spec). Stop marketing "Level 0/1/2".
4. **Ship a `STABILITY` statement** ("0.x — CLI stable; library API evolving").

**This makes #47 BREAKING** → retitle the PR with `!` (e.g. `refactor!: freeze
pre-release public surface`); current title is `chore:` (no bump).

**ALSO PENDING (offered, awaiting user go-ahead):** 3 small positioning edits — (a) the
**author-time-vs-runtime wedge** as the one-line differentiator; (b) citeable
harness-engineering quotes (Karpathy "automate what you can verify", OpenAI "the harness
is hard") into the launch positioning; (c) a roadmap A2 note for the AHE
prediction-loop. Public-safe; not yet done.

### SHIPPED this session (don't rebuild)

- **🔐 git-crypt `startup/` vault** — VC/competitor/funding research is ENCRYPTED at rest
  (`.gitattributes startup/** filter=git-crypt`; `startup/` in `.prettierignore`; outside
  scan paths so CI ignores it). Branch history was **filter-repo-scrubbed + force-pushed**
  to remove the old plaintext. **The user has the base64 key saved** (NOT in repo). Next
  session the vault is LOCKED: `apt-get install -y git-crypt` → paste key → `git-crypt
unlock`. Files: `startup/{vc-and-competitor-intel,competitor-arga-labs,funded-adjacency-2026,vc-landscape-2026}.md`.
- **Stale-HANDOFF Stop hook** (`.claude/hooks/session-handoff-check.sh` + 5-case test) —
  jq→grep loop-guard fix landed (Codex review) so it works without jq.
- **README overhaul** — pain-first hero ("100x coder, 1x verifier"), audience router,
  **Guard PARKED** (3 instruments: Lint/Test/Eval), `docs/for-plugin-authors.md`. The
  README DIRECTION comment (rule 1b: never open with a negative) is at the top.
- **Research bundle (public):** `research/agentic-harness-evolution-poach.md` (arXiv AHE
  poach), `research/oss-lane-sweep-2026-06.md` (OSS double-check), `research/pre-release-focus.md`,
  the roadmap `🚀 Launch readiness` section.

### Decisions of record (don't relitigate)

- **CORRECTION:** the "YC RFS describes vigiles" claim was WRONG — Bento/Lark/Salus are
  FUNDED YC COMPANIES, not RFS entries. (Details in the vault.)
- **The competitive wedge (from the big fan-out):** EVERY competitor — funded
  (BentoLabs/Salus/Braintrust) AND OSS (agnix @297★ the structure-lint leader) — is
  **runtime/observability/post-hoc** or **structure-lint**. vigiles is the ONLY
  **author-time / deterministic / pre-run verification + typed-spec** play. The lane is
  empty; that sentence is the positioning.
- **Focus = VERIFY + MEASURE.** Launch = article-led MEASUREMENT (NOT caveman-headline);
  ecosystem-benchmark v0 is the one real pre-launch build.
- **Moratorium on net-new research + new instruments until after launch.**
- **Verb surface = 8 + hidden `hook-runtime`.** Public docs name the USER BENEFIT (no
  `moat`/`flywheel` vocab, no `research/` links, no VC/firm names — those live in the vault).

### Gotchas

- **PR #47 watch is SESSION-ONLY** — the subscription + hourly cron `42d90a74` die when
  this session ends. If you want to keep watching, re-`subscribe_pr_activity` next session.
- CC-on-web: GitHub via `mcp__github__*` (NO `gh` CLI). Before commit: `npm run build` +
  `npx vitest run` + `npm run fmt:check`; `self-command-refs` fails CI on a stale `vigiles
<cmd>` ref. Conventional commits + `!` on breaking. NO session links / model IDs in commits.

## Don't re-read unless the task needs it

- `research/pre-release-focus.md` — THE plan for the resume task.
- `research/roadmap.md` — `🚀 Launch readiness` front door.
- `startup/` — git-crypt vault (locked; competitor + who-to-pitch intel; unlock with the saved key).
