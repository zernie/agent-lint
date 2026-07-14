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

**Branch `claude/rules-compiler-python-3xqhtd`** — expand the **audit rule-compile tier**
(`src/rule-inventory.ts` + `src/rule-routing.ts` + `src/segment.ts`, backed by `compiler/`) from
ESLint-only toward **multi-language (Ruff + Pylint)** + a robust **segmentation** model (what text in
a freeform CLAUDE.md is even a "rule"). This is the AUDIT feature that suggests which prose rules can
be codified as lint rules — NOT the linter cross-ref engine (`core/linters.ts`), which already does
Python. **No PR opened yet.** Full vitest not re-run this session; targeted suites green + tsc clean.

**Design-of-record: `research/rule-compiler-multilang-design.md`** — READ FIRST. Grounded in 2 Fable
design passes + a real 20-repo OSS corpus; has the whole plan, the ConfigProbe/Intent-Realization
model, and the build order.

**Shipped this session (4 commits, pushed):**

- `docs:` the design doc (indexed in `research/CLAUDE.md`).
- `fix(segment):` corpus-grounded precision — `RULE_HEADING` `do`-substring bug word-bounded,
  `INDEX-SMELL` veto (`` `path` — desc `` bullets), anti-context headings, decoration-strip
  (`**Never**`/`✅`), ordered/emoji bullets, copulas out of the verb lexicon. +regression tests.
- `feat(rule-routing):` new `meta` category (agent-instructions ≠ code rules) + `unrouted` reframed
  as the explicit **"hard to codify"** bucket end-to-end incl. the report UI (`RuleInventory.tsx`).
- `feat(rule-inventory):` +curly / consistent-type-imports / no-only-tests intents (real docs name them).

**GROUNDED REALITY** (ran the real router on 8 LIVE CLAUDE.md/AGENTS.md): deterministic reuse is
**~2%** (2/118 segmented; was 0 before this session). WHY low — all honest, not bugs: (1) clean
AGENTS.md deliberately OMIT generic lint rules (2026 best-practice) → most content is
project/process/semantic → correctly "hard"; (2) when a doc DOES name a rule, the map often lacks it
(fixed 2); (3) rule-naming bullets lacking a lexicon VERB score "medium" → cut by the high-only
default (no-explicit-any/no-floating-promises named but dropped); (4) vigiles's OWN structured
CLAUDE.md → 0 segmented (the S0/S1 marker tier isn't built).

**NEXT LEVERS (ranked, user asked which of #1/#2 first — decide + go):** (1) a **RULE-NAME cue** in
`segment.ts` — a bullet naming an off-the-shelf rule → HIGH confidence (recovers named-but-medium
bullets, cheapest win); (2) the **S0/S1 structured tier** — compile vigiles-style docs w/
`**Enforced by**` markers (0 today, ~100% precision possible, the loop-closer); (3) the **`Intent →
Realization` regroup** + per-linter `ConfigProbe` (ruff/pylint) + Python intents (§6 of the design doc).

**Repro tools in `scratchpad/`:** `assess.mjs`/`probe.mjs`/`mini.mjs` run `routeRules` over
`realdocs/` (8 fetched real instruction files) + `configs/`+`eslint-configs/` (real linter configs
from the OSS sweep). Rebuild dist (`npx tsc`) before re-running after a src edit.

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
  discovery via WebSearch or sourcegraph + `raw.githubusercontent`. `add_repo` is **same-owner only**
  (v1) — can't add `astral-sh/ruff` etc. into a `zernie`-scoped session; fetch external files with
  `curl https://raw.githubusercontent.com/OWNER/REPO/BRANCH/PATH` (works through the proxy, disk-free).
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
- **Rule-compile tier design (this session, full record in `research/rule-compiler-multilang-design.md`):**
  the deterministic default is **PRECISION-first, low-recall by design** — compile a NARROW curated
  set VERY well, flag everything else CLEARLY as "hard to codify" (never silent-drop or overclaim);
  gradual expansion from what REAL docs actually name. Data model = **`Intent → Realization[]`** (one
  norm, N per-language realizations; match ungated, REPORT gated). Config-state = a **per-linter
  `ConfigProbe`** (ruff `select` REPLACES the default set; pylint is DENY-list/on-by-default) — parsing
  TOML/INI is DATA not exec, so it's safe + more complete than the ESLint grep (RCE path = only
  executable JS config). **Both-keys scoping** (language present AND that linter's config present) makes
  a wrong cross-language nudge structurally impossible. **ruff-absorbs-pylint is NOT a contradiction**
  (union of enabled across both tools). `compiler/catalog/rule-map.json` stays ESLint-shaped (model-tier
  superset); the deterministic Python seed lives in typed TS. **AGENTS.md is the #1 code-norm carrier;
  CLAUDE.md is a redirect stub; `.cursor/rules` absent in OSS.** Ruff+Pylint only (no mypy/flake8/bandit).
