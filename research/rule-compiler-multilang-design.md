---
status: active
topic: compiler
---

# Rule-compiler: multi-language design (Ruff + Pylint) + segmentation, grounded in a 20-repo corpus

> Design-of-record (2026-07-14). The `audit` rule-compile tier (`src/rule-inventory.ts` and
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

**🟡 DOABLE CHEAPLY (spike-proven, not wired)**

- Use the DYNAMIC available-rule catalog as the match target (1 API call, 702 rules) — deterministic
  match of prose that NAMES a rule against the LIVE catalog, replacing the hand-list AS THE STRATEGY.
- Surface available-but-OFF rules ("you have this rule installed, it's off").
- Route architecture / import intents to `reuse` (boundaries / import), not `semantic`.
- Parse ALL instruction sources — nested `CLAUDE.md` (`globSync('**/CLAUDE.md')` already exists in
  `cli.ts`) + `.claude/`. Today `readInstructionText` reads ROOT ONLY (misses 8 of 9 in this repo).

**🔴 HARD (model-tier / later)**

- Fuzzy SEMANTIC prose→catalog mapping ("keep functions small" → `max-lines-per-function`) — needs
  the model tier (the deterministic tier only catches prose that NAMES a rule/token).
- Custom-rule synthesis for the residue (`compiler/` has it, gated).
- Cross-language Ruff/Pylint via the ConfigProbe / Intent→Realization model (§3) — still valid, but
  SECONDARY to the dynamic-catalog reframe.

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
