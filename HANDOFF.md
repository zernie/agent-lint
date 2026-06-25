# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** (`.claude/hooks/session-handoff-check.sh`) nudges you when
> ≥5 commits pile up without a refresh — it's live and dogfood-proven.

## RESUME HERE — surface freeze SHIPPED on `claude/handoff-mylfen`; finish launch polish

**State:** the **pre-release surface freeze + markdown cut + launch-polish pass is DONE**
and pushed on branch **`claude/handoff-mylfen`** (NOT merged, **no PR open yet** —
awaiting user go-ahead). The freeze the prior handoff queued is complete. Commits (all
pushed, on top of `origin/main` `2747878`):

- `ef7281c` **freeze!** — typed-composition cluster + `effect()`/EffectRegion marked
  `@internal` in `vigiles/spec` (still exported at runtime, excluded from API docs +
  flagged in `etc/*.api.md`); `evolve.ts` noted `@internal`; markdown ladder collapsed to
  two on-ramps with the frontmatter docs **PARKED via HTML comment** in
  `docs/markdown-mode.md` (nothing deleted); `STABILITY.md` shipped + README pointer.
- `83d41e3` positioning — author-time-vs-runtime wedge + citeable quotes into the
  Positioning lock (`research/pre-release-focus.md`).
- `911b328` README hero — leads with the concrete pain ("installed plugins + wrote skills,
  but do they work? a library with no tests"); `53423cc` same pain-first pass on the
  subdoc openings (lint/test/plugin-author guides).
- `2d24d9f` codified the pain-first principle into the README direction comment (new rule
  **1c**, reconciled with 1b) + fixed a stale `vendor.test.ts` doc link.

**This is BREAKING** → when opened as a PR, title needs `!`
(`refactor!: freeze pre-release public surface + collapse markdown ladder`) with a
`BREAKING CHANGE:` footer (the freeze commit already has both).

**DO NEXT (the two overdue loose ends + launch polish):**

1. **Open the PR?** (user hadn't said yes — ask/confirm.) Re-`subscribe_pr_activity` if you
   want it watched (the old #47 watch is dead).
2. **Quick-win launch polish (all polish-grade, doable now):** first-run smoke
   (`vigiles init` clean temp dir, non-interactive doesn't hang); README length trim (256
   raw lines — comments/parked-Guard inflate it, keep visible skim-content under cap); final
   full gate (build+vitest+fmt+api:check); FP spot-check a famous plugin beyond the vendored 4. See the launch sequence in `research/pre-release-focus.md`.
3. **Bigger launch builds (NOT polish, separate):** ecosystem-benchmark v0 (the ONE
   sanctioned pre-launch build, needs sub/quota) + the method-first article + README 60-sec
   proof/GIF.

### Gotchas (read before trusting test output)

- **REAL-MODEL TIERS ARE RUNNABLE HERE (Claude Code web).** Do NOT say "eval /
  `scan --trigger` need quota, not exercisable." There is NO `ANTHROPIC_API_KEY`, but
  the `claude` CLI on PATH (`/opt/node22/bin/claude`, 2.1.191) is AUTHENTICATED via the
  session OAuth (`CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` + `ANTHROPIC_BASE_URL` proxy).
  Proven: `claude -p "Reply READY"` → `READY`, exit 0. vigiles drives that authenticated
  CLI, so `vigiles eval` / `scan --trigger` / `measureTriggerRate` run on the subscription
  here — use them to dogfood the real-model tier.
- **`src/dialect-drift.test.ts` FAILS in THIS container** — env-only: the container has
  `@anthropic-ai/claude-code` **2.1.42** vs the validated **2.1.187**, so the installed tool
  set drifts from `ACKNOWLEDGED_TOOL_INPUT_TYPES`. CI PINS CC → green there. My diff touches
  nothing dialect-related; `scan` also prints a non-blocking `⚠ dialect freshness` for the
  same reason (working as designed). Full suite otherwise: **1596 passed / 11 skipped / 1
  (this) failed**.
- `etc/*.api.md` is the surface gate (`npm run api:check`); regenerate with
  `node scripts/api-extractor.mjs --local` after an intentional API change.
- `docs/markdown-mode.md` parked block: inner `<!-- … -->` markers are written `<!~~ … ~~>`
  so a nested `-->` doesn't close the park comment — restore them when un-parking.

### SHIPPED earlier (don't rebuild)

- **PR #47 MERGED** (`2747878`) — README overhaul + research consolidation + handoff hook +
  encrypted `startup/` vault. CLI verb consolidation 13→8 (PR #46) + typed-spec moat (#43).
- **🔐 git-crypt `startup/` vault** — VC/competitor/funding research ENCRYPTED at rest
  (`.gitattributes startup/** filter=git-crypt`; in `.prettierignore`; outside scan paths).
  **The user has the base64 key saved** (NOT in repo). Next session the vault is LOCKED:
  `apt-get install -y git-crypt` → paste key → `git-crypt unlock`. GitHub shows it as
  `Bin 0 -> N bytes` — committed + correct, ciphertext-invisible by design.
- **`deep-research` skill** (`.claude/skills/deep-research/SKILL.md`, project-local, NOT
  shipped, `vigiles:ignore-test`) — write-full-findings-to-disk + durable appendix. Use it
  for future fan-outs.

### Decisions of record (don't relitigate)

- **The competitive wedge:** EVERY competitor — funded (BentoLabs/Salus/Braintrust) AND OSS
  (agnix @297★) — is **runtime/observability/post-hoc** or **structure-lint**. vigiles is the
  ONLY **author-time / deterministic / pre-run verification + typed-spec** play. Empty lane.
- **Focus = VERIFY + MEASURE.** Launch = article-led MEASUREMENT (NOT caveman-headline);
  ecosystem-benchmark v0 is the one real pre-launch build. **Moratorium on net-new research +
  new instruments until after launch.**
- **Verb surface = 8 + hidden `hook-runtime`.** Public docs name the USER BENEFIT (no
  `moat`/`flywheel` vocab, no `research/` links, no VC/firm names — those live in the vault).
- **README pain-first hook** (new this session, codified as rule 1c): lead with the reader's
  concrete pain + "a library with no tests", for hero AND every subdoc opening.

### Gotchas (ops)

- CC-on-web: GitHub via `mcp__github__*` (NO `gh` CLI). Before commit: `npm run build` +
  `npx vitest run` + `npm run fmt:check`; `self-command-refs` fails CI on a stale
  `vigiles <cmd>` ref. Conventional commits + `!` on breaking. NO session links / model IDs
  in commits.
- Local `main` ref is stale (behind `origin/main`) — trust `origin/main`.

## Don't re-read unless the task needs it

- `research/pre-release-focus.md` — the launch sequence + Positioning lock.
- `research/roadmap.md` — `🚀 Launch readiness` front door.
- `startup/` — git-crypt vault (locked; competitor + who-to-pitch intel; unlock with the key).
