---
status: active
topic: compiler
---

# Rule compiler — design of record

> The crisp answer to "what is the rule compiler, what can it realistically do, and
> how does it behave with several linters / freeform prose?" The two companion docs
> are BUILD-LOGS with the blow-by-blow: `rule-compiler-multilang-design.md`
> (segmentation + the multi-language reasoning) and `compiler-end-to-end-flow.md`
> (the `@vigiles/compiler` synthesis pipeline). THIS doc is the front door — read it
> first, then drop into those for detail. Records the 2026-07-15 design decisions.

## 0. What it is (and isn't)

The "rule compiler" is TWO layers that share one question — _can this prose rule be
turned into an enforced check?_:

1. **The rule MAP** (deterministic, in `vigiles audit`) — reads the prose rules in a
   repo's `CLAUDE.md` / `AGENTS.md`, decides which text is even a rule, and routes
   each one into a lane (enforceable / hook / custom / judgment). No model, nothing
   executes (except the own-repo linter-catalog read, gated). Code:
   `src/rule-routing.ts` and `src/core/rule-catalog.ts`.
2. **The SYNTHESIS tier** (`@vigiles/compiler`, opt-in, model-gated) — for the
   "custom rule" residue, writes an actual checker + proves it sound on a blind gold
   set or abstains. `compiler/`.

It is **NOT** the `enforce()` cross-reference engine (`src/core/linters.ts`). That
engine _verifies a rule you already named_ across 7 catalogs; the rule map _discovers_
which prose _could_ become a rule across 2. See §4 — do not conflate them.

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

### DECISION (2026-07-15): the map supports exactly TWO linters — ESLint + Pylint — and that is FROZEN for now.

Ruff, RuboCop, Clippy, Stylelint are **deliberately out of scope** for the rule map.
A prose rule that would map to (say) a Ruff rule simply won't resolve to reuse — it
falls to "custom" or "judgment". This is a scope line, not a bug, and the report +
docs must **say so plainly** rather than imply broad coverage. Effort goes to
detection reliability + the report contract (below), not linter breadth. Ruff (which
is foreign-safe — static rule set, TOML config is data) remains the cheapest _future_
add if we lift the freeze, but we are not building it now.

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

What we actually run is a **heuristic segmenter** (`src/core/segment.ts`) biased for
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
the confident set trustworthy. **Status: TARGET — today detection is single-tier
(confident only); the "possible" tier is designed here, not yet built.**

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

**Status: TARGET — today only (1) is shown. (2)+(3)+(4) are designed here, not built.**
(Open sub-question for build time: keep the terminal/HTML lean and put the full
skipped list in `--json`, vs show a trimmed skipped list inline. Lean toward: inline
counts + caveat, full list in `--json`.)

## 4. Compilability — the four lanes ARE the "compilable or not" answer

Once a bullet is a (confident) rule, "can it be compiled?" _is_ the routing:

| Lane                      | Compilable how                                              | Enabled-state?                                |
| ------------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| ✓ **Enforceable** (reuse) | an existing lint rule already does it                       | yes (own-repo) — ✓ on / ⛔ documented-but-off |
| ⛓ **Hook**                | enforceable, but by a git hook not a linter                 | n/a                                           |
| ⚙ **Custom rule**         | no off-the-shelf rule, but a synthesizable checker can (§5) | n/a                                           |
| ✎ **Judgment**            | undecidable — stays prose ("keep it readable")              | n/a                                           |

**The two "which linters?" answers — never conflate:**

|           | Rule MAP (this doc)                | `enforce()` engine (`core/linters.ts`)                          |
| --------- | ---------------------------------- | --------------------------------------------------------------- |
| does what | DISCOVERS: prose → could-be-a-rule | VERIFIES: a rule you NAMED exists + is on                       |
| linters   | **2** (ESLint, Pylint)             | **7** (ESLint, Stylelint, Ruff, Clippy, Pylint, RuboCop, Cedar) |
| input     | freeform prose                     | an explicit `enforce("eslint/x")` mark                          |

## 5. The synthesis tier (the ⚙ lane's hand-off)

`@vigiles/compiler`, opt-in + model-gated. Decision order **REUSE > SYNTHESIZE**: only
the residue no off-the-shelf rule covers is synthesized. A synthesized checker must
pass its own self-test AND an independent blind gold set (precision = recall = 1.0) or
it **abstains** — never ships a checker it can't prove sound. One gate, per-engine
executors: **ESLint** rules (JS module) and **Python** (an ast-grep rule object —
data, not code). **Built** (both engines; `compiler/gate.js`, `compiler/executors/`).

## 6. What's realistically doable

| Capability                                   | Doable?                                                 |
| -------------------------------------------- | ------------------------------------------------------- |
| Reliable rule detection (rules vs not)       | ❌ NO — undecidable; heuristic ceiling, precision-first |
| Two-tier detection (confident + possible)    | ✅ yes — the honest way to recover recall (designed)    |
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

Decisions 2 + 3 are TARGET state — designed here, not yet built. What's built today:
the 2-linter merge + per-rule provenance, enabled-state, the 4-lane routing, and
synthesis for both engines, all CI-dogfooded (`src/rule-routing-oss.test.ts`,
`src/rule-catalog-oss.test.ts`, `compiler/gate.js`).

## See also

- `research/rule-compiler-multilang-design.md` — segmentation model + multi-language
  build-log (the detailed §0/§0.0 record).
- `research/compiler-end-to-end-flow.md` — the `@vigiles/compiler` synthesis pipeline.
- `research/reference-verification-limits.md` — the general proxy-vs-judgment /
  undecidability boundary this doc's §2 is a specific instance of.
