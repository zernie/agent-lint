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
positioning → a 2-pass Fable pivot re-review → launch-surface CUTS → a competitor-teardown
workflow (STILL RUNNING, background).

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

### IN FLIGHT + DO NEXT

- **RUNNING (background): competitor-teardown workflow** (`wf_17aa399e-e38`) — 5 clusters
  (typed-spec frameworks / eval-testing / observability[Braintrust-deep] / gating-reliability /
  attestation) → synthesis. THROTTLED (transient rate-limits); 2/5 clusters back last check.
  On completion → **VAULT SAVE** per rule 6: `startup/competitor-teardown-2026.md` (full detail,
  depth-tagged, coverage map, indexed, cross-linked) + FOLD IN the two Fable pivot reviews +
  the anonymize/areas-for-improvement launch decision.
- **QUEUED: #2 capability-diff PR comment** (GHA — checkout PR base, run `audit --capability-diff`,
  fold into the existing sticky comment in `action.yml`; dogfood in this repo's CI). Sequenced
  AFTER the workflow to avoid throttle contention. User approved "in agent".
- Then the BUILD from the cohesion pass; the launch ARTICLE (behavioral finding, anonymized).

### ALSO OPEN (separate track) + Gotchas

- **PR #54 on `claude/haretrail-dogfood-pvdo9t`** — watched by cron `5438c724`. Merge = user's call.
- **VAULT (`startup/`)** git-crypt, LOCKED at session start → `apt-get install -y git-crypt` +
  `git-crypt unlock <keyfile>` with the user's base64 key; verify a committed blob is `\0GITCRYPT`.
- `CLAUDE.md` (root + src/ + core/ + research/) COMPILED from `.spec.ts` — edit the spec + recompile,
  NEVER hand-edit. Deleting a keyFiles-listed file → remove its keyFiles line first or compile FAILS.
- RUN ESLINT on new files (`no-confusing-void-expression`, unused imports = ERRORS; `[...str]`→Array.from).
- `dialect-drift.test.ts` fails LOCALLY (installed claude-code vs pinned 2.1.187); CI pins it. Env-only.
- Commits/PR: NO session links / NO raw model-id strings. Conventional-Commit titles.
- Background agents share the working tree → don't commit while one is running (race). The teardown
  WORKFLOW does not touch the tree (research only), so committing HANDOFF/vault while it runs is safe.

### Decisions of record (don't relitigate)

- Verify-first tagline (locked); "Lighthouse for your agent harness" = the meme-handle.
- Monetization ONLY in vault; local-first, no data lock-in; typed spec = ground truth.
- Guards KEPT (hidden kind, low value to remove). Viral finding ANONYMIZED + areas-for-improvement.
- Existing surfaces STAY; capability-diff is the un-hold priority; observe depth is frozen (built).

## Don't re-read unless the task needs it

- `startup/harness-tech-direction-2026.md` — the full competitive tech + monetization + exit (vault).
- `research/harness-observability-direction.md` — the tech direction of record.
- `research/roadmap.md` — the front-door roadmap.
