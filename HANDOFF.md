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
> private `zernie/mine` repo under `vigiles/` (migrated 2026-07-13 from the old
> git-crypt `startup/` vault). HANDOFF may say strategy exists there, never name or
> describe its contents. NEVER name a specific user/company/figure here (public). (See `doc-tiers`.)

## RESUME HERE

**Branch `claude/skill-eval-cost-benefit-q4ivfp`** (name misleading — the work is a
PUBLIC-DOCS REVAMP, not cost analysis) → **PR #67 OPEN, merging-when-green.** The user flagged the
docs as over-claiming maturity + hard to scan; this session overhauled the README + docs.

**MERGE STATE (resume here first):** PR #67 open, **merging-when-green**; **subscribed to its
activity**; a `send_later` check-in (trigger `trig_01LX727g2VMn1qpe7k31eJ1o`, ~21:18Z) re-checks CI
and **squash-merges into main with a CLEAN message (NO session link / model-id) when all 6 jobs
green**, else re-arms. If resuming: `get_check_runs` for #67 → merge if green, then **unsubscribe**.
Latest SHA `f1d0a2d`. CI jobs: validate/describe/check/test/e2e/harness (`test` ~5-7 min, last).
Lone allowed failure: env-only `dialect-drift` (CI pins CC → passes in CI).

**Shipped (branch — all `docs:`):**

- **Version honesty** — STABILITY.md + README FAQ claimed "0.x"; real npm version is **12.7.0**
  (semantic-release cuts a major per breaking change). Fixed to v12 + honest framing. Root cause: the
  `package.json` `0.0.0-semantically-released` placeholder misread as "0.x". Added `vigiles/linting`
  to the stable entry-points list.
- **README scannability** — `More` link-farm → 3 Diátaxis buckets + index pointer; collapsed the dense
  audit/lint/test/eval reconciliation paragraph; trimmed Proof 2/3. Eval heading → "the only way to put
  a real number on cost."
- **docs/README.md** reorganized (Guides / Reference / Explanation) + 6 docs added that were missing
  from the index (harnesses, adapter-api, authoring-an-adapter, railway-subagents, faq, what-vigiles-catches).
- **Merges** — `related-tools`→`comparison`; `inline-mode`→`markdown-mode` (one no-spec on-ramp doc;
  NB inline mode is LIVE — only FRONTMATTER mode is disabled); `agent-setup`+`agent-workflows`→one guide.
- **`eval-architecture.md` (54KB design-of-record ADR) relocated `docs/`→`research/`** per doc-tiers:
  5 public links repointed (testing-api / measuring-skills), research/src relative paths fixed, added to
  research index + `status:`/`topic:` frontmatter, both `CLAUDE.md` + `research/CLAUDE.md` recompiled.
- **Codex-bot review** caught 1 real bug (the compiler surface is `vigiles/linting`, not `vigiles/spec`) — fixed.
- Kept standalone by JUDGMENT (merging would bloat, not help): `testing-matrix`, `migrating-from-promptfoo`.

Deleted: docs/{related-tools,inline-mode,agent-workflows,eval-architecture}.md (last one moved to research/).

**REPO ABOUT (USER ACTION — no tool/API access to set it):** paste into Settings→About —
desc "Like Lighthouse for your agent harness — verify your CLAUDE.md/AGENTS.md, skills & hooks are real,
then test and measure they actually work. Claude Code + Codex.", website https://zernie.github.io/vigiles/,
topics: claude-code codex agentic-coding ai-agents llm claude anthropic developer-tools cli linter testing
evals typescript mcp skills.

**NEXT (not blocking):** none required. Candidate follow-up: a deterministic `no-internal-links-in-public-docs`
lint rule (P1 roadmap) — currently hand-enforced (this session verified it by grep).

**TEST STATUS:** touched-gate dogfoods pass locally (research-index, self-command-refs, doc-command-coverage,
orphans, inline) + build / integrity / orphan-docs / fmt / no-internal-links green. Full vitest not re-run
(docs-only change); env-only `dialect-drift` still fails locally (CI pins CC).

## Don't re-read unless the task needs it

- strategy KB — now in the PRIVATE `zernie/mine` repo under `vigiles/` (migrated 2026-07-13 from the old git-crypt `startup/` vault); `add_repo zernie/mine`, index in `vigiles/CLAUDE.md`.
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
- **Strategy KB MOVED (2026-07-13)** out of this repo → private `zernie/mine` repo, `vigiles/`
  (plain text). No more git-crypt / `startup/` vault here; there is nothing to unlock.
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
