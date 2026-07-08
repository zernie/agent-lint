# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file so a new session starts oriented — **read it
> first.** Git-TRACKED + EPHEMERAL container, so an update persists ONLY if you
> **commit + push**. **REFRESH IT before you end the session** (and on any "handoff"
> request). A **Stop hook** nudges you at ≥5 commits without a refresh.
>
> ⚠️ **THIS FILE IS PUBLIC** (open-source repo). NO STRATEGY here — business
> direction, monetization, competitive framing, and personal plans live ONLY in the
> `startup/` vault. HANDOFF may POINT to the vault, never name or describe its
> contents. NEVER name a specific user/company/figure here (public). (See `doc-tiers`.)

## RESUME HERE

**Branch `claude/vigiles-cost-analysis-9ko9mv`** (name is misleading — the work is
ADOPTION FIXES, not cost analysis) → **PR #66 OPEN, merging-when-green.** This session acted
on a skills-monorepo FIELD REPORT (a team ran vigiles on a 46-skill CI library with no
`plugin.json` and hit blockers) — all 7 feedback points fixed.

**MERGE STATE (resume here first):** PR #66 open, **merging-when-green**; **subscribed to its
activity**; a `send_later` check-in (trigger `trig_01HgpKfkov7BQAJNzHtMNEoq`, ~14:44Z) re-checks CI
and **squash-merges into main with a CLEAN message (NO session link / model-id) when all 6 jobs
green**, else re-arms. If resuming: `get_check_runs` for #66 → merge if green, then **unsubscribe**.
Latest SHA `aa5526d` (a HANDOFF-refresh commit sits on top). CI jobs: validate/describe/check/test/
e2e/harness; `test` runs ~5-7 min and is always last. The lone allowed failure anywhere is env-only
`dialect-drift` (CI pins CC, so it passes in CI).

**CODE-REVIEW LOOP (done):** Codex-bot reviewed every pushed commit and found **13 real P2 bugs
across 5 rounds — ALL fixed + tested** (api-extractor surface, eslint void-expr, single-skill bundled
resources, root-SKILL.md coverage + colocation, sharedDirs-from-repo-root, scoped harness detection,
per-surface→repo-level fallback, hook-only + hooks-convention plugin shape, loadable-only surface
count, foreign-repo sharedDirs root, query-suffix vs glob-skip). Codex then **hit its usage quota**
(no more reviews incoming) — the loop ends by quota, NOT by proof of correctness. WATCH-OUT: the
single-skill-dir targeting + `.claude`-fallback subsystem generated most siblings; classes are now
closed + tested, but if a NEW real bug there surfaces, prefer a redesign or NARROWING the PR (drop
single-skill-dir) over another patch.

**Shipped (branch — `feat(scan)` + `fix(lint)` + docs):**

- **P0-1** `loadPlugin` recognizes THREE repo shapes — published plugin / bare `skills/*` library /
  plain `.claude/skills` user repo — via a new optional `PluginLayout.userSurfaceRoot` (`.claude`
  in the CC adapter; core stays agnostic, `.claude` literal only in the adapter). Root `skills/`
  WINS over `.claude/skills`. A single skill dir works. `LoadedPlugin.sources` maps each
  materialized key → its real on-disk path. Reads the PROJECT `.claude` only, never `~/.claude`.
- **P0-2** `vigiles lint` now SCOPES to an explicit dir arg (was: ignored the path, scanned the
  whole repo → reported foreign surfaces). `runLint` resolves ONE `scanRoot` (single existing dir →
  narrow; file / several / none → cwd, so **bare `lint` is byte-identical**) threaded into all 21
  surface appliers (replaced `process.cwd()`). Bugfix — only `lint <dir>` changes.
- **P1-3** skill-resources skips glob / placeholder refs (`* ? { } < >`) + `~/` home paths.
- **P1-4** OPT-IN `sharedDirs` config — a ref whose first segment is a declared shared dir also
  resolves at the repo root; scoped so nothing outside it is masked; default byte-identical.
- **P2-6** lethal-trifecta advisory collapsed to one line per unit. **P2-7** `docs/skills-monorepo.md`.

Files: `src/plugin-loader.ts`, `src/core/layout.ts`, `src/adapters/claude-code/layout.ts`,
`src/scan.ts`, `src/core/skill-resources.ts`, `src/core/types.ts` (`sharedDirs`), `src/cli.ts`
(scanRoot). Tests: `src/scan.test.ts`, `src/core/skill-resources.test.ts`, `src/scan-cli.test.ts`
(lint-scoping e2e), `src/adapters/claude-code/plugin-loader.test.ts`.

**NEXT (not blocking):** the feedback is fully addressed. The field report's exact "global
`~/.claude` skills appeared" symptom couldn't be reproduced from code (their env) — P0-2's
correct rooting closes it either way. Possible follow-up: the `init` ADOPT/untested discovery
also walks cwd; P0-2 scopes the lint appliers, adopt-discovery is a separate pass.

**TEST STATUS:** full vitest **2074 passed** locally; the only failure is env-only
`dialect-drift.test.ts` (installed vs pinned CC — CI pins it). eslint/tsc/test:types/fmt/api all
green locally.

## Don't re-read unless the task needs it

- vault `startup/` — unlock + read `startup/README.md` for the ID→name index; strategy is there.
- `research/roadmap.md` — the front-door (technical) roadmap.

## Gotchas (still live)

- **Real-model evals run in-container on the SUBSCRIPTION** (`claude -p`; `apiKeySource:"none"`,
  `$0` metered). Cold start ~20s+; a first probe may time out — retry longer.
- **A SKILL.md is NOT a skill unless registered** — a bare `SKILL.md` in a run's cwd never loads;
  use `arm.pluginDir` (`--plugin-dir`) or `skillsDir`. `CLAUDE.md` DOES auto-load as memory.
  vigiles WARNS (`unregisteredSkillFiles`). Verify activation with a style/`skillResolved` check.
- **The 100% coverage gate is an EXPLICIT allowlist** in `vitest.config.mjs` (`coverage.include`).
  A new pillar file must be added there AND its real-IO seams marked `/* v8 ignore */` (as
  `sandbox.ts`/`egress.ts` do). `services.ts`/`services-docker.ts` are now in it.
- **`measure()` is SINGLE-arg** — `measure(spec: MeasureSpec)` where `checks`/`trials`/`model`
  live INSIDE the one object (see `examples/harness/dogfood/skill-quality.eval.mjs`). Codex caught
  a 2-arg call that silently dropped `checks`. NOTE: the ROOT `CLAUDE.md` eval.ts description still
  says "measure(spec, { trials, checks })" — that's WRONG (fix the spec later). `runEval` (custom
  metrics via a `measure(ctx)` callback + `ephemeralEnv`) vs `measureArms` (a `checks` array, NO
  `measure`/`ephemeralEnv`) — don't confuse them.
- **`git add -A` sweeps test-scratch dirs** (`.tmp-genh-*`, `.tmp-compile-genh-*`,
  `.vigiles-test-types-tmp`, now gitignored) — prefer staging explicit paths after a test run.
- **Transient proxy TLS** — `claude -p` trials sometimes fail "Self-signed certificate / Unable
  to connect to API" (agent-proxy CA). Flaky, not fatal; re-run, don't read a single 0-tok trial.
- `CLAUDE.md` (root + `src/` + `core/` + `research/`) is COMPILED from `.spec.ts` — edit the spec +
  recompile (`node dist/cli.js compile <spec>`), NEVER hand-edit. (A PostToolUse hook recompiles.)
- **COMMIT SIGNING is BROKEN in-container** (0-byte pubkey) → "Unverified"; email correct. Don't amend.
- `dialect-drift.test.ts` fails LOCALLY (installed vs pinned claude-code); CI pins it. Env-only.
- **VAULT (`startup/`)** git-crypt, LOCKED at session start; strategy is there. Filenames + commit
  messages are PUBLIC → opaque IDs + generic `chore: vault` messages.
- **SCOPED-SESSION GITHUB ACCESS** — WebFetch blocked by net policy; WebSearch works. Cross-GitHub
  discovery via WebSearch or sourcegraph + `raw.githubusercontent`.
- Commits/PR: NO session links / NO raw model-id strings. Conventional-Commit titles.

## Decisions of record (don't relitigate)

- **`sharedDirs` is OPT-IN by design** (P1-4). Resolving a bundled `SKILL.md` ref against the repo
  root BY DEFAULT can mask a genuinely-missing bundled resource (a same-named file at root → false
  negative). So only a ref whose first segment is a repo-DECLARED shared dir gets root resolution;
  a repo that sets no `sharedDirs` is byte-identical to before.
- **`lint <dir>` scoping is a BUGFIX, not a breaking change** (P0-2). The path was silently ignored;
  now a single explicit dir narrows the scan. Bare `vigiles lint` (the CI-common case) stays
  whole-repo / byte-identical. Only someone who passed a dir AND relied on the accidental whole-repo
  scan sees narrower coverage.
- **`userSurfaceRoot` / `.claude/skills` reading is PROJECT-only** — never `~/.claude`. Keeps CI
  reproducible. The `.claude` literal lives in the CC adapter layout, not core (`core ⊄ adapter`).
- Repo is PUBLIC → strategy is VAULT-ONLY (`doc-tiers`). HANDOFF/research/CLAUDE.md/README = public.
  **Never name a specific user/company/$ figure in the repo** — one such mention was scrubbed from
  branch history this session via `git reset --soft` + force-push-with-lease.
- **R3 is EXPERIMENTAL** — lives on `vigiles/experimental` only, NOT in the README, NOT a
  stable-surface change. The Docker backend is real but the tier is unstable.
- **R3 safety posture (load-bearing):** the disposable container is the ONLY isolation; the run
  ENVIRONMENT's isolation is the operator's job. NEVER present `endpoints` / "can't phone home" as
  a live guarantee (false-safety) until the egress wall ships. Credential-scrub is OPT-IN for now
  (recommend `ephemeralEnv`); safe-default deferred because an over-aggressive scrub breaks claude auth.
- **Don't build a promptfoo config auto-converter** — a half-parser mis-maps unsupported assertions
  = false confidence. A mapping guide + worked example instead (shipped).
- **A code-quality / general-coding skill goes in `dev/` (the `vigiles-dev` plugin), NOT the
  shipped plugin** — vigiles verifies harnesses, it does NOT lint code (`dont-reimplement-linters`),
  so shipping one to users would muddy positioning. (User's call this session.)
- Vault filenames MUST be opaque IDs; commit messages for vault changes MUST be generic.
