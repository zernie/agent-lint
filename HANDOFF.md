# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** nudges you at ≥5 commits without a refresh.

## RESUME HERE

**Branch `claude/tool-positioning-market-65fvvh`.** No PR opened. This is a long STRATEGY +
BUILD session: decided the tool direction → built the OBSERVE layer → verify-first launch
positioning → a 2-pass Fable pivot re-review → launch-surface CUTS → SHIPPED the capability-diff
PR comment (moat #2) → salvaged the deep half of a competitor-teardown workflow (it died throttled).

**THE DIRECTION (decision of record).** vigiles = ONE LOOP: declare what the harness should
do (typed spec) → check reality against it, via four instruments — VERIFY (lint/cross-ref),
GATE (compiled hooks), MEASURE (evals on your sub), OBSERVE (local flight-recorder ledger).
Spine: the typed spec is the declared GROUND TRUTH. Local-first + agent-readable; NOT hosted
runtime/OTel. Coding-harness world ONLY (Market C). Existing surfaces STAY (sensors, not a
pick-your-tools framework). Full record: root `CLAUDE.md ## Direction` +
`research/harness-observability-direction.md`; monetization = `startup/` vault ONLY.

### What landed this session (all pushed, full suite green except known dialect-drift)

- **OBSERVE layer — BUILT.** `src/observe.ts` ledger + all 5 emit kinds (compiled-hook gate,
  agent contract-rail, skill-fire, trigger-rate, capability-diff) → `.vigiles/runs.jsonl`;
  `vigiles audit` RENDERS it (`formatLedgerSummary`) + it's in the AuditReport JSON + HTML;
  `debug-my-harness` model-invocable skill reads it. `.vigiles/runs.jsonl` gitignored.
- **Verify-first launch positioning.** README front door retuned ("Catch the silent breakage
  in your Claude Code & Codex setup"), + the tagline decision LOCKED in the README editor-guide.
- **Two rules encoded** (`CLAUDE.md.spec.ts` + `startup/CLAUDE.md`): LINK DIRECTIONALITY
  (doc-tiers — links point outward only; vault may cite research, research/public must NEVER
  cite the vault) + VAULT rule 6 (competitive research saved in full detail, DEPTH-TAGGED
  deep/medium/thin, coverage-mapped, cross-linked, indexed — shallow never masquerades as deep).
- **Launch-surface CUTS (3/4).** Deleted the `hook-spec` spike; demoted the `scaffold-test`
  VERB to skill-internal (engine kept); demoted "7 catalogs" from the README headline.
  GUARDS KEPT (deliberate — it's a HIDDEN `hook-runtime guard` kind, not public surface;
  clean removal would gut a real e2e test + touch shipped guardrail-check → not worth it).
- **#2 CAPABILITY-DIFF PR COMMENT — SHIPPED.** The CLI/lib layer (`audit --capability-diff`)
  was already built+tested; this session added the GHA face: `action.yml` gains
  `capability-diff` + `fail-on-widen` inputs, materializes the PR base with `git archive`
  (NOT a worktree — avoids checkout/smudge filters, e.g. git-crypt), runs the diff, folds a
  section into the SAME sticky comment only when the surface changed. Dogfooded in `ci.yml`
  (`fetch-depth: 0` + `capability-diff: true`). Verified e2e locally (widen→section+exit-1,
  no-change→no-section, no leaked worktrees/report-files). Docs: `docs/github-action.md`.
- **VAULT: deep competitor teardown SALVAGED.** The teardown workflow DIED (throttled, silent
  1h+); one cluster returned deep before it died → saved to `startup/competitor-teardown-2026.md`
  (9 cos: Coval/Momentic/Hamming/Roark/promptfoo[→OpenAI $86M]/DeepEval/Ashr/HUD/Respan; full
  rule-6 fields + ranked poach-list). Folded IN: the 2 Fable pivot reviews (#4) + the launch
  anonymize/areas-for-improvement decision (#3). 4 planned clusters `unrun` (coverage map in-doc).

### THE PIVOT — 2nd-pass decisions of record (from Fable ×2 + hit-rate data)

- **Hit-rate (measured):** deterministic ecosystem catches are THIN (444 plugins mostly clean;
  official 0/39 graded; ~3 graded in 170) → the "I audited N plugins" headline has no big N.
  BEHAVIORAL is the shock: superpowers (752k installs) flagship `brainstorming` fires 10-30%.
- **Viral artifact:** the behavioral "silent breakage" finding (a popular skill silently
  doesn't fire), framed as SILENT-BREAKAGE, never "eval". ANONYMIZED + framed as
  AREAS-FOR-IMPROVEMENT (user call — not a call-out). Deterministic layer = the free "why".
- **Capability-diff: UN-HOLD + PROMOTE** — viral loop (GHA sticky PR comment, org-to-org) AND
  the attestation primitive AND markdown-impossible. The #1 build.
- **Monetization:** observability + attestation CONVERGE for the coding-harness TEAM buyer
  (hosted tier aggregates the local ledger; its VALUE is the compliance/conformance EVIDENCE;
  raw data stays local, no lock-in). First revenue = 3-5 design-partner conformance pilots
  ($10-30K) with Tier-2 regulated enterprises via a red-team/cert channel — sales-led, not PLG.
- **Adapters:** Cursor = VERIFY-ONLY (closed/unmockable); Gemini→Antigravity (closed); next
  FULL adapter = OpenHands/Factory (mockable). Flue (Astro team, typed agent runtime) = adapter
  target + typed-spec validation, not a competitor.
- **Biggest risk:** speed-to-being-the-NAMED cross-harness auditor before Anthropic ships a
  built-in `claude doctor`. CC+Codex neutrality is the hedge.

### DO NEXT (this session's #2/#3/#4 all landed; teardown re-run DONE + folded in)

- **Teardown COMPLETE** — the 2×2 re-run (`wf_2daca7be-bfc`) returned all 4 clusters clean
  (4/4, 0 err, ~9 min); folded into `startup/competitor-teardown-2026.md` → **5 clusters / 41
  companies, all `deep`**. The batching fixed the self-throttle; no interrupt this time.
- **The launch ARTICLE** — the behavioral silent-breakage finding, ANONYMIZED + framed as
  areas-for-improvement (decision recorded in the vault teardown doc). Not yet written.
- **The cohesion-pass BUILD items** — the top poaches now also live in the teardown doc's
  ranked list (observe-replay-as-test is the flagged flagship of the observe layer).

### ALSO OPEN (separate track) + Gotchas

- **PR #54 on `claude/haretrail-dogfood-pvdo9t`** — watched by cron `5438c724`. Merge = user's call.
- **VAULT (`startup/`)** git-crypt, LOCKED at session start → `apt-get install -y git-crypt` +
  `git-crypt unlock <keyfile>` with the user's base64 key; verify a committed blob is `\0GITCRYPT`.
- `CLAUDE.md` (root + src/ + core/ + research/) COMPILED from `.spec.ts` — edit the spec + recompile,
  NEVER hand-edit. Deleting a keyFiles-listed file → remove its keyFiles line first or compile FAILS.
- RUN ESLINT on new files (`no-confusing-void-expression`, unused imports = ERRORS; `[...str]`→Array.from).
- `dialect-drift.test.ts` fails LOCALLY (installed claude-code vs pinned 2.1.187); CI pins it. Env-only.
- Commits/PR: NO session links / NO raw model-id strings. Conventional-Commit titles.
- Background agents share the working tree → don't commit while one is running (race). A research
  WORKFLOW does not touch the tree, so committing HANDOFF/vault while it runs is safe.
- **WORKFLOW FRAGILITY (post-mortem of the first teardown run).** Two causes, remember both:
  (1) SELF-THROTTLE — a wide concurrent fan-out (5 agents × many web searches) all hit ONE shared
  account rate-limit bucket → `429`/`529`/`503` + backoff → crawl. FIX: batch (2×2 = peak 2).
  (2) The KILL SHOT was an INTERRUPT — the in-flight agents' last log line is
  `[Request interrupted by user]`, aborted at the SESSION COMPACTION boundary; a background
  workflow does NOT survive a hard session interrupt (killed, never resumes, no notification).
  FIX: keep research fan-outs NARROW + FAST, launch with context headroom, or split so each
  sub-run returns before a compaction. Don't leave a long fan-out as the only thing across a likely compact.

### Decisions of record (don't relitigate)

- Verify-first tagline (locked); "Lighthouse for your agent harness" = the meme-handle.
- Monetization ONLY in vault; local-first, no data lock-in; typed spec = ground truth.
- Guards KEPT (hidden kind, low value to remove). Viral finding ANONYMIZED + areas-for-improvement.
- Existing surfaces STAY; capability-diff is the un-hold priority; observe depth is frozen (built).

## Don't re-read unless the task needs it

- `startup/harness-tech-direction-2026.md` — the full competitive tech + monetization + exit (vault).
- `startup/competitor-teardown-2026.md` — the deep agent-eval-testing teardown + poach-list (vault).
- `research/harness-observability-direction.md` — the tech direction of record.
- `research/roadmap.md` — the front-door roadmap.
