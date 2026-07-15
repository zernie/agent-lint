---
status: active
topic: compiler
---

# Rule-compiler: multi-language design (Ruff + Pylint) + segmentation, grounded in a 20-repo corpus

> **The crisp design-of-record is now `research/rule-compiler-design.md` — read that
> first.** This doc is the detailed BUILD-LOG (segmentation model + the multi-language
> reasoning + the OSS corpus). Note: the design-of-record FROZE the rule map at 2
> linters (ESLint + Pylint) for now, so the Ruff-routing plans below are future/parked,
> not active — and detection moved to a two-tier (confident + possible-review) target.

> Build-log (2026-07-14). The `audit` rule-compile tier (`src/rule-inventory.ts` and
> `src/rule-routing.ts`, backed by `@vigiles/compiler`) reads prose rules in a repo's
> convention docs and reports which map to off-the-shelf lint rules and whether they're
> enforced. It is **ESLint-only in its data** today. This doc designs the expansion to
> **Python (Ruff + Pylint)** and — the harder half — a robust **segmentation** model for
> deciding what text in a freeform doc is even a "rule". Grounded in two first-principles
> design passes (Fable) + a real 20-repo OSS corpus (WebSearch survey + `curl` extraction
> of live configs and docs; `add_repo` was blocked cross-owner, so extraction was raw-file).
> Nothing here is built yet — this is the plan the build follows.

## Scope decided with the founder

- **Full hexagonal refactor** of the tier (not a bolt-on). **Ruff + Pylint** are the Python
  pair — **no** mypy/flake8/bandit engines (Ruff reimplements bandit `S`/flake8; Pylint is
  the deep semantic checker). Skill side: one language-grouped reference skill (separate note).
- Two tiers stay split: the **deterministic default** (model-free, safe on a stranger's repo,
  textual/structural config parse — never executes a config) and the **opt-in model tier**
  (own-repo, on the user's sub, behind the existing `decideExecute` consent). This doc is
  mostly about the deterministic tier; it names precisely where the model tier takes over.

## 0.0 Current state at a glance (2026-07-14) — the authoritative snapshot

> The narrative below (§0) is the chronological build log; THIS block is the crystal-clear "what ships
> today" reference. When they disagree, this block wins — keep it updated as the feature moves.

**What the rule map is.** `vigiles audit` reads the prose rules in a repo's `CLAUDE.md`/`AGENTS.md`,
segments them, and routes each into one of four lanes. It is **read-only + deterministic** — no model,
nothing executes (the ONE exception: the ESLint catalog enumeration in mechanism #1, gated below). It is
NOT the `enforce()` cross-ref engine (`core/linters.ts`, which already resolves 7 catalogs incl. Python);
the rule map is the AUDIT feature that SUGGESTS which prose could become a lint rule.

**Linters the rule map supports today: exactly TWO — ESLint (full) and Pylint (full: dynamic catalog +
enabled-state + routing intents). Ruff is NOT yet routed.** (The "ESLint/Ruff/…" phrasing in public docs
describes the separate `enforce()` engine, not this map — a real discrepancy, see "What's next".)

**UPDATE 2026-07-15 — Pylint gained the dynamic catalog + enabled-state** (`enumeratePylintCatalog`,
`src/core/rule-catalog.ts`), closing the two gaps this §0.0 previously called deferred. It shells
`pylint --list-msgs` (available) + `--list-msgs-enabled` (enabled, section-aware — the `Disabled messages:`
/ `Non-emittable messages:` sections are NOT misread as enabled), so a Python repo now gets the SAME
own-repo catalog match + "documented but OFF" nudge as ESLint, **plugin messages included** (a loaded
pylint plugin's `W9xxx` message is in the listing). Each rule is matchable by its symbolic name OR its
numeric code (`missing-function-docstring` or `C0116`). The "inverted-polarity ConfigProbe" the design
called for (§3/§5b) turned out **unnecessary** — `--list-msgs-enabled` resolves enabled-state directly, so
there is no polarity to reason about. `mergeCatalogs` unions ESLint + Pylint for a polyglot repo. The ONE
remaining ESLint-only capability is **custom-rule SYNTHESIS** (the `@vigiles/compiler` engine emits ESLint
rules only; a Python target — a pylint/astroid checker or, cheaper, an ast-grep YAML rule — is unbuilt).

**The four lanes** (`RuleCategory` in `src/rule-routing.ts`):

| Lane          | category value | Meaning                                              | Report label      |
| ------------- | -------------- | ---------------------------------------------------- | ----------------- |
| Enforceable   | `reuse`        | maps to an off-the-shelf lint rule                   | ✓ Enforceable now |
| Hook          | `hook`         | an action a linter can't see (`git push`, run tests) | ⛓ Hook            |
| Custom rule   | `unrouted`     | no off-the-shelf rule fits, but a custom one could   | ⚙ Custom rule     |
| Judgment call | `semantic`     | genuinely undecidable ("keep it readable")           | ✎ Judgment call   |

(`meta` is a fifth internal category for repo-management prose — not one of the four user-facing lanes.)

**The reuse-match mechanisms** (how a prose rule becomes `reuse`), in `classify()` precedence order:

| #   | Mechanism          | Where                                               | Linters                   | Foreign-safe?                | What it does                                                                                                                                                             |
| --- | ------------------ | --------------------------------------------------- | ------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S   | S0/S1 markers      | `extractMarkedRules` (rule-routing.ts)              | any                       | yes                          | `**Enforced by:**`→reuse · `**Guard:**`→hook · `**Guidance only**`→classify body                                                                                         |
| 1   | Dynamic catalog    | `enumerate{Eslint,Pylint}Catalog` (rule-catalog.ts) | **ESLint + Pylint**       | **NO** — executes the linter | ESLint ~702 real rules (292 core + 410 plugin); Pylint ~389 messages + plugins via `--list-msgs`; matches prose that NAMES a rule (symbol or code); powers enabled-state |
| 2   | `INTENT_MAP`       | rule-inventory.ts                                   | **22 ESLint + 12 Pylint** | yes                          | curated intent→rule aliases (e.g. "no console" → `no-console`)                                                                                                           |
| 3   | `PATTERN_RULE_MAP` | rule-routing.ts                                     | **5 ESLint + 1 Pylint**   | yes                          | constructs → `no-restricted-syntax`; docstring-presence → `missing-function-docstring`                                                                                   |

Mechanism #1 EXECUTES the linter (loads the repo's real ESLint config, or runs `pylint` with the repo's
rcfile + `load-plugins`), so it is gated: **own-repo + the sticky `audit.measure` consent**; on a stranger's
repo / no consent / failure it falls back to the foreign-safe textual path (#S, #2, #3). NOT gated on the
agent harness (a catalog is a linter fact, not a CC-vs-Codex fact). Mechanisms #2 and #3 are pure text →
route, no execution.

**Enabled-state ("documented but OFF")** — the "you wrote this rule but your config silently disables it"
payoff: **ESLint AND Pylint** (as of 2026-07-15). ESLint reads severity from the resolved config; Pylint
reads `--list-msgs-enabled` (config-respecting, plugin-inclusive). The feared "inverted polarity" of Pylint's
on-by-default deny-list is a non-issue — `--list-msgs-enabled` gives the resolved enabled SET directly, so
no ConfigProbe polarity logic is needed. (`buildRuleInventory`, the SEPARATE `rulesInventory` cross-ref, is
still ESLint-gated — that's a different surface from this routing catalog.)

**Per-linter support quality:**

- **ESLint — FULL.** dynamic catalog (own-repo, ~702 rules) + 22 intents + 5 construct patterns + enabled-state
  (ON / one-line-away / documented-but-OFF). Architecture rules count (`boundaries/dependencies` → reuse).
- **Pylint — FULL (catalog + enabled-state), as of 2026-07-15.** Dynamic catalog (`enumeratePylintCatalog`,
  own-repo + consent) enumerating ~389 core messages + every loaded plugin's messages, each matchable by
  symbol OR numeric code, with correct enabled-state (`--list-msgs-enabled`) for the "documented but OFF"
  nudge. PLUS the 12 curated intents (bare-except, broad-exception-caught, dangerous-default-value,
  invalid-name, too-many-arguments/statements, wildcard-import, global-statement, line-too-long, unused-import,
  consider-using-f-string; each symbol verified via `pylint --help-msg`) + 1 docstring-presence pattern
  (`missing-function-docstring`). Keywords are Python-UNAMBIGUOUS (bare `snake_case` / `import *` / "unused
  imports" deliberately excluded) → 0 cross-language false positives. The ONE gap vs ESLint: no custom-rule
  SYNTHESIS for Python (the compiler emits ESLint rules only) — see "What's next".
- **Ruff — NONE (in the map).** 0 intents, not routed. Highest-value next linter for modern Python.

**Grounded reality (17-doc OSS fan-out).** Foreign TEXTUAL reuse ≈ **0%** — real third-party docs almost never
NAME a lint rule, so reuse pays off mainly on the OWN repo (via #1 the catalog + #S markers): vigiles's own
`CLAUDE.md` routes **47** rules. The honest value is: own-repo catalog + intents + construct patterns, PLUS
truthful `hook`/`custom-rule`/`judgment-call` labeling of everything that isn't reuse.

**CI enforcement.** Two committed golden dogfoods, both in the vitest `unit` project (→ run under `npm run
coverage`, no linter binary needed — pure text→route): `src/rule-routing-dogfood.test.ts` (synthetic
ESLint-construct + Pylint golden net + a keyword-disjointness invariant + a docstring content-vs-presence
precision guard) and `src/rule-routing-oss.test.ts` (real vendored MIT-licensed Python `AGENTS.md` from
langchain + browser-use, asserting stable invariants: docstring→pylint, no cross-language FP, hard lane
populated). A routing regression fails CI. The engine files (`rule-routing.ts`/`rule-inventory.ts`/`segment.ts`)
are NOT yet in the 100% coverage `include` list (behavior is gated; line-coverage of the engine is not).

**What's next (ranked).**

1. **Ruff routing** — foreign-safe (the rule set is static to the binary, `pyproject.toml`/`ruff.toml` is
   data not code, `select` replaces the default → no consent gate). Arguably higher-value than Pylint for
   modern Python. Closes the public "ESLint/Ruff/…" discrepancy.
2. ~~**Pylint enabled-state**~~ — **DONE 2026-07-15** (`enumeratePylintCatalog` + `--list-msgs-enabled`; the
   inverted-polarity ConfigProbe proved unnecessary). A Python repo now gets "documented but OFF".
3. **Python custom-rule SYNTHESIS** — the ONLY remaining ESLint-vs-Pylint asymmetry: the `@vigiles/compiler`
   engine (the "custom rule ⚙" lane's hand-off) emits ESLint rules + a JS self-test only. A Python target
   would be a new synthesis backend — a pylint/astroid checker, or (cheaper, and ast-grep already does Python)
   an ast-grep YAML rule + a Python self-test harness, re-pointing the trust gate. Larger than the catalog fix.
4. **More catalog linters** — the dynamic-catalog approach (#1) now covers ESLint + Pylint; it generalizes
   further (Ruff via `ruff rule --all`, etc.).
5. **Graduate synthesis** — the gated `pr-to-lint-rule` skill is DEV-ONLY today (the ⚙ custom-rule lane's
   hand-off); ship it to users once the trust gate is proven in the wild.
6. **Fuzzy semantic mapping** ("keep functions small" → `max-lines-per-function`) — genuinely needs the model
   tier; the deterministic map only catches prose that NAMES a rule/token/construct.

## 0. Spike + honest scope (2026-07-14) — DYNAMIC catalog, not a static map

A founder correction reframed the whole approach, and a spike (`scratchpad/spike.mjs`, run on THIS
repo) confirmed it. **Do NOT hand-curate prose→rule mappings — that's a dead end.** The match target
is the repo's **dynamic rule catalog**: enumerate the rules the linter ACTUALLY has and match prose
against that. Spike numbers: one ESLint API call → **702 available rules** (292 core + 410 plugin:
typescript-eslint / sonarjs / boundaries) vs the static `INTENT_MAP`'s ~23; 154 enabled → **548
available-but-OFF** rules a documented norm could map to. And architecture is enforceable —
`boundaries/{dependencies,element-types,entry-point}` + `no-restricted-imports` are in the catalog, so
**"dir X may import dir Y" is `reuse`, NOT semantic**.

The three-column scope, marked honestly (this section supersedes the INTENT_MAP-centric framing below):

**✅ DONE (built today)**

- Static `INTENT_MAP` fast-path (~23 rules) + segment + route (reuse/hook/meta/semantic/unrouted),
  with the precision fixes (`INDEX-SMELL` veto, anti-context, decoration, meta category).
- ENABLED-rule discovery (`generate-types`) for the `.d.ts` autocomplete.
- The available-rule enumeration PRIMITIVES exist (`core/linters.ts` `builtinRules` +
  `resolveEslintPluginRules`) — just not wired into the compile tier.
- Custom-rule SYNTHESIS + adversarial gate (`compiler/`) — the model-tier engine for the residue.
- `boundaries/dependencies` dogfooded (architecture rules are real + enforced).
- **DYNAMIC available-rule catalog is LIVE (`src/core/rule-catalog.ts` + wired into `vigiles audit`).**
  `enumerateEslintCatalog` runs ESLint once (702 rules, 141 enabled here) and `routeRules({availableRules})`
  matches prose that NAMES a rule against the LIVE catalog — so `boundaries/dependencies` routes to `reuse`
  and carries its enabled-state nudge (ON / documented-but-OFF), a rule the static map never captured.
  Because enumeration EXECUTES the linter, it is gated as an OWN-REPO + `audit.measure`-CONSENTED,
  claude-code-only capability; a null/failure falls back to the foreign-safe textual routing.
- **MEDIUM-confidence catalog rescue is LIVE (`routeRules`).** A declarative-subject bullet ("The core
  layer must not import X (`boundaries/dependencies`)") segments at MEDIUM (context+shape, no imperative
  head) and is dropped by the high-only default — but when it NAMES a rule the catalog actually has, it's
  rescued to `reuse`. Grounded in the catalog (ground truth), NOT a widened regex, so the foreign-safe
  textual path stays conservative. Closes the "route architecture/import intents even without a rule-name
  cue" gap for the OWN-REPO case; the foreign-safe declarative case (no catalog) stays a deliberate
  precision floor.
- **S0/S1 STRUCTURED-MARKER pre-pass is LIVE (`extractMarkedRules` in `routeRules`).** A compiled/marked
  doc declares its own routing via explicit markers: an "Enforced by" marker → reuse (rule-id verified vs
  the catalog), a "Guard" marker → hook, a "Guidance only" marker → its body routed through `classify` (so a
  guidance that's really an action surfaces as a would-be hook — the promote-prose signal). Markers are
  extracted BEFORE the heuristic pass and their body lines CONSUMED (a new `skipLines` arg to
  `segmentInstructions`) so nothing double-counts; each rule carries `source:'marker'|'heuristic'`.
  **vigiles's OWN CLAUDE.md went 0 → 47 routed** (5 reuse / 6 hook / 5 meta / 31 semantic) — the embarrassing
  dogfood-zero is closed. A hand-written non-rule-id "Enforced by" value is a CLAIM, not emitted (Fable's gate).
- **REPORT UI surfaces "documented but OFF"** (`report/src/components/RuleInventory.tsx`): the CompileCTA now
  renders a `⛔ N documented but OFF` callout off the catalog `enabled:false` — the payoff of the catalog
  work, previously computed but buried. `RoutedRule` mirror gains `enabled` + `source`.

**OSS DOGFOOD (2026-07-14, fan-out over 17 real CLAUDE.md/AGENTS.md — the grounding):** foreign-safe TEXTUAL
routing = 0% reuse (real docs almost never NAME a lint rule → reuse needs the catalog, own-repo only), ~7%
hook, ~90% "hard". A categorizer fan-out re-classified the 207 "hard": **39% segmenter NOISE, 32% misrouted
(hook/meta/semantic), only 29% genuinely hard** — so the 93% overstated the problem. Two grounded fixes
shipped: (a) HOOK_CUES widened for the "run X when/after Y changes" guard (vigiles's own `guard()` shape) +
commit/PR hygiene without a literal "commit" (co-author, semantic PR titles) — +6 real hooks, 0 FP; (b)
segmenter DESCRIPTION-LED reject (`` `Foo` class in `x` executes … `` = an architecture sentence, not a
rule), deontic-guarded so `` `const` is preferred `` survives — the SAFE slice of the 39%. Bug fixes from a
design review: mirror double-count (a symlinked/byte-identical `CLAUDE.md`⇄`AGENTS.md` counted twice →
`dedupeInstructionFiles` by realpath+hash) and `isFixturePath` case-sensitivity + `__mocks__`.

**🟡 DOABLE CHEAPLY (spike-proven, not wired)**

- **NESTED-SOURCE discovery is LIVE.** `gatherInstructionFiles` now globs `**/CLAUDE.md` + `**/AGENTS.md`
  and reads a repo's real subdirectory memory (`src/CLAUDE.md`, `research/CLAUDE.md`, …), each routed
  SEPARATELY + folded by `mergeRoutings` so every rule keeps its OWN file + line numbers (this also FIXED
  a latent provenance bug: concatenating root `CLAUDE.md` + `AGENTS.md` offset the second file's lines).
  The FIXTURE-NOISE policy is `isFixturePath` (`src/instruction-sources.ts`, pure + 100%-tested): skip a
  path with a build/deps/test dir segment OR a `demo*`/`example*`/`sample*`/`fixture*`/`bench*`/`mock*`/
  `scratch*`/`tmp*` prefix — precision-first (over-skip a legit `sample-service` before flooding with
  fixture rules). On THIS repo: 4 real memory files KEPT, 5 fixtures SKIPPED. Remaining = `.claude/` rule
  sources (a distinct source shape) + a possible sub-project refinement (a nested file next to its own
  `package.json`/`.claude-plugin/` is a sub-project, not this repo's memory).

**✅ ESLint construct-prohibitions + PYLINT BASICS are LIVE (2026-07-14).**

- ESLint construct-prohibitions → the built-in `no-restricted-syntax` (classes / default-exports / enums /
  namespaces / for-in), precision-gated (prohibition+construct proximity, negative lookbehind), foreign-safe.
  A rule that LOOKS custom ("never use classes") is reuse. Grounded: betterauth's "NEVER use classes" routes.
- **PYLINT basics** — 12 curated entries in the shared `INTENT_MAP` (bare-except, broad-exception-caught,
  dangerous-default-value, invalid-name, too-many-arguments/statements, wildcard-import, global-statement,
  line-too-long, unused-import, consider-using-f-string; symbols verified via `pylint --help-msg`) +
  docstring-PRESENCE via the linter-aware `PATTERN_RULE_MAP` (a bare "docstring" keyword over-fires on
  content/style rules — the dogfood caught it on langchain/pandas). ROUTE-ONLY: `buildRuleInventory` is gated
  to eslint because pylint is ON-BY-DEFAULT (the eslint-shaped config-state check would mislabel its inverted
  polarity — enabled-state waits on the §3 ConfigProbe). Keywords are Python-UNAMBIGUOUS (bare `snake_case` /
  `import *` / "unused imports" excluded to avoid cross-language FP). THE DOGFOOD IS COMMITTED
  (`src/rule-routing-dogfood.test.ts`) — a golden routing net + a keyword-disjointness invariant, so CI catches
  routing regressions. Two shared-matcher bugs fixed en route: `FORM_HEAD`'s `no\s+\S` (broke "No bare except")
  → bare `no`; `matchesWholeToken` missed a keyword at sentence-end ("No wildcard imports.") → a `.`-tolerant
  trailing lookahead. Live on real Python docs: 4 reuse hits across the 21-doc corpus, 0 FP.

**🔴 HARD (model-tier / later)**

- Fuzzy SEMANTIC prose→catalog mapping ("keep functions small" → `max-lines-per-function`) — needs
  the model tier (the deterministic tier only catches prose that NAMES a rule/token).
- Custom-rule synthesis for the residue (`compiler/` has it, gated; ship as the `pr-to-lint-rule` skill).
- PYLINT enabled-state ("documented but OFF") via the §3 inverted-polarity ConfigProbe — the deferred half
  of the pylint work (routing is done; the State-A inventory config-state is not).
- RUFF (foreign-safe catalog — static to the binary, TOML config is data, no consent gate) + Clippy/RuboCop.

**`INTENT_MAP` is DEMOTED** to a small high-precision alias enrichment for the top common rules
(`console.log`↔`no-console`), NOT the strategy. Stop expanding it as if it were.

## 1. The corpus (what the ground truth changed)

20 repos: 10 Python (ruff/pylint/pandas/home-assistant/airflow/django/salt/fastapi/pydantic/polars),
6 JS/TS (typescript-eslint/next.js/astro/sentry-js/t3/excalidraw), 4 doc-carriers
(cloudflare/workers-sdk, openai/codex, shadcn-ui, anthropic-sdk-python). Live configs + docs
fetched via `raw.githubusercontent.com`.

### Config-shape frequencies (drive ConfigProbe priorities)

- **Ruff `select` semantics is THE probe behavior.** Bare `select` (which **replaces** Ruff's
  default set `E4/E7/E9/F`) dominates **7/8** ruff users; `extend-select` 1/8 (airflow);
  `select=["ALL"]` **0/8** (polars uses a big explicit `select`, not `ALL` — corrected the survey).
- **`[tool.ruff.lint]` is universal (8/8); the deprecated top-level `[tool.ruff] select` is dead** —
  but the **dotted-key variant** `[tool.ruff]` + `lint.select = [...]` (pylint's own repo) is
  textually distinct and a naive section parser misses it. Handle both.
- **`per-file-ignores` (+ `extend-per-file-ignores`) is common (6/8)** — classic `F401` in
  `__init__.py`, `S101` in tests. Both keys occur, sometimes together (pydantic) → merge, don't
  pick one. Monorepos enumerate ~13 explicit test paths, not one `tests/**` glob.
- **`extend =` inheritance: 0/10** → deprioritize. Even airflow's monorepo relies on Ruff's
  directory walk-up, not explicit `extend`.
- **Ruff absorbing Pylint's job is common** (pandas, home-assistant, airflow): select Ruff's
  `PL*` codes and never run real Pylint. A "is pylint configured?" check false-negatives here.
- **Cross-tool delegation is explicit and parseable** — home-assistant annotates ~150 disabled
  Pylint codes with `# Handled by ruff` / `# Handled by mypy`. A gold "not-a-gap" signal.
- **Pylint** (3 users): all **default-on + selective `disable=`** (no `disable=all`+enable in the
  sample); symbolic names, not codes; one uses a category-letter (`disable=R,`); docstring disables
  use the **umbrella `missing-docstring`**, not split `C0114/5/6`. File split: 2/3 `.pylintrc` INI,
  1/3 `pyproject.toml`.
- **Type-checkers are plural**: 3/10 run mypy **+** pyright/pyrefly/`ty` simultaneously. The
  "types not enforced" false-gap guard cannot key on mypy alone.

### ESLint config reality

- **~50% of repos hide their effective rule set behind unresolvable presets** (`extends`,
  `FlatCompat`, external org configs) → a textual probe genuinely can't resolve them; **`unknown`
  is a common verdict, not an edge case**. Accurate answer needs `eslint --print-config`
  (execution → opt-in tier). The Python probes (parse TOML/INI) are, by contrast, _more_ complete.
- **`overrides`/per-glob config is the norm** in mature repos (15–20 `files:` blocks) → "enabled"
  is not a repo-global boolean. **String severities only** (6/6, zero numeric `2/1/0`).
- **Non-ESLint JS linters are already here**: Sentry migrated fully to **oxlint** (`typescript/*`
  namespace), Astro does an ESLint→**Biome** handoff. A JS tool that only knows ESLint will
  silently misreport these — a documented honesty gap + future-linter candidate (out of scope now).

### Convention-doc reality (drives segmentation)

- **AGENTS.md is the #1 code-norm carrier** (10/20 substantive). **CLAUDE.md is a redirect stub**
  (6/7 just point to AGENTS.md) → **read AGENTS.md, follow a CLAUDE.md→AGENTS pointer**.
  **`.cursor/rules`: 0/20** (survey hypothesis wrong for OSS — don't build for it now).
  **CONTRIBUTING is nearly code-norm-free** (setup + commit conventions) — a false lead.
  Dedicated style guides (django) are the densest but rare (1/20).
- **Enforceable code-norms (a) are <15% of rule-shaped content**, mode 0–10% — the mass is
  setup/commands (f), process/VCS (b), index (d), narrative (e). **Segmentation is a PRECISION
  problem.** Reject-first, require positive evidence of (a).
- **The #1 false-positive is the path-description bullet + "where-to-look" table** — index rows
  carry imperative-sounding clauses ("never modify", "goes here").
- **Rule-ids are named in only ~10–15% of norms** (2/20 docs) → intent→rule mapping is the
  workhorse; an explicit id is a high-confidence bonus, never a gate.
- **Intent frequency corrects the seed**: `naming-convention` is the most common lint-able norm;
  `no-print`/`mutable-default-arg`/`eqeqeq`/`wildcard-import` are rare in the wild. The single
  most-common documented norm — **"comments explain why, not what"** — is undecidable (stays prose):
  a clean honest-ceiling data point.

## 2. Segmentation design (what is a "rule"?)

Current `segment.ts` is directionally right (precision-biased, no-denominator) but is effectively a
~1.5-cue gate with concrete bugs. The redesign: **a tier ladder that exploits structure, plus a
named-signal decision list whose negative half (rejection signals) is the real precision lever.**

### 2a. Bugs to fix first (smallest diff, pure precision+recall win)

1. `RULE_HEADING` matches the substring `do` (via `do(?:n'?ts?)?s?`) → `## Documentation`,
   `## Adoption` become "rule-ish". **Word-bound every alternate.**
2. `**Never** …` bullets fail the imperative `FORM_HEAD` (they start with `**`) → **strip leading
   emphasis/blockquote/emoji decoration on a shadow string** before the head test (keep offsets).
3. `LIST_ITEM` misses ordered (`1.`) and emoji (`✅`/`❌`) bullets → widen the marker class.
4. The verb lexicon includes `is/are/be/have/must` → the "shape" cue is near-vacuous. Move copulas/
   modals out of the shape role.

### 2b. The tier ladder (exploit structure when present)

- **S0 — marked file** (a compiled vigiles CLAUDE.md, integrity header present): don't segment; the
  `### + **Enforced by/Guidance only**` blocks ARE the rule list. Highest-precision input, currently
  handled worst. This is the loop-closer for vigiles's own users → `strengthen` queue.
- **S1 — hand-written vigiles style**: marker parse (`### name` + `**marker**` + body).
- **S2 — generic rules section** (`## Rules`/`## Code Style`/`## Coding Standards`/`## Naming`/
  `## Good practices`): headings _are_ rule names; each bullet a unit with the imperative-head
  requirement relaxed (strong context substitutes). Fixes "heading that's secretly a rule".
- **S3 — freeform prose**: the hardened cue gate; accept only on a reliable positive signal.

### 2c. The named-signal decision list (replaces the anonymous cue count)

Ordered, first-match, individually FP-measurable. Positive: `MARKER`, `PROHIBIT+CODE`,
`MODAL+CODE` (imperative modal + a concrete code token — a symbol, `==`, `const`, `any`, a decorator,
a numeric cap), `RULE-NAME`, `DO/DONT-LIST`. **Negative (the missing half):**

- `INDEX-SMELL` veto — ``^`…`\s*[—:-]\s`` (code-span + separator + description) → index, reject.
- `ANTI-CONTEXT` heading — reject content under `Commands`/`Setup`/`Testing`/`Structure`/
  `Architecture`/`Commits`/`Pull Requests`/`Environment`/`Key Files`.
- `PATH-SUBJECT` (subject is a file path / resolves on disk), `NARRATIVE-TENSE` (past tense /
  first-person without a deontic modal), link/url/fence/table (present).

Prose imperatives **without** a code token ("write clean code", "match surrounding style", "comments
explain why not what") are undecidable → category (c), dropped from the lint tier by design.

### 2d. New routing categories (rule-routing.ts)

Add `index` (so index bullets never inflate `unrouted`) and `meta` ("read X first" — split from
`semantic`, since the compile tier can never make it enforceable — an honesty fix).

## 3. Language-mapping design (Intent → Realization)

### 3a. Data model — one intent, N per-language realizations

The naive `{intent, linter, rule}` flat row breaks three ways (language-specific vs cross-language
intents; shared tokens like `no-else-return` in both ESLint and Pylint; per-linter default polarity).
Model it as:

```ts
interface Realization {
  language: LanguageId;
  linter: LinterName;
  rule: string;
  aliases?: string[]; // pylint symbol↔code, ruff renames (TCH→TC), eslint base↔@typescript-eslint
  keywords: string[]; // whole-token, code-shaped triggers SPECIFIC to this realization
  configFix: string;
  preset?: "eslint-recommended" | "ruff-default" | "pylint-default";
}
interface Intent {
  id: string;
  intent: string;
  realizations: Realization[];
}
```

No intent-level keywords — every deterministic trigger is a token that belongs to a realization
(and self-identifies its language). **Match ungated, report gated.** One finding per intent.

### 3b. Scoping = both keys (the don't-cry-wolf guarantee, structural)

A nudge fires only if `language ∈ repo` **AND** `that linter's config exists` (a `RepoProfile` from
manifests/config-files/source-globs). Suggesting a Ruff rule to a JS repo is impossible by
construction, not by heuristic. A Python repo with no Ruff config gets at most one aggregate line.

### 3c. The `ConfigProbe` port (per-linter, because default polarities differ)

`probe(sources, realization) → {state, evidence}` where state ∈ enabled | explicitly-disabled |
default-enabled | preset-maybe | unknown | not-found.

- **ruffProbe** (parse TOML — data, not exec): selector prefix-subsumption (`select=["T20"]` covers
  `T201`); **bare `select` REPLACES the default set** (the #1 trap); more-specific selector wins, ties
  go to `ignore`; read both `[tool.ruff.lint]` and the dotted-key `[tool.ruff] lint.select`; merge
  `per-file-ignores` + `extend-per-file-ignores` (a rule ignored only in tests is still ENABLED);
  `extend=` present + local not-found → `unknown`, never "off".
- **pylintProbe** (INI + TOML): **inverted polarity — on by default**; specificity ladder
  symbol/code (2) > category-letter `C/R/W/E/F` (1) > `all` (0), enable beats disable at a tie;
  alias both directions (`R0915`↔`too-many-statements`); umbrella `missing-docstring` covers
  `C0114/5/6`; join multi-line INI `disable=` continuations before splitting.
- **eslintProbe**: existing textual logic; `.eslintrc.json`/`.yml` = data (parse), flat `.js`/`.mjs`
  = grep-only → degrade to `unknown` when rules hide behind a preset (accurate = `--print-config`,
  opt-in). `variantsOf` dissolves into `aliases` data.

### 3d. The intent-verdict fold (the co-use payoff)

Fold realizations for an intent: **enabled if ANY active realization is on** (Ruff `PLR0913` on +
Pylint `too-many-arguments` disabled = enforced, **not** a contradiction — the corpus's most
important correction). `contradiction` only if the intent is documented AND **every** active
realization is explicitly off. Parse `# Handled by ruff/mypy` delegation comments as strong
not-a-gap evidence. Prefer the Ruff fix when both realize it.

### 3e. False-gap guards (mitigating signals — never flag these as gaps)

Formatter-owned norms (quotes/line-length → Ruff-format/Black/Prettier), type norms → mypy **or**
pyright/pyrefly/`ty`, preset-hidden rules (→ `unknown`, not "off"), non-ESLint JS linters
(oxlint/Biome present → don't claim ESLint gaps).

### 3f. Seed intents (weighted by real doc frequency, not just "a rule exists")

High-value, corpus-observed: naming (`N`/`C0103`), line-length (`E501`/`C0301` — most-stated),
function/module-length + complexity (`PLR0915`/`C901`/too-many-\*), max-args (`PLR0913`), bare/broad
except → specific-exception (`E722`/`BLE001`/`broad-exception-caught`), unused (`F401`/`F841`),
import-sorting (`I001`), assert-in-prod (`S101`), hardcoded-secrets (`S1xx`), docstrings (`D1xx`/
`missing-docstring`), f-strings (`UP032`/`C0209`). JS cross-language: no-any, no-floating-promises,
naming, no-unused, require-curly (`curly`), consistent-type-imports, no-only-tests, node:-protocol.
Deprioritized (rare in the wild): no-print, mutable-default-arg, eqeqeq, wildcard-import.

## 4. The catalog (`compiler/catalog/rule-map.json`)

Leave it ESLint-shaped — it's the **model-tier** routing superset with a different precision
contract (bare-word keywords the deterministic tier bans). Add only a stable `intent-id` **join key**
so the two tiers dedupe; grow Python there as a sibling section on its own schedule. The deterministic
Python seed lives in typed, unit-tested TS (`Record`-completeness-checkable, per the rule-meta pattern).

## 5. The honest ceiling (state in the docs)

Deterministic finds: marked/sectioned/code-anchored rules; rejects index/narrative; scopes to real
languages+linters. It **cannot** find an anchor-less prose norm, decompose interacting clauses, quote a
denominator, or read a non-English file (→ a loud "unsupported language" notice). The most-common
documented norm ("comments explain why") is itself undecidable. Those are the opt-in model tier's job,
behind the existing consent + gate.

## 5b. The hook lane — enforcement taxonomy (Fable, 2026-07-14)

Grounded in reclassifying the 137 "unrouted" rules from the real corpus, a big slice are NOT lint
rules — they're process/VCS/shell/agent norms that "should be a hook". "Most rules are hooks" is the
wrong frame; the right axis is **enforcement boundary × failure asymmetry**. Five sub-classes:

| Class                  | Example                                                           | Enforced at                                                       | Instrument                                                                     |
| ---------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **H1 disaster guard**  | force-push, `rm -rf`, secret read, `curl\|sh`                     | agent tool-call (**no git event exists**)                         | compiled hook + verify battery; server-side branch protection is the real WALL |
| **H2 tool-redirect**   | "use `just test` not `cargo test`", "don't run `eslint` directly" | agent tool-call (best fit — deny msg re-steers the model in-loop) | compiled hook; #34692 barely matters                                           |
| **H3 sequencing**      | "run `pnpm check` before push"; "ruff after edit"                 | push→lefthook/CI; edit→PostToolUse `react`                        | delegate git part; react for edit-time                                         |
| **H4 VCS/intent**      | no co-author footer; "unless explicitly asked"                    | commit-msg→lefthook; **"unless asked" → the `ask` decision**      | `ask` is the differentiator lefthook has no analogue for                       |
| **H5 agent-attention** | "never re-read a file", "don't re-run a test"                     | **nothing — and nothing should try**                              | route to `meta`; MEASURE (flight recorder), never gate                         |

Two spine rules (anti-false-safety): **(1) No gate without its proof** — never SUGGEST a hook without
pairing it with the test that proves it blocks (the `assertBlocksDisasters` battery for
catalog-mapped disasters; a scaffolded `runHook` test built from the rule's own examples otherwise) —
this is the 2/7→7/7 finding productized. **(2) Honesty tags** per row — `wall` (server-side,
unbypassable) / `strong-default` (blocks in-loop but bypassable — #34692 for harness hooks,
`--no-verify` for client git hooks) / `suggested` (audit printed a snippet, nothing installed, **NOT
counted as coverage**) / `no-gate`. Composition insight audit can print: an H1 harness gate blocking
`--no-verify` is what protects your H3 git hooks.

Where vigiles's own hook machinery EARNS its place (be skeptical — delegate loudly elsewhere): (a)
**the boundary nothing else sees** — non-git tool calls (`rm -rf`, `curl|sh`, `cargo test` vs `just
test`, ruff-after-edit); lefthook is structurally blind to these; (b) **the VERIFY battery** — it
audits ANY hook incl. hand-written bash ("prove your guard blocks"); (c) **the `ask` decision** — no
lefthook analogue, exactly encodes "unless explicitly asked". Where git hooks are mature (commit-msg,
pre-push sequencing), audit says **"use lefthook"** out loud.

Router change: split `hook` → **`gate`** (agent tool-call boundary; a `flavor` of disaster / redirect
/ ask / stateful / react) + **`git-hook`** (commit/push boundary → lefthook/CI). Do NOT add an
agent-guidance category — `meta` already IS one; the re-read/re-run family only landed in `unrouted`
because `META_CUES` lacked the cues. **SHIPPED:** H5→`meta` cues + index-leakage rejection. **NEXT:**
the `hook`→`gate`/`git-hook` split with flavor + honesty tags + the "no gate without its proof"
pairing in audit. Full record in this section; the compiled-hook engine is `vigiles/hook`
(experimental, capped by #34692) + `guardrail-check.ts` (the battery).

## 6. Build plan

1. **Segmentation bug-fixes** (§2a) + `INDEX-SMELL` veto + `index`/`meta` routing categories.
   Regression fixtures harvested from the corpus (real index bullets vs real code-norms) + the repo's
   own CLAUDE.md. Smallest diff, precision+recall win, no data change.
2. **`Intent → Realization` type regroup** (no behavior change): fold the ~18 ESLint rows into
   single-realization intents; `variantsOf` → `aliases`. The calibration substrate.
3. **`ConfigProbe` port** + `detectRepoProfile` (both-keys scoping); wrap current ESLint logic as
   `eslintProbe`.
4. **`ruffProbe` + `pylintProbe`** (structural TOML/INI parse; the named-trap tests from §3c/§1).
5. **Seed the Python intents** (§3f) — pure-data PR; cross-language wiring onto shared intents.
6. **Tier ladder S0–S2** + the intent-verdict fold (§3d) + false-gap guards (§3e).
7. **AGENTS.md as a first-class doc surface** (the #1 corpus carrier); CLAUDE.md→AGENTS pointer follow.

Steps 1–2 are independent and low-risk (start here). Every ConfigProbe trap in §1/§3c becomes a test.

## Related

`research/audit-rule-compile-tier.md` (the tier's invariants — preserved: no denominator, textual/
structural parse not exec, teaser stays deterministic), `research/compiler-end-to-end-flow.md`
(the whole harvest→gate→run flow), `research/enforcement-model.md` (the decidability buckets the
signal decision-list mirrors).
