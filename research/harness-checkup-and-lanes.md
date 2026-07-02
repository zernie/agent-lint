---
status: active
topic: audit
---

# The harness checkup ("Lighthouse mode") + the casual-vs-power lane decision

> What this doc is: the decision record for a product question raised from CC-user
> field feedback (2026-06-26) — _most Claude Code users are NOT power users; they
> won't author tests/evals, but they'd happily get free info about their harness._
> Should vigiles ship a zero-config "Lighthouse for your harness" audit, predefined
> evals that need no authoring, and which lane (casual-free / power-test / both)?
> Decision below, then the synthesis, then the external-research appendix.
> Feeds `pre-release-focus.md` (the VERIFY-mass / MEASURE-depth thesis).

## The decision

**Both lanes — but ordered as ONE funnel, not two products, with strict layer
separation.** The free zero-config audit is the front door (acquisition); authored
tests/evals are the depth casual users _discover_, never a prerequisite they hit.

```
Layer 0 — FREE, zero-config, no key:  `vigiles scan`
   structural health + 0–100 score + A–F grade + the score-explainer fix list
   + PREDEFINED batteries (no authoring): hook disaster-battery, skill over-fire/collision
        ↓ opt-in (still zero-authoring, runs on the user's own sub)
Layer 1 — predefined model-gated evals: auto-prompted trigger-rate / over-fire
        ↓ opt-in (one command: `vigiles scaffold-test`)
Layer 2 — AUTHORED tests/evals: `test` / `eval` / measureTriggerRate  (power users / companies)
```

This is the Lighthouse / ESLint / Snyk model: everyone runs the free score; the
depth (CI budgets, custom checks, authored tests) is for teams. The mistake to
avoid is leading any casual surface with "write evals for your skills" (niche)
instead of "get a free harness health grade" (mass).

### The positioning conclusion — `scan` is the GATEWAY (pre-release goal)

The iPhone principle: ONE simple thing to start with. So this is NOT a new
subcommand — **`scan` is the single front door** that runs BOTH the cross-reference
lint AND the canned tests (disaster-battery, over-fire) and prints a score. The
SIDEWAYS move: agnix already owns markdown-linting (crowded, and "lint my markdown"
demand is weak), so vigiles does NOT compete on rule-count — it competes on **"we RUN
your harness, not just read it."** Authored tests/evals + the `vigiles/testing` API
are the DEPTH for those who want more (the funnel's bottom, not a second product).
This is the proposed pre-release positioning + goal.

**No env var, no setup (the iPhone reassurance).** The canned checks need NO API key
and NO model. The disaster-battery runs your hook via `runHook` (just spawns the hook
process) — for YOUR OWN repo that's like running your own tests: zero config. The
only nuance is scanning OTHER people's plugins (leaderboard mode), where the hook is
run under the existing sandbox; where the sandbox isn't available (e.g. no bubblewrap)
the battery **auto-skips with a LOUD note**, never asks you to configure anything.
So adding it to `scan` is genuinely zero-config for the common case.

### Ref-checking on a plain CLAUDE.md — DON'T guess; adopt a spec (the gateway drug)

Decided 2026-06-26. Earlier idea: have `scan` heuristically EXTRACT code-shaped refs
(paths, `npm run X`) from plain prose and verify them. **Rejected — too unreliable +
cry-wolf risk** (the README's own illustrative `src/auth/login.ts` would flag). And it
would make `scan` guess, violating scan-side-effect-free / don't-cry-wolf.

The reliable path is what vigiles already has: **auto-ADOPT a spec.** `init` (and a
prompted `scan` follow-up) generates a faithful `.spec.ts` from the existing CLAUDE.md;
the user REVIEWS the candidate marks (the human absorbs the extraction uncertainty —
no silent FPs), compiles → references are verified RELIABLY. It is **ejectable
(throwaway), or KEEP it if you like it — the gateway drug into spec-first.** So:

- `scan` (zero-config gateway) leads with the checks that need NO marks/spec: the
  disaster-battery, over-fire, structural health, score. That is the differentiated
  free value.
- Reliable file/cmd/symbol/linter-rule ref-checking = the **adopt → review → keep/eject**
  flow, not a scan heuristic. Refs degrade gracefully: nothing guessed for free →
  adopt a spec for reliable + complete (the on-ramp), keep it if it earns its place.
- Net: nobody is forced to write a spec to get value, AND we never ship an unreliable
  guess. The spec is the reliable artifact; adoption + eject is what makes committing
  to it risk-free.

## Why this is mostly PACKAGING, not a new build

vigiles already ships ~80% of the checkup:

- `scan` (`src/scan.ts`) — zero-config, no-key, deterministic report of what a
  repo/plugin ships and what's broken.
- leaderboard (`src/leaderboard.ts`) — 0–100 structural-health score + A–F grade.
- score-explainer (`src/score-explainer.ts`) — the WHY + a fix per issue (this is
  the Lighthouse "Opportunities" analog — what makes a canned check feel custom).
- `guardrail-check.ts` `DISASTER_CATALOG` — the hook **disaster battery** ("does
  your safety hook actually block `git push -f` / `rm -rf` / `curl|sh` / secret
  reads?"). Already a predefined, deterministic, zero-authoring check.
- `description-overlap.ts` — skill over-fire / collision, deterministic, free.
- `measureTriggerRate` — auto-promptable over the user's EXISTING skills (Layer 1,
  no authoring; model-gated, runs on their sub).
- `scaffold-test` — the one-command bridge from a flagged issue to an authored test.

So the work is: (1) surface the battery + over-fire checks as NAMED audit results
in `scan` (not buried in raw output), (2) frame `scan` as "your harness health
report", (3) make the score + the scariest true finding the headline on every
casual surface (README, `init` output, the GH Action PR comment), (4) a badge.

NOT a new verb — per `cohesive-cli-surface`, the checkup IS `scan` (+ flags/output),
not a sibling `doctor`/`checkup` command.

## What converts casual users (from the external research)

- **A concrete, shame-inducing number vs a familiar benchmark in <60s, before any
  commitment.** Lighthouse's 0–100 isn't new info — it's a defensible number to
  show a manager + a shareable artifact + a priority queue. vigiles's grade + the
  "2/7 disasters get through" line is exactly that.
- **The free tier must be the REAL tool in the real workflow, never a teaser.**
  Snyk/SonarCloud/Socket give full diagnostic value free (CI, PR decoration); that
  is what converts to paid depth. A partial result ("upgrade to see the rest")
  destroys trust — the canonical PLG anti-pattern.
- **Specificity beats a score.** Knip converts with no score at all — just a
  precise, actionable list. `npm audit` names the CVE, not "you may have issues."
  The score-explainer naming the exact dangerous command that slipped through is
  the high-signal move.
- **Progressive DEPTH, not progressive pricing** (ESLint recommended→custom, TS
  loose→strict). The casual path must never require config/login before output.
- **The badge is the distribution flywheel** (Codecov coverage %): ambient
  advertising that pulls in the next developer.

## Pitfalls (hard rules)

1. **Don't tease the battery** — the disaster-battery + over-fire checks are fully
   free with full output. No "upgrade to see the rest."
2. **Don't cry wolf** — the structural group stays FP-safe (a clean plugin stays
   green). One false positive on a famous plugin and casual users dismiss the
   score forever. (Ties directly to the launch FP-sweep: `scripts/fp-sweep.sh`.)
3. **Keep power concepts off the casual path** — `scan` output must not mention
   `vigiles/hook`, typed specs, or `.harness.mjs` until the user has engaged Layer 2. The score + fix list is the interface; the typed machinery is the impl.
4. **Invest in actionability** — "blocks 2/7 of the disaster battery, `git push -f`
   slips through" (high-signal), never "consider adding more rules" (noise).

## How this maps to the launch (it REINFORCES the plan)

- The ecosystem-benchmark (measuring hyped skills at scale) is the PUBLIC version
  of this same bet — free, zero-effort measurement as the wedge. Same idea pointed
  two ways: your-harness checkup vs the-ecosystem leaderboard.
- It sharpens the README's mass on-ramp: lead casual surfaces with "free harness
  health report + the one scary true finding," not the instrument framing.
- Companies are the monetizable depth (they WILL author tests — discipline +
  stakes); casual users are the funnel that feeds them. Not pick-one.

## Status / next (post-decision)

**SHIPPED (2026-06-27, branch `claude/lint-inline-mode-go56av`) — the FULL Lighthouse
build:** the verb is `audit`; a default run prints **four deterministic category
rings** (Truthfulness/Triggering/Structure/Tested) + a weighted A–F health score,
folds each finding's **fix inline**, and writes a **self-contained HTML report**
(`vigiles-report.html`) — a deterministic READ, nothing executes. "We RUN your
harness" is THREE executing checks (safety battery · live MCP · trigger-rate)
behind **one consent** (`decideExecute`): at a TTY `audit` **asks once** (remembered
in `.vigilesrc.json` `audit.measure`); headless it stays a read + a one-line nudge;
there is NO execution flag — `audit` is a local report (Lighthouse-style), not a CI
step (CI uses `lint`); automation tests the harness via the `vigiles/testing` API.
State-safe per `audit-side-effect-free`: execution is opt-in UNIFORMLY (not
confined-on-Linux/unconfined-on-Mac) because confinement is Linux-only; on consent
the battery runs **network-confined** where a sandbox exists (else own hooks direct

- loud warning, foreign skip), live MCP is own-repo only, the trigger-rate stubs
  skill bodies. The dropped flags
  (`--check-hooks`/`--verify-mcp`/`--trigger`/`--fix-plan`/`--explain`/`--deep`/`--fast`)
  all collapsed into this surface. See `research/audit-lighthouse-design.md` for the
  design record. The flag-per-check surface below is superseded.

* The **badge** (README markdown + URL) — the distribution flywheel, not yet built.
* Lead the casual surfaces (README, `init` output, GH Action PR comment) with the
  score + the scariest true finding — not yet wired into those surfaces.
* Auto-prompt generation for the Layer-1 over-fire check (reuse `measureTriggerRate`
  - a deterministic prompt synthesizer) — the one genuinely new-ish piece.
* Monetization/company angle (CI policy, org views, history/trending) — post-launch.

## Competitive landscape (2026-06 — fanned-out research, 4 search angles)

The "free zero-config harness audit/score" SURFACE is more crowded than expected —
but vigiles's two real wedges (cross-reference CORRECTNESS + the TESTING layer) are
unclaimed by anyone.

**Funded startups — vigiles's lane is OPEN.** Two camps, neither in it: runtime
observability / output-eval (Langfuse, Braintrust, Arize/Phoenix, Patronus, HoneyHive,
Galileo, LangSmith — trace the running agent, grade OUTPUTS) and agent/MCP security
scanning (Snyk Agent Scan — the closest: free, PLG-shaped, reads static SKILL.md/MCP;

- Enkrypt AI). The security scanners ask "is this MALICIOUS?" (prompt injection, tool
  poisoning), never "is this WIRED CORRECTLY?". No funded startup scores harness
  CORRECTNESS.

**OSS — the SCORE surface is commoditizing fast.** Multiple zero-config tools already
ship the Lighthouse score+grade shape:

- **agnix** (`agent-sh/agnix`, ~250–300★) — the lint-breadth + MINDSHARE leader:
  ~425 rules over CLAUDE.md/AGENTS.md/SKILL.md/hooks/MCP, multi-harness, real LSP,
  `--fix`. But pass/fail diagnostics, **no graded report card, no cross-ref engine**.
  The incumbent to watch (could bolt on a score any release).
- **AgentLinter** (`seojoonkim/agentlinter`, ~69★) — the SCORECARD-UX leader: 0–100 +
  letter grades, 8 dimensions, shareable web report, zero-config. But scores
  **prose/content quality**, not reference correctness. (AgentLint `0xmariowu` ~41★ +
  cc-health-check are the same static-heuristic-scorer pattern.)
- **cc-health-check** (`yurukusa/...`, new) — 0–100 + bands, 20 checks/6 dims, README
  badge. **Config completeness**, not correctness.
- **claudelint** (claudelint.com) — agnix's twin: 114 rules / 10 categories over
  CLAUDE.md/skills/settings/hooks/MCP/plugins/agents, SARIF output. Validate-only,
  **no score, no cross-ref**.
- **SkillCheck** (getskillcheck.com / `thedaviddias/skill-check`, ~183★) — owns the
  **score + A–F grade + badge** UX, but scoped to a single SKILL.md's content quality
  (not the whole harness). The UX motion to beat.
- Also: Reporails (score/10, 92 rules), AgentLint (`0xmariowu`/agentlint.app),
  Emasoft/claude-plugins-validation (190+ rules, weighted score), cclint ×2,
  Anthropic's own `claude plugin validate`.

**The consistent verdict across both thorough sweeps — NONE have either vigiles wedge:**

1. the **cross-referencing engine** (does a declared tool / hook-event / script /
   linter-rule actually EXIST and is it ENABLED, across 7 catalogs) — everyone checks
   prose quality / structure / config-completeness / security, never reference TRUTH;
2. the **harness-TESTING layer** (`runHook`/`runHarnessTest`/`runEval` — does it
   actually fire / block / help) — everyone is a static linter/scorer; nobody tests
   the assembled machine.

### Snyk Agent Scan — the incumbent to watch (deep dive, 2026-06)

Bigger than the first sweep suggested, and moving onto our exact artifacts — but from
the SECURITY angle, which keeps the differentiation clean.

- **Provenance + scale:** Snyk acquired **Invariant Labs** (ETH Zurich / Vechev lab)
  June 2025; `invariantlabs-ai/mcp-scan` → **`snyk/agent-scan`** (npm `@snyk/agent-scan`,
  Oct 2025, **~2.4k★**, Apache-2.0). An ~$8B incumbent with real distribution.
- **Scope EXPANDED** from MCP-servers-only to agent Skills (SKILL.md), harnesses
  (CLAUDE.md / AGENTS.md / GEMINI.md), and enterprise fleet scanning (Snyk Evo). **Open
  issue #301 explicitly requests scanning CLAUDE.md/AGENTS.md/GEMINI.md + commands +
  referenced markdown** — i.e. Snyk is actively moving toward whole-harness scanning on
  the SAME files vigiles compiles + verifies. The clearest competitive signal in the sweep.
- **But it's a SECURITY threat detector, not a correctness verifier.** Detection = local
  heuristics + a hosted LLM "Guardrails" classifier (`--local-only` is weaker). Classes:
  prompt injection, tool poisoning, cross-origin / tool-shadowing, rug pulls
  (tool-description hash pinning), toxic flows (cross-tool data-flow). All "is this
  MALICIOUS?" — none asks "does the declared rule/tool/event EXIST + resolve?", none RUNS
  the harness (no `runHook`/`runHarnessTest`/`runEval`), none scores correctness.
- **Differentiation (clean + citeable):** security layer (Snyk) vs correctness/testing
  layer (vigiles) — complementary, not overlapping. The ACM/IEEE 2026 MCP-Scanner paper
  (`dl.acm.org/doi/10.1145/3786160.3788471`) formalizes Snyk's approach — a useful cite
  for positioning vigiles as the correctness layer. Confirmed across 3 sub-probes:
  agent-scan's ~21 issue codes (E001–W021) are ALL threat-detection; the word
  "correctness" never appears in their docs; and **a perfectly broken harness — dead hook
  scripts, typo'd linter rules, an unreachable MCP server — passes Snyk's checks
  completely.** That sentence is the demo.
- **Direction + pricing (lowers the threat):** Snyk is moving DEEPER into security (Evo
  AI-SPM GA Mar 2026; Evo Agentic Development Security GA ~Jun 29 2026; Vercel/skills.sh
  install-time scanning), with NO signal — no acquisition, job post, or blog — toward
  correctness/quality scoring. Monetization is enterprise seats (~$25–$105/dev/mo); the
  OSS CLI + free web Skill Inspector are the funnel. So there is **no Snyk free tier that
  solves the correctness problem — clean air for vigiles.**
- **Snyk ALREADY ran the "scan-the-ecosystem → scary stat → viral" play — on the
  SECURITY axis.** Their **ToxicSkills** research (Feb 2026) scanned 3,984 skills → 36%
  had issues, 76 human-confirmed malicious — the exact motion vigiles's
  ecosystem-benchmark plans. TWO implications: (1) run OUR benchmark on the
  **correctness / performance axis ("what works vs hype")**, NOT security — that axis is
  taken; (2) Snyk publicly dismantles rival scanners ("False Security" blog), so do NOT
  pick a fight on their axis — position as the complementary CORRECTNESS layer. (Their
  free Skill Inspector web UI needs no account; the CLI needs a `SNYK_TOKEN`; enterprise
  = Snyk Evo ADS, GA ~2026-06-29.)
- **THREAT VERDICT: MEDIUM.** Not a head-on competitor today (different question —
  confirmed: all ~20 of agent-scan's checks are threat-detection, zero correctness), but
  the biggest mover on our artifacts + the distribution to define the category. Lead the
  differentiation HARD: _"Snyk scans your harness for malice; vigiles verifies it's
  correct and tests that it works."_ Watch issue #301 and any "reliability/quality score"
  signal.

### Strategic implication (refines the decision above)

- The free zero-config SCORE is now **table stakes, not a differentiator.** Do NOT
  pitch vigiles as "another scored harness linter" — agnix owns lint breadth, 3+ tools
  own the score UX. The score is the familiar WRAPPER, not the substance.
- **LEAD the free report with what's uniquely vigiles AND visceral:** (a) cross-ref
  FAILURES ("your hook fires on a typo'd event → it never runs"; "this tool isn't in
  the catalog"; "this linter rule is disabled"), and (b) the DISASTER-BATTERY result
  ("blocks 2/7") — a TESTING result, not a lint, so **no competitor can produce it.**
  That one line is the moat made visible.
- **Competitive watch:** agnix (lint leader — could bolt on a score); the score-racers
  (AgentLinter / cc-health-check / Reporails); Snyk Agent Scan (funded incumbent doing
  free static agent-config scanning — "add a correctness score" is a plausible
  adjacent move).
- (Adjacent-category sweep — eval/guardrails/MCP-security/AI-code-review — still
  finishing; not expected to change the verdict since those are different lanes.)

## Appendix — external research (preserve; sources)

Patterns + named examples the synthesis draws on:

- **Lighthouse** — zero-install, 0–100 per category, ranked "Opportunities" with
  estimated ms saved + the exact element. Score = social currency + manager-facing
  artifact + priority queue.
- **`npm audit`** — ships WITH npm (the audit IS the tool, not a separate install);
  count + severity in one line; names the CVE (specificity = signal).
- **Snyk** — free `snyk test` richer than `npm audit` (license, fix PRs, severity);
  free scan is the growth engine; CI/PR/multi-repo is the enterprise upsell.
- **SonarQube/SonarCloud** — free tier does REAL branch analysis + PR decoration
  (workflow features, not a gimped demo); enterprise = taint analysis, portfolio,
  custom gates (additive, casual path untouched).
- **Socket.dev** — free supply-chain behavior scan; the insight itself ("this
  package added `fs.writeFile` in v2.0.1") is the hook.
- **Knip** — `npx knip`, zero config, no score — just a precise actionable list;
  converts on specificity alone (the score matters less than the "now what").
- **ESLint / TypeScript** — Layer 0 zero-config → Layer 1 recommended preset (where
  most non-power users live permanently; must be FP-safe) → Layer 2 custom/CI. The
  failure mode is collapsing 0 and 2 (config wall before any output).
- **Codecov / Sentry** — free = real signal (coverage/traces); paid = team mgmt,
  SLO, retention. The README badge is the ambient-ad flywheel.
- **PLG data** — bottom-up individual→enterprise is the consistently validated
  dev-tool acquisition model; the winners' free tier is genuine workflow value, not
  a demo; login-wall-before-output loses casual users.

Sources: Google Lighthouse (Chrome for Developers) · Snyk Code free SAST blog ·
NearForm "comparing npm audit with Snyk" · SonarQube free-tier blog · Lighthouse
performance-scoring docs · daily.dev PLG-for-dev-tools · saasmag PLG-2026 ·
Product Marketing Alliance "open source to PLG" · pkgpulse Knip-vs-depcheck ·
webhint axe hint · Extruct "State of PLG 2025".
