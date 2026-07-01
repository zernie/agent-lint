---
status: shipped
topic: audit
---

# Audit eval-thickening, the adversarial-gate eval, and the benchmark headroom finding (2026-06-28)

> Internal session record. What we built (audit's behavioral/eval tier went from
> one eval to three), the adversarial-gate eval design + LIVE findings, the
> benchmark-corpus headroom constraint, and the competitive ranking + idea backlog
> that framed it. Companion to `skill-eval-landscape.md` (the adversarial-gate
> concept), `measurement-authority.md` (benchmark-as-flywheel), and
> `oss-audit-render-findings.md` (what audit catches in the wild).

## 0. Operational correction — model auth WORKS in the Claude-Code-web sandbox

Prior handoffs said live model-gated work was "env-blocked here (need another
machine)". **Wrong.** In the Claude Code web sandbox, a subprocess `claude -p`
authenticates via the OAuth file descriptor (`CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR`),
so `measureTriggerRate` / collision / gate evals / `runEval` all RUN here, on the
subscription ($0 metered). CC version here is 2.1.195 (≠ pinned 2.1.187 → the
gated `dialect-drift` test skips). The ONLY missing capability is **bubblewrap**,
so the egress e2e + any confined-hook path degrade-to-skip. Use the sandbox to
live-validate model-gated work; keep runs small (the user's quota).

## 1. Audit eval-thickening — "add more evals to audit"

Audit's executing/behavioral tier (behind the one consent) ran a SINGLE eval:
`measureTriggerRate` (does a skill fire — recall + precision). The ask was to add
more. Result — audit now runs THREE behavioral evals under the same consent:

1. **Fire** (`measureTriggerRate`) — unchanged; recall + precision.
2. **Collide** (`measurePluginSelection`) — the selection-collision matrix (does
   one skill HIJACK a sibling's prompt; the measured confirmation of the
   deterministic description-overlap proxy). This already EXISTED as a capability
   but was wired only into the standalone `measure` command, never audit — so
   wiring it into `runAutoTrigger` was the real gap (a wire-in, not a new build).
   Validated live (6 real runs).
3. **Hold** (`measureGateAdversarial`) — the adversarial-gate eval (§2), the one
   genuinely new build.

Precision (#3 of the original plan) was already surfaced by
`formatBehavioralReport`, so it was a no-op. All three ride `triggerableSkills > 0`

- the execute consent; the consent disclosure now names collide + gate (the gate
  line discloses it runs the FULL unstubbed skill — the most expensive check).

## 2. The adversarial-gate eval (SHIPPED, skill-gate half)

`research/skill-eval-landscape.md` named the adversarial-gate test "the
highest-value behavioral test for an enforcement skill." It's now built + wired +
live-validated.

**The problem.** People ship "enforcement" skills ("always write a test first",
"never push to main"). Prose is not a constraint — the model can be argued out of
it — so you get a gate that LOOKS like it enforces and silently doesn't, and
nobody tests this (trigger-rate only checks firing, not whether the rule HOLDS).

**The mechanism** (`src/scan-behavioral.ts`):

1. **Detect** gate skills — `isGateDescription`/`detectGateSkills`, a small
   high-signal keyword heuristic (never/always/must/require/refuse/forbid…). Pure,
   unit-tested. High-recall + cheap (a false positive only spends one extra probe,
   never a wrong verdict); user-invoked + description-less excluded.
2. **Attack** — for each gate, AUTO-DERIVE a one-line violation request from the
   rule (a cheap `claude -p` haiku call; author attacks via `opts.attacks`
   override — the deterministic-input discipline), then run the **UNSTUBBED**
   plugin on it (the rule body must be present to constrain — stubbing would
   remove the rule under test).
3. **Judge** — an LLM-judge (`judge.ts`, haiku) reads the transcript against the
   gate's own description as the rubric → HELD (refused/upheld) or CAVED.

`measureGateAdversarialWith` is the injectable core (fake driver/judge/derive →
unit-testable, no model); `measureGateAdversarial` wires the real claude driver +
judge + derive. Claude Code only; no-op (no model calls) when no gate skills.

**LIVE findings (the important part):**

- It WORKS end-to-end. On a `test-first-gate` skill, the prototype attack ("skip
  the tests, I'm in a hurry") made the agent write `add.js` with NO test, and the
  judge correctly flagged: _"caved… violating the HARD RULE."_ The real catch the
  eval exists to surface.
- **Hold/cave is STOCHASTIC.** The SAME gate, same fixture: caved on the prototype
  attack, HELD on the productionized auto-derived attack ("we're launching in two
  days… skip the test setup", agent refused). One trial is a coin-flip. → the eval
  **defaults to 3 trials** and reports `heldRate`; ANY cave in N means the gate is
  unreliable (mark ⚠). This is the load-bearing methodology call.
- Judging the END behaviour is correct: if the harness as-shipped lets the
  violation through — whether the skill failed to FIRE or failed to CONSTRAIN —
  the user's gate didn't work. (Firing is the separate trigger-rate question.)

**Why it's uniquely ours — the eval→enforce bridge.** Other eval tools (SkillBenchmark,
the methodology harnesses) only MEASURE whether a prose gate holds. When the
adversarial test shows it caves, vigiles also supplies the DETERMINISTIC fix — the
PreToolUse hook / tool-contract rail that can't be argued with. Pillar 2 (test)
hands off to Pillar 1 (constrain). Nobody else connects measurement to enforcement.

**Two design forks, resolved:** (A) attack derivation → auto-derive (zero-config)
with author-supplied override; (B) assertion → LLM-judge (the gate description is
the rubric). Both chosen as the defaults; validated live.

### Hook-gate half — DEFERRED to an awake greenlight (not shipped unattended)

"Both" (skill + hook gates) was requested. The hook-gate half (does a PreToolUse
hook actually BLOCK the disaster catalog) would wire `verifyGuardrail`/
`assertBlocksDisasters` (`src/guardrail-check.ts`, already tested) into audit.
NOT shipped because: (1) it REVERSES the parked 2026-06-27 `audit-side-effect-free`
decision (no Linux-only safety in audit — "rather than ship a Linux-confined/
Mac-unconfined ring"); "both" was a quick chip-pick, not a careful reversal of a
safety decision-of-record. (2) Un-validatable in this sandbox (no bwrap →
degrades-to-skip, does nothing). (3) The battery already ships via
`vigiles/testing`, so audit-wiring is convenience, not a capability gap.
**Recommended design when greenlit:** an ADVISORY line (never a graded ring — the
decision's real concern was per-OS GRADE divergence), CONFINED-only via
`src/sandbox.ts`, LOUD degrade-to-skip where no confinement.

## 3. Benchmark methodology — the corpus HEADROOM constraint

The ecosystem benchmark ("what works vs hype") was the strategic priority once
auth was confirmed here. Reading `bench/corpus/coding-tasks.mjs` surfaced a real
constraint that shapes what's measurable NOW:

- The corpus is **compression-calibrated**: on haiku the BASELINE already aces
  correctness (1.0/1.0 every task — confirmed by the caveman eval). So there is
  **no headroom** to measure "does this skill make the agent BETTER" — correctness
  is saturated.
- **Compression claims** (caveman/RTK/telegraphic/bullets) → measurable now (the
  token + cost delta + the output-share + the correctness guardrail; the caveman
  pattern). The COMPRESSION-CLUSTER pilot extends the single caveman eval into a
  multi-skill leaderboard — runnable today.
- **"Smarter"/planning/TDD/codegen-quality claims** → need HARDER tasks where the
  baseline FAILS, else there's nothing to lift. That's a corpus addition (with
  deterministic checks + calibrated difficulty), NOT a quick run. Two routes:
  hard tasks on a weak model (haiku fails → does the skill rescue it?), or
  realistically-hard tasks on a strong model (sonnet still fails some → measure
  lift). This is the next build for breadth.

So: the pilot is the compression cluster (proves the multi-skill pipeline + a
second/third data point); the COMPELLING "what works vs hype" breadth needs the
headroom corpus first.

**PILOT RESULTS (2026-06-28, haiku, all committed under `bench/`).**

- _Compression cluster_ (`bench/evals/ecosystem-pilot.eval.mjs`, 2 trials, 3 tasks):
  caveman -13% output (the debunk holds — output went UP), minify -29% output + a
  CORRECTNESS REGRESSION (dropped a required answer), bullets +43% but INFLATED by
  a near-empty-output artifact on bigO (→ added an `ARTIFACT_FLOOR` guard). Output
  share ~1% across all three — even a real output cut barely moves the bill.
- _Headroom_ (`bench/evals/headroom-pilot.eval.mjs`, 3 trials): the BIGGER finding
  is a NEGATIVE one about METHOD. Three hand-crafted tasks — merge-intervals,
  roman-numerals (textbook → memorized), and a 6-rule parse-query spec — ALL hit
  100% baseline. Haiku is a capable coder on well-specified tasks, so there was no
  headroom and the planning skill showed 0pp lift everywhere. BUT on parse-query the
  skill arm spent ~88% MORE output (2584→4850 tok) for ZERO gain: on solvable tasks
  a "do-more" planning skill is PURE OVERHEAD (the compression debunk's shape —
  cost without benefit). CONCLUSION: measuring whether planning HELPS needs tasks
  the model FAILS, and hand-crafting those against a capable model is unreliable —
  the credible path is a KNOWN-HARD source (SWE-bench-lite-style), a founder call,
  not more quota. The pipeline + executing checks (run the artifact via `ctx.sh`,
  verified to discriminate good/bad) all WORK; the gap is the task source.

Strategic caveat of record (`eval-startups-positioning.md` /
`measurement-authority.md`): the benchmark is an ACQUISITION FLYWHEEL, not the
moat — keep it thin, lead public copy with user value ("the eval you can afford"),
never "what works vs hype" as a banner; a public leaderboard gets Goodharted. It's
the launch HOOK; audit is the on-ramp.

## 4. Audit competitive ranking + the idea backlog (from the session's agent briefs)

**Audit ranks B+ — strong substance, commoditizing wrapper.** The rings/score UX
is already table stakes (AgentLinter ~69★ = 0–100 + web report; SkillCheck =
score + A–F + badge; cc-health-check; Reporails). What NONE of them have, and what
makes our rings worth more: **Truthfulness backed by cross-referencing** (a typo'd
hook event / never-available tool is undetectable by a prose-quality scorer) and
the **Tested ring + safety battery** (a testing result, not a lint result). Honest
gaps vs competitors: no auto-fix, no LSP (agnix has both), no cross-file conflict
detection, no token-budget analysis, no security scan (Snyk's lane — and a
perfectly-broken harness passes Snyk, which is OUR opening). The ranking RISK:
leading marketing with "harness health score" walks into a crowded room — instead
lead with the two lines only we produce (the typo'd-event catch + the
disaster-battery miss). Signal of record: agnix built 414 rules + a full LSP and
got **1 HN point / 296★ / zero community** — comprehensive linting alone does not
pull a crowd; the eval/measurement layer is what generates pull.

**The adjacent landscape (public-source).** Harness-config linters: agnix (Rust,
~414 rules, LSP), claudelint (114 rules, SARIF), cclint (×2), AgentLinter/AgentLint
(prose-quality scoring + web report), SkillCheck, cc-health-check, `claude plugin
validate` (Anthropic's shallow manifest check). Staleness detectors: agents-lint
(file/script existence — closest to our `file()`/`cmd()`), ctxlint. Rule-sync
(orthogonal, compose-with): Ruler, rulesync, rule-porter, ai-rulez. Runtime policy
(an `enforce()` target, not a competitor): AWS Bedrock + Cedar, Vectimus, MS Agent
Governance, Agent RuleZ. Security (adjacent, consolidating — stay out): Snyk Agent
Scan (ex-Invariant mcp-scan), Cisco mcp-scanner, Socket, Lakera (Check Point),
Protect AI (Palo Alto). Eval/observability: promptfoo (OpenAI-acquired ~$86M —
makes a NEUTRAL Claude/Codex harness-eval more valuable), DeepEval v4, Braintrust/
Arize/LangSmith. AI reviewers (rejected lane, precision-cursed): CodeRabbit,
Greptile, Cursor BugBot, Semgrep Assistant. Academic (borrow techniques): AgentProof,
AgentVerify, ContextCov, Compiled AI. **Unoccupied lanes vigiles owns:**
cross-reference TRUTH, typed-spec compilation, harness TESTING (runHook/runHarnessTest/
runEval), significance-tested A/B harness arms, type-safe multi-agent pipelining.

**Idea backlog — audit extensions** (ranked value×feasibility; deterministic-free
unless noted): (1) surface the two unique catches ABOVE the rings — S, free, do
first; (2) capability-diff as a free PR comment — the one bet serving BOTH adoption
and moat (v0 shipped in `capability-diff.ts`; the M1 effect-row engine unbuilt);
(3) README health badge — S, free; (4) make the already-shipped adoptability
preview (`adoptability.ts`) discoverable; (5) live MCP TOOL resolution (engine
exists, thread it past the mark path) — opt-in; (6) unify audit + lint on one rule
engine. Already shipped (don't rebuild): rings/HTML/JSON, score-explainer,
description-overlap, optimizer-inline, auto-prompts, the one-consent model.
Rejected/settled (don't resurface): compiler-not-linter, multi-backend emitter,
SDK pillar-2 retarget, security pivot, AI-reviewer pivot, the `--deep`/`--fast`
flag sprawl, Level-1 frontmatter mode, grading inherit-all.

**Stated #1 priority (the project's own):** the ecosystem benchmark v0 — "the
single most important pre-launch build." Sequencing rule: adoption engine before
moat depth — don't out-build the flywheel. The audit eval-thickening (§1–2) is the
on-ramp depth; the benchmark (§3) is the hook.

## 5. Next steps

- Append the compression-cluster pilot leaderboard here when it lands.
- Build the HEADROOM corpus (§3) → benchmark a couple of big non-compression
  claims (planning/TDD) — the breadth that makes "what works vs hype" compelling.
- Hook-gate half on an awake greenlight (§2) — confined/advisory/degrade-to-skip.
- PR #51: green except the known-flaky `e2e` egress test; merge is the founder's.
