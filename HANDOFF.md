# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** (`.claude/hooks/session-handoff-check.sh`) nudges you at
> ≥5 commits without a refresh.

## RESUME HERE — `claude/lint-inline-mode-go56av` — PR #49 OPEN + GREEN; merge HELD pending founder

**One PR for the whole branch** — the Lighthouse `audit` refactor, off
`claude/lint-inline-mode-go56av` as one `refactor!` (breaking: `--deep`/`--measure`/
`--fast`/`--no-measure` all removed; battery no longer a default — now CUT entirely).
**PR #49 is OPEN and CI is GREEN.** Merge is **HELD** (the merge-when-green cron was
deleted) because the founder is rethinking audit's value + wants an adoption-gateway
feature. **Ask before merging.**

**State:** committed + pushed (`22d5a4b`). Local suite: 1697 pass, only the env-only
`dialect-drift` fails here (container CC tool set ≠ baseline; CI pins it). build incl.
report + fmt + lint clean.

### What this branch is

1. **Lighthouse `audit`** (renamed from `scan`): **FOUR** deterministic category RINGS
   — Truthfulness / Triggering / Structure / Tested (weighted A–F) + inline fixes + a
   shareable **HTML report** + the versioned **`AuditReport` JSON** (`src/audit-report.ts`,
   `schemaVersion`) everything renders from (HTML / `--json` / future upload).
2. **Report stack** = a real Vite + React + shadcn single-file app (`report/`), built to
   `dist/audit-report.template.html` (`scripts/build-report.mjs`, in `npm run build`).
3. **Read-vs-run consent** (`decideExecute`, `src/scan-trigger-suggest.ts`): a plain
   `audit` is a DETERMINISTIC READ (nothing executes, safe anywhere). The TWO executing
   checks — live MCP (own-repo) + trigger-rate (model) — share ONE consent: at a TTY
   ask-once + remember in `.vigilesrc.json` (`audit.measure`); headless = read + nudge.
   NO execution flag. `audit` is a LOCAL report (Lighthouse), NOT a CI step (CI uses `lint`).

### The SAFETY BATTERY was CUT from audit (2026-06-27) — "no half-made shit pre-release"

- `audit` has NO Safety ring. Running arbitrary hooks safely needs cross-platform
  confinement; bubblewrap is Linux-only → a default battery would be Linux-confined /
  Mac-unconfined. Narrowed out rather than shipped half-made.
- **The confinement IMPLEMENTATION is KEPT, only the audit wiring is parked.**
  `src/sandbox.ts` + `src/egress.ts` are intact and still drive `runHook({sandbox})` /
  `runHarnessTest` / the testing-API battery (`guardrail-check.ts`). What was deleted is
  `src/audit-battery.ts` (the audit wrapper) + the CLI headless battery path.
  Re-promotion = a re-WIRE once a cross-platform backend (env-scrub ephemeral floor /
  macOS `sandbox-exec`) lands, NOT a rebuild. (Recorded in `audit-lighthouse-design.md`.)
- The battery lives in the `vigiles/testing` API now — opt in explicitly via
  `assertBlocksDisasters` (no zero-config-safety promise to break).

### This session's work (all on top of the battery cut, all pushed)

- **5 Codex PR-review bugs fixed** (all real):
  - auto trigger tier was BROKEN — `minPrompts=6` but irrelevant bank had 4; gate hits
    both arms → every skill "unmeasured." Expanded bank (`src/audit-prompts.ts`) + test.
  - `isEmptyMachine` ignored `inlineHooks` → inline-hook-only harness graded F/0. Fixed
    - test (`src/audit-score.ts`).
  - trigger-tier model gate was Claude-only → Codex never measured. Made harness-aware
    (`src/cli.ts`, `adapter.name==="codex"` self-reports via `codexDriver.available()`).
  - `AuditReport` inventory counted only file-backed hooks → JSON/HTML said "0 hooks"
    for inline-only. Now `hooks.length + inlineHooks` (`src/audit-report.ts`).
  - consent disclosure read Claude env for cost wording → Codex repo told "no model
    access" wrongly. Threaded harness into `buildExecuteDisclosure` (`src/cli.ts`).
- **Adoption-gateway design doc** written: `research/adoption-gateway-preview.md`.
- **Adoption-gateway preview v1 SHIPPED** (the founder's "build it bro"):
  `src/adoptability.ts` — `verifyDraftedRefs` (pure deterministic verdict, reuses
  `checkLinterRule` + compile validators) + `parseDraftJson` (tolerant) +
  `runAdoptabilityTier` (injectable drafter; the one real model call is the only
  v8-ignored seam) + `formatAdoptability`. Fully unit-tested with a FAKE drafter
  (`src/adoptability.test.ts`, 14 tests) incl. the hallucinated-rule-is-broken
  property. Wired into `audit` behind the EXISTING consent — `surfaces.adoptableRefs`
  makes a bare CLAUDE.md repo consent-eligible (the prime adoption target). Optional
  additive `adoptability?` field on `AuditReport` (+ `report/src/schema.ts` mirror) +
  an HTML section (`report/src/components/Adoptability.tsx`). Docs in README + cli.md.
  v1 = Claude Code only (drafting drives the `claude` CLI); Codex gets a LOUD deferral
  note (harness-parity). NOTE: the REAL model draft was NOT run end-to-end here (no
  model auth in this container) — the deterministic half is fully proven, the LLM half
  is the injectable v8-ignored seam + parse tests. A live spike is the gated follow-up.

### DO NEXT

- **MERGE DECISION is the founder's** — PR #49 is green (was, before these pushes; CI
  re-runs). Either re-arm merge-when-green or merge. Don't merge without an explicit go.
- **Adoptability follow-ups** (v1 shipped): a LIVE real-model spike (gated on auth) to
  validate the draft prompt's recall; extend to skills/subagents (flag-gated); caching
  via `eval-cache.ts`; Codex drafting (the deferred harness-parity gap). See
  `research/adoption-gateway-preview.md` build increments 1 + 4.
- Deferred (not blockers): OSS FP sweep (needs open-net machine — git scoped to
  `zernie/vigiles` here); env-scrub/`sandbox-exec` backend (re-earns the Safety ring);
  hosted dashboard + `audit --upload`.

### Gotchas

- **GIT IS REPO-SCOPED HERE** — clones reach only `zernie/vigiles` (403 elsewhere). npm
  registry IS reachable. **No bubblewrap here** → `sandboxAvailable()` false (intended).
- **`src/dialect-drift.test.ts` fails in THIS container only** (CC version). CI pins it.
- `CLAUDE.md` + `src/CLAUDE.md` are COMPILED from `.spec.ts` — edit the spec, recompile
  (`node dist/cli.js compile CLAUDE.md.spec.ts`); never hand-edit the md.
- **Commits: NO session links / NO model IDs** (auto-classifier blocks them).
- Use `mcp__github__*` for PR ops (no `gh` here). Watch PR via `subscribe_pr_activity`.

### Decisions of record (don't relitigate)

- **`audit` reads; the prompt runs.** LOCAL report (Lighthouse), NOT CI (`lint` is CI).
  ONE consent, asked-once at TTY. NO execution flag. Automation → `vigiles/testing` API.
- **Safety battery CUT from audit; impl KEPT/parked** (re-wire when confinement is
  cross-platform). Execution opt-in UNIFORMLY across OSes (state-safety > the wow).
- **Adoption gateway = LLM proposes, deterministic disposes.** Extraction is an LLM job;
  verification is the moat. Deterministic spec-creation is OUT (regex catches only
  machine-shaped low-value tokens; `adopt.ts` already infers no rules).
- **`audit` is the adoption front door** (rings + fixes + report, free/safe-anywhere).
- Public docs name USER BENEFIT (no `moat`/`flywheel`, no `research/` links, no VC names).
- `startup/` git-crypt vault stays LOCKED unless a task needs it (leak rail).

## Don't re-read unless the task needs it

- `research/adoption-gateway-preview.md` — the next feature's design (LLM+deterministic).
- `research/audit-lighthouse-design.md` — full audit design + every decision incl. the cut.
- `research/roadmap.md` — `🚀 Launch readiness` front door.
- `startup/` — git-crypt vault (LOCKED).
