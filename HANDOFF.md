# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** (`.claude/hooks/session-handoff-check.sh`) nudges you at
> ≥5 commits without a refresh.

## RESUME HERE — TWO live branches

**(1) `claude/pre-release-priorities-pw7myh` — THIS session (autonomous). Pushed, NO PR
yet.** README revamp + skill/subagent spec adoption + AUDIT TRUST-FIX WAVE. Full vitest:
**1729 pass / 1 fail (only env-only `dialect-drift`, CI pins it) / 11 skip.**

**(2) `claude/lint-inline-mode-go56av` — PR #49 (Lighthouse `audit` refactor) — OPEN,
merge HELD pending founder.** Don't merge without an explicit go. (Details below.)

### What landed this session on `pre-release-priorities`

1. **README = full proof-led rewrite (Concept 5).** Tagline "The tests your AI agent
   harness never had." Leads with REAL audit catches → then the 3 instruments as the
   mechanism. Picked from 5 concepts in `research/readme-revamp-concepts.md`.
   - **HYBRID proof source** (founder-chosen): Proofs 1-2 = community catches ANONYMIZED
     (real names only in `research/dogfood/`); Proofs 3-4 = OFFICIAL + NAMED (punch up).
     See the "Official plugins — DONE" item in DO NEXT for the full detail + sourcing.
   - Demo gif REMOVED from Proof 1 (rendered as a frozen half-typed terminal); "Not
     mockups" TMI removed; screenshots rendered + sent to founder (markdown-it + Chromium).
2. **Skill/subagent spec adoption — SHIPPED (the founder's "super important for pre-release").**
   - Engine: `adoptSkill`/`adoptAgent` in `src/core/adopt.ts` — SKILL.md → `skill()`,
     agents/x.md → `agent()` (lead→body, `##`→sections). Verbatim body + standard
     frontmatter round-trip; unmappable keys (`level:`) preserved in a `// NOTE`, never
     dropped. Round-trip tested via real compileSkill/compileAgent + dogfooded (`adopt-surface.test.ts`).
   - CLI: `init --target=skills/x/SKILL.md` (per-surface) + bare `init` now SWEEPS every
     skill+subagent (`discoverAdoptableSurfaces`) → "create all the specs it can" default.
     CLI e2e tested (`src/cli.test.ts`). Non-destructive (writes specs, never compiles over).
3. **Audit→adoption UX design**: `research/audit-adoption-ux.md`. The report is a browser
   app → can't write files → it EMITS commands (`init` / `init --target=`), the CLI writes.
   Decided: default CREATES specs (no previews/stash). git-stash idea REJECTED (global,
   hijacks stash stack, can't run from report). NOT a contradiction of the "deterministic
   spec-creation is OUT" decision below — that was about inferring RULES; this is faithful
   TRANSCRIPTION (no rule inference), exactly what `adopt.ts` already does for CLAUDE.md.
4. **AUDIT TRUST-FIX WAVE (3 subagents, all pushed)** — made the score trustworthy:
   - **(a) untested = advisory, not graded** (`f4f302d`): a clean-but-untested repo is no
     longer F. `Tested` ring is advisory (shown, excluded from overall); leaderboard appends
     untested as a score-neutral "(advisory)" note.
   - **(b) unified the two scorers** (`fb72e27`): `audit-score.ts` averaged 4 capped rings,
     `leaderboard.ts` summed → SAME plugin got two grades (88 vs 52). Now ONE shared
     `reportDeductions`+`computeIntegrityScore` in `leaderboard.ts` (weights exported); both
     use the SUMMED model. Rings are a diagnostic breakdown; overall = 100−Σpenalties.
   - **(c) fixed the nested-agent FALSE POSITIVE** (`c8e915f`): `scan.ts` `makeClassifier`
     `isAgent` regex matched `agents/` ANYWHERE → `skills/<x>/agents/*.md` (skill-internal
     docs) wrongly flagged as subagents → mis-graded Anthropic's `skill-creator` F. Now
     excludes `skillDir/.../agentDir` (read from layout, adapter-agnostic). Verified via CC
     docs: subagents load ONLY from top-level `agents/`+`.claude/agents/`, never under skills/.
     Regression-tested both directions.
   - **(d) report advisory parity** (`dcf873f`): `report/` renders the advisory Tested ring
     neutrally (na band + "not graded — hardening signal" badge); `advisory` flows through
     the AuditReport JSON (additive, no schemaVersion bump). `npm run build` clean.
   - NET on the official leaderboard (`e51f865`): now **24/25 clean A, pr-review-toolkit the
     lone 70 C** (6 real top-level agents inherit all tools). README Proof 4 reframed from
     "even Anthropic scores F" → "a fair tool flags the ONE real outlier, not noise" (a
     precision/trust message). FOUNDER MAY WANT TO REVISIT: Proof 4 is now near-all-A; option
     (b) was to drop the leaderboard from the proof stack (Proofs 1-3 carry the catches).

### DO NEXT (pre-release-priorities)

- **AUDIT 2nd WAVE** — (2) report adoption buttons + CLI adoptable-surface nudge +
  behavioral "do skills fire?" nudge = **DONE** (`c007352`): `AuditReport.adoptable` carries
  per-surface `npx vigiles init --target=` + create-all commands; `report/src/components/
Adopt.tsx` renders copy-to-clipboard buttons; CLI prints both nudges (non-`--json` only).
  REMAINING (env-blocked HERE — need a different machine): (1) "inherits all tools" severity
  is still a graded −5 (DECISION OF RECORD: kept graded — capability/blast-radius, not
  test-coverage; only untested is advisory; a future call could make it advisory → pushes
  pr-review-toolkit to A). (3) ONE live behavioral validation (needs model auth). (4) asset
  refresh (pinned-CC screenshot, this container is CC 2.1.42) + dialect freshness (needs
  current CC installed).

- **Founder review of the README** (it's a marketing asset — wants a wordsmith pass).
  Then decide: open a PR for this branch? (no PR opened yet.)
- **README asset refresh**: recapture `vigiles-audit.png` from
  `research/dogfood/audit-superpowers.html` on a PINNED-CC machine (this container's
  2.1.42-vs-2.1.187 drift banner must not be in the screenshot).
- **Official plugins in README — DONE (HYBRID, founder-chosen)**: Proofs 1-2 = community
  catches anonymized (dead ref, dropped tool — official plugins DON'T have those); Proofs
  3-4 = OFFICIAL + NAMED (pr-review-toolkit malformed-YAML + unrestricted review agents;
  the all-37 Anthropic leaderboard A→F, LSP stubs excluded). KEY FACT for next session:
  official plugins are well-formed — no dead-ref / never-available-tool / dropped-tool
  bugs exist in them, and skill-creator's "won't register" is a LIKELY FALSE POSITIVE
  (skill-internal agent docs, not subagents) so it was NOT featured. **Sourcing the whole
  official marketplace: `curl -L codeload.github.com/anthropics/claude-plugins-official/
tar.gz/refs/heads/main` works (API + git-clone are blocked, but codeload tarball isn't).**
  Saved: research/dogfood/audit-official-{leaderboard,skill-creator,pr-review-toolkit}.txt.
  (POST-TRUST-FIX numbers now: 24/25 clean A, pr-review-toolkit 70 C — the rings and the
  leaderboard AGREE since the scorers were unified in `fb72e27`. The old 88-vs-52 split is gone.)
- **OSS FP sweep** (founder enabled "auto mode" for it): needs an open-net machine to
  gather many plugins; git-scoped here. HTTPS/curl works, git clone of others doesn't.
- Live real-model spike for the adoption-gateway draft recall (gated on model auth).

### PR #49 (branch 2) — unchanged, still HELD

Lighthouse `audit` (rename `scan`→`audit`): 4 deterministic RINGS (Truthfulness/
Triggering/Structure/Tested, A–F) + inline fixes + HTML report + versioned `AuditReport`
JSON (`src/audit-report.ts`). Report = Vite/React/shadcn single file (`report/`). One
consent for the 2 executing checks (live MCP + trigger-rate); NO execution flag; `audit`
= LOCAL report, CI uses `lint`. **Safety battery CUT from audit** (cross-platform
confinement unbuilt; impl in `src/sandbox.ts`+`egress.ts` KEPT/parked, lives in the
`vigiles/testing` API via `assertBlocksDisasters`). Adoption-gateway preview v1 shipped
(`src/adoptability.ts`, LLM-proposes/deterministic-disposes). Merge is the founder's call.

### Gotchas

- **GIT IS REPO-SCOPED** — clones reach only `zernie/vigiles` (403 elsewhere). npm + HTTPS
  curl reachable; git clone of other repos is NOT. **No bubblewrap** → `sandboxAvailable()` false.
- **`src/dialect-drift.test.ts` fails in THIS container only** (CC 2.1.42 vs validated 2.1.187). CI pins it.
- `CLAUDE.md` + `src/CLAUDE.md` are COMPILED from `.spec.ts` — edit the spec + recompile
  (`node dist/cli.js compile CLAUDE.md.spec.ts`); never hand-edit the md.
- **Commits: NO session links / NO model IDs** (auto-classifier blocks them).
- Use `mcp__github__*` for PR ops (no `gh`). Watch a PR via `subscribe_pr_activity`.

### Decisions of record (don't relitigate)

- **`audit` reads; the prompt runs.** LOCAL report (Lighthouse), NOT CI (`lint` is CI).
  ONE consent, asked-once at TTY. NO execution flag. Automation → `vigiles/testing` API.
- **Default adoption CREATES specs** (faithful transcription, non-destructive, `eject`
  reverses) — not previews/stash. Writing local specs is a safe deterministic write.
- **Adoption-gateway = LLM proposes RULES, deterministic disposes.** Inferring rules is an
  LLM job; faithful spec TRANSCRIPTION (no rule inference) is deterministic and shipped.
- **Don't shame OSS** — real catches, anonymized upstreams in public copy; punch up at
  official/vendor plugins, never name a volunteer's repo to show its bug.
- **Safety battery CUT from audit; impl KEPT/parked** (re-wire when confinement is cross-platform).
- Public docs name USER BENEFIT (no `moat`/`flywheel`, no `research/` links, no VC names).
- `startup/` git-crypt vault stays LOCKED unless a task needs it (leak rail).

## Don't re-read unless the task needs it

- `research/readme-revamp-concepts.md` — 5 README concepts + dogfood proof inventory.
- `research/audit-adoption-ux.md` — how the report creates specs (this session's design).
- `research/audit-lighthouse-design.md` — full audit design + the battery cut.
- `research/roadmap.md` — `🚀 Launch readiness` front door. `startup/` — git-crypt vault (LOCKED).
