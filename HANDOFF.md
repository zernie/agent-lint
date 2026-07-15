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

**Branch `claude/rules-compiler-python-3xqhtd`** — **PR #73 OPEN**, `feat: full
ESLint/Pylint parity in the audit rule map (catalog + Python synthesis)`. HEAD
`7fa3386`. **Waiting on CI to go green to SQUASH-MERGE** (a self-check-in via
ScheduleWakeup polls it). After merge: **deliver the Telegram Russian CC prompt**
the user asked for — the version that runs `vigiles audit`, reads
`vigiles-report.json` `ruleRouting`, and opens `vigiles-report.html` in the browser.
(#72 already merged as `cd61af5`; this branch was restarted from main for #73.)

**Merge protocol reminder:** if #73 is already merged when you resume, it's finished —
restart this branch from `origin/main` for any follow-up, never stack on merged history.

### What PR #73 contains (all built + green locally)

- **Pylint dynamic catalog + enabled-state** (`src/core/rule-catalog.ts`) —
  `enumeratePylintCatalog` shells `pylint --list-msgs` + `--list-msgs-enabled`
  (SECTION-AWARE), so a Python repo gets the SAME dynamic catalog + "documented but
  OFF" nudge as ESLint, plugins included; matchable by symbol OR numeric code.
  `mergeCatalogs` unions ESLint+Pylint for polyglot. `AvailableRule.linter`/`code`.
- **Python custom-rule synthesis** (`@vigiles/compiler`, Fable-designed) — `astgrep-py`
  engine on the trust gate; ONE gate, injected per-engine executors; rules are ast-grep
  JSON objects (data-not-code) via `@ast-grep/napi`+`lang-python`. Cross-engine leak
  proof (P2 py-no-print `$A` → abstain-gold) + provenance guard.
- **Two-tier detection** (`segment.ts`/`rule-routing.ts`/`cli.ts`/`audit-report.ts`) —
  CONFIDENT / POSSIBLE (rule-ish, below the bar) / SKIPPED (index/description/section/
  no-signal, each with a reason). POSSIBLE calibrated to NORM_SIGNAL bullets only; a
  no-signal reject is RESCUED to confident only via catalog/pattern/intent match.
- **OSS dogfood, CI-run** — `rule-routing-oss.test.ts` (3 vendored MIT Python AGENTS.md)
  - `rule-catalog-oss.test.ts` (drives the REAL pylint binary; authored config).
- **DX** — audit auto-gitignores `vigiles-report.{json,html}`, `--out=<dir>`, `--no-open`.
- **Design-of-record** — `research/rule-compiler-design.md` (crisp front door). 3
  frozen decisions: 2 linters (ESLint+Pylint), two-tier detection, show skipped.

### Codex review — ALL 11 threads addressed (don't re-fix)

Codex left 11 P2s across successive commits; every one is fixed on `7fa3386`:
per-linter provenance on marked rules; numeric-code markers (`C0116`) accepted;
report renders possible/skipped-only maps; ast-grep self-test try/catch; meta rules
counted in the terminal summary; medium-mode no-signal folds rescued-only;
`hasPythonSurface` requires a REAL pylint config (rc/section, all config filenames);
**mergeCatalogs combines colliding ids conservatively** (enabled OR-s, provenance
follows the enforcer, code alias tied to the enforcing entry — `no-else-return` is in
both linters); **consent resolved BEFORE routing the rule map** so a first interactive
`audit` enriches its own run (report still prints before the prompt — read leads).
Last two fixes = commit `7fa3386`; collision fix = `618c84e`.

### Roadmapped LOW (not in #73; need user go-ahead for a fast-follow)

- **X** — `rule-routing.ts`: strip a leading `<linter>/` prefix (`eslint/no-var`) before
  the catalog lookup, else a prefixed marked ref misses reuse. (W = consent-before-routing
  is now DONE in #73; X is still open — verified no prefix-strip in rule-routing.ts.)
- **Z** — `segment.ts`: don't over-suppress a rule bullet under an H2 like `## Rules`.
- **Y** — `rule-routing.ts`: honor checkbox markers (`- [ ] enforce(...)`).
- SKIPPED-inline-vs-json presentation; probe a real linted file (not hardcoded
  `src/index.ts`); Codex corpus parity (vendored corpus is CC-only); EvalDriver→core-port;
  no-model floor for the 9 skill evals; `no-internal-links-in-public-docs` as a lint rule.

## Design-of-record

- **`research/rule-compiler-multilang-design.md` §0.0** — the authoritative rule-map
  snapshot: TWO linters (ESLint + Pylint both full — catalog + enabled-state as of
  2026-07-15; Ruff NOT yet), the 4 reuse mechanisms, ranked next steps. READ FIRST for that
  tier. The remaining ESLint-only capability is custom-rule SYNTHESIS (Python target unbuilt).
- **`research/dogfood-corpus.md`** — the dogfood map + policy (read before touching any
  dogfood artifact). The word "dogfood" covers FOUR different things — only
  `test/dogfood/` is the SHA-pinned vendored corpus; `examples/harness/dogfood/`=skill
  examples (model-gated MANUAL), `compiler/gold/`=package-internal, `research/audit-captures/`
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
