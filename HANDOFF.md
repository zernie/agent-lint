# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** nudges you at ≥5 commits without a refresh.

## RESUME HERE

**Branch `claude/tool-positioning-market-65fvvh`.** This session was a STRATEGY session
that landed a DIRECTION decision + STARTED its implementation. No PR opened yet.

The session: user pushed on "why is our offering thin vs funded agent-harness startups?"
→ competitive/tech research (vault unlocked) → decided the whole tool direction + started
building the observability ledger.

**THE DIRECTION (decision of record).** vigiles is ONE LOOP: **declare what the harness
should do (typed spec) → check reality against it.** Four instruments are FACETS of it:
VERIFY (lint/cross-ref), GATE (compiled hooks), MEASURE (evals on your sub), OBSERVE (a new
local **flight-recorder ledger**). Spine: **the typed spec is the declared GROUND TRUTH** —
that's what makes observation PRECISE on deterministic surfaces (vs a black box needing an
LLM-judge). Local-first + **agent-readable**; NOT hosted runtime telemetry (that's the
crowded Camp-1 trap w/ wrong skill-set + privacy risk). Existing surfaces ALL STAY (they
become the sensors); it is NOT a pick-your-tools framework.

### What landed this session (all pushed)

- **Direction elevated to 3 tiers:** root `CLAUDE.md` NEW `## Direction` section (north-star;
  edit the SPEC `CLAUDE.md.spec.ts` + recompile, ~47 rules) + `research/harness-observability-direction.md`
  (full TECH record, indexed) + `startup/` vault (tech **+** monetization/exit — vault ONLY).
- **`src/observe.ts` + `src/observe.test.ts`** — the FOUNDATION: `.vigiles/runs.jsonl` ledger.
  Versioned discriminated union (hook/agent/skill/eval/capability-diff), best-effort append
  (never breaks a session), tolerant reader (torn lines skipped), typed `observationsOfKind`.
  Placement = composition root (NOT core — not the ref-verify domain; NOT an adapter — kinds
  are harness-neutral). tsc+eslint+prettier clean, 7/7 tests green.
- **Vault docs** (`startup/`, git-crypt): `harness-tech-direction-2026.md` (two-camps tech map,
  telemetry/default-install fork = local-first, pseudocode DX, fundability+exit thesis) +
  cross-links in `funded-adjacency-2026.md` + index in `startup/CLAUDE.md`.
- **OBSERVE LAYER — largely BUILT (all pushed, full suite green except known dialect-drift):**
  - `src/observe.ts` ledger + 8 unit tests.
  - **All 5 emit kinds wired:** compiled-hook gate (`emitGate`) + subagent contract rail
    (`agentHookCommand`) in `src/cli.ts`; skill-fire (`skillStartCommand`); trigger-rate
    recall/precision (`measureTriggerRate` in `src/eval.ts`); capability-diff (audit `--capability-diff`).
  - **`vigiles audit` RENDERS it** — `formatLedgerSummary` (pure, tested) prints a "Flight
    recorder" section (counts + recent denials). Smoke-tested end-to-end.
  - **`debug-my-harness` skill** (model-invocable) — reads the ledger to diagnose; + dogfood
    trigger eval; loads clean; skill enumerations + keyFiles synced (3→4 model-invocable).
  - `.vigiles/runs.jsonl` is **gitignored** (runtime artifact, never committed).
  - **AuditReport JSON + HTML integration DONE** — `summarizeObservations` (pure, shares
    denial logic w/ the terminal formatter) → an ADDITIVE optional `observations` field on
    AuditReport (NO schema bump — additive-only precedent). `audit --json` + the HTML report
    (a `report/` Observations component + `report/src/schema.ts` mirror synced, parity test
    green) both render it. Verified end-to-end (`--json` + built template).

### DO NEXT (one heavier piece remains)

1. **capability-diff PR comment** — the GHA integration. Building blocks EXIST:
   `scan/audit --capability-diff <base>` computes it (+ emits a ledger record now);
   `action.yml` already posts a sticky PR comment (find-by-marker). Wire: compute base ref in
   the action → run capability-diff → fold into the comment. GHA-heavy → dogfood in this
   repo's own CI (prod-grade-gha-cli).

- Optional: unify the legacy `hook-observations.jsonl` writer fully into the ledger (both are
  written today for back-compat — additive, no removal yet).

### ALSO STILL OPEN (separate track — don't lose)

- **PR #54 on branch `claude/haretrail-dogfood-pvdo9t`** — being WATCHED by hourly cron
  `5438c724` (report green / fix red / CronDelete when merged). Merge is the USER's call.
  Unrelated to this session's branch.

### Gotchas

- **`CLAUDE.md` is COMPILED** from `CLAUDE.md.spec.ts` — edit the spec + `node dist/cli.js
compile CLAUDE.md.spec.ts`; NEVER hand-edit. Same for `src/`, `src/core/`, `research/`
  CLAUDE.md (all in `.prettierignore`). A recompile-on-spec-change guard hook auto-runs.
- **VAULT (`startup/`) is git-crypt encrypted + LOCKED at session start.** git-crypt is NOT
  preinstalled → `apt-get install -y git-crypt`, then `git-crypt unlock <keyfile>` with the
  user's base64 key (they paste it). Files re-encrypt on commit; verify a committed blob is
  `\0GITCRYPT` before trusting. Key NEVER in the repo (scratchpad only).
- **RESEARCH INDEX SYNC**: a new `research/*.md` needs a `keyFiles` line in
  `research/CLAUDE.md.spec.ts` + `status:`/`topic:` frontmatter, else `src/research-index.test.ts` fails.
- **RUN ESLINT on new files** — `no-confusing-void-expression` (a void-returning arrow
  shorthand → add braces) + unused imports are ERRORS; `[...str]` too (use `Array.from`).
- `prettier --check .` covers `HANDOFF.md` — `npx prettier --write HANDOFF.md` before commit.
- `validate.test.ts` has a hardcoded `DEFAULT_RULES` literal that breaks on a new rule.
- `dialect-drift.test.ts` fails LOCALLY (installed claude-code drifted from pinned 2.1.187);
  CI pins it. Env-only, not a real break.
- Commits/PR: **NO session links / NO model IDs** (auto-classifier blocks). Conventional-Commit title.

### Decisions of record (don't relitigate)

- **Monetization lives ONLY in `startup/` vault.** Tech direction can live in `research/` +
  root `CLAUDE.md`. Public docs = user benefit (no moat/flywheel, no `research/` links).
- **Local-first, agent-readable observability — NOT hosted runtime/OTel prod ingestion.**
  Record our OWN instruments locally; never sit in the request path.
- **Typed spec = the ground truth.** Observability is precise on deterministic surfaces
  (hooks/contracts/refs/capability) for free; skill-triggering (behavioral) needs
  `measureTriggerRate` (authored expectation) or a fuzzy proxy — never claim passive-catches-a-miss.
- Existing surfaces STAY; the ledger is connective tissue, not a replacement.
- Adoption wedge: the "100s of how-to-write-skills blog posts" = demand no tool serves →
  "measure whether your skill actually fires." Fundability/exit detail: vault only.

## Don't re-read unless the task needs it

- `startup/harness-tech-direction-2026.md` — the full competitive tech + monetization + exit (vault).
- `research/harness-observability-direction.md` — the tech direction of record.
- `research/measurement-authority.md` / `research/roadmap.md` — pivot + front-door roadmap.
