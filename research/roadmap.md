---
status: active
topic: roadmap
---

# Roadmap — the single front door

> Updated 2026-06-13. The scattered "next steps" sections across the research
> docs were sprawling, so this is the **one consolidated, current view** of what
> ships next. Each item is a one-liner + a link to the doc that holds the
> rationale; detail lives there, priority lives here. When you finish or kill an
> item, move it here first.
>
> **Idea backlogs feed this** (ideas live there, the ranked plan lives here):
> [`audit-wow-ideas.md`](audit-wow-ideas.md) (the main one — new audit/lint checks,
> the **Flue poach F1–F8** in Appendix D, the OSS-issue detector harvest),
> [`feature-ideas.md`](feature-ideas.md) (pillar-1 user features),
> [`harness-testing-coverage-matrix.md`](harness-testing-coverage-matrix.md)
> (pillar-2 surface coverage), [`harness-state-space.md`](harness-state-space.md)
> (analogical-transfer moats). See also the full index in
> [`README.md`](README.md).

## Direction (technical)

> vigiles is ONE LOOP — declare what the harness should do (the typed spec) → check reality
> against it — via four instruments: **VERIFY** (lint/cross-ref/compile), **GATE** (compiled
> hooks), **MEASURE** (evals on your subscription), **OBSERVE** (the local `.vigiles/runs.jsonl`
> flight recorder). Full technical record: [`harness-observability-direction.md`](harness-observability-direction.md).
>
> _Business direction / positioning / monetization live in the private `startup/` vault
> (this is a public doc — see the `doc-tiers` rule)._

### Enforcement-tier backlog — ranked (from the 2026-07-15 breadth benchmark)

> Grounded by the 21-real-rulebook run (`rule-enforceability.md` breadth section): off-the-shelf
> routing is only **~4%** at breadth; the rest is a **⅓ mechanizable / ⅓ prose / ⅓ not-even-a-rule**
> split. That reorders where rule-engine effort pays off. (Launch readiness below is still the ship
> gate; this is the enforcement-tier work behind it.)

1. **Segmenter PRECISION** — ✅ **first pass shipped 2026-07-15** (`src/segment.ts`). ⅓ of segmented
   "rules" were commands / headings / pointers, NOT rules. Added two verified-safe gate rejects:
   (a) **`leadin`** — a colon-terminated procedure/enumeration header ("To add a setting:", "Python
   check:") whose enforceable content lives in the sub-list it introduces (confirmed on the corpus:
   sub-items segment independently, so the header drops for free); fires only when the header carries
   NO rule signal, so a norm-bearing header ("`expect` must come from test context — never …:") is
   kept. (b) **determiner-led `description`** — "The v1 README lives on the `v1.x` branch", "Each test
   lives in its own folder" — architecture FACTS, not norms; the determiner lead is what keeps it from
   eating verb-first imperatives ("Check you are not on main"). Measured: **818 → 789 segments across
   the 22-file corpus** (−29), hand-verified as ~28 clean non-rule drops + 1 minor edge-case-advice
   loss (a description-led compound bullet whose trailing sentence was advice); 0 real-rule regressions
   in the test suite. Distinct `leadin` reject reason (NOT `no-signal`) so routing does not re-surface
   it in the recall-review tier. **Still open:** the pointer/`Label: command` E-bucket (route-4
   verification targets, not norms) and the recall sibling. (Precision first — it was the bigger noise
   source at breadth.)
2. **AST-not-regex + gate-ABSTAIN** — the measured soundness law: every checker that leaked (2/13)
   was regex or a context-blind selector. Make the `compile-rules` synth prefer the target-language
   AST; make the gate ABSTAIN a checker that can't be proven sound. The cry-wolf guard.
3. **Clippy support (Rust routing)** — ✅ **shipped 2026-07-15** (`src/rule-inventory.ts`). 7 real
   clippy restriction lints mapped from the corpus's actual Rust prose (`.unwrap()`→unwrap_used,
   `.expect()`→expect_used, `panic!`, `unreachable!`, `todo!`, `dbg!`, wildcard-match-arm→
   wildcard_enum_match_arm). Rust-unambiguous keywords (macro `!` / `.method` / `clippy::` forms +
   "wildcard arm(s)" NOT bare "wildcard"), guarded by the cross-language-FP test. Route-only (like
   ruff/pylint — config-state stays eslint-gated; the Cargo.toml `[lints.clippy]` ConfigProbe is #4).
   Measured: codex/ghostty were **0%**; now the corpus routes clippy (codex→wildcard, ruff-repo→
   unwrap) — modest absolute count (these rulebooks are short/project-specific), but Rust is no longer
   a blind spot and it scales with any Rust-heavy rulebook. Tests added (positive Rust-routing +
   Python-doc-never-clippy guard).
4. **Ruff config-state (ConfigProbe)** — ruff is route-only; wire `select`/`ignore` detection → the
   "disabled → one-flip" / "✓ enforced" states for Python (currently eslint-only).
5. **5-homes routing surfaced in `audit`** — route each rule to its home explicitly (off-the-shelf /
   synth / hook / ref-verify / prose), not just reuse-vs-unrouted (see `rule-enforceability.md`).
6. **Evidence in the finding** — "enforceable AND violated in N files right now" (smaller real
   surface than hoped, but the sharpest wow where it lands).

## 🚀 Launch readiness (pre-HN) — the current top priority (2026-06-24)

> **▶ The full triage lives in [`pre-release-focus.md`](pre-release-focus.md)** — the
> park/polish/add decision over the WHOLE feature surface, the API-surface freeze plan,
> the positioning lock, the markdown-mode decision, and the launch sequence. This
> section is the summary; that doc is the detail.

> **📌 Positioning validation + the launch-article language to mirror** ("silent
> failure / drift from system prompt / tool contracts / harness fixes") live in the
> private `startup/` vault (git-crypt) along with the investor/competitor research —
> not detailed here.

> The new orienting goal: ship a **stable, focused public surface** and launch via a
> **measurement/debunk ARTICLE**, not a bare "Show HN: repo" drop (lint alone is too
> boring for the front page; the eval/measurement story is the interesting one). The
> repo is the DESTINATION the article drives to ("run it yourself — free, no key"),
> not the headline.
>
> **Launch framing — method-first AT SCALE, NOT caveman-first.** Caveman is
> SATURATED (~6mo old, multiple outlets, author conceded — see the Explore "viral
> debunk" note), so it is ONE validation row (it agrees with prior coverage → proves
> the harness is sound), never the headline. Headline = _"I built a re-runnable
> harness and measured the claims of N hyped Claude skills — here's the
> claim-vs-reality leaderboard,"_ where the FRESH content is the under-measured
> skills + head-to-heads + the surprising findings (output GROWS, best-case-is-worst).
>
> **The reorder this implies:**
>
> - **PROMOTED to launch-critical-path:** Ecosystem-Benchmark v0 (P1 below) — measure
>   ~10–20 hyped skills on `bench/corpus`. This is the main thing between us and the
>   article. The single most important pre-launch BUILD.
> - **PROMOTED — surface freeze (the "stop the breaking changes" posture the launch
>   needs):** (1) lock the **8 CLI verbs + flags + exit codes** (just consolidated —
>   the CLI is what ~90% of launch users touch, and it's a narrower/stabler contract
>   than the library); (2) draw a hard **public vs internal line** — un-export or
>   loudly label the experimental/parked surface (`guards.ts`, `hook-spec.ts`
>   effect-region, the opencode prototype, the deep typed-spec exports) so a later
>   breaking change burns nobody (audit via the `api-extractor` `api-surface/*.api.md`
>   surface); (3) ship a one-paragraph **0.x stability statement** ("CLI stable;
>   library API 0.x, evolving") — honest beats a fake 1.0.
> - **PROMOTED — first-run hardening + don't-cry-wolf:** a clean `npx vigiles@latest`
>   from an empty dir AND a real repo works fast, no crash, no key / no TS for
>   lint+audit+init; run audit/lint over the **top ~10 community plugins** and kill any
>   embarrassing false positive (a cry-wolf on a famous repo on launch day is fatal).
>   Plus a 20-sec asciinema/GIF of `lint` finding a stale ref + `audit` ranking a
>   marketplace, and a smoke-test of the PUBLISHED npm package.
> - **PARKED for launch (add back post-HN):** Guard / compiled hooks — niche (you must
>   write hooks) + the honest #34692 caveat dilutes a first impression. README section
> - table row commented out (markers point here); the `docs/compiled-hooks.md` guide
>   stays. Re-headline post-launch.
> - **CUT / COLLAPSE — the markdown adoption ladder:** KEEP the zero-TS inline-comment
>   on-ramp (`<!-- vigiles:enforce -->`; the README depends on it), but collapse the
>   3-rung ladder (inline / frontmatter / spec) to **2 (plain markdown → typed spec)** —
>   frontmatter mode (Level 1 `vigiles:` block) is a redundant 2nd syntax. Stop marketing
>   "Level 0/1/2"; cutting the frontmatter surface is a small BREAKING change (mark it).
>   Detail in `pre-release-focus.md`.
> - **PROMOTED — spec-first reframe + `vigiles eject` (decided 2026-06-25):** DON'T contest
>   the linting crown (the structure-lint lane is crowded/commoditized; "lint-my-markdown"
>   adoption is weak — not worth fighting on its axis). Lead with the BOLD different thing:
>   author-time TYPED SPECS the agent writes + EVALS you can afford. Markdown demotes from
>   on-ramp to **floor / eject-target**. ENABLER (must ship for "always ejectable" to be
>   true): a one-command **`vigiles eject`** — strip the `vigiles:sha256` header → clean
>   owned markdown lint won't nag about (none exists; hand-deleting the spec makes
>   `require-instructions-spec` error). The create-react-app move that dissolves the two spec objections
>   (TypeScript friction — the agent writes it; lock-in — you eject). Reframe Lint as "your
>   spec's references are real," never "lint my markdown." Detail in `pre-release-focus.md`.
> - **PROMOTED — Codex parity is launch-real, finish the last mile (P0).** The whole-
>   package flow now maps to Codex (compile fans hooks + the CI binary to both harnesses;
>   inject is confirmed + encoded in `injectableEvents`; `init` wires the eval-lock + refs
>   nudges into `.codex/config.toml`). The remaining pre-release gaps, ranked: **(1) run
>   the eval tier against the REAL `codex` binary at least ONCE** — the transport is built
> - fake-tested, but no live native `codex exec --json` eval has run (gated on Codex
>   quota); this is the one "claimed but never executed end-to-end" piece and must be
>   proven before we say "works on Codex" at launch. **(2)** `react` hook output on Codex
>   stays CC-confirmed-only (a real-binary probe; low bite — react is rare). **(3)** the
>   SessionStart lint-summary + compile-on-edit/pre-edit guards stay manual on Codex (need
>   a harness-neutral `hook-runtime` entrypoint; documented deferral, not a blocker).
>   Item (1) is the P0; (2)/(3) are polish. Detail in `research/codex-prototype-findings.md`.
> - **SHIPPED this session (branch `claude/handoff-mylfen`, not merged):** the surface
>   freeze + STABILITY + markdown cut (parked, not deleted) + pain-first hero/subdocs — so
>   the freeze and markdown-cut items above are DONE there.
> - **DEFERRED to post-launch (the flywheel, run once there are eyeballs):** the public
>   leaderboard site + README badge, capability-diff M1, the twin work, macOS Seatbelt,
>   all remaining typed-spec depth. **Moratorium on net-new research + new instruments
>   until after launch** (the churn this whole reprioritization is meant to end).
>
> **Launch-blocker checklist:** [ ] Ecosystem-Benchmark v0 · [ ] CLI/API surface frozen
>
> - stability statement · [ ] first-run hardened + top-10-plugin FP sweep · [ ] **Codex
>   eval run live ONCE (real `codex` binary)** · [ ] the article drafted (method-first) ·
>   [ ] README 60-sec proof + GIF · [ ] CI green + published-package smoke test. The viral
>   leaderboard/badge is the FOLLOW-UP, not a blocker.

> **🧭 The positioning wedge (from the 2026-06-25 competitive fan-out) — for the
> article + README.** Every competitor, funded AND OSS, is **runtime/observability/
> post-hoc** (BentoLabs/Salus/Braintrust) or **structure-lint** (agnix); vigiles is the
> ONLY **author-time / deterministic / pre-run verification** play. One-liner:
> _"everyone else catches drift at runtime, after the fact; vigiles proves the
> references are real and the spec compiles **before the agent ever runs**."_ Ride the
> now-canon **"harness engineering"** frame and cite the authorities (Karpathy: _"LLMs
> can automate what you can verify"_; OpenAI: _"the harness is hard"_; arXiv AHE's
> **structure-beats-prose** ablation = the proof for enforce > guidance). Competitor
> names + VC who-to-pitch are in the `startup/` vault (keep them OUT of public docs).

**P0 — validate the thesis before building (cheapest, do first):**

- [x] **Measure one hyped skill vs its claim — DONE, thesis VALIDATED (corrected
      2026-07-07).** caveman over 7 real coding tasks (sonnet, 5 trials, on the
      subscription), faithful `--plugin-dir` install so the skill actually loads —
      the canonical run in [`bench/ecosystem/FINDINGS.md`](../bench/ecosystem/FINDINGS.md).
      Claims ~65% output cut; **measured ~6% mean output cut (2 task-level cuts
      significant, both clear Bonferroni), pooled bill flat (−1%), and output is
      ~20% of the _dollar_ bill** — so even a real cut barely moves what you pay.
      "Measured ≪ claimed" holds on the number that matters (the bill), just not the
      way the earlier bare-`SKILL.md` pilot reported it (that delivery never loaded
      the skill — see `FINDINGS.md`'s correction note). → `benchmark-methodology.md`

**P1 — measurement (the identity):**

- [ ] **Ecosystem benchmark v0** — A/B 10–20 most-hyped skills/plugins on a small real-task
      corpus; publish "what works vs hype" (lead with the debunks). Reuses `runEval` /
      `measureTriggerRate` + the ROI-optimizer bet.
- [x] **Does-our-spec-help A/B — DONE (2026-06-20), the spec HELPED.** First real-model
      A/B of vigiles's OWN typed contract: [`examples/harness/dogfood/reviewer-ab.eval.mjs`](../examples/harness/dogfood/reviewer-ab.eval.mjs)
      (prose vs spec code-reviewer, controlled, sonnet 2×). **Result: quality identical
      (bug caught 100% both arms — no regression), payoff a categorical win (parseable
      `vigiles:ok` outcome 0% prose → 100% spec).** So the typed contract adds
      deterministic testability (assertAgentOk, no LLM judge) at ZERO quality cost — the
      "typed contracts make measurement affordable" thesis, validated on our own contract.
      → `typed-contracts-for-agents.md`
- [x] **FIX: subagent nested-trace recovery under `--plugin-dir` — SHIPPED (`212869d`).**
      Two real CC behaviors fixed + validated against a captured live dispatch: (1) a
      `--plugin-dir` agent's `subagent_type` is namespaced `plugin:agent` → match the bare
      name; (2) the sub's `result()` block lands in its RETURN (the dispatch's top-level
      `tool_result`) → captured as `SubagentTrace.output`. Unlocks
      `subagent(name,[output(/vigiles:ok/)])` — any subagent-contract eval.
- [x] **Per-repo optimizer v0 — DETERMINISTIC SPINE DONE (2026-06-20), now folded
      INLINE into `audit`.** [`src/optimize.ts`](../src/optimize.ts) (`optimize` /
      `formatOptimize` / `formatRecommendations`, vitest + e2e cases) — the free
      half: a structural-health score (reuses `scoreReport`/`gradeFor`) + a typed, ranked
      `Recommendation[]` reusing `explainScore` (one-detector-no-drift) — `FIX` /
      `DIFFERENTIATE`, likely dead-ends first — that you clear BEFORE spending a token,
      then it hands off to the measured layer. **Folded INLINE into the default `audit`
      report (NOT a standalone `optimize` verb, and no longer a `--fix-plan`/`--explain`
      flag)** because, until the measured half lands, an optimizer that only re-prints
      audit's findings is a third surface on one report — see P2 below.
      **Remaining (the measured half):** wire the real-model A/B so each add/drop/swap
      carries a measured delta (`runEval` over `bench/corpus`, gated on the subscription).
      **Mechanism to poach (arXiv AHE, `agentic-harness-evolution-poach.md`):** wrap each
      recommendation in a **falsifiable predicted-delta contract** — predict which evals
      it improves/regresses, run, **auto-revert on no-improvement**, and predict
      REGRESSIONS explicitly (their regression-foresight was the weak spot).
      `agentic-harness-evolution-poach.md`
- [x] **Benchmark methodology + task corpus — v0 DONE (2026-06-20).** The method
      doc: [`benchmark-methodology.md`](benchmark-methodology.md) (the metric triple —
      bill/target/blast-radius — grounded in the P0 caveman measurement). The
      **reusable task-corpus module shipped:** [`bench/corpus/coding-tasks.mjs`](../bench/corpus/coding-tasks.mjs)
      (5 neutral real coding tasks, each self-contained + checkable + agentic) +
      [`verify.mjs`](../bench/corpus/verify.mjs) (a no-model self-check that every
      correctness oracle discriminates good/bad). The P0 eval now consumes it, and
      the ecosystem benchmark (A1) + `vigiles optimize` (A2) A/B over the SAME corpus.
      Remaining: per-repo-variance handling (report the distribution across tasks,
      not one mean).

**P1 — typed contracts / spec-as-testability (substrate + adoption ramp):**

- [x] **Test-gen from free-form — SHIPPED (2026-06-20)** as `vigiles scaffold-test`
      ([`src/scaffold-test.ts`](../src/scaffold-test.ts) + CLI). Free-form in, a runnable
      starter test out, per kind at the untested-detector's suggested path.
      `typed-contracts-for-agents.md`
- [ ] **Auto-derive `interceptTools` from the tools allowlist in `scaffold-test`** — the
      salvaged nugget from the rejected `effect()`-as-test-seam reframe (2026-06-21): read a
      skill/agent's declared `tools` + `effectSurface(tools, dialect)` (which already buckets
      read-only vs side-effecting deterministically) and emit a ready `interceptTools` entry
      per side-effecting tool, so a side-effecting agent's "hole" is mocked/denied in a
      generated test with **zero new spec surface**. Bounded — reuses `src/core/effects.ts` + the existing scaffold paths. → `effect-boundary-design.md` (the salvage section),
      `typed-contracts-for-agents.md` · **MEDIUM**
- [x] **Typed purity — SHIPPED (2026-06-21, `249aead`).** Compile-time half of the
      purity floor: `vigiles/claude-code`'s `agent()`/`skill()` make `purity:"pure"` +
      `"Bash"` a `tsc` error at edit time (core `vigiles/spec` stays open, backwards-compatible).
      A strict addition to the runtime `decidePurityGate`. → `typed-spec-power.md`
- [x] **Typed composition — SHIPPED (2026-06-21).** `agent()`/`result()` preserve the
      `result()` field shapes as types; `pipe(producer, pipeStep(agent, needs({…})))` (+ the
      `start`/`andThen` fold) cross-references at `tsc` time that step N's `ok` SUPPLIES step
      N+1's `needs` — a missing field / wrong type / out-of-order handoff **won't compile**.
      The headline non-replicable typed-spec win. Additive over the string-based `delegate()`
      path; shallow `Supplies<>` encoding (TS2589-safe). → `typed-spec-power.md`
- [~] **Semantic capability-diff at PR time (Moat #2) — the bridge bet. v0 SHIPPED.**
  `vigiles capability-diff <before> <after>` (src/core/capability-diff.ts +
  the CLI handler): diffs the two whole-harness capability lattices and reports the
  WIDENED verdict (new side-effecting/unknown tool, or loosened purity), informational
  by default + `--fail-on-widen` for the opt-in CI gate (don't cry wolf). Pure core +
  CLI e2e (exit-code contract). v0 reads the **tool-bucket** lattice
  (`computeHarnessCapabilities`); the RICHER surface (per-step effect-row + cross-step
  accumulation, M1 below) is the deferred follow-up that turns "gained Bash" into
  "opened a cross-step exfil path". Original framing:
  A permissions-diff for your agent: on a PR, compute the harness's capability surface
  before/after and tell the reviewer what the agent can now **DO** that it couldn't —
  "this PR gives `summarizer` network access / removes the review gate / opens a
  cross-step exfil path" — off the spec's **effect surface**, not a text diff. Markdown
  gives a text diff; only a typed spec gives a capability diff. **The bridge that serves
  BOTH moat and adoption** (a free PR comment — partial on plain plugins via `audit`
  richer on specs — so value without authoring a typed spec). Built on: the
  whole-harness **capability lattice** (`computeHarnessCapabilities`, SHIPPED in
  `generate-harness`) + the **effect-row (M1) + cross-step accumulation** engine
  (unbuilt — the surface to diff); the v1→v2 diff itself was **prototyped** as an
  abstract-interpreter (fp-theory T2). MUST carry a loud sign-off hatch
  (`vigiles:allow-net` / `allowTrifecta`) so an intentional widening doesn't cry wolf.
  A **Snyk/Dependabot-for-harnesses** trajectory bet — early to the market, but the one
  moat feature that also pulls adoption. A funded competitor validates the
  PR-time-verification-for-agents surface AND leaves this lane open (they test the app
  the agent built, not the agent's powers) — see the private `startup/` vault.
  → `typed-spec-fp-theory.md` (T2) · **P1**

- [ ] **Lethal trifecta as a forbidden TYPE (F1) — the dangerous tool combo is
      unrepresentable.** An agent with untrusted-input + secret-access + exfil legs in one
      `tools` contract won't compile without a typed `allowTrifecta` sign-off the compiler
      demands. Rides typed purity's EXACT machinery (the same `const` tools tuple → a typed
      capability lattice). Defense-in-depth: the type tier (config, edit-time) sits above the
      planned `audit` check (config, CI) + the runtime egress wall (behaviour) + F4's
      hyperproperty (the true noninterference question). Honest limit: the type sees the
      capability COMBINATION, not the data FLOW (that's runtime). → `typed-spec-frontier.md`
      (F1, prototyped) · **P0**
- [x] **Elevate railway/Result contracts — SHIPPED (2026-06-20)** (docs + worked example).
      `assertAgentOk/Err/Result` existed but were invisible; added
      [`examples/harness/railway-result.harness.mjs`](../examples/harness/railway-result.harness.mjs)
      (Part A pure, Part B a real mock turn) + a `docs/harness-testing.md` section.
      `typed-contracts-for-agents.md`, `railway-subagents.md`
- [x] **Side-effect boundaries for skills — SHIPPED (2026-06-20).** The deterministic
      side-effect-boundary ASSERTION (rung 2): added `didNotWrite()` (the symmetric no-write
      sibling of `wrote()`) to the check vocabulary +
      [`examples/harness/effect-boundary.harness.mjs`](../examples/harness/effect-boundary.harness.mjs)
      (`wrote`/`didNotWrite`/`notTool` over a constructed Trace AND a real mock turn, no key).
      The authoring half (`effect()`, the `purity:` floor) already shipped. The eval-tier
      `tool-intercept` (real-model prevention) stays as is. → `typed-contracts-for-agents.md`
- [ ] **Shareable typed templates (skills/agents) — DEFERRED (premature).** `preset()` /
      `extend()` only pay off at SCALE (an org standard or monorepo consuming one published
      preset), and vigiles has ~no consumers yet — building the
      network-effect layer before the network. The `off()` primitive in the sketch is also
      mis-framed (it reads as "disable an eslint rule," but vigiles never touches eslint config
      — it can only drop an inherited rule from the compiled instruction file). Revisit once
      adoption exists and a real org wants a shared house style. → `shareable-presets.md`
- [x] **`dir()` + `glob()` lightweight authoring — SHIPPED (2026-06-20).**
      [`src/core/spec.ts`](../src/core/spec.ts) builders + compile-time verification
      (`validateDirRef` — exists AND is a directory; `validateGlobRef` — matches ≥1 path),
      7 vitest cases, docs in [`docs/spec-format.md`](../docs/spec-format.md).
      `lightweight-spec-authoring.md`
- [✗] **`doc()` builder — DROPPED (2026-06-20).** It would duplicate `instructions\`\``(the existing tagged template already does typed prose-with-refs). Research-backed:
the spec syntax is already the correct hybrid (plain-object backbone + typed-value
helpers + tagged template for prose-with-refs) — the win is RESTRAINT, not more
helpers (also: NO`section()`helper — keep the object map). →`spec-syntax-and-railway-scope.md`
- [x] **Spec authoring polish — SHIPPED (2026-06-20).** Length-guard (`989791e`),
      agent frontmatter fields `disallowedTools`/`color` for clean round-trips +
      side-effect separation (`95ce25f`), and the `migrate` → `adopt-spec` rename
      (`6137008`). → `spec-syntax-and-railway-scope.md`
- [x] **Spec REFERENCE docs complete — SHIPPED (2026-06-20, `44a8d54`).**
      [`docs/spec-format.md`](../docs/spec-format.md) gained the entire subagent
      surface (`agent()` field table + example), the full skill field table
      (inputs/tools/purity/steps/result/context/output), a Purity & effects section,
      and result/railway/delegate/effect pointers. Pairs with the public railway guide
      [`docs/railway-subagents.md`](../docs/railway-subagents.md). Spec + its docs are
      now complete; remaining spec gaps are niche (agent `level`/`skills` frontmatter,
      a prose-command-file builder) — deferred. → `spec-syntax-and-railway-scope.md`
- [x] **Model `context: fork` on `SkillSpec` — SHIPPED (2026-06-20, `b19febd`).**
      `context?: "fork"` (rendered to frontmatter) + `output?: OutputContract` on a
      skill, gated: `output` without `context:"fork"` is a compile error
      (`output-without-fork`) — enforcing "a typed outcome needs the subagent
      boundary" from the research. A forked skill's Output contract renders via the
      SAME `renderOutputContract` the subagent uses (one-renderer-no-drift).
      `spec-syntax-and-railway-scope.md`

**P2 — linting, repositioned (free pre-filter + diagnostic):**

- [ ] **Reconsider a standalone `optimize` verb — only once the MEASURED half exists.**
      The deterministic spine ships folded inline in `audit` (above), deliberately NOT its
      own command: today an "optimizer" that just re-prints audit's structural findings is a
      third surface over one `ScanReport` (`audit` reports + ranks the repo inline) —
      confusing, no new capability. Revisit promoting it back to
      `vigiles optimize` WHEN it genuinely optimizes: when each add/drop/swap recommendation
      carries a real-model before/after delta (the A2 measured half over `bench/corpus`).
      At that point "optimize" means something `audit` can't, and the verb is earned. The
      pure `optimize()`/`formatOptimize()` in `src/optimize.ts` are kept either way.
- [ ] **Keep the high-signal cross-ref engine; drop the breadth race** (no beat-agnix-on-rule-count).
      CONFIRMED by the 2026-06-25 OSS sweep (`oss-lane-sweep-2026-06.md`): **agnix** is the
      structure-lint incumbent (297★, 429 rules, Rust, LSP) — the lane to NOT race. Our
      differentiated four (catalog cross-ref / harness-execution-test / trigger-eval / typed
      specs) are **unoccupied by OSS**; that's the wedge. **Watch agnix** (if it adds catalog
      cross-ref or execution it closes toward us).
- [ ] **Capability / lethal-trifecta check** (`warn` + `vigiles:allow-trifecta` sign-off) — one
      column in the benchmark ("safe AND effective"), not the headline. → `harness-state-space.md`
- [ ] **Lint-as-hook + agent-consumable JSON** (see Now). → `instruction-file-linter-landscape.md`
- [x] **Score-explainer pairing — DONE (2026-06-20), core + CLI.** [`src/score-explainer.ts`](../src/score-explainer.ts)
      (`explainScore` / `explainSurface` / `formatExplanations`, 12 vitest cases):
      pure over the `ScanReport` the linter already computes (one-detector-no-drift),
      it maps each cross-ref finding to the behavioral SYMPTOM a benchmark observes
      (wrong-skill-fires / skill-never-fires / agent-underperforms / hook-never-runs /
      subagent-never-dispatches) + a one-line fix — so the optimizer says "underperforms
      BECAUSE its description overlaps X — differentiate them", not just "drop it".
      Shipped as the `explainScore` engine (deterministic; `explainSurface` narrows to
      one surface). Now folded INLINE into the default `audit` report (A2) via
      `formatRecommendations` — each recommendation IS an explanation reshaped with an
      action verb (the former `--explain`/`--fix-plan` flags are gone).

**Distribution:**

- [ ] **The "what actually works" benchmark report** = the viral artifact (follows P0/P1).
- [ ] **Zero-config installer reframed** — "apply the empirically-best setup"; resident not
      scaffolder; compose not curate. → `zero-config-mother-harness.md`

## Shipped recently (don't rebuild)

- **Effect-surface + purity contract + Bash classifier (2026-06-20)** — the
  deterministic side-effect substrate. `src/core/effects.ts` (`classifyToolEffect`
  / `effectSurface` / `purityViolations` + the pure/bounded/unrestricted ladder,
  `dialect.sideEffectingTools`); the **`purity:` floor** on skill/agent
  (`"pure" | "bounded" | "dangerously-unrestricted"`, enforced at compile —
  absent tools = inherits-all = violation); the **audit effect-surface column**
  (per-unit purity + `N pure · M bounded · K unrestricted` audit); and the
  standalone **deterministic Bash-effect classifier** (`src/core/bash-effects.ts`
  `mvdan-sh` AST + catalog + fail-closed residue, zero-false-read-only gate). Two
  design calls locked in: the enum mirrors the analysis vocabulary
  (declare/report symmetry), and `dangerously-unrestricted` is loud at the
  _declaration_ site but neutral `unrestricted` in the _report_ (no cry-wolf).
  See [`side-effect-separation.md`](side-effect-separation.md) +
  [`bash-effect-classification.md`](bash-effect-classification.md).
- **Runtime purity gate — the per-call FLOOR, wired (2026-06-20)** — `purity` is
  no longer compile-only. `decidePurityGate` (`src/core/effects.ts`) is the
  per-call gate, folded into the agent `PreToolUse` rail
  (`src/adapters/claude-code/agent-runtime.ts` via `parseAgentPurity`); the
  tool-contract rail fires first, then the purity gate, refining `Bash` by the
  live command with `isReadOnlyBash`. `compile` emits a
  `<!-- vigiles:purity:LEVEL -->` marker into a compiled agent's `.md`
  (`dangerously-unrestricted` → neutral `unrestricted`). KEY ladder change:
  `bounded` now **admits command-gated `Bash`** (read-only allowed as
  observation, mutating denied) — `pure` still bars `Bash` entirely; the static
  `effectSurface`/`audit` still reports any `Bash` as `unrestricted` (can't see
  the command — the runtime gate is where the refinement lands). **Skill-parity
  shipped same day** — skills now carry the SAME per-call gate
  (`src/adapters/claude-code/skill-runtime.ts`: `parseSkillPurity` +
  `evaluateSkillPreToolUse`, the `skill-tool-hook` CLI; the floor only, no
  tools-allowlist rail for skills yet). Remaining: the position-aware
  effect-BOUNDARY region mark (see "Effect-surface: the runtime half" under Now).
  See [`side-effect-separation.md`](side-effect-separation.md) +
  [`bash-effect-classification.md`](bash-effect-classification.md).
- **`vigiles audit`** + **plugin health leaderboard** — deterministic per-plugin
  report + rank-by-structural-health (`src/scan.ts`, `src/leaderboard.ts`).
- **`untested-surface` rule** + **skills conformance gate** — third gap detector;
  every skill loads with a usable description (`src/test-coverage.ts`
  `src/skills-dogfood.test.ts`).
- **Eval B→A→C** — cost/latency capture, record/replay cache, concurrency +
  budget, Welch significance + pass^k, regression gating vs committed baseline
  ([`eval-api-landscape.md`](eval-api-landscape.md): `src/eval.ts`, `stats.ts`
  `eval-baseline.ts`).
- **Sandbox unit tier + allowlisted egress** — `runHook`/`runHarnessTest` confine
  untrusted code under bubblewrap; `egress: { allow }` ([`sandbox-network.md`](sandbox-network.md),
  feature-ideas §13 — partial).
- **Subagent tool-contract rail**, **MCP reference verification** (`vigiles:mcp`),
  **symbol refs**, **dead-enforcement / stale-ref** (pillar 1 core).

## Now — cheap, high-leverage, do next

- **Step-enforcement / process-gating prototype + A/B dogfood (2026-07, NEW).** Declare each
  step of a skill/agent procedure with a checkable POSTCONDITION + control-flow, compile it to
  hooks that block advance/stop until the postcondition holds (extends `guards.ts` `requireBefore`
  - the Stop-gate + `result()`). Then A/B on a vendored complex OSS skill — gated vs prose-only —
    measuring THREE metrics: process-adherence, HELD-OUT correctness (a hidden oracle from
    `bench/corpus/`, NOT the gate's own check — that's tautological), and cost. Answers the
    highest-felt-pain question: does deterministic gating actually improve the model's step-following?
    Scope: agent-first (clean call→return boundary), NO loops v0, only observable-postcondition steps
    are gate-able (the boundary). Deterministic mock-model proof runs free; the real-model A/B runs on
    the sub. (Note: `benchmarks-runtime-gates.md` earlier found gates didn't help capable agents — this
    re-tests with a POSTCONDITION contract + held-out oracle, a sharper design.)
- **`observe` → `promote` loop (2026-07, NEW).** `vigiles promote <session>`: read a real
  `.vigiles/runs.jsonl` failure (wrong skill fired, hook didn't block, contract violated) and emit a
  scripted-mock `*.harness.mjs`/`*.eval.mjs` fixture that reproduces it, the ledger's objective
  auto-populated as the assertion. Turns "we hit a bug in a real session" into "there's now a test
  that would have caught it" without hand-authoring. The record→promote flywheel every eval tool has
  for OUTPUTS, applied to the HARNESS. Builds on the shipped observe ledger (`src/observe.ts`).
- **Harness-native cross-check — DEEPEN (2026-06-21, IN PROGRESS).** The moat refinement
  (see [`landscape-mid-2026.md`](landscape-mid-2026.md) §"Read of Market C" REFINEMENT):
  cross-referencing's value is the HARNESS-NATIVE references (tools, MCP `server#tool`
  hook events, paths, delegates), NOT the linter-catalog leg (legacy/supporting — don't
  add more catalogs). **First build: live MCP tool resolution of the real
  `mcp__server__tool` contract refs** — the live engine exists (`src/core/mcp.ts`
  `listMcpTools`/`closest`) but is wired only to the explicit `vigiles:mcp` mark;
  bridge it to the actual `mcp__server__tool` references (subagent contracts + bodies)
  so a renamed/removed tool (`create_issue`→`issue_write`) is caught, not just an
  undeclared server (the static `mcp-tool-resolves` only checks the server is declared).
  Opt-in (starts the server, not a free CI default); test against the existing
  `examples/harness/fixture-mcp-server.mjs`.

- **Purity FLOOR gate — DONE + STABLE (2026-06-20).** The per-call floor
  (`decidePurityGate` wired into the agent + skill `PreToolUse` rails,
  `isReadOnlyBash` refining `Bash` by the live command, the `vigiles:purity:`
  marker) is the keeper: deterministic, whole-unit, shipped. See
  [`side-effect-separation.md`](side-effect-separation.md) +
  [`bash-effect-classification.md`](bash-effect-classification.md).
- **`effect()` sub-region BOUNDARY — EXPERIMENTAL, PARKED (P3, revisit).** The
  in-flow side-effect sub-region (`effect\`\``→`<!-- vigiles:effect -->`markers,
"pure outside / declared floor inside") is **dropped as a goal**, not a near-term
build. 2026-06-20 redesign + dogfood: the model-emitted`effect-enter`/`exit`
signal is a category error (a deterministic gate keyed on probabilistic model
compliance, fail-closed). For **skills** it's now a **compile error**
(`effect-in-skill`; a skill uses the floor + `context:'fork'`) — KEEP. For
**subagents** a deterministic tracker shipped (`PreToolUse(tool=Task)`open +`SubagentStop`close,`f045554`). It was flat (single slot) and not nesting-safe;
the depth-aware **STACK fix has since SHIPPED** (push on dispatch, pop on
`SubagentStop`back to the parent, gate on the top + recognize both`Task`/`Agent`spawn tools — TLC-certified,`AgentWindowStack.tla`; the `Open;Open;Stop;Call(Bash)`counterexample is now a regression test), closing the contract-escape CC v2.1.172
depth-5 nesting exposed. Still marked EXPERIMENTAL; **do NOT auto-wire**. Conclusion: a deterministic _in-flow_ sub-region has no
harness signal, and the subagent-split alternative is **weaker AND costlier** than
intended (whole-unit granularity, context-isolation, depth-5 cap, subagent spam) —
so the realistic safety story is the **whole-unit floor + a stateful pre-hook**.
  **Hidden from public docs** (removed from`spec-format.md`/`harness-testing.md`;
  `docs/safety.md` unlinked from the README + WIP-bannered) — don't re-surface until
  it's coherent end-to-end.
  - **Open inconsistency to reconcile (don't keep the skill special-case).** The
    `effect-in-skill` compile error's whole rationale was "the runtime sub-region gate
    needs a structural boundary a skill lacks" — but that gate is now parked, so
    erroring in skills while ALLOWING `effect()` in subagents treats it as a real
    subagent feature it no longer is (and a `context:'fork'` skill IS a subagent, yet
    still errors). When revisited, decide `effect()`'s fate **uniformly** —
    deprecate-everywhere / doc-marker-only / drop the builder — not special-case skills.
  - **When revisited, build the PRE-HOOK, not the split.** A stateful `PreToolUse` gate
    keyed on the tool stream (conntrack/eBPF-maps pattern): read-before-write ("no
    `Write` to a file not `Read` this run"), ordering invariants ("no mutating Bash
    until X"), state in a `.vigiles/` file or read from the transcript — no
    restructuring, no subagent spam. The `f045554` tracker's nesting-safety (depth-aware
    stack + both spawn tools recognized) has SHIPPED, so active-agent CONTRACT enforcement
    now holds under nesting independently of `effect()`.
  - **"effect() as a test/mock seam instead of an enforcement boundary" — considered, rejected (2026-06-21).**
    The reframe: forget position; for an agent a tight `tools` allowlist already pins the
    effect surface, so `effect()` could just NAME "the hole" — the one side-effecting op —
    to make it the mock point. Verdict: the hole already exists three ways without the
    primitive. (1) Enforcement: the `tools` allowlist + `purity` floor pin it. (2)
    Identification: `effects.ts` `effectSurface(tools, dialect)` / `classifyToolEffect`
    ALREADY bucket a tool list into read-only vs side-effecting deterministically — the hole
    is COMPUTED from the allowlist, no annotation. (3) Test seam: `interceptTools` + the
    `ArgMatcher` (`when:{command:/git push/}`) already mock the EXACT invocation at sub-tool
    granularity. So `effect()` would only move the matcher from the test into the spec
    (single-source-of-truth convenience, not a capability) — fails "earns its place" like
    `doc()`/`section()`. Honest limit on the framing too: `interceptTools` is
    intercept-and-PREVENT (deny + assert the attempt), right for a DESTRUCTIVE hole (push,
    charge); a hole that must RETURN a fake value is the record-replay/R2 tier, also not
    `effect()`. The useful NUGGET to keep: have `scaffold-test` read the existing tools +
    `effectSurface` and AUTO-DERIVE the `interceptTools` entry per side-effecting tool —
    delivers "the agent's hole is easy to test/mock" with zero new spec surface. → folds
    into the scaffold-test enhancement, NOT an `effect()` revival.
  - See [`effect-boundary-design.md`](effect-boundary-design.md). **P3**
- **Authoring ergonomics — `dir()` / `glob()` SHIPPED (2026-06-20).** The two
  lightweight verification helpers (the `Ref` union extended → render + compile
  verification in every switch). `doc()` was the proposed next sibling but is now
  DROPPED (duplicates `instructions\`\``) — see
[`spec-syntax-and-railway-scope.md`](spec-syntax-and-railway-scope.md).
[`lightweight-spec-authoring.md`](lightweight-spec-authoring.md)

- **Run the behavioral (eval) tier in CI as a gate** — today `vigiles eval` is
  manual-only and results are frozen as `FINDING:` comments (a snapshot is
  documentation, not protection). Wire the _cheap_ tier (`measureTriggerRate` /
  `measure` with `stubSkillBodies`, on **Sonnet** — the realistic selector, not
  haiku, which under-measures trigger-rate) as a per-PR gate, then the
  tool-call spy/fake keystone for side-effecting skills. Full model + ranked gap
  roadmap in [`eval-architecture.md`](eval-architecture.md). **HIGH**
- **PATH-shim / record-replay helper (fake-on-PATH)** — the R2 tier: a fake
  binary earlier on PATH that emits a result **recorded once** from the real tool
  and replayed deterministically (never model-synthesized — drift → false
  confidence), reusing the eval cache's record/replay machinery. **Explicitly
  ahead of real-service/testcontainers provisioning:** a survey of community
  collections + a ~90-artifact production audit put R1+R2 at ~90%+ of real plugin
  surface (R3 real-service ≤ ~9%), and every GitHub/issue-tracker/chat/CI/linter/
  test-runner integration is replayable at R2 with no Docker. **STATEFUL extension
  (competitor-informed — see the private `startup/` vault):** record a whole SESSION
  trace and replay it in order → a stateful local twin for multi-step SaaS flows,
  auto-built from real traffic (no per-service hand-build grind — we record, not
  author). SaaS-HTTP/MCP only; DB/Redis stay R3 run-real-disposable. The one "twin"
  worth building because recording sidesteps the hand-build grind. Higher leverage than
  a container integration. [eval-coverage-and-isolation](eval-coverage-and-isolation.md) · **HIGH**
- **Native input/output/cache token + cost measurement** — split `tokens()` into
  `inputTokens`/`outputTokens`, capture cache tokens, and report a per-class A/B
  **delta** gated by Welch significance. A harness change trades input↔output (a
  CLAUDE.md/skill injection adds input every turn; a "compression" skill cuts
  output), so a single total can bless a net-negative change — SkillBenchmark's
  Caveman cut output yet 2–4×'d cost. The money story, and the data model is half
  there. [eval-architecture](eval-architecture.md) · [skill-eval-landscape](skill-eval-landscape.md) · **HIGH**
- **Adversarial-gate check + eval→enforce bridge** — a first-class "ask the agent to
  skip the enforcement gate, assert it refuses" check (`notTool` shape); when it
  fails, point at the deterministic rail (pillar 2 → pillar 1). The highest-value
  behavioral test for an enforcement skill. [skill-eval-landscape](skill-eval-landscape.md) · **HIGH**
- **#2 Reverse coverage** — "your CLAUDE.md documents 5 of 47 enabled rules": the
  one item that is both moat and a shareable distribution artifact.
  [feature-ideas #2](feature-ideas.md) · **HIGH**
- **Dogfood popular plugins + emit a per-plugin `COVERAGE.md` scorecard** — run the
  rung classifier over popular community plugin collections and emit a per-plugin
  `COVERAGE.md` (R1/R2/R3 distribution + the R3 service shortlist + a testability
  grade). Validates the ~90% R1+R2 claim on real artifacts AND is a shareable
  distribution artifact (the leaderboard's testability sibling).
  [eval-coverage-and-isolation](eval-coverage-and-isolation.md) · **HIGH**
- **More deterministic lint rules — the next moat surfaces.** This session
  shipped 5 cross-referencing rules (agent-tool-contract, hook-events,
  agent-frontmatter, skill-frontmatter, mcp-config). The ranked, sweep-grounded,
  FP-calibrated backlog for the next batch — `mcp-tool-resolves`, `hook-shape`
  `duplicate-names`, the novel `description-overlap` (NCD precision proxy),
  `frontmatter-valid`, `hook-matcher` — is in
  [deterministic-rule-ideas](deterministic-rule-ideas.md). Each is the same
  "valid is not true" cross-reference on a new surface, high-precision by design. **P1**
- **`no-internal-links-in-public-docs` lint rule — deterministic enforcement.**
  Today it's a GUIDANCE rule only (root `CLAUDE.md` spec): a public doc
  (`README.md` / `docs/*.md`) must never link an internal `research/*.md`. Make it
  a real lint rule — scan public markdown for a `](…research/…)` link and fail
  (high-precision: the pattern is unambiguous, near-zero FP). Pair it with the
  orphan-docs invariant so stripping the last public link still leaves the
  research doc referenced from `CLAUDE.md` keyFiles / `research/README.md`. Same
  one-detector-no-drift shape (shared by `lint` + a `audit` note) as the other doc
  rules. Add the `RulesConfig` key + `docs/rules/<name>.md` + the matrix row
  (rules-docs-in-sync). **P1**
- **Agent-native lint delivery — JSON-in-the-loop + lint-as-hook.** The lint
  consumer is shifting from a human in an editor to an _agent in a loop_, so deliver
  findings where the agent acts: (a) structured `--json` with did-you-mean fixes and
  minimal-token messages the agent applies directly, and (b) **lint-as-a-PostToolUse-hook**
  that gates the moment the agent writes a bad reference — extend the existing refs-hook
  from symbol marks to the whole cross-reference family (tool-contract, mcp-tool,
  hook-events). Corollary: **FP-calibration becomes a SAFETY property, not just UX** — a
  human ignores a noisy finding, but an agent _obediently "fixes" every one_, so a false
  positive makes it edit correct content. The "don't cry wolf" discipline is load-bearing
  once the consumer is a model. See [instruction-file-linter-landscape](instruction-file-linter-landscape.md)
  (the moat in an agent-authored world). **P1**
- **Cross-platform confinement — macOS Seatbelt backend.** Confinement is
  Linux-only today (`bwrap`), so on a Mac foreign plugin/skill code forces the
  refuse-or-`sandbox:false` choice — unacceptable when most devs are on macOS.
  Extract the `vigiles/os-isolation` port and add a `sandbox-exec`/Seatbelt backend
  beside `bwrap`. Per-host egress stays Linux-only (Seatbelt can't packet-filter
  per host); macOS degrades honestly to deny-all-net. **Phased design is ready**
  (interface + layout + capability matrix + 4 green-keeping phases + the
  Seatbelt-blocks-localhost limitation): [os-isolation-port](os-isolation-port.md),
  decided in [cross-platform-sandboxing](cross-platform-sandboxing.md). **Note: the
  maintainer has no Mac**, so this needs a macOS CI runner (or a Mac-having
  contributor) to validate the backend end-to-end — the pure policy/args seams can
  still be unit-tested without one. **P1**
- **AGENTS.md + SKILL.md as first-class verified inputs** — the engine is already
  format-agnostic; rides the 60k-repo / 32-tool wave.
  [standards-conformance](standards-conformance.md) · **MED**
- **`audit` → observed-egress column** — boot each hook under `recordEgress`, list
  hosts reached; turns `audit` from static into behavioural, feeding the
  leaderboard and the supply-chain audit. [agent-supply-chain-security #1](agent-supply-chain-security.md) · **MED**
- **Wire `composeCollisions` into `vigiles lint`** — warn when a compile target
  is a file Ruler/rulesync regenerates (stales the integrity hash); suggest the
  source-slot redirect. Detector shipped (`src/compose.ts`); CLI wiring + a
  `compile --into <dir>` flag are the remaining steps.
  [sync-tool-compatibility](sync-tool-compatibility.md) · **MED**
- **"Valid is not true" positioning** — one comparison row vs structural linters
  (agnix); pure messaging, no build. [standards-conformance](standards-conformance.md) · **LOW**

## Next — differentiated, medium effort

- [~] **Flue poach (2026-06-29) — a typed TS harness validates the typed-spec bet + opens
  surfaces.** Flue (withastro/flue, the Astro team) is a programmable TypeScript agent
  harness with Valibot-typed tool/workflow I/O that ALSO imports Claude Code `SKILL.md`
  dirs — independent confirmation of "the harness is a typed program, not prose."
  **F1 SHIPPED** (`delegation-trifecta`, commit `7b88bcb` — capability-diff across the
  subagent delegation tree). Still open, ranked: **F3** model-specifier resolution
  (`provider/model` ids resolve / not deprecated — cheapest quick win, extends the
  frontmatter-value rule); **F2** typed tool/workflow I/O handoff verification (the
  pipe/Supplies moat applied to Valibot schemas — pre-run > runtime throw); **F4**
  workflows as a first-class audit surface (productize `validateRailway`); **F5** tool
  DEFINITIONS as a surface (effect-floor on a `defineTool` body); **F6** harness-
  portability lint (a harness-only frontmatter key inert under another target); **F7** a
  `vigiles/flue` adapter (4th harness; cheap first step — detect `flue.config.ts`, verify
  its imported SKILL.md dirs + `agents/*.ts` model specifiers); **F8** Flue workflow
  event-history as a Trace source for the test tier. [audit-wow-ideas](audit-wow-ideas.md)
  Appendix D · **F3 = quick win; F2/F4 = on-moat**
- [ ] **Remaining OSS-issue detector harvest** (all DETECT-mode, deterministic, FP-safe,
      audit + lint, same one-detector pattern as the five shipped `7b88bcb`):
      secrets-in-config / `settings.local.json`-not-gitignored, dangerous-default-permissions
      (`Bash(*)` / `--dangerously-skip-permissions`), `.env`-deny-Bash-bypass, CLAUDE.md
      `@import` resolution, instruction-file truncation limit, skill-description >250-char cap.
      [audit-wow-ideas](audit-wow-ideas.md) §Tier-1 · **LOW-MED each**
- [ ] **`adoptHook` — close the hook prevent-layer asymmetry.** Every surface but hooks
      has a Stage-1 PREVENT on-ramp (`init` auto-adopts CLAUDE.md / skills / subagents into
      typed specs); hooks have only Stage-3 DETECTION (the `hook-*` lint rules), because
      there's no `adoptHook` and `prefer-compiled-hooks` defaults off. An `adoptHook` would
      convert a hand-written shell hook into a compiled `vigiles/hook` program during `init`
      making `hook-block-ineffective` / `hook-events` / `hook-script-exists` _prevented by
      construction_ instead of detect-only. Parked because shell→typed is lossy/undecidable in
      the general case (best-effort + a loud "couldn't fully translate" is the realistic shape).
      [enforcement-model](enforcement-model.md) §the-hook-asymmetry · **MED-HIGH**
- [ ] **"Prove your guardrail actually blocks" — the verify-not-gate killer feature.**
      The #1 verified hook pain is FALSE CONFIDENCE: a safety hook looks like a guardrail and
      silently isn't (exit 1≠exit 2, wrong JSON field, PostToolUse-can't-block, wrong jq path) —
      "three teams believed they'd blocked force pushes"; a not-planned RFC (#45427) names it.
      Feed the DISASTER event (`git push --force`, `rm -rf /`, `--no-verify`, `cat ~/.ssh/*`) to
      the user's EXISTING hook via `runHook` + `decideHook` and assert it BLOCKS. Deterministic,
      model-free, CI, works on hand-written hooks with NO spec/compile (zero adoption tax) —
      and it sidesteps CC's runtime delivery bugs (subagent-bypass #34692 etc.) by verifying
      LOGIC, not delivering enforcement. Receipt proven 2026-06-22 (runHook caught an exit-1
      fake guard). Smallest build: a curated disaster-event catalog + the `audit`/`scaffold-test`
      surface over it; dogfood on a real OSS safety hook to find a secret no-op. Compile is the
      OPTIONAL Level-2 (declared intent → auto-generated test); verify is the mechanism.
      [hook-pain-points](hook-pain-points.md) · **HIGH — highest-conviction, lowest-risk**
- [~] **Reliability RUNTIME: typed safe-by-construction guards (the big-moat bet).**
  The harness's safety failures (destroy-without-backup, untrusted→sink, prose rules
  ignored) are ORDER/FLOW/REPLAY properties a capability SET can't see, and they can't be
  fixed by more prose (it decays under compaction). Fix: DECLARE a guard from a closed
  audited vocabulary; vigiles GENERATES the PreToolUse hooks block pointing at its own gate
  (no user shell → safe-by-construction; closes the CVE-2025-59536 hook-RCE class). v0
  PROTOTYPED + the live gate RUNS (`src/core/guards.ts` + `vigiles hook-runtime guard` CLI + session
  ledger, `959e88c`/`4336f4a`): `guard.block` / `requireBefore` (the ORDER axis:
  destroy-after-plan, enforced live across hook invocations) / `confine`. ⚠️ The 5-pass hook
  research (hook-pain-points.md) found GATE is undercut by CC bugs (subagent-bypass #34692,
  exit-2-stops-Claude #24327) that also hit our own PreToolUse gate — so prefer VERIFY (above)
  over GATE near-term. NEXT (if pursued): the measurable A/B (harness ± guards → fewer
  destructive actions). [harness-protocol-flow-moat](harness-protocol-flow-moat.md) · **MED (gate undercut by CC bugs)**
  - _Parked prototype files (linked in CLAUDE.md Key Files so they're not orphaned):_
    `src/core/guards.ts` (+test, WIRED via `vigiles hook-runtime guard` but EXPERIMENTAL) and
    `src/core/hook-spec.ts` (+test, a pure spike imported NOWHERE). The hook-spec
    "typed effect-classified hook" idea was **superseded** by the SHIPPED compiled
    hooks (`src/core/hook-program.ts` → `vigiles/hook`, `c4d4d85`), which took the
    closed-vocabulary angle further (role family + AST matcher + stamp). Keep
    hook-spec only as the design record; resume guards from here if the GATE bet is
    revived. [harness-protocol-flow-moat](harness-protocol-flow-moat.md)
- [ ] **FLOW axis — information-flow / noninterference over the typed pipeline.** Label tool
      I/O (untrusted/secret) and prove no untrusted→sink path — the lethal trifecta as a real
      dataflow, not co-occurrence. Harder than ORDER (needs taint across calls); the second
      reliability-runtime guarantee. [harness-protocol-flow-moat](harness-protocol-flow-moat.md) · **P3 (the deep one)**
- [ ] **REPLAY axis — exactly-once side effects (linear types / idempotency).** Declare an
      effect's idempotency; the gate keeps a per-session ledger keyed on semantic intent (NOT
      byte-identity — ACRFence shows that fails for LLMs) and blocks a second fire. The
      duplicate-on-replay hole 12 frameworks share — but MEDIUM for the coding-harness market
      (the catastrophic cases are prod agent-frameworks, not CC/Codex), so it ranks behind
      ORDER+FLOW. [harness-protocol-flow-moat](harness-protocol-flow-moat.md) · **P3 (MED)**
- **Poach-list follow-ups (typed CLAUDE.md).** Zod-`result()` (feature-ideas §14b), typed
  context/needs contract (Pydantic-style deps), exhaustive err-track (Effect-TS). Mechanics
  verified against Mastra/Pydantic/Vercel/Effect-TS. [typed-claude-md-poach](typed-claude-md-poach.md) · **P3**
- **Ephemeral run environment (not just CWD)** — every model-driven run already
  uses a throwaway `cwd`, but the direct/non-bwrap path inherits the real `$HOME` +
  env, so a model-driven `git push` / write to `~` escapes — even for a trusted
  plugin (the model, not the author, chose the action). Default every run to a
  fresh HOME + scrubbed env (re-inject only the harness's own auth). Needs no
  kernel features → lands on macOS today, ahead of the Seatbelt backend; the
  cheapest cross-platform side-effect protection. [cross-platform-sandboxing](cross-platform-sandboxing.md) · **HIGH**
- **Move the CC mock + driver physically into the adapter dir (structural cleanup).**
  `src/mock-model.ts` (the Anthropic-Messages mock) and `claudeCodeDriver` +
  `buildClaudeArgs`/`parseClaudeRun`/`claudeAvailable` (in `src/harness-test.ts`) are
  Claude-Code-specific but sit at the composition root, so the directory-based
  `agnostic-surface ⊄ adapter` lint can't see them by location. Today they're
  enforced by **glob-classifying `src/mock-model.ts` as `cc-harness`** in
  `eslint.config.mjs` (works, proven — reintroducing the leak errors). The
  principled end-state is to physically relocate them under
  `src/adapters/claude-code/` (mirroring `src/adapters/codex/{mock-model,driver}.ts`)
  so classification is by directory, not a glob exception — and so the symbol-level
  leak of `claudeCodeDriver` via a future `export *` is caught too. Bounded refactor
  (~8 files' relative imports + the `claudeCodeAdapter` wiring); update the eslint
  classification back to a plain directory pattern afterward. [code-adapter-architecture](code-adapter-architecture.md) · **MEDIUM**
- **Verify & test the harness's sandbox config** — `settings.json`'s `sandbox` block
  is a harness surface: verify `allowedDomains`/`allowWrite` are coherent (flag a hook
  that phones a blocked domain), and prove the configured sandbox blocks what it claims
  (reuse `recordEgress`/`egress:{allow}`). The "valid is not true" wedge applied to
  sandbox policy. [cross-platform-sandboxing](cross-platform-sandboxing.md) · **P3**
- **Near-neighbor trigger-rate tier** — between isolated (cheap, optimistic) and
  whole-harness (`installSet`, realistic but pricey/noisy), co-install the
  skill-under-test + its **NCD-nearest competitors** (reuse `proofs.ts` `ncd` /
  `findSimilarRules`) so a large roster gets faithful precision at a fraction of
  the cost. Decided + grounded; deliberately deferred (the two existing tiers
  cover the common cases). [isolated-vs-whole-harness](isolated-vs-whole-harness-eval.md) · **P3 (MED–LOW)**
- **Auto-applied known context for trigger-rate** — empty-context activation
  measurement is faithful for opening-move skills but biased-low for
  state-dependent ones (fires only mid-session — "about to claim done", "review
  arrived", "dirty git tree"), a blind spot the whole query-based field (AWS
  skill-eval included) shares. Two steps: (1) **DONE** — `TriggerRateSpec` gained
  `fixture` (seed repo state) + `concurrency` (parallelize the grid), reaching
  parity with the user-injected-context tools (prior-turn/history still open);
  (2) the differentiator, still open — auto-select a **curated preset context**
  from the skill's declared trigger phrases so it's measured in the state it
  claims to fire on. Preset SELECTION on explicit cues, not prose synthesis (stays
  out of the undecidable-prose trap). [plugin-behavioral-findings](plugin-behavioral-findings.md) · **P3 (MED)**
- **Per-model trigger-rate + context-rot curve** — two parts. (a) Report
  trigger-rate **per model** wherever we report it — already a capability
  (`EvalArm.model` makes a model comparison a harness A/B; Sonnet default +
  `minModel` floor), so this is "make it a standard column", near-free. (b) The
  study: measure how recall **rots as the skill roster grows** (5 → 20 → 80
  skills) and whether a stronger model rots slower — the concrete form of
  `divergent-bets` #11 (measure model × harness) and the buyer question "how many
  skills can I install before they stop firing, on model X?". A roster × model ×
  prompt matrix, so opt-in study, not a default gate; rides the existing isolated
  → near-neighbor → whole-harness (`installSet`) tiers crossed with model arms.
  Decisive cheap first probe: `brainstorming` recall at 2 roster sizes × 2 models
  (~20 stubbed runs) to confirm the curve is real + model-dependent before any
  matrix. Measure, don't claim. [plugin-behavioral-findings](plugin-behavioral-findings.md) · **P3 (MED)**
- **Plugin selection-collision matrix** — **SHIPPED (core + CLI `audit --prompts=`, interactive).**
  The behavioral CONFIRMATION of the deterministic `description-overlap` rule: run
  each model-invocable skill's own prompts against the whole installed plugin and
  record WHICH skills fired (N×N matrix; diagonal = recall, off-diagonal = a sibling
  hijacking the prompt). The cross-skill precision question per-skill trigger-rate
  can't see; the leaderboard's blast-radius column. Claude Code only (needs a discrete
  skill-selection event). [plugin-selection-collision](plugin-selection-collision.md) · **DONE**
- **Trigger/collision: carry plugin hooks (hook-primed plugins)** — the trigger/collision
  tier stubs a plugin to skills-only (`packageSkillsDir`), DROPPING `hooks/` — so a plugin
  that primes proactive skill use via a SessionStart hook (e.g. superpowers' `using-superpowers`
  gateway injection) shows artificially 0% recall. Fix: carry `hooks/` into the stubbed plugin,
  or run the whole-plugin install (unstubbed) when a SessionStart hook is present.
  [plugin-selection-collision](plugin-selection-collision.md) · **P3 (MED)**
- **Observed-vs-declared, signed (the flagship)** — declare a contract, run
  confined, diff observed vs declared, sign with the SHA-256 chain. Only vigiles
  holds both the declaration model and the confined trace.
  [supply-chain #2](agent-supply-chain-security.md) · **MED**
- **OTel-GenAI span emission** from the test tiers (`src/otel.ts`, opt-in) — make
  test-time traces speak prod-observability's wire format.
  [runtime-guardrails #1](runtime-guardrails-observability.md) · **P3**
- **`enforce()` over AI-linter catalogs** — a `semgrep/` resolver in `linters.ts`
  then CodeRabbit/Greptile. [ai-native-linting #1](ai-native-linting.md) · **MED**
- **MCP-reference conformance** + a typed `mcp()` / `mcpConfig` harness hook —
  "does the cited `server#tool` still exist" via live or `.well-known`.
  [standards #3](standards-conformance.md) · [coverage-matrix](harness-testing-coverage-matrix.md) · **MED**
- **Twin-contract verification (NEW, competitor-informed)** — "valid is not true"
  applied to mocks/twins: does a twin still match the real API's CURRENT OpenAPI spec? A
  drifted twin gives false confidence; the cross-ref engine is built for it ("your twin
  claims Stripe v2024-06 but Stripe shipped a breaking change"). Could run against a
  hosted vendor's twins (compose). **Gate on demand** — contingent on the twin pattern
  spreading in users' workflows; don't build ahead of it. (Source in the private
  `startup/` vault.) · **MED / Explore**
- **Unify `audit` + `lint` on one rule engine** — promote the audit report's
  hard-coded structural findings (no-description skill, no-tool-contract agent,
  missing hook) to documented, configurable, CI-gatable rules; `audit` becomes
  inventory + a rule-derived score. The ESLint model: one rule vocabulary, two frontends.
  [scan-lint-unification](scan-lint-unification.md) · **MED**
- **`compile --policy` → Cedar/OPA codegen** — one `tools:` declaration drives the
  dev-loop hook, the prod gate, and the trace check; emit-and-verify only.
  [runtime #3](runtime-guardrails-observability.md) · [landscape-mid-2026](landscape-mid-2026.md) · **P3**
- **Multi-harness compile & the mirror story** — `harness` in project config
  (select-by-config, not just auto-detect), a byte-identical `CLAUDE.md`⇄`AGENTS.md`
  copy-mirror when no sync tool fans out, and per-harness skill verify/compile.
  Kills the silent harness-mismatch footgun in `compile`.
  [multi-harness-compile](multi-harness-compile.md) · [sync-tool-compatibility](sync-tool-compatibility.md) · **MED**
- **Mock-ergonomics borrow-list (NEW — 2026-06-17 multi-SDK probe, this PR)** —
  concrete ergonomics to adopt from other SDKs' first-party mocks into `scriptModel`
  / the eval tier, surfaced by the current-evidence probe. Borrow: Pydantic
  `FunctionModel`'s contract-aware `(messages, info) -> ModelResponse` scripting
  (expose the loaded harness's tool defs to the mock script); Vercel
  `simulateReadableStream`'s delay-knob + `convertArrayToReadableStream` + `mockId`
  - `doGenerate`-accepts-array (a `scriptModel` array shorthand) + `doGenerateCalls`
    capture (≈ `trace.modelRequests`); LangChain's `langchain-tests` capability-flag
    conformance (≈ our adapter-conformance kit) + `langchain-replay` decision-level
    replay (mock the model's judgment, keep tool side effects real); Pydantic's
    `ALLOW_MODEL_REQUESTS=False` accidental-real-call guard; MS response-caching as
    replay-adjacent. Each is an ergonomics upgrade, not a retarget — the probe
    reaffirmed vigiles owns the gaps no SDK fills (tool-contract _enforcement_ of the
    assembled agent, trigger-rate recall+precision, record/replay caching,
    sub-affordability). [sdk-harness-testing.md](sdk-harness-testing.md) (the
    2026-06-17 section) · **LOW**

- **Per-check rate thresholds in `assertRates` (DONE — 2026-06-17, API review;
  additive, non-breaking).** The absolute oracle (`measure({ checks }) +
assertRates`) is the recommended path for testing one skill, but
  `assertRates({ min })` applied a single rate floor across _all_ checks. Now
  `assertRates({ min, per })` takes a per-check-KIND override, so "`skill` must
  fire every trial AND `judged` ≥ 0.8" gates in one call; the failure message
  reports each check's own min. The `judged` check's own `min` is a per-_run_
  score threshold (orthogonal — kept). [testing-api-design §Part 7](testing-api-design.md)

- **Single-arm ABSOLUTE behaviour path — first-class now (DONE — 2026-06-17, this
  PR).** Audit found A/B was over-privileged: the absolute path existed (single-arm
  `measure` + `judged` + `assertRates`, `examples/harness/dogfood/skill-quality.eval.mjs`)
  but README, `docs/harness-testing.md`, and the `test-harness` skill all led with
  the A/B `runEval` framing. Fixed (docs/skill only, no code change): the absolute
  oracle is now the **default** for testing a single skill across every front-door
  surface, with A/B reframed as the specialised relative/regression oracle (how
  promptfoo/DeepEval frame it). [testing-api-design §Part 7 #7](testing-api-design.md)

## Later — needs model auth (write-don't-run today) or bigger

- **⛔ SCOPE (2026-07-21): `vigiles audit` is CLAUDE-CODE-FOCUSED for now.** To keep the
  current iteration a reasonable bite (a clear audit + website update, then iterate),
  the multi-harness audit DX is DEFERRED. Codex deterministic audit stays supported via
  `--harness=codex` (ships + tested) but isn't the focus. Deferred, thinking preserved in
  `research/audit-harness-dx.md`:
  - **Multi-harness audit DX** — audit ALL detected harnesses (shared-once + per-harness
    slice), fix the detection (AGENTS.md is an AAIF cross-tool standard, NOT Codex),
    read-vs-pick behavior, and a metered-API cost warning. (✅ mirror-collapse for
    `CLAUDE.md`⇄`AGENTS.md` shipped 2026-07-21 — `detectAdapterResult`; rest deferred.) **MED**
  - **Hosted in-browser audit demo** — deterministic-only rings run in the browser
    (nothing uploaded), with a real progress bar and the model-gated part TEASED
    (blurred/locked → "run locally to unlock"). Needs the shared report components. **MED**
  - **Backend audit service (WITH rate-limited LLM access) — the path to the FULL
    audit in the demo (2026-07-22, from founder feedback).** The in-browser demo is
    STRUCTURALLY a subset on BOTH axes: (1) DETERMINISTIC depth it can't reach —
    linter-rule cross-referencing (`enforce()` needs the 7 catalogs + the repo's
    config), symbol resolution (ast-grep), live MCP resolution, references INSIDE
    markdown prose; (2) the MODEL-GATED behavioral tier — trigger-rate ("do your
    skills actually fire?" recall/precision), the currently locked/teased column.
    Client-side fixes DON'T work: prose-ref parsing is SEMANTIC/undecidable (a
    code-span may be an example, not a ref — exactly why vigiles needs MARKS/a spec,
    see `reference-verification-limits.md`); catalogs/config/ast-grep aren't feasible
    in a browser; and the model-gated tier obviously needs a model. So the long-term
    fix is a BACKEND with RATE-LIMITED LLM ACCESS that runs the real `vigiles audit`
    server-side — the full deterministic depth AND the behavioral tier — and returns
    the complete report, so the demo shows REAL trigger-rate numbers (UNLOCKING the
    tease) instead of "run locally to see." Design constraints: PUBLIC-repo only
    (private stays CLI-local, preserving "nothing leaves your machine" for the CLI
    path); the demo's LLM is VIGILES-FUNDED (a marketing cost — distinct from the
    CLI's "your own subscription, no metered API" story, which stays the pitch for
    real use), so RATE-LIMIT per session/IP + cache aggressively to cap spend; the
    trigger-rate run must stub skill BODIES (firing is a frontmatter property) to keep
    each measurement cheap. HONEST CAVEAT even with the backend: UNMARKED prose
    references stay undecidable — the backend adds linter/symbol/MCP/spec-compile +
    the behavioral tier, NOT "verify any sentence." Interim (done 2026-07-22): scope
    the site text so the browser grade doesn't imply the full linter cross-reference.
    **LARGE** (infra + cost + abuse controls).
  - **Shared-component monorepo refactor** — `apps/` + `packages/report-view` (npm
    workspaces) so the report UI is genuinely shared by `report/`, the site hero, and the
    demo (no screenshots, no hacks). Root `vigiles` package + CI stay green. **MED**
- **Build the ONE polished front-door demo** — the deprecated demos (`examples/demo/`
  - `examples/plugin-test-demo.mjs` and their `demo`/`demo:plugin` scripts) have
    been **deleted**. What's still needed: ONE polished, reliably-passing demo plus a
    recorded GIF/asciinema, framed by the three "best"s — the stale-`enforce()`
    "lies" story as the one-sentence sell, and `vigiles audit` as the zero-setup wedge.
    feature-ideas #14 · **MED**
- **Leaderboard behavioural columns** — real trigger-rate + safety on top of the
  structural score. **LOW**
- **Harness cost/ROI optimizer** — A/B token-cost eval (full vs trimmed CLAUDE.md);
  a money story. **strong**
- **CI for model upgrades** — `--model` matrix over an eval baseline; catch the
  harness a new model silently breaks. **LOW**
- **Measured `judge()` rule — as an experiment first** — one `*.eval.mjs` that
  grades a code property + reports its FP rate; ship the rule kind only if the
  rate is publishable. [ai-native-linting #2](ai-native-linting.md) · **LOW**
- **Sandboxed eval tier + non-Linux backend** — `runEval` still spawns `claude`
  unconfined; `sandbox-exec`/docker for non-Linux. [feature-ideas §13](feature-ideas.md) · **LOW**
- **Deterministic subagent / command wiring** — register + drive without a model.
  [coverage-matrix](harness-testing-coverage-matrix.md) · **LOW**
- **Dogfood: a no-model floor for the 9 skill evals** — `examples/harness/dogfood/*.eval.mjs`
  are CI'd only for SYNTAX; their staleness gate (the eval LOCK / `eval --check`) is a
  green no-op because no locks are committed. Either commit eval-locks so `--check`
  actually gates, and/or add a deterministic "each eval's plugin/skillsDir LOADS + its
  skill target RESOLVES" check (no model). See `research/dogfood-corpus.md`. · **LOW**
- **Rule-catalog: probe a real linted file, not a hardcoded `src/index.ts`** —
  `enumerateEslintCatalog` (`src/core/rule-catalog.ts`) calls
  `calculateConfigForFile("src/index.ts")`, so on an own-repo whose ESLint flat
  config scopes rules to a different target (JS-only `files:["**/*.js"]`, a
  monorepo `packages/app/**`), the enabled-state read is wrong — a rule enabled
  for the real target can be mislabeled "documented but OFF". Affects only the
  ON/OFF nuance of the reuse lane (own-repo + consent), not whether it routes to
  reuse. Fix: pick a representative linted file per config target (or merge
  configs across JS/TS paths) instead of the hardcoded path. Codex review on #72. · **LOW**
- **⚠️ The rule map is ALPHA + its SHAPE IS FROZEN.** Before adding any rule-map
  heuristic / lane / linter / rescue source, read `research/rule-enforcer-design.md`
  §8 (scope-freeze + backlog) — the tuning is otherwise infinite. The default answer to
  "improve the rule map?" is NO unless it's "broaden the deterministic dogfood corpus"
  (§8 backlog #1) or a MEASURED precision/recall win. The specific LOW bugs below are the
  only pre-approved rule-map work.
- ~~**Rule map: two-tier detection (confident + possible-review)**~~ — **DONE 2026-07-15.**
  `routeRules` splits output into confident / possible / skipped via `partitionCandidates`
  (`src/rule-routing.ts`); the honest fix for the undecidable rule-vs-not problem. · shipped
- ~~**Rule map: report shows SKIPPED bullets + a best-effort caveat**~~ — **DONE 2026-07-15.**
  Terminal + HTML report render possible/skipped with reasons + a precision-first caveat;
  `audit --json` carries all three sets. · shipped
- **Rule-catalog: normalize an `eslint/` prefix before the catalog lookup** —
  `routeRuleToMechanism` (`src/core/rule-routing.ts`) matches a reuse candidate
  against the enumerated ESLint catalog by bare rule id, but a marked ref written
  as `eslint/no-var` (the `enforce()` prefix form) isn't stripped before the lookup,
  so it misses the catalog and falls through to `synthesize` even though the rule is
  real + enabled. Fix: strip a leading `<linter>/` segment before matching. Codex
  review on #72. · **LOW**
- ~~**Audit: apply the measure-consent BEFORE building the rule map on first run**~~ —
  **DONE 2026-07-15 (#73).** `cli.ts` now resolves `resolveExecution` consent BEFORE
  `computeRuleRouting`, so the first interactive `audit` enriches its own run (the
  deterministic report still prints before the prompt). Codex review on #73. · shipped
- **Segment: don't over-suppress rule bullets under a process heading** — the
  markdown segmenter (`src/segment.ts`) drops list items nested under a
  process/section heading to avoid treating steps as rules, but a legitimate rule
  bullet under an H2 like `## Rules` / `## Conventions` gets suppressed too, so it
  never reaches the routing map. Fix: only suppress under genuinely procedural
  headings (a small denylist / heading-intent check), not every H2. Codex review on
  #72. · **LOW**
- **Rule-routing: honor checkbox rule markers in the pre-pass** — the reuse pre-pass
  (`src/core/rule-routing.ts`) recognizes a marked linter ref inside a bullet but not
  when the bullet is a GitHub task-list checkbox (`- [ ] enforce(...)` / `- [x] ...`),
  so a checkbox-styled rule is skipped. Fix: strip the `[ ]`/`[x]` checkbox token
  before parsing the bullet. Codex review on #72. · **LOW**
- ~~**Python custom-rule SYNTHESIS**~~ — **DONE 2026-07-15.** Added an `astgrep-py`
  engine to `@vigiles/rule-enforcer`: one gate, injected per-engine executors
  (`rule-enforcer/executors/{eslint,astgrep-py}.js`), corpus entries carry an `engine` field.
  Python rules are synthesized as ast-grep rule OBJECTS (JSON — data, not code) run
  in-process via `@ast-grep/napi` + `@ast-grep/lang-python`. 3 dogfood rules
  (py-no-bare-except/py-no-print/py-no-eval); the naive `print($A)` ABSTAINS on the gold
  (recall leak — misses zero/multi-arg) proving the gate still catches leaks cross-engine.
  Added a provenance guard (gold reused in a self-test → abstain-contaminated, engine-
  agnostic). CI-enforced via the existing compiler-gate step (EXPECTED extended P1/P2/P3).
  Fable-designed. FOLLOW-UP (not built): wiring the audit "custom rule ⚙" lane to actually
  invoke this synthesis lane is a separate change with its own consent story. · shipped
- **Ruff routing** — extend the dynamic catalog approach to Ruff (`ruff rule --all` is
  static to the binary, `ruff.toml`/`pyproject` is data → FOREIGN-SAFE, no consent gate
  needed, unlike ESLint/Pylint). Highest-value next linter for modern Python; closes the
  public "ESLint/Ruff/…" wording discrepancy. See the design doc "What's next" #1. · **LOW**
- **Wrap the FP / dogfood sweeps as contributor skills** — `tools/fp-sweep.sh` +
  `tools/dogfood-sweep.sh` have real model-judgment on their output (which flags are
  true false positives / which detectors regressed). At launch, wrap each as a
  `.claude/skills/` contributor skill that INVOKES the script + reasons about the
  result (the `audit-feedback-loop` genre) — with a trigger eval per great-agent-flow.
  Keep the scripts as the mechanism. See `tools/README.md`. · **LOW**
- **Dogfood: Codex corpus parity** — the vendored `test/dogfood/` corpus is CC-only;
  Codex is covered only by artificial tmp fixtures (`scan-cli.test.ts`). Vendor a real
  Codex plugin slice (SHA-pinned, MIT, provenance) so the corpus is symmetric across
  adapters like the port-conformance already is. See `research/dogfood-corpus.md`. · **LOW**
- **Promote `EvalDriver` to a core port on the `HarnessAdapter` bundle** — today
  the eval-driver seam (`EvalDriver`/`ModelOutputParser`/`AgentRunner`) + the
  shared trace vocabulary (`ToolCall`/`HookFire`/`SubagentTrace`/`EvalUsage`) live
  in the library layer (`eval.ts`/`harness-test.ts`), and the default
  `claudeEvalDriver` is wired at the composition root (documented in `eval.ts`,
  commit `ca49fed`). That is DEFENSIBLE — the eval tier is a library subsystem,
  not the reference-verification core — so this is a nice-to-have symmetry, NOT a
  boundary fix. If done: hoist the trace/eval type vocabulary into a new `core/`
  module (so `core/adapter.ts` can carry `evalDriver?: EvalDriver` like the other
  five ports + `harnessTestDriver`), set it on both adapters, rewire
  `eval.ts`+`harness-test.ts`+`integration.ts`+`check.ts` to import types from
  core, keep BOTH 100% coverage gates green, and regen `api-surface/*.api.md`. ~day-sized,
  do in isolation. The trap to avoid: dragging eval/trace types into core muddies
  the reference-verification domain — only do it if the symmetry is judged worth
  that. · **LOW**

## Backlog — lower priority / niche

- Pillar 1: #12 annotation-typo (partial), #10 instruction diff (PR-time), #4
  snapshot, #1 custom-rule plugin API, #7 token budget, #8 skill coloring, #11
  dep graph, #9 hook validation (**partial** — `audit` already checks hook-script
  existence). [feature-ideas.md](feature-ideas.md)
- Pillar 2: property-based hook fuzzing, monotonic eval invariants.
  [coverage-matrix](harness-testing-coverage-matrix.md)
- Subagents: typed tool catalog for `tools:`, handoff resolution.
  [subagent-compilation.md](subagent-compilation.md)
- **#7 Self-improving harness** — auto-tune via `evolve.ts` + `proofs.ts` (idle).
  Differentiated but hard (cost, overfitting).

## Explore — go-to-market / strategic (not code-first)

> Go-to-market, positioning, monetization, and distribution bets (badge/leaderboard/
> acquisition posture, buyer segments, viral-artifact plans) live in the private
> `startup/` vault — this is a public doc (see the `doc-tiers` rule). The CODE-first
> items those bets depend on are ranked in the sections above.

## Rejected / parked (don't relitigate)

- **Killed:** compiler-not-linter, one-source-many-backends.
- **No (researched):** SDK pillar-2 retarget — gap closed by first-party SDK
  mocks; the 2026-06-17 multi-SDK probe relocates pillar-2 value to the Claude
  Agent SDK + Codex (no mock, unenforced/buggy tool contract) + a mock-ergonomics
  borrow-list. [sdk-harness-testing.md](sdk-harness-testing.md)
- **Demoted:** vigiles-as-MCP-oracle → fold into `audit`.
- **Punted:** promptfoo interop (E) + dataset/scorer parity (D).
  [eval-api-landscape.md](eval-api-landscape.md) · [promptfoo-deep-dive.md](promptfoo-deep-dive.md)
- **Rejected pivots:** security vendor, guardrails/observability vendor, generic
  agent-config linter (agnix lane), AI PR reviewer.
- **Parked:** measure model × harness (overlaps "CI for model upgrades").
- **No (evaluated 2026-06-18):** [Sogen](https://sogen.dev/) as a sandbox backend
  — it's a syscall-level Windows/Linux _binary emulator_ (Unicorn/icicle/Hyper-V)
  for malware/DRM research, and its own docs say host isolation "might not be
  perfect". Wrong workload (we confine **Node + shell**, not compiled binaries),
  wrong guarantee (we need the containment to BE the boundary), wrong gap (our hole
  is macOS Seatbelt of native processes). The one transferable idea — **snapshot +
  deterministic replay** of full execution state — we already do at the right
  altitude (filesystem/trace: the eval record/replay cache, `snapshotDir` /
  `restoreDir`). Backend decisions live in
  [cross-platform-sandboxing](cross-platform-sandboxing.md) ·
  [egress-sandbox-tooling](egress-sandbox-tooling.md).

## See also

- [`typed-spec-power.md`](typed-spec-power.md) — the non-replicable wins of a
  typed `.spec.ts` over markdown (ranked + prototyped): typed handoff composition
  (`A.ok` must satisfy `B.needs`, checked by `tsc`) and typed purity (a `pure`
  agent can't be given `Bash` — a type error). The strongest "why a spec, not
  markdown" answer.
- [`typed-spec-frontier.md`](typed-spec-frontier.md) — the deeper PL-theory +
  formal-methods round (builds on `typed-spec-power.md`): the lethal trifecta as a
  forbidden compile-time TYPE (F1, the headline), a plan-before-mutate typestate
  protocol (F2), separation-logic disjoint-write runtime gates (F3), and
  noninterference as a 2-safety hyperproperty → an A/B eval pair (F4). All four
  prototyped against real `tsc` 5.9.3 / runtime in
  [`prototypes/typed-spec-frontier/`](prototypes/typed-spec-frontier/).
- [`typed-spec-effects-monads.md`](typed-spec-effects-monads.md) — round-2 cluster
  (algebraic effects / monads / interpreters): the granular effect ROW (generalize
  the 3-rung purity ladder to independent legs fs-read/fs-write/net/exec) + the
  handler-as-residual-shrinking-router (our egress recorder / tool-interceptor are
  already handlers without the abstraction). Prototyped in
  [`prototypes/typed-spec-effects-monads/`](prototypes/typed-spec-effects-monads/).
- [`typed-spec-formal-verification.md`](typed-spec-formal-verification.md) — round-2
  cluster (model checking). **Found a REAL shipping bug** by running TLC against the
  `agent-runtime.ts` active-agent window: under depth-5 nesting a nested subagent's
  Stop clears the whole flat slot → the parent inherits tools it never had
  (`Open(writer)→Open(writer)→Stop→Call(Bash)`, contract escape). The depth-aware
  STACK fix is TLC-certified. Verdict: model checking earns its keep ONLY for the
  harness author verifying the harness's OWN protocol, never per-user. Prototyped in
  [`prototypes/typed-spec-formal-verification/`](prototypes/typed-spec-formal-verification/).
- [`typed-spec-refinement-types.md`](typed-spec-refinement-types.md) — round-2 cluster
  (refinement / dependent / session types). The pick: **refinement → runtime guard**
  (parse-don't-validate — a `result()` brand minted only after a predicate passes, the
  payload-contract twin of typed composition's wire check); plus full branching/recursive
  session types for the railway ok/err arms (TS-encodable but a recursive walk hits TS2589,
  so the shipped typed `pipe` is fixed-arity). Key insight: the type-vs-runtime line is set
  by ARITY (literal shape → type, arbitrary value → runtime guard, protocol structure
  shallow type). Prototyped in
  [`prototypes/typed-spec-refinement-types/`](prototypes/typed-spec-refinement-types/).
- [`covering-arrays-for-harness.md`](covering-arrays-for-harness.md) — the NIST
  pairwise / covering-array direction (`prune-the-timeline`). The pick: **eval
  interaction-testing as prune-then-sample** — the spec enumerates the config space,
  typed purity PRUNES the impossible configs (PICT-style constraints), a 2-way covering
  array SAMPLES the rest, and the subscription eval runs them; measured 3072 → 18 rows
  (99.4% fewer real-model runs) on a 10-skill × 3-model space. Non-replicable (markdown
  can't be fed to a CA generator) + ties the eval moat. Lint/audit is a crisp NO (free
  cells). Prototyped (real IPOG-style generator) in
  [`prototypes/covering-arrays/`](prototypes/covering-arrays/).
- [`typed-spec-fp-theory.md`](typed-spec-fp-theory.md) — round-3 deep FP/monad theory.
  Headline (a THEOREM): **Applicative / Selective / Monad is the boundary of static
  analyzability** — a selective-applicative pipeline's effect surface is a compile-time
  fold (the shipped `pipe`/`andThen` is ALREADY applicative — proven in `tsc`: monadic
  `bind` WIDENS the surface to all legs, precision provably lost), so the discipline is
  **never add a monadic `bind` combinator** (the one move that forfeits the moat). Plus
  T2 the spec-AST-as-abstract-interpreters (validated the #2 v1→v2 capability-diff) and
  T3 effect accumulation ≡ the `proofs.ts` join-semilattice. Prototyped in
  [`prototypes/typed-spec-fp-theory/`](prototypes/typed-spec-fp-theory/).
- [`whole-harness-codegen.md`](whole-harness-codegen.md) — the "wild idea", VALIDATED +
  perf-measured: a generated registry (`harness.gen.ts`, à la TanStack `routeTree.gen.ts`)
  imports every spec so `tsc` enforces the WHOLE harness as ONE program — cross-file typed
  composition, dangling-`delegate` + duplicate-name errors at edit time, and the repo-scale
  capability lattice that feeds the #2 capability-diff. **TS scales**: TS2589 only at N≈1000
  and ONLY in the naive O(N²) uniqueness encoding; the design uses per-edge O(N) types +
  uniqueness in the JS generator (~100ms at a realistic tens-of-specs harness). A MOAT lever
  (markdown- AND framework-impossible). Prototyped in
  [`prototypes/whole-harness-codegen/`](prototypes/whole-harness-codegen/).
- [`feature-ideas.md`](feature-ideas.md) · [`harness-testing-coverage-matrix.md`](harness-testing-coverage-matrix.md)
  — the two detailed backlogs.
