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

**Branch `claude/rules-compiler-python-3xqhtd`** — **PR #74 OPEN**, `refactor(audit):
decompose the rule-map pipeline + design-of-record docs`. HEAD `8616589`. Contains a
pipeline REFACTOR + the ALPHA/experimental pass (below). **Not yet merged** — offered
to watch CI + merge; user may want to review first. (#72 merged `cd61af5`; #73 merged
`2a86291` = full ESLint/Pylint parity; branch restarted from main for #74.)

**Merge protocol:** if #74 is already merged when you resume, it's finished — restart
this branch from `origin/main` for any follow-up, never stack on merged history.

### What PR #74 contains (all built + green locally; full suite passes bar the known env-only `dialect-drift`)

- **Pipeline REFACTOR (behavior-preserving)** — `segmentInstructions` (CC 108) → a thin
  dispatcher over pure per-block helpers; `extractMarkedRules` (CC 39) → `markerFor`/
  `markerRuleFrom`; the rescue ladder → a module-level `RESCUE_SOURCES`; the tier split →
  a pure `partitionCandidates`; new `src/rule-signals.ts` (FORM_HEAD/RULE_PREDICATE/
  NORM_SIGNAL in ONE home); exported `LANE_META` (category→glyph+label, CLI reads it).
  `segment.ts` + `rule-routing.ts` went ~27 lint warnings → 0. **Fable differential-fuzz
  reviewed** (3.6k output comparisons, real+adversarial+fuzz): zero divergence.
- **Rule map marked ALPHA/experimental** — HTML report: rule section DEMOTED below the
  deterministic sections + an `experimental` badge; CLI header `Rule map [experimental]`.
  Public docs (`verifying-instruction-files.md`, `what-vigiles-catches.md`) frame it as a
  preview + document the confident/possible/skipped tiers.
- **`research/rule-enforcer-design.md` §8 = the SCOPE-FREEZE (load-bearing).** The map's
  SHAPE is FROZEN (`segment→merge→route→LANE_META`); changing it needs a MEASURED
  precision/recall win, not a vibe. Marked backlog (broaden dogfood #1, Ruff, recall
  tuning, …) — default answer to "improve the map?" is NO unless #1 or measured. §9 =
  the OSS-e2e/LLM-in-CI answer: the MAP is model-free → already CI-dogfooded on real OSS
  (`rule-routing-oss`/`rule-catalog-oss`); only synthesis/behavioral tiers are model-gated
  → on-sub + manual, never CI. **Read §8 before touching the rule map.**

### Rule map = ALPHA + FROZEN. Backlog is MARKED, not chased (design doc §8)

Do NOT sink effort here — the detection problem is undecidable, tuning is infinite.
Pre-approved only: broaden the deterministic dogfood corpus (#1, no model needed), or a
MEASURED win. Still-open LOW bugs (roadmap): strip a leading `<linter>/` prefix before
the catalog lookup; don't over-suppress a rule bullet under an H2 like `## Rules`; honor
checkbox markers (`- [ ] enforce(...)`); probe a real linted file (not hardcoded
`src/index.ts`); Codex corpus parity (vendored corpus is CC-only).

## Design-of-record

- **`research/rule-enforcer-design.md`** — THE front door (STATUS: ALPHA). Pipeline
  diagram, the rescue-ladder/no-signal-fold decisions, the category↔lane↔glyph table,
  §8 scope-freeze+backlog, §9 testing. Read FIRST. (`rule-enforcer-multilang-design.md`
  is the older build-log; it defers to this doc.)
- **`research/dogfood-corpus.md`** — the dogfood map + policy (read before touching any
  dogfood artifact). The word "dogfood" covers FOUR different things — only
  `test/dogfood/` is the SHA-pinned vendored corpus; `examples/harness/dogfood/`=skill
  examples (model-gated MANUAL), `rule-enforcer/gold/`=package-internal, `research/audit-captures/`
  =captured audit OUTPUT (not tests).

## Gotchas (still live)

- **CI won't trigger on Claude-authored commits** — `ci.yml` fires on `pull_request` but
  GitHub suppresses workflow runs for commits authored by `Claude <noreply@…>`. If a PR's
  checks don't start: Approve-and-run-workflows in the PR UI, or Close→Reopen the PR.
  (`pr-title.yml` on `pull_request_target` always runs.)
- **Real-model evals run in-container on the SUBSCRIPTION** (`claude -p`; `$0` metered).
  Cold start ~20s+; a first probe may time out — retry longer.
- **A SKILL.md is NOT a skill unless registered** — bare `SKILL.md` in cwd never loads;
  use `arm.pluginDir`/`skillsDir`. `CLAUDE.md` DOES auto-load as memory.
- **The 100% coverage gate is an EXPLICIT allowlist** in `vitest.config.mjs`
  (`coverage.include`). A new pillar file must be added there + real-IO seams marked
  `/* v8 ignore */`.
- **`measure()` is SINGLE-arg** — `measure(spec)` where `checks`/`trials`/`model` live
  INSIDE the one object. (Root `CLAUDE.md` eval.ts desc still wrongly says
  "measure(spec, { trials, checks })" — fix the spec later.)
- `CLAUDE.md` (root + `src/` + `research/`) is COMPILED from `.spec.ts` — edit the spec +
  recompile (`node dist/cli.js compile <spec>`), NEVER hand-edit (a PostToolUse hook does).
- **COMMIT SIGNING is BROKEN in-container** (0-byte pubkey) → "Unverified"; email correct.
- `dialect-drift.test.ts` fails LOCALLY (installed vs pinned claude-code); CI pins it. Env-only.
- **`add_repo` is same-owner only** — fetch external files via
  `curl https://raw.githubusercontent.com/OWNER/REPO/BRANCH/PATH` (through the proxy).
- Commits/PR: NO session links / NO raw model-id strings. Conventional-Commit titles;
  a public-API removal/rename needs `!` (drives the semantic-release major bump).

## Don't re-read unless the task needs it

- strategy KB — PRIVATE `zernie/mine` repo under `vigiles/` (`add_repo zernie/mine`).
- `research/roadmap.md` — the front-door (technical) roadmap.
