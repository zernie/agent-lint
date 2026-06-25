# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** (`.claude/hooks/session-handoff-check.sh`) nudges you when
> ≥5 commits pile up without a refresh — it's live and dogfood-proven.

## RESUME HERE — launch-polish branch `claude/handoff-mylfen`; PR should be OPEN

**State:** the big pre-launch chunk is DONE on **`claude/handoff-mylfen`**. This
session added the **rule-cleanup + auto-adopt** batch on top and **opened the PR**
(see DO NEXT if the PR wasn't opened — check `mcp__github__list_pull_requests`).
Full suite: **1653 passed / 11 skipped / 1 failed** — the 1 fail is the env-only
`dialect-drift` (container CC ≠ pinned 2.1.187; green in CI). Lint **0 errors**,
fmt clean, `api:check` no drift, CLAUDE.md recompiled (38 rules).

**THIS SESSION's batch (one `refactor!` commit — BREAKING):**

- **`require-spec` → `require-instructions-spec`**, and **NARROWED**: only a
  `.spec.ts` satisfies it now — inline `<!-- vigiles:enforce -->` / `vigiles:`
  frontmatter NO LONGER do. Disable marker is now
  `<!-- vigiles-disable require-instructions-spec -->`. Clean break (no alias — no
  users yet). Renamed across code, `.vigilesrc.json`, tests, ~16 docs/research files,
  and `docs/rules/require-instructions-spec.md` (old doc deleted).
- **Rule GROUPS named** in `src/setup-plan.ts`: `STRUCTURAL_RULES` (the 9 FP-safe
  gate, default error) / `WORKFLOW_RULES` (require-instructions-spec + untested-\*,
  `--strict`) / `NUDGE_RULES` (never gate). Added **`--report-only`** (writes the
  whole gate at `warn`) threaded through `mergeProjectConfig`.
- **`prefer-compiled-hooks` → default OFF**; **`require-skill-spec` un-deprecated**
  (the consistent `require-<surface>-spec` parallel, default off).
- **AUTO-ADOPT** (the headline): new **`src/core/adopt.ts`** — `adoptMarkdown()` /
  `adoptToSpec()` faithfully convert an existing CLAUDE.md/AGENTS.md into a
  `claude()` spec (every heading → a verbatim prose section, NO rule inferred,
  always compiles). Wired into `init()` (adopt-or-scaffold) + `setupPillar1` (adopted
  targets are compiled). Proven **byte-identical below the integrity header** on a
  real e2e + a round-trip unit suite (`adopt.test.ts`, 15 tests). So
  `require-instructions-spec` is **green by construction** after `init` — a safety
  net, not a nag (resolves the old inconsistency). Design recorded in
  `research/install-enforcement-dx.md` (the auto-adopt section + group table).
- Swept stale **Level-0/1/2** markdown-mode comments; fixed 3 pre-existing branch
  lint errors (`scan-cli.test.ts`, `cli.test.ts`) that would've failed CI.
- `npx vigiles strengthen` is NOT a verb — it's the **`/strengthen` skill**; all refs
  use `/strengthen` (self-command-refs would flag `vigiles strengthen`).

**DO NEXT:**

1. **If the PR isn't open**, open it from `claude/handoff-mylfen` → `main`. Title
   needs `!` + the BREAKING CHANGE is the `require-instructions-spec` rename/narrow.
   Then `subscribe_pr_activity` to watch CI.
2. Launch builds (separate from polish): ecosystem-benchmark v0 + the method-first
   article + README 60-sec proof/GIF (see `research/pre-release-focus.md`).

**OPEN IDEA (not built):** the deterministic adopt converter falls back to a `raw`
tier (one synthesized `Overview` section) for heading-less / intro-bearing files —
content preserved but the diff adds a heading. A compiler passthrough primitive
would make `raw` truly byte-identical; not needed yet (agentic path handles
irregular prose; structured tier is byte-identical).

### Gotchas (read before trusting test output)

- **REAL-MODEL TIERS RUN HERE (Claude Code web).** No `ANTHROPIC_API_KEY`, but the
  `claude` CLI on PATH is AUTHENTICATED via session OAuth. Use `eval` /
  `scan --trigger` / `measureTriggerRate` to dogfood the real-model tier — do NOT say
  "needs quota / not exercisable."
- **`src/dialect-drift.test.ts` FAILS in THIS container** — env-only (container CC
  version vs validated 2.1.187). CI PINS CC → green there. By design.
- **Auto-adopt + compile in a tmp dir fails to resolve `vigiles/spec`** unless vigiles
  is installed (devDep + `npm install`) — same as any scaffolded spec. The repo
  self-resolves `vigiles/spec`, so e2e adopt→compile works inside the repo tree. The
  round-trip is proven model-free in `src/core/adopt.test.ts` (compileClaude direct).
- `etc/*.api.md` is the surface gate (`npm run api:check`); regenerate via
  `node scripts/api-extractor.mjs --local` after an intentional API change.

### Decisions of record (don't relitigate)

- **The wedge:** vigiles is the author-time / deterministic / pre-run + typed-spec
  play. NOT a linter. Don't fight agnix for the linting crown.
- **Spec-first + ejectable + auto-adopted:** the agent writes the spec, `init` adopts
  your existing files faithfully, you can always `vigiles eject`. Markdown demoted to
  floor/eject-target (inline kept; frontmatter parked).
- **Rule groups, NOT a preset menu** (Clippy/Biome best practice): structural (error,
  default) / workflow (`--strict`) / nudge (warn). `--report-only` is an orthogonal
  severity dial. Presets EXPAND to explicit `.vigilesrc.json` severities.
- Public docs name the USER BENEFIT (no `moat`/`flywheel`, no `research/` links, no
  VC/firm names — those live in the git-crypt `startup/` vault; user has the key).

### Gotchas (ops)

- CC-on-web: GitHub via `mcp__github__*` (NO `gh` CLI). Before commit: `npm run build`
  + `npx vitest run` + `npm run fmt:check` + `npm run lint`; `self-command-refs` fails
  CI on a stale `vigiles <cmd>` ref (scans `skills/` too). Conventional commits + `!`
  on breaking. NO session links / model IDs in commits. Trust `origin/main`.

## Don't re-read unless the task needs it

- `research/install-enforcement-dx.md` — install groups + the auto-adopt design.
- `research/pre-release-focus.md` — launch sequence + Positioning lock.
- `research/roadmap.md` — `🚀 Launch readiness` front door.
- `startup/` — git-crypt vault (LOCKED; unlock with the saved key).
