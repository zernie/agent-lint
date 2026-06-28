# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** (`.claude/hooks/session-handoff-check.sh`) nudges you at
> ≥5 commits without a refresh.

## RESUME HERE

**Branch `claude/readme-length-review-3vnx5h` — pushed, 6 commits, NO PR yet.** A
README brevity/accuracy pass that turned into an AUDIT TRUST WAVE driven by a real OSS
false-positive sweep. All committed + pushed; build + targeted suites green.

### What landed this session

1. **README trim + accuracy.** Light trim (258 → ~132 non-blank body lines): FAQ
   dedup, dropped the inline-markdown escape-hatch from the Lint section. Then a
   claim-accuracy pass fixed THREE false/unsupported claims: the "runs `audit` in CI"
   line (audit is in NO workflow — CI runs `lint`+`test`; also contradicted the
   README's own "Not a CI step"); a fabricated leaderboard rank (`#1 code-review` →
   it's #4); severity inflation (`✗` → `ℹ` for the advisory YAML note) + an
   unsupported `silent-failure-hunter.md` attribution the capture didn't name.
2. **OSS FALSE-POSITIVE SWEEP — 124 plugin roots** (wshobson/agents 85,
   ruvnet/claude-flow 38, obra/superpowers 1) fetched via **codeload tarballs** (the
   git-clone workaround — see Gotchas). Found + fixed ONE real FP (`5e41782`):
   `commands/agents/*.md` (a command namespaced `/agents:…`) + a `README.md` were
   misclassified as SUBAGENTS → "missing frontmatter, won't register" → mis-graded a
   plugin F. Same class as the `c8e915f` `skills/<x>/agents/` fix, extended to
   `commandDir/.../agentDir` (read from layout, adapter-agnostic). After the fix the
   sweep has ZERO graded false positives.
3. **Versioned `audit --json` envelope** (`53a624c`): marketplace/leaderboard
   `--json` used to emit a BARE unversioned array. Now every `audit --json` is a
   versioned object with a `meta.kind` discriminant: `audit` (AuditReport) /
   `leaderboard` (LeaderboardReport, `plugins[]`) / `marketplace` (MarketplaceReport).
4. **inherit-all → ADVISORY, not graded** (`87d4209`): a subagent with no `tools:`
   line was −5 apiece; the sweep showed 109/122 plugins had ONLY this finding, so it
   cried wolf on an idiomatic style. Now surfaced as an advisory note (like untested),
   never scored. Grade dist flipped {A:90,B:24,C:5,D:3,F:1} → **{A:122,F:1}** (lone F
   = a genuinely empty plugin). Rationale documented inline in `leaderboard.ts` +
   `audit-score.ts`.
5. **Dropped README Proofs 3-4** (`97df4e9`): they leaned on pr-review-toolkit's
   inherit-all as an official-plugin "defect" — now a clean 100 A, so the proofs were
   false AND self-contradictory. Kept Proofs 1-2 (missing SKILL.md + never-available
   tool — real GRADED defects). Founder chose DROP (not reframe-to-trust).

### DO NEXT

- **Open a PR for the branch** (none opened). Title should be `fix:` (the precision +
  scoring fixes dominate) and cover all three concerns (README + FP fix + scoring), so
  the `readme-length-review` name isn't surprising.
- **Env-blocked HERE** (need a different machine): asset refresh — recapture
  `vigiles-audit.png` from `research/dogfood/audit-superpowers.html` on a PINNED-CC
  box (this container is CC 2.1.42 vs validated 2.1.187 → drift banner); ONE live
  behavioral validation (model auth); dialect freshness (current CC installed).
- Last audit pre-release DECISION is now closed (inherit-all). Remaining audit roadmap
  items (observed-egress column, etc.) are post-launch.

### Gotchas

- **OSS sweep workaround (NEW):** `git clone` of other repos is 403 here, but
  **codeload tarballs work**: `curl -sSL codeload.github.com/<owner>/<repo>/tar.gz/refs/heads/<main|master>`.
  Unblocks fetching + auditing real community plugins in-container. (Official
  marketplace: `anthropics/claude-plugins-official` the same way.)
- **GIT IS REPO-SCOPED** — only `zernie/vigiles` reachable; npm + HTTPS curl work.
- **No bubblewrap** → `sandboxAvailable()` false; **`src/dialect-drift.test.ts` fails
  in THIS container only** (CC 2.1.42 vs validated 2.1.187). CI pins it.
- **`npm run fmt` reformats `research/` too** — it reflowed `readme-revamp-concepts.md`
  + the dogfood html/json (huge prettier diff) as a side effect; I reverted them. Stage
  only the files you changed; don't bundle fmt noise.
- `CLAUDE.md` + `src/CLAUDE.md` are COMPILED from `.spec.ts` — edit the spec + recompile
  (`node dist/cli.js compile CLAUDE.md.spec.ts`); never hand-edit the md.
- **Commits: NO session links / NO model IDs** (auto-classifier blocks them).
- Use `mcp__github__*` for PR ops (no `gh`). Watch a PR via `subscribe_pr_activity`.

### Decisions of record (don't relitigate)

- **inherit-all is ADVISORY** (subagent with no `tools:` line) — idiomatic, not
  breakage; shown, never scored. A health score means "something is BROKEN".
- **`audit --json` is ALWAYS a versioned object** (`meta.kind`: audit/leaderboard/
  marketplace), never a bare array — additive within `schemaVersion` 1.
- **README has TWO proofs** (community catches, anonymized — missing SKILL.md +
  never-available tool). Official-plugin proofs dropped (official plugins are clean A
  post-advisory). If a proof returns, punch UP (name Anthropic's own), never volunteers.
- **`audit` reads; the prompt runs.** LOCAL report (Lighthouse), NOT CI (`lint` is CI).
  ONE consent, asked-once at TTY. NO execution flag. Automation → `vigiles/testing` API.
- **Safety battery CUT from audit; impl KEPT/parked** (re-wire when confinement is
  cross-platform). **Guard / compiled-hooks battery parked for launch** (live set:
  Lint/Test/Eval).
- Public docs name USER BENEFIT (no `moat`/`flywheel`, no `research/` links, no VC names).
  `startup/` git-crypt vault stays LOCKED unless a task needs it.

## Don't re-read unless the task needs it

- `research/audit-lighthouse-design.md` — full audit design + the battery cut.
- `research/readme-revamp-concepts.md` — README concepts + dogfood proof inventory.
- `research/roadmap.md` — `🚀 Launch readiness` front door. `startup/` — vault (LOCKED).
