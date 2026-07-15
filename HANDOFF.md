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

**Branch `claude/rules-compiler-python-3xqhtd`** — **PR #72 MERGED** into `main` as
`cd61af5` (squash, all 6 CI jobs green). Branch was RESTARTED from `origin/main`
(now at `cd61af5`) per the merged-branch protocol — a merged PR is finished, so any
new work is a FRESH change on this same branch name, never stacked on merged history.

**What #72 shipped (v13):** the merged squash title was `feat(audit)!: prose→lint-rule
routing map (ESLint + Pylint) + dogfood CI-enforcement + repo-structure pass`. Three
things in one:

- **Rule-routing map** — `vigiles audit` previews which prose rules can be codified as
  lint rules (ESLint full incl. dynamic catalog under own-repo+consent; Pylint
  routing-only). 4 lanes: reuse (⚙ config-line) / hook / **custom rule (⚙, doable/opt-in)**
  / **judgment call (✎, undecidable)**. The `pr-to-lint-rule` gated-synthesis skill
  (REUSE-first → intent+codebase → synth rule + independent intent-test → TRUST GATE
  P=R=1.0 else ABSTAIN) is the hand-off target. `AUDIT_SCHEMA_VERSION` bumped 1→2.
- **Dogfood CI-enforcement** — `research/dogfood-corpus.md` is the index (every
  artifact → is-it-CI-enforced → by-what) + policy; the `dogfood-vendoring-policy`
  CLAUDE rule points at it. `compiler/gate.js` now ASSERTS its kept/abstain verdicts
  (was print-only) + 2 new `check`-job CI steps run it and `bench/corpus/verify*.mjs`.
- **Repo-structure pass** — `dev/`→`.claude/skills/` (contributor skills, unshipped);
  `schemas/`→`src/schemas/`+DEPRECATED.md; `fixtures/`→`test/fixtures/`; `etc/`→
  **`api-surface/`** (API-contract dir, lockfile-class); human scripts→`tools/` (+README);
  `research/dogfood/`→`research/audit-captures/`. Root `CLAUDE.md` gained a `## Layout`
  section = a desc per every root dir. **Verdict from the investigation: 8/10 hexagonal,
  CI-enforced; adapters symmetric via the adapter-contract registry loop.**

## LATEST (2026-07-15) — Pylint dynamic catalog + enabled-state (unpushed until commit)

Closed the ESLint-vs-Pylint asymmetry in the audit rule map (was "Pylint routing-only"):

- **`enumeratePylintCatalog`** (`src/core/rule-catalog.ts`) — shells `pylint --list-msgs`
  plus `--list-msgs-enabled` (SECTION-AWARE — the `Disabled:`/`Non-emittable:` sections are
  not misread as enabled), so a Python repo now gets the SAME dynamic catalog + "documented
  but OFF" nudge as ESLint, **plugins included** (W9xxx). Rules matchable by symbol OR code
  (`missing-function-docstring` / `C0116`). The deferred "inverted-polarity ConfigProbe" is
  UNNECESSARY — `--list-msgs-enabled` gives the enabled set directly.
- **`mergeCatalogs`** unions ESLint + Pylint for a polyglot repo; `computeRuleRouting`
  (cli.ts) enumerates both under the SAME own-repo + `audit.measure` consent, pylint gated
  on `hasPythonSurface` (a `.pylintrc`/`pyproject.toml`/`setup.cfg`) so a pure-JS repo never
  spawns pylint. `AvailableRule.code` alias + the `routeRules` map-build tweak (flatMap).
- Proven end-to-end on a real Python fixture: `invalid-name`→config-line+enabled:true,
  `C0116` (disabled in config)→enabled:false. Unit-tested (parse/merge/section-aware/dedup);
  live pylint+eslint integration tests pass; rule-catalog.ts 100% covered.
- **ONE gap remains** (roadmapped MEDIUM): Python custom-rule SYNTHESIS — `@vigiles/compiler`
  emits ESLint rules only; a Python target (ast-grep YAML rule is the cheap path) is unbuilt.
- Docs updated: `research/rule-compiler-multilang-design.md` §0.0 (+ per-linter + What's next),
  `docs/verifying-instruction-files.md` linter-coverage line, roadmap (+2 items).

## NEXT — the fast-follow (4 Codex P2s, all roadmapped as LOW)

Codex review on #72 surfaced 4 small correctness nits, now captured in
`research/roadmap.md` (right after the probe-file item, ~line 832). All LOW, none
block anything; the map still routes correctly, these sharpen edges:

- **X** — `rule-routing.ts`: strip a leading `<linter>/` prefix (`eslint/no-var`)
  before the catalog lookup, else a prefixed marked ref misses reuse → falls to synth.
- **W** — `cli.ts`: resolve the measure-consent BEFORE `computeRuleRouting`, else the
  FIRST interactive `audit` misses the dynamic catalog (only the 2nd run sees it).
- **Z** — `segment.ts`: don't over-suppress a legit rule bullet under an H2 like
  `## Rules`; only suppress under genuinely procedural headings.
- **Y** — `rule-routing.ts`: honor checkbox rule markers (`- [ ] enforce(...)`) in the
  reuse pre-pass — strip the `[ ]`/`[x]` token before parsing.

**User has NOT confirmed scope/timing for a fast-follow PR** — I offered "fix X+W now,
roadmap Z+Y" vs "leave all four as roadmap notes." Do NOT open a fast-follow PR without
the user's explicit go-ahead. If they say go: fresh work on this branch, `fix:` commits
(NOT `feat!` — these are internal correctness fixes, no API change).

**Also roadmapped LOW (pre-existing, from #72):** probe a real linted file not hardcoded
`src/index.ts` (`enumerateEslintCatalog`); wrap the FP/dogfood sweeps as contributor
skills; Codex corpus parity (vendored corpus is CC-only, Codex synthetic-fixtures only);
EvalDriver→core-port; no-model floor for the 9 skill evals (eval-lock wired but green
no-op, no committed locks); make `no-internal-links-in-public-docs` a real lint rule (P1).

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
