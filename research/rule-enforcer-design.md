---
status: active
topic: compiler
---

# Rule enforcer — design of record

> **STATUS: ALPHA (experimental).** Only 2 linters, scarce dogfood, an undecidable
> core, and a complex pipeline with no "finished" state. **§8 is the load-bearing
> section — the scope-freeze + backlog — READ IT before spending any effort
> "improving" this**, because the tuning is otherwise infinite. §9 answers how we
> test it on OSS given the model-gated parts.
>
> The crisp answer to "what is the rule enforcer, what can it realistically do, and
> how does it behave with several linters / freeform prose?" The two companion docs
> are BUILD-LOGS with the blow-by-blow: `rule-enforcer-multilang-design.md`
> (segmentation + the multi-language reasoning) and `compiler-end-to-end-flow.md`
> (the `@vigiles/rule-enforcer` synthesis pipeline). THIS doc is the front door — read it
> first, then drop into those for detail. Records the 2026-07-15 design decisions.

## 0. What it is (and isn't)

The "rule enforcer" is TWO layers that share one question — _can this prose rule be
turned into an enforced check?_:

1. **The rule MAP** (deterministic, in `vigiles audit`) — reads the prose rules in a
   repo's `CLAUDE.md` / `AGENTS.md`, decides which text is even a rule, and routes
   each one into a lane (enforceable / hook / custom / judgment). No model, nothing
   executes (except the own-repo linter-catalog read, gated). Code:
   `src/segment.ts`, `src/rule-routing.ts`, and `src/core/rule-catalog.ts`.
2. **The SYNTHESIS tier** (`@vigiles/rule-enforcer`, opt-in, model-gated) — for the
   "custom rule" residue, writes an actual checker + proves it sound on a blind gold
   set or abstains. `rule-enforcer/`.

It is **NOT** the `enforce()` cross-reference engine (`src/core/linters.ts`). That
engine _verifies a rule you already named_ across 7 catalogs; the rule map _discovers_
which prose _could_ become a rule across 2. See §4 — do not conflate them.

### The pipeline at a glance

```
 CLAUDE.md / AGENTS.md                         repo's linters (own-repo + consent)
        │                                       ┌ enumerateEslintCatalog ─┐
        │  computeRuleRouting (cli.ts)          ├ enumeratePylintCatalog ─┤
        │  gatherInstructionFiles ──────────────┤     mergeCatalogs       │→ RuleCatalog
        ▼                                       └─────────────────────────┘  (concat; each
   ┌─────────────────────────────────────────────┐          │                rule keeps its
   │ segmentInstructions  (src/segment.ts)        │          │                linter + code)
   │  prose → atomic bullets, each passed to      │          ▼
   │  gate() → { confidence: high | medium }      │   buildCatalogLookup (rule-routing.ts)
   │        or { reject: index | description |    │   token → { linter, enabled }
   │                 section | no-signal }        │   (id collision → combine; a numeric
   └─────────────────────────────────────────────┘   code keeps its own linter's hit)
        │  segments[] + skipped[]                            │
        ▼                                                    ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │ routeRules  (src/rule-routing.ts)                                  │
   │  1. extractMarkedRules — **Enforced by:** / **Guard:** (definitive) │
   │  2. RESCUE ladder (catalog / pattern / intent) → confident (§2)     │
   │  3. partitionCandidates → confident | possible | skipped(reason)    │
   │     classify() each confident bullet → a lane                       │
   └───────────────────────────────────────────────────────────────────┘
        │  RuleRouting { rules[], possible[], skipped[], counts }
        ▼                                     ▼
   audit-report.ts → AuditReport      report/RuleInventory.tsx (HTML)
        │
        └── ⚙ "unrouted" lane hands off to  @vigiles/rule-enforcer (§5) — a SEPARATE
            package; proves a synthesized checker on a blind gold set or abstains.
```

The **rule-vs-not** decision is `gate()` in `segment.ts` (§2); the **which-lane**
decision is `routeRules` in `rule-routing.ts` (§4). The deontic/imperative vocabulary
both stages key on lives in ONE module, `src/rule-signals.ts`, so the segment gate's
`RULE_PREDICATE` and the routing tier's `NORM_SIGNAL` can't drift.

**Why the three pure-domain modules (`segment.ts`, `rule-routing.ts`,
`rule-inventory.ts`) sit at `src/` root, not `src/core/`** (where their sibling
`rule-catalog.ts` lives): they are the audit-detector layer that composes the
domain; keeping them at root avoids a `core → root` import (`rule-routing` depends on
`rule-inventory`'s `INTENT_MAP`). Moving all three into `core/` is a viable cleanup
but a cosmetic ~15-file churn, deliberately deferred.

## 1. Multiple linters in one project

A repo can carry several linters (ESLint for JS, Pylint for Python, …). The model:

```
prose rules (CLAUDE.md / AGENTS.md)          your project's linters
        │                                    ├─ eslint  → enumerate ~700 rules
        │                                    └─ pylint  → enumerate ~389 rules
        ▼                                            │  (each rule tagged with its linter)
   for each prose rule:  "does an off-the-shelf     ▼
   rule enforce this?"  ───────────────────►  ONE MERGED CATALOG
        │                                     eslint:no-console (on)
        ▼                                     pylint:invalid-name (off)
   route → ✓ eslint:x / ✓ pylint:y / ⛓ / ⚙ / ✎
```

- vigiles enumerates **each** linter it finds, **merges** the catalogs, and tags every
  matched rule with its linter, so a polyglot map reads `eslint:no-floating-promises`
  next to `pylint:invalid-name` — never an ambiguous linter-less match. (Per-rule
  `linter` provenance: `AvailableRule.linter`, `mergeCatalogs`; **built**.)
- Enabled-state (`✓ on` / `⛔ off`) comes from running the real linter, so it's an
  **own-repo + consent** capability; a foreign repo gets the textual match only.

### DECISION (2026-07-15): map linters — ESLint + Pylint, and (UPDATED same day) + Ruff.

> **UPDATE (2026-07-15, later same day): the freeze was lifted for RUFF.** Real Python repos
> use ruff, not pylint (measured: Python AGENTS.md matched pylint checks their toolchain doesn't
> run). Ruff was added **route-only** for the NET-NEW intents pylint lacks (PLC0415, E402,
> ANN001/201, TRY400, T201, I001), keyword-disjoint from pylint, every code verified against
> ruff 0.15.8. Config-state stays eslint-only (ruff `select`/`ignore` ConfigProbe pending).
> So the map now supports **ESLint + Pylint + Ruff (route-only)**. See
> `rule-enforceability.md` (the current linter-support table) and `src/rule-inventory.ts`.
> **CLIPPY (Rust) is still the open GAP** — Rust AGENTS.md route ~0% purely from that; it is the
> next ruff-like win. RuboCop/Stylelint remain out of scope for routing (verification-only via
> `enforce()`). The original frozen-at-2 text below is kept as the historical decision.

Original decision (superseded for ruff): Ruff, RuboCop, Clippy, Stylelint are **deliberately out
of scope** for the rule map. A prose rule that would map to (say) a Ruff rule simply won't resolve
to reuse — it falls to "custom" or "judgment". This is a scope line, not a bug, and the report +
docs must **say so plainly** rather than imply broad coverage. Effort goes to detection reliability

- the report contract (below), not linter breadth. Ruff (which is foreign-safe — static rule set,
  TOML config is data) remains the cheapest _future_ add if we lift the freeze, but we are not
  building it now.

## 2. Separating rules from non-rules — the undecidable core

This is the load-bearing hard problem, and the honest answer is: **we cannot do it
perfectly.** An instruction file is freeform prose with no ground truth for "this
line is a rule":

| Bullet                                 | Rule? | Why                                             |
| -------------------------------------- | ----- | ----------------------------------------------- |
| "Never use `console.log`"              | ✅    | imperative prohibition                          |
| "Every function must have a docstring" | ✅    | deontic — but declarative subject, easy to miss |
| "This project is a monorepo"           | ❌    | context / description                           |
| "Run `npm install` to set up"          | ❌    | setup step, not a norm                          |

What we actually run is a **heuristic segmenter** (`src/segment.ts`) biased for
**precision over recall**:

- **Signals it treats as a rule:** imperative / deontic heads (never, always, avoid,
  require, must, don't…), a named lint rule in backticks (`` `eslint/x` ``),
  structured markers (`**Enforced by:**`, `**Guard:**`, `**Guidance only**`).
- **Signals it rejects:** descriptive sentences, section headings, setup / how-to
  steps, index-like content, agent-attention meta.
- **When unsure, it drops.** So it _under-reports_ rather than flooding you with false
  "rules".

**Realistic reliability: high precision, lower recall.** What it flags is usually a
real rule; it _will_ miss some — especially declarative phrasings ("Every function
must…"). This is the ceiling of NL rule-extraction, not a defect we can engineer
away. The response is not "make it perfect" — it's "**be two-tier and be honest**".

### DECISION (2026-07-15): TWO-TIER detection — confident + possible.

Rather than one drop-or-keep verdict, detection reports two sets:

- **Confident rules** — cleared the precision bar (a named rule, a marker, or a strong
  imperative/deontic head). These populate the routed lanes as today.
- **Possible rules (review these)** — bullets that look rule-ish but didn't clear the
  bar (a declarative "Every X must Y", a norm with no imperative head). Surfaced
  SEPARATELY so a recall miss is visible to a human WITHOUT polluting the confident
  lane or the lane counts.

This gives the user the recall they'd otherwise lose, as a review list, while keeping
the confident set trustworthy. **Status: BUILT** (`RuleRouting.possible`, populated by
`partitionCandidates` in `src/rule-routing.ts`; rendered by the terminal summary + the
HTML report).

### The rescue ladder + the no-signal fold (the two subtle, load-bearing bits)

Two mechanisms recover recall WITHOUT lowering precision — document them because they
live mostly in code and are easy to get wrong:

- **The RESCUE ladder** (`RESCUE_SOURCES` in `rule-routing.ts`). A `medium`-confidence
  bullet (or a `no-signal` reject) is PROMOTED to confident if it provably maps to a
  real off-the-shelf rule via any of three sources: **catalog** (the text names a rule
  the repo's live catalog has), **pattern** (a construct-prohibition like "No default
  exports" → `no-restricted-syntax`), or **intent** (an `INTENT_MAP` keyword). The
  catalog/pattern/intent match is a higher-precision signal than the segmenter's
  imperative-head cue, so it overrides the medium drop.
- **The no-signal fold ASYMMETRY** (`partitionCandidates`). A bullet the gate rejected
  as `no-signal` is folded back as a review candidate, but it is promoted to confident
  ONLY by a RESCUE — **never** by the blanket `minConfidence: "medium"` opt-in. The
  opt-in widens the confident tier for genuine `medium` SEGMENTS, but must not
  resurrect bullets the gate explicitly rejected. Getting this wrong floods the
  confident tier with prose (the exact regression a reviewer caught pre-merge).

## 3. The report contract — "be clear about what you detected"

The current report lists routed rules but never states that detection is a
best-effort filter, and never shows what it set aside — so a user can't tell
"no rules here" from "I skipped your declarative bullets". That's the honesty gap.

### DECISION (2026-07-15): the report SHOWS what it skipped, with why.

The audit rule-map section reports, in order:

1. **Confident rules** → their lanes (✓ enforceable / ⛓ hook / ⚙ custom / ✎ judgment),
   each with linter + enabled-state where known.
2. **Possible rules (review)** → the §2 second tier — "looks like a rule, we weren't
   sure", so you can promote or ignore.
3. **Skipped** → bullets we decided were NOT rules, each with a one-word reason
   (heading / setup-step / description / context), so a wrong drop is eyeball-able.
4. A one-line honesty caveat: _detection is a heuristic, precision-first filter — it
   won't catch every rule._

**Status: BUILT.** All four are shown: the terminal summary + HTML report render the
confident lane counts, a `possible (review)` list, and a `skipped` list with reasons,
under the precision-first caveat. `audit --json` carries the full `ruleRouting`
(`rules` / `possible` / `skipped` / `counts`) for a machine reader.

## 4. Compilability — the four lanes ARE the "compilable or not" answer

Once a bullet is a (confident) rule, "can it be compiled?" _is_ the routing:

| Lane                      | Compilable how                                              | Enabled-state?                                |
| ------------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| ✓ **Enforceable** (reuse) | an existing lint rule already does it                       | yes (own-repo) — ✓ on / ⛔ documented-but-off |
| ⛓ **Hook**                | enforceable, but by a git hook not a linter                 | n/a                                           |
| ⚙ **Custom rule**         | no off-the-shelf rule, but a synthesizable checker can (§5) | n/a                                           |
| ✎ **Judgment**            | undecidable — stays prose ("keep it readable")              | n/a                                           |

**Lane label ↔ code `RuleCategory` ↔ glyph** — the one mapping, because the code
name and the user-facing lane label differ (and `LANE_META` in `rule-routing.ts` is
the single source the terminal + report read):

| `RuleCategory` (code) | Lane label (UI) | Glyph | Mechanism     | Meaning                                                            |
| --------------------- | --------------- | ----- | ------------- | ------------------------------------------------------------------ |
| `reuse`               | enforceable     | ✓     | `config-line` | an off-the-shelf lint rule already does it                         |
| `hook`                | hook            | ⛓     | `hook`        | an action a linter can't see (git / shell) → a git/PreToolUse hook |
| `unrouted`            | **custom**      | ⚙     | `synthesize`  | no off-the-shelf rule; the §5 synthesis tier MIGHT write one       |
| `semantic`            | judgment        | ✎     | `prose`       | undecidable — stays prose                                          |
| `meta`                | agent-note      | ☰    | `prose`       | an agent-instruction, not a code rule ("read X first")             |

> ⚠️ `unrouted` is a **wire value** (it appears in the versioned `AuditReport`
> JSON `counts`), which is why the code name isn't renamed to its lane label
> `custom`. A rename would be an `AuditReport` schema bump. `LANE_META` resolves the
> human-facing name; don't hardcode a glyph/label anywhere else.

**The two "which linters?" answers — never conflate:**

|           | Rule MAP (this doc)                | `enforce()` engine (`core/linters.ts`)                          |
| --------- | ---------------------------------- | --------------------------------------------------------------- |
| does what | DISCOVERS: prose → could-be-a-rule | VERIFIES: a rule you NAMED exists + is on                       |
| linters   | **2** (ESLint, Pylint)             | **7** (ESLint, Stylelint, Ruff, Clippy, Pylint, RuboCop, Cedar) |
| input     | freeform prose                     | an explicit `enforce("eslint/x")` mark                          |

## 5. The synthesis tier (the ⚙ lane's hand-off)

`@vigiles/rule-enforcer`, opt-in + model-gated. Decision order **REUSE > SYNTHESIZE**: only
the residue no off-the-shelf rule covers is synthesized. A synthesized checker must
pass its own self-test AND an independent blind gold set (precision = recall = 1.0) or
it **abstains** — never ships a checker it can't prove sound. One gate, per-engine
executors: **ESLint** rules (JS module) and **Python** (an ast-grep rule object —
data, not code). **Built** (both engines; `rule-enforcer/gate.js`, `rule-enforcer/executors/`).

## 6. What's realistically doable

| Capability                                   | Doable?                                                 |
| -------------------------------------------- | ------------------------------------------------------- |
| Reliable rule detection (rules vs not)       | ❌ NO — undecidable; heuristic ceiling, precision-first |
| Two-tier detection (confident + possible)    | ✅ **built** — the honest way to recover recall         |
| Multi-linter merge + per-linter provenance   | ✅ yes — **built** for 2 linters                        |
| Reuse match when prose NAMES a rule          | ✅ reliable (own-repo, incl. enabled-state)             |
| Reuse match when prose only DESCRIBES a rule | ⚠️ ~0% on foreign docs — needs the catalog (own-repo)   |
| Enabled-state ("documented but OFF")         | ✅ **built** — own-repo + consent, ESLint + Pylint      |
| Custom-rule synthesis (ESLint + Python)      | ✅ **built** — gated, abstains when unproven            |
| More linters in the map (Ruff, RuboCop, …)   | ⏸️ frozen by decision — Ruff is the cheap future add    |

## 7. Decisions of record (2026-07-15)

1. **Rule map is frozen at 2 linters (ESLint + Pylint).** Documented scope, not silent.
2. **Detection is two-tier: confident + possible-review.** Recovers recall honestly.
3. **The report shows skipped bullets + a best-effort caveat.** No invisible misses.

**All three are BUILT** (2 + 3 shipped 2026-07-15). Built today: the 2-linter merge +
per-rule provenance, enabled-state, the 5-category / 4-lane routing, the two-tier
detection (confident + possible + skipped-with-reason), the rescue ladder + no-signal
fold (§2), and synthesis for both engines — all CI-dogfooded
(`src/rule-routing-oss.test.ts`, `src/rule-catalog-oss.test.ts`, `src/segment.test.ts`,
`rule-enforcer/gate.js`).

## 8. Status: ALPHA — the scope-freeze + backlog (READ THIS before "improving" it)

The rule map is **alpha**, and the report/CLI/user-docs now say so (badged
_experimental_). This section exists to STOP the feature becoming an infinite tuning
sink — the detection problem has no optimum, so without a freeze we would spend
unbounded energy for diminishing returns. The rule: **freeze the shape, capture the
backlog, chase almost none of it.**

### Why it's alpha — the honest constraints

- **Only 2 linters** (ESLint + Pylint), frozen (§1). A rule that would map to Ruff /
  RuboCop / Clippy / Stylelint falls to custom/judgment by design.
- **Scarce dogfood.** A handful of vendored MIT OSS instruction files + one authored
  real-pylint config — not a broad, representative corpus. Every calibration number (the
  precision cutoffs, the reject vocabulary, the rescue lists) is only as trustworthy as
  that corpus, so real-world recall/precision on an unseen repo is genuinely uncertain.
- **The core is undecidable** (§2). "Is this line a rule?" has no ground truth; the
  precision-first heuristic MISSES rules and always will — Rice's theorem, not a TODO.
- **The pipeline is already complex** (segment gate + rescue ladder + tiers + catalog
  collision handling). Each new heuristic buys a little recall and costs precision +
  maintainability. The marginal return is diminishing and visible.

### The BALANCE — why "just make it better" is a trap

Quality here is a multi-way tradeoff with no maximum, only positions. Pushing any axis
degrades another:

- **feasibility** — some rules are undecidable or need whole-repo semantics no detector has.
- **skill quality** — the synthesis tier is only as good as the model + gate; a wrong
  synthesized rule is worse than none.
- **token consumption** — richer detection / synthesis / codebase-research burns the
  user's subscription; every model call must earn its cost.
- **human-in-the-loop** — the honest design surfaces `possible`/`skipped` for a human to
  judge instead of pretending to decide; more automation trades trust for coverage.
- **codebase research** — better matches need context on the user's real code (their
  installed rules, their conventions) — more input, more cost, more latency.

There is no "finished" state to reach, which is precisely why we FREEZE rather than chase.

### FROZEN pipeline shape (v1 — do not re-architect without measured evidence)

The shape is settled:

```
segment (gate) → merge catalogs → route (markers → rescue → partition:
                 confident | possible | skipped) → LANE_META presentation
```

Behavior-preserving REFACTORS (like the 2026-07-15 decomposition) are always welcome.
Changing the SHAPE — adding a heuristic, a lane, a linter, or a rescue source — must
clear a bar: **a measured precision/recall win on the (ideally broadened) dogfood
corpus**, not a vibe. Absent that evidence, the answer is no.

### Backlog — MARKED, not chased

Real improvements exist; none earns open-ended effort now. Rough value order:

1. **Broaden the deterministic dogfood corpus** — the single highest-leverage item, and
   it needs NO model (see §9). Every calibration number depends on it.
2. **Ruff** — the cheapest linter to add (static rule set, TOML config is data).
3. **`possible`-tier recall tuning** — measure how many real rules land in
   possible vs confident vs skipped, on the broadened corpus.
4. **Codebase-research inputs** — feed the user's real conventions / rule catalog into
   detection for higher-precision matches (costs context + latency).
5. **Synthesis quality** — the model-gated custom-rule tier is the deepest + most
   expensive; improve only behind the trust gate + on-sub measurement.
6. **A `possible` → `confident` promotion UX** — let a human confirm a review-tier bullet
   once and remember it (the human-in-the-loop lever).

The default answer to "should we improve the rule map?" is **no — unless it's #1, or a
measured win.**

### The point: an impressive, HONEST demo — not an energy sink

This feature earns its place as a striking demo: _"point vigiles at your repo and watch
it map your prose rules to real lint rules — and flag the ones you documented but never
enabled."_ That lands TODAY with the current shape. It does not need to be perfect to be
impressive; it needs to be **honest** (hence the tiers + the experimental badge) and to
not consume the energy the higher-leverage parts of vigiles need.

## 9. How we test it — and the "OSS e2e with an LLM in CI?" question

The pipeline splits cleanly into a DETERMINISTIC half (CI-testable on real OSS) and a
MODEL-GATED half (not CI-able). That split IS the answer to "how do we e2e-test the map
on real projects when it uses an LLM?": **the part that would need an LLM is not the map.**

- **The rule MAP is model-free** — segment → route → catalog + enabled-state runs no
  model, so it is e2e-dogfooded on real OSS **in CI today**:
  - `src/rule-routing-oss.test.ts` — routes real vendored MIT OSS instruction files
    (langchain / browser-use / modelcontextprotocol `AGENTS.md`) and asserts stable
    routing invariants.
  - `src/rule-catalog-oss.test.ts` — drives the **real `pylint` binary** (installed in
    CI) on a real config and asserts enabled-state end to end.
  - `src/segment.test.ts` + the routing suites cover the detector logic.
    So the deterministic OSS e2e is already there — the honest gap is BREADTH (few repos),
    not the ability to run it. (Broadening it is backlog #1, and needs no model.)
- **The synthesis trust GATE is deterministic** — `rule-enforcer/gate.js` runs in CI on a
  FIXED gold corpus (proves a synthesized checker is sound on a blind set or abstains).
  No model at CI time; the verdicts are pinned.
- **What genuinely CAN'T go in CI** is the LLM SYNTHESIS of a NEW rule from a user's
  codebase, and any trigger/behavioral measurement — those need a model, cost tokens,
  and are nondeterministic. They run on YOUR subscription, never CI — the same posture
  as the eval tiers (R1 deterministic in CI, model-gated on-sub; see
  `research/eval-coverage-and-isolation.md`). Validate them by MANUAL spot-checks on a
  few real repos on-sub, labelled MANUAL per the dogfood-vendoring-policy — never a CI
  job that needs an API key.

**Bottom line:** the audit rule MAP doesn't use an LLM, so its OSS e2e is deterministic
and already CI-run; only the opt-in synthesis / behavioral tiers use a model, and those
are validated on-sub + manually, not in CI. The thing worth investing in is a broader
deterministic OSS corpus (backlog #1) — no model required.

## See also

- `research/rule-enforcer-multilang-design.md` — segmentation model + multi-language
  build-log (the detailed §0/§0.0 record).
- `research/compiler-end-to-end-flow.md` — the `@vigiles/rule-enforcer` synthesis pipeline.
- `research/reference-verification-limits.md` — the general proxy-vs-judgment /
  undecidability boundary this doc's §2 is a specific instance of.
