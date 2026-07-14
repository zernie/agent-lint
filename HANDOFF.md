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

**Branch `claude/rules-compiler-python-3xqhtd`** — the audit rule-compile tier + a big
REPO-STRUCTURE tightening pass. **No PR opened yet.** HEAD `45ea17b`. Targeted suites green,
build+fmt clean + API surface gate green; env-only `dialect-drift` still fails locally (CI pins CC).

**LATEST SESSION (2026-07-14, structure + dogfood pass — all pushed):**

- **"b then a" DONE** — (b) sharpened the audit rule map's 4th lane to **custom rule (⚙)** ("doable,
  opt-in") vs **judgment call (✎)** ("undecidable"); (a) rewrote the `pr-to-lint-rule` skill into the
  GATED synthesis skill (REUSE-first → intent+codebase → synth rule + independent intent-test → TRUST
  GATE P=R=1.0 else ABSTAIN), wrapping `compiler/gate.js`.
- **Rule-map docs made crystal-clear** — `research/rule-compiler-multilang-design.md` **§0.0** is the
  authoritative snapshot: TWO linters only (ESLint full, Pylint routing-only, Ruff NOT yet), the 4
  reuse mechanisms, enabled-state=ESLint-only, ranked next steps. Public note in
  `docs/verifying-instruction-files.md`.
- **DOGFOOD now CI-ENFORCED + indexed** — `research/dogfood-corpus.md` is the map (every artifact →
  is-it-CI-enforced → by-what) + the policy; CLAUDE rule **`dogfood-vendoring-policy`** points at it
  (so a new session learns it automatically). `compiler/gate.js` now ASSERTS its kept/abstain verdicts
  (was print-only exit 0) + two new `check`-job CI steps run it and `bench/corpus/verify*.mjs`.
  Backfilled LICENSE+SOURCE for the 2 slices that lacked them.
- **STRUCTURE cleanup** — `dev/` plugin GONE: its 6 contributor skills moved to `.claude/skills/`
  (auto-load in-repo, still unshipped); `generate-logo` eval now uses `skillsDir`. `schemas/` →
  `src/schemas/` + `DEPRECATED.md` (require-structure never built); `@jackchuka/mdschema` moved
  `dependencies`→`devDependencies` (stops shipping ~11MB unused). `scripts/` = build pipeline only;
  human-run scripts (demo/fp-sweep/make-demo-gif) → `tools/`. Deleted orphan `vigiles-demo.gif`.
  Hexagonal relocate of `claudeEvalDriver` DELIBERATELY NOT done (composition-root default, moving it
  = circular import) — documented in place instead. **Verdict: 8/10 hexagonal, CI-enforced.**
- **MORE STRUCTURE (2nd half of session)** — `fixtures/`→`test/fixtures/`; `etc/`→**`api-surface/`**
  (the API-contract dir, legibly renamed — update `scripts/api-extractor.mjs` reportFolder + `.prettierignore`
  if ever touched; it's a lockfile-class CONTRACT, NOT docs). Root `CLAUDE.md` gained a **`## Layout`
  section = a desc per EVERY committed root dir** (verified complete). DOGFOOD disambiguated: the word
  covered FOUR things — only `test/dogfood/` is the corpus; `examples/harness/dogfood/`=skill examples,
  `compiler/gold/`=package-internal, `research/dogfood/`→renamed **`research/audit-captures/`** (it's
  audit OUTPUT, not tests). PER-ADAPTER documented: adapters symmetric (adapter-contract registry loop)
  but the vendored corpus is CC-only + Codex-synthetic (roadmapped). All in `research/dogfood-corpus.md`
  + the `dogfood-vendoring-policy` rule.
- **DECISIONS (don't relitigate):** subpackages `compiler/` (paper artifact "Prose Isn't Policy" + the
  `pr-to-lint-rule` engine) + `report/` (React/Vite frontend, keeps its toolchain out of the CLI deps)
  both KEEP (not fold, not `packages/` — no workspaces). `docs/`+`research/` stay (NOT `docs/internal`).
  Shipped `skills/`+`hooks/` at root = plugin convention (correct). no-orphan-docs NOT widened to
  compiler//bench/ (noisy). compiler/ unlinted = accepted (separate CJS package).
- **ROADMAP added (all LOW):** EvalDriver→core-port promotion; no-model floor for the 9 skill evals
  (eval-lock is wired but a green no-op — no committed locks); Codex corpus parity. Also flagged the
  one genuine MISSING RULE: `no-internal-links-in-public-docs` is guidance-only (P1 = make it a lint rule).

**Earlier this branch — the audit rule-compile tier** (`src/rule-inventory.ts` + `src/rule-routing.ts` +
`src/segment.ts`, backed by `compiler/`): ESLint + Pylint-basics routing. This is the AUDIT feature that
suggests which prose rules can be codified as lint rules — NOT the linter cross-ref engine
(`core/linters.ts`), which already does Python.

**Design-of-record: `research/rule-compiler-multilang-design.md`** — READ FIRST. Grounded in 2 Fable
design passes + a real 20-repo OSS corpus; has the whole plan, the ConfigProbe/Intent-Realization
model, and the build order.

**⚠️ THE REFRAME (founder correction, mid-session — supersedes "expand the map"):** DON'T hand-curate
prose→rule mappings, it's a dead end. The match target is the repo's **DYNAMIC rule catalog** — run
the linter, enumerate the rules it ACTUALLY has, match prose against THAT. Spike (`scratchpad/spike.mjs`)
on THIS repo: **702 available rules** (vs the static map's ~23), 548 available-but-off. Architecture IS
enforceable (`boundaries/dependencies` in the catalog → "dir X may import dir Y" is `reuse`, not
semantic). `INTENT_MAP` is DEMOTED to a small alias fast-path. `research/rule-compiler-multilang-design.md`
**§0** = the honest DONE / DOABLE-cheaply / HARD scope (read it).

**Shipped this session (~26 commits):** design doc + §0 reframe/scope; `fix(segment)` precision (INDEX-SMELL
veto, anti-context, decoration/emoji/ordered, RULE_HEADING bug); `feat(rule-routing)` `meta` category +
"hard to codify" bucket (incl. report UI); intents (+curly/consistent-type-imports/no-only-tests); SCOPE
markers; `feat(segment)` RULE-NAME cue; **`feat(core)` `src/core/rule-catalog.ts`** (`enumerateEslintCatalog`,
702 rules, own-repo/executes, 100% cov). **THE CATALOG IS NOW LIVE END-TO-END in `vigiles audit`:**
(a) `feat(audit)` `computeRuleRouting` enumerates the catalog under the sticky `audit.measure` consent
(own-repo, claude-code only) so `boundaries/dependencies` → `reuse (ON)`; (b) `feat(routing)` MEDIUM-rescue
— a declarative bullet ("The core layer must not import X (`boundaries/dependencies`)") that NAMES a real
catalog rule is rescued from the high-only drop (grounded in the catalog, not a widened regex); (c)
`feat(audit)` PER-FILE routing (`gatherInstructionFiles`→`{path,text}[]` + pure `mergeRoutings`) — FIXED a
latent provenance bug (concatenating root CLAUDE.md+AGENTS.md offset the 2nd file's lines); (d) `feat(audit)`
NESTED discovery — globs `**/CLAUDE.md`+`**/AGENTS.md`, reads real subdir memory, skips fixtures via pure
`isFixturePath` (`src/instruction-sources.ts`, 100% cov; 4 kept / 5 skipped on this repo). Then a FABLE
review + a 2-agent FAN-OUT dogfood (17 real OSS docs) drove the FINISH pass: (e) **S0/S1 marker pre-pass**
(`extractMarkedRules`) — `**Enforced by:**`→reuse / `**Guard:**`→hook / `**Guidance only**`→classify'd body
(promote-prose), consumed before the heuristic via a `skipLines` arg so 0 double-count; **vigiles's own
CLAUDE.md 0 → 47 routed**; (f) **HOOK_CUES widened** (regenerate-on-change guard + commit/PR hygiene: +6
real hooks, 0 FP); (g) **segmenter DESCRIPTION-LED reject** (deontic-guarded — the SAFE slice of the 39%
noise); (h) **mirror double-count fix** (`dedupeInstructionFiles` realpath+hash) + `isFixturePath` case-
insensitivity/`__mocks__`; (i) **report UI "⛔ documented but OFF" callout** (the catalog payoff). tsc clean;
routing/segment/instruction-sources/cli/scan-cli/audit suites all green (only failure = env-only
`dialect-drift`, CI-pinned). **No PR yet.**

**GROUNDED REALITY (17-doc OSS fan-out):** foreign TEXTUAL reuse = 0% (real docs rarely NAME a lint rule →
reuse needs the catalog, own-repo only), ~7% hook, ~90% "hard". A categorizer fan-out re-classed the 207
"hard": **39% segmenter NOISE / 32% misroute / 29% genuinely hard** — the 93% overstated the problem, so the
finish pass attacked noise + misroute (precision-first). vigiles's OWN doc now routes 47 (was 0) via S0/S1.
Measured slice: a doc that NAMES lint rules → **100% precision / 100% recall** on reuse (added require/
disallow/forbid/ban/enforce to FORM_HEAD to close curly-style "Require `x`" misses).

**REUSE-LANE BROADENING (latest — ESLint constructs + PYLINT basics, dogfood-driven):** (1) ESLint
construct-prohibitions → the built-in `no-restricted-syntax` (classes/default-exports/enums/namespaces/for-in),
precision-gated, FOREIGN-SAFE — "never use classes" LOOKS custom but is reuse (betterauth real hit). (2)
**PYLINT basics**: 12 curated `INTENT_MAP` entries (symbols verified via `pylint --help-msg`) + docstring-
PRESENCE via a linter-aware `PATTERN_RULE_MAP`. ROUTE-ONLY (buildRuleInventory gated to eslint — pylint is
ON-BY-DEFAULT, its config-state needs the §3 inverted-polarity ConfigProbe, deferred). Keywords Python-
UNAMBIGUOUS (bare snake_case/`import *`/"unused imports" excluded → no cross-lang FP). (3) **DOGFOOD IS NOW
COMMITTED** (`src/rule-routing-dogfood.test.ts`) — golden routing net + keyword-disjointness invariant; CI
catches regressions (was scratchpad-only before). It CAUGHT a real bug: bare "docstring" over-fired on
content/style rules (langchain/pandas) → fixed to presence-context. 2 shared-matcher bugs fixed en route
(FORM_HEAD `no\s+\S`→`no`; matchesWholeToken sentence-end `.`). Live: 4 reuse hits over the 21-doc corpus, 0 FP.
Fable steered the architecture (INTENT_MAP+gate over a separate map). **`compiler/` gate is the real synthesis
engine (6/10 kept, 2 abstain on its corpus).**

**"b then a" DONE (latest):** (b) SHARPENED the rule map's 4th lane — `synthesize`/`unrouted` relabeled
**"custom rule (⚙)"** ("doable, opt-in — a custom rule CAN enforce it") vs `semantic` **"judgment call (✎)"**
(genuinely undecidable), in report UI (`RuleInventory.tsx`) + `docs/verifying-instruction-files.md`. (a)
REWROTE the DEV-ONLY `pr-to-lint-rule` skill (`dev/skills/`) from a generic "generate a rule" recipe into
the GATED synthesis skill — the explicit hand-off target of audit's custom-rule lane: REUSE-first
(ADOPT>REUSE>SYNTHESIZE) → nail intent + read codebase → synthesize rule + INDEPENDENT intent-test (adversarial
cases) → TRUST GATE (P=R=1.0 else ABSTAIN, never ship an unproven checker). Points at `compiler/gate.js` +
`gold/gold.json` + `npm run demo` (both verified running: gate shows R5 abstain-selftest + R10 silent-leak-
caught; demo keeps 3, abstains 2). Fixed the broken `../linter-docs/` path (→ `../../../skills/linter-docs/`).
Stays user-invoked (`disable-model-invocation`) — nothing auto-runs on install. Commits e2d4f57 + e7044d4, pushed.

**CLARITY PASS (founder pushback: "you're confused af, improve audit docs first"):** the
word "compile" was overloaded across THREE things → un-overloaded. (1) `vigiles compile` = the spec→markdown
verb ONLY. (2) the audit routing preview = **"the rule map"** (read-only, deterministic). (3) `@vigiles/
compiler` = **"synthesize"**. Renamed `mechanism:"compile"`→`"synthesize"` (cascades src/rule-routing.ts +
report/schema.ts). **DELETED the misleading `CompileCTA`** (it printed `npx vigiles compile` — the wrong verb
— + false "turns rows into config + one model pass" copy) → `RuleMap` "Your rules, mapped" with an honest
opt-in next step PER LANE. Wrote the keystone doc section "From prose to enforced: the rule map" (docs/
verifying-instruction-files.md). Reframed the **phantom `/pr-to-lint-rule`** refs (11 files) — it's a real but
DEV-ONLY skill (`dev/skills/pr-to-lint-rule/`), so docs no longer tell users to "run" it; custom-rule
synthesis is "experimental / not yet generally available". Fable + 2 subagents drove this (context-rot avoid).

**KEY SCOPE TRUTH (do not re-confuse):** the audit rule-compile tier is really TWO layers. (A) the DETERMINISTIC
**rule map** in `vigiles audit` (`src/rule-routing.ts`) — a read-only PRE-FILTER: reuse-match (names/curated-
intent → existing lint rule) + hook + prose + hard; SHIPPED, model-free, nothing auto-runs. (B) the model
work — reuse-matching is the `strengthen` SKILL; custom-rule SYNTHESIS is `@vigiles/compiler` (real engine +
a two-stage blind-gold TRUST GATE: `node compiler/gate.js` → on 10 rules, 6 kept / 2 abstain / 2 prose;
refuses to ship a checker it can't prove sound), delivered as the DEV-ONLY `pr-to-lint-rule` skill. Everything
in (B) is OPT-IN, on the user's sub, agent-invoked — NEVER auto after install. `init` only NUDGES.

**NEXT (clear):** GRADUATE `dev/skills/pr-to-lint-rule` into a SHIPPED, consent-gated synthesis skill wrapping
the `compiler/` trust gate (the thing that makes the "hard" lane real for users). Then: broaden the reuse
catalog — esp. parameterized built-ins (`no-restricted-syntax`/`-imports`/`-globals`) that capture "no
classes"/"no barrel files"/"no default exports" deterministically, shrinking the synthesis residue. Then:
`.claude/` sources; ruff/pylint (ruff's catalog is FOREIGN-SAFE, no consent gate needed).

**NEXT (in order):** (1) **`.claude/` rule sources** (a distinct source shape). (2) **`.claude-plugin/`-only
sub-project refinement** to `isFixturePath` (NOT `package.json`-adjacency — Fable: that kills monorepo
package memory). (3) **more segmenter over-emission** — the imperative-led "Use `path` for X" pointers +
numbered how-to steps (the risky ~remaining half of the 39%; needs a labeled precision harness first). (4)
**Cross-language Ruff/Pylint** (§3) — and Fable's nugget: ruff's catalog is FOREIGN-SAFE (static to the
binary, TOML config is data not exec) → NO consent gate needed, cheaper than the ESLint path. (5) minor:
"catalog skipped (not cwd)" notice for `vigiles audit <subdir>` in own repo.
(4) Consider surfacing enabled-state ("documented but OFF") more prominently in the report UI.

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
- **Contributor-only skills go in `.claude/skills/` (this repo's own harness), NOT the shipped
  plugin** — vigiles verifies harnesses, it does NOT lint code (`dont-reimplement-linters`), so
  shipping e.g. a code-quality skill to users would muddy positioning. (The old `dev/`/`vigiles-dev`
  second plugin was folded into `.claude/skills/` on 2026-07-14 — no separate contributor plugin now.)
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
