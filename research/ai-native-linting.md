---
status: active
topic: linters
---

# AI-native linting — the LLM-reviewer wave and where the deterministic line holds

> Status: research (2026-06-13). Adjacent to
> [reference-verification-limits](reference-verification-limits.md),
> [ai-code-quality](ai-code-quality.md), [enforce-over-guidance](enforce-over-guidance.md).
> Does NOT re-cover the proxy-vs-judgment / prose-undecidability boundary
> (that's reference-verification-limits), the catalog of AI-code failure modes
> (ai-code-quality), the rule-sync tool comparison
> ([competitive-landscape](competitive-landscape.md),
> [sync-landscape-analysis](sync-landscape-analysis.md)), or the
> deterministic-upgrade-gate mechanics (enforce-over-guidance). Covers: the
> 2026 LLM-as-linter / AI-code-review field, what's genuinely new vs hype,
> and the one strategic question — does vigiles stay deterministic-only, or
> does it grow a falsifiable judge-rule tier gated by its own eval machinery?

## TL;DR

The AI-code-review field exploded in 2026 (CodeRabbit, Greptile, Cursor BugBot,
Sourcery, Qodo, Korbit, Semgrep Assistant) and has already **converged on one
pattern: layered review — a probabilistic LLM tier on top of a deterministic
linter tier**, because the LLM tier alone has a precision problem nobody has
solved (academic ACR benchmarks: top technique ~19% F1, four others <10%
precision; the field's own bake-offs show 82% recall bought with double-digit
false positives). The interesting new capability is **natural-language custom
rules** — "flag PRs that bypass our auth middleware," authored in English, not
a YAML AST query. vigiles sits one layer up from all of them: it doesn't lint
code, it verifies the _references in the instruction file that points the agent
(and increasingly the AI reviewer) at the rules_. Two lanes:

1. **Improvement (recommended, ship first):** extend the 7-catalog cross-ref
   engine to AI-linter rule catalogs — verify that the `coderabbit/` or
   `semgrep/` or `greptile/` rule your CLAUDE.md cites actually exists and is
   enabled. The AI-review wave creates a _new class of dangling reference_
   (English rules that drift), and nobody verifies them.
2. **New direction (prototype, don't trust):** a `judge()` _rule kind_ —
   honestly probabilistic, never a silent gate, only admissible when its
   reliability has been **measured** by the existing `eval`/`stats` tooling
   (recall + falsePositiveRate + Welch significance). This is the only way to
   add judgment without breaking the determinism creed: you don't trust the
   judge, you _falsify_ it.
3. **Pivot (rejected):** become an AI reviewer. No — that's a crowded, capital-
   intensive, precision-cursed market and it abandons the moat.

## Landscape 2026 (the AI-linter / AI-code-review field)

The field splits into three bands, and they are visibly merging.

**Band A — pure LLM PR reviewers.** CodeRabbit (largest, ~2M repos, 13M PRs,
works across GitHub/GitLab/Bitbucket/Azure), Greptile (full-codebase indexing,
"custom rules in plain English"), Cursor BugBot (in-editor, Autofix spawns
cloud-agent VMs), Sourcery, Qodo (PR-Agent lineage), Korbit, Baz. They read a
diff (or the whole indexed repo) and post review comments. The headline 2026
fact is **precision, not recall, is the wall**: independent bake-offs report
Greptile catching 82% of bugs vs CodeRabbit's 44% — but with 11 false positives
to CodeRabbit's 2; BugBot at 128 findings / 50 PRs / 4.8% FP. Academic ACR
benchmarks are harsher (top F1 ~19.38%, four techniques <10% precision; SWR-Bench
explicitly built to measure FP on 500 clean PRs). The conclusion across the
literature: SOTA automated review is **not yet gate-grade**; it is suggestion-grade.

**Band B — deterministic engines growing an AI skin.** Semgrep Assistant is the
clearest: a deterministic AST SAST engine underneath, an LLM layer on top that
_triages, explains, and autofixes_ findings (humans agree with auto-triage 97%
of the time — note that's triage of deterministic findings, not LLM-originated
findings). ast-grep and Biome's GritQL plugin are AST-pattern engines that now
ship **AI-assisted rule authoring** (English → AST query) while keeping
execution 100% deterministic. CodeRabbit itself bundles 40+ real linters and
markets their output as "zero-false-positive enforcement" — explicitly
_because_ the AI tier isn't.

**Band C — the layered consensus.** The dominant 2026 architecture, stated
almost identically by CodeRabbit, Semgrep, Codacy, and the trade press:
**probabilistic AI for subtle logic / architecture + deterministic linting for
concrete rules**, with the deterministic tier as the only thing allowed to
_block_ CI. Martin Fowler's harness-engineering frame (probabilistic compliance
vs deterministic constraints) and Factory.ai's "agents write the code, linters
write the law" are the same split. This is exactly the
[ai-code-quality](ai-code-quality.md) "LLM proposes, deterministic tool
disposes" finding, now industry default.

**What's genuinely new vs hype.**

- _Genuinely new:_ **natural-language custom rules that compile to / drive a
  checker** (Greptile English rules, Semgrep Assistant rule generation, ast-grep
  AI rule-gen). The rule itself is now a first-class, authored, drifting artifact
  written in prose. Also new: **full-repo indexing** as review context (Greptile),
  and **autofix-by-agent** (BugBot VMs).
- _Hype / unresolved:_ "AI catches the bugs linters miss" is true for recall and
  false for precision; without a human or a deterministic backstop the FP rate
  makes it un-gateable. "Custom rules in English" hides that an English rule is
  **unfalsifiable until you measure how often it fires correctly** — the same
  reliability gap, relocated from the reviewer to the rule.

## The gap / whitespace

Three observations the wave hands to vigiles:

1. **AI-linter rules are a new, fast-drifting reference class — and unverified.**
   When a CLAUDE.md says "CodeRabbit blocks raw SQL — don't write it," or a spec
   wants to `enforce("semgrep/sql-injection")`, _does that rule still exist in
   the org's CodeRabbit/Semgrep config?_ These rules are edited in dashboards and
   YAML far from the instruction file, so they rot faster than ESLint config.
   This is precisely the dangling-reference problem the 7-catalog engine already
   solves for ESLint/Ruff/Clippy — just pointed at a new catalog. Nobody does it.

2. **English custom rules have no falsifiability layer.** Greptile/Semgrep let
   you _write_ an English rule; nothing tells you it fires on the cases you meant
   and stays quiet on the ones you didn't. That is _exactly_ what vigiles's
   `measureTriggerRate` already computes for skill descriptions (recall +
   `falsePositiveRate` + `precision`). The machinery to grade a probabilistic
   rule already exists in this repo — pointed at skills, not lint rules.

3. **The instruction file is now also the AI reviewer's brief.** As reviewers
   read CLAUDE.md/AGENTS.md for project conventions, a stale reference there
   mis-aims the AI reviewer too — doubling the blast radius of the drift vigiles
   already catches. The "verify the map the agent reads" thesis
   ([reference-verification-limits](reference-verification-limits.md)) now also
   means "the map the _reviewer_ reads."

## Relation to vigiles's two pillars (the creed + the falsifiability boundary)

Pillar 1 (reference verification) is **untouched and strengthened** by the wave:
more rule catalogs to cross-reference, more drift to catch, the same gap-free
"does the rule exist + is it enabled" fact-check. `enforce()` never lints; it
_verifies the rule reference_. An `enforce("coderabbit/no-raw-sql")` is the same
shape as `enforce("eslint/no-console")` — vigiles confirms it's real and on,
CodeRabbit does the (probabilistic) judging. **Delegation, not absorption.**

The hard question is whether judgment ever crosses into vigiles itself. Tie it
precisely to the boundary in
[reference-verification-limits](reference-verification-limits.md):

- That doc's boundary is **proxy vs judgment for _forcing a behaviour_** — a
  deterministic hook that forces "mark your refs" is a decidable proxy for an
  undecidable judgment, so it's gameable (the `vigiles:ignore` escape hatch _is_
  the gap).
- The judge-rule question is a **different axis**: not "force a behaviour" but
  "**assert a property of code that is itself a judgment**" — "this error
  handling is real, not suppressed," "this isn't business-logic drift." These
  are the [ai-code-quality](ai-code-quality.md) silent-failure modes that _no_
  deterministic check reaches, by construction. Here there is no proxy to game,
  because there's no forced behaviour — there's a _measurement_ whose error rate
  is itself measurable.

So the falsifiability boundary for a judge rule is sharp and statable:

> A `judge()` rule is admissible **iff its decision is treated as a measurement
> with a known, committed error rate**, not as a fact. The instant a judge
> verdict silently blocks CI as if it were `enforce()`, it has crossed into the
> proxy-vs-judgment trap and the creed is broken. Kept on the measured side —
> reported with its falsePositiveRate, gated by significance, baselined for
> regression — it's an honest probabilistic tier, not a betrayal of determinism.

The creed isn't "never touch judgment." It's "**never present a judgment as a
fact.**" vigiles already crossed into judgment with `judge()` + `runEval` for
testing the harness; it just hasn't aimed that lens at _code_.

## Bold ideas (improvement → new direction → pivot)

### 1. `enforce()` over AI-linter catalogs — _improvement_

- **Bet:** the cross-ref engine is catalog-shaped; adding a resolver for
  CodeRabbit (`.coderabbit.yaml` + path-rules), Semgrep (registry + `.semgrep`
  rulesets), and Greptile (repo rules file) makes vigiles the only tool that
  verifies an AI-linter rule reference is real + enabled. Same gap-free fact-check,
  new and faster-drifting reference class (§gap-1). Extends to
  `generate-types`/`generate-schema` so a spec author gets autocompleted
  `coderabbit/...` rule names with squiggles on typos.
- **Risk:** AI-linter "rules" are often freeform English, not stable IDs — there
  may be no canonical name to resolve against (unlike ESLint's rule registry).
  Mitigated by starting with the tools that _do_ expose structured config
  (Semgrep registry IDs, CodeRabbit's path-instructions keys) and treating pure-
  English Greptile rules as un-resolvable-by-name (verify presence-of-file, not
  rule-identity).
- **Smallest first step:** a `semgrep/` resolver in `src/linters.ts` (registry +
  local `.semgrep` ruleset → rule exists + enabled), mirroring the existing
  Ruff/Clippy path. Semgrep is the most catalog-like and overlaps the existing
  SAST audience. One resolver proves the extension; the rest follow the pattern.

### 2. A measured `judge()` rule kind — _new direction_

- **Bet:** the one class of failure that is real, costly, and unreachable by any
  deterministic check is the silent-logic / suppressed-error / business-drift band
  ([ai-code-quality](ai-code-quality.md)). vigiles already has `judge()` (rubric →
  score), `runEval` (arms × trials, mean ± se), `measureTriggerRate`
  (recall/FP/precision), `stats.ts` (Welch significance), and `eval-baseline.ts`
  (regression gating). Compose them into a fourth rule kind that compiles to
  `**Judge (probabilistic, FP≈X%):**` in markdown and is _only_ allowed to gate
  if a committed eval shows its falsePositiveRate below a declared threshold with
  significance. The judge is never trusted; it's _continuously falsified_ against
  a labelled fixture set the author commits — exactly the no-undecidability-ceiling
  pillar, pointed at code instead of the harness.
- **Risk:** this is the creed's edge. The failure mode is a judge rule that
  silently degrades into a trusted gate (people stop re-measuring; the fixture
  set rots; the model changes underneath). Also: authoring a labelled fixture set
  is real burden, and a judge's FP rate is drift-prone across model versions.
  Mitigation is structural — make the markdown output _shout_ the probability,
  make `compile` **refuse** a `judge()` rule that lacks a current, passing eval
  baseline (reuse `assertNoRegression`), and re-pin the model in the cache key so
  a model bump invalidates the measurement (`eval-cache.ts` already keys on model).
- **Smallest first step:** _don't ship a rule kind yet._ Write one `*.eval.mjs`
  that uses the existing `judge()` to grade a known code-quality property (e.g.
  "error is handled, not swallowed") across a labelled corpus, and report its
  recall/FP via `measureTriggerRate`-style scoring. If the FP rate is publishable
  and stable across two model versions, the rule kind is justified; if it isn't,
  the experiment _is_ the evidence that judgment stays delegated — and that's a
  publishable result too.

### 3. Become an AI reviewer — _pivot (rejected)_

- **Bet:** ride the wave; ship a vigiles PR reviewer.
- **Risk:** crowded (8+ funded incumbents), capital-intensive, and precision-
  cursed (§Band-A); it abandons the deterministic moat for a commodity. The whole
  point of vigiles is to be the layer the reviewers _can't_ be — the one that
  verifies the rules they all consume. **Reject.** If anything, vigiles should
  verify the references in _their_ config, not compete with their verdicts.

## Honest case against

The strongest argument for deterministic purity (idea 2 = no): the moment
vigiles ships _any_ judge rule, the marketing line "deterministic by creed"
gets an asterisk, and asterisks are how positioning dies. A measured judge is
strictly harder to explain than "we only verify facts," and the layered-review
consensus (§Band-C) means **the deterministic tier is already a commodity** that
CodeRabbit/Semgrep bundle for free — so a vigiles judge tier competes on the
_probabilistic_ axis where it has no edge and the incumbents have indexing +
distribution. Under this view, idea 1 is the whole game: be the **registry of
record for AI-linter rule references**, the one tool that keeps the English-rule
sprawl honest, and let everyone else do the judging. The counter-counter is that
idea 2's smallest step _is the experiment that settles it_ — and a falsified-not-
trusted judge is a genuinely novel category nobody in Band A/B occupies (they all
present judgments as findings, none publish a per-rule, committed, regression-
gated FP rate). The doc's recommendation: **ship idea 1 now; run idea 2's
experiment; let the measured FP rate, not taste, decide whether the rule kind ever
ships.** That is itself the deterministic move — falsify the bet, don't believe it.

## See also

- [reference-verification-limits](reference-verification-limits.md) — the
  proxy-vs-judgment / prose-undecidability boundary this builds on.
- [ai-code-quality](ai-code-quality.md) — the AI-code failure modes a judge tier
  would target; "LLM proposes, deterministic tool disposes."
- [enforce-over-guidance](enforce-over-guidance.md) — deterministic upgrade gates;
  the Merkle-catalog-diff idea extends naturally to AI-linter catalogs.
- [harness-testing.md](../docs/harness-testing.md) /
  [harness-testing](harness-testing.md) — the eval/significance machinery idea 2
  reuses (the no-undecidability-ceiling pillar).
- [skill-eval-landscape](skill-eval-landscape.md) — `measureTriggerRate` /
  precision tooling the judge-rule falsifiability layer would reuse.
- [competitive-landscape](competitive-landscape.md) /
  [sync-landscape-analysis](sync-landscape-analysis.md) — the rule-sync field
  (not this doc's scope).
