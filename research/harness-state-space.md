---
status: active
topic: roadmap
---

# Harness state-space — the moat thesis, generative checks, and ranked bets

> Status: strategy synthesis (2026-06-19). The organizing thesis (minimize the
> harness's state space; make invalid states unreachable), the method that feeds it
> (analogical transfer from mature CS, filtered by don't-cry-wolf), the concrete
> check classes it generates, and a **ranked list of practical bets** to find a moat,
> beat the field, and go viral — including the OSS-PR generation flywheel. Companion
> to `instruction-file-linter-landscape.md` (the competitor map), `lightweight-spec-authoring.md`
> (the spec/templates design), and `roadmap.md` (where these land).

## The thesis: minimize the harness state-space; make invalid states unreachable

Reframe vigiles's job as one principle: **shrink the agent harness's state space to
known-good.** Every feature is an instrument of that, and there are four:

| Mechanism            | Shrinks the space by…                      | Works on       |
| -------------------- | ------------------------------------------ | -------------- |
| **Construct** (spec) | invalid states can't be _expressed_        | typed surface  |
| **Verify** (lint)    | invalid states _detected & rejected_       | any (incl. md) |
| **Gate** (hooks)     | invalid states _can't be entered_ in-loop  | any            |
| **Test** (evals)     | the _remaining_ valid space is proven good | any            |

The agent-world adaptation is the key move: when the author is a model, "make invalid
states **unrepresentable**" (a type-system idea, edit-time, human audience) becomes "make
invalid states **unreachable in the loop**" (a gating-hook idea, loop-time, format-agnostic).
You don't need the type system to forbid expression if a gating hook means the agent's
invalid edit can't survive its own loop. This is why the moat is the _harness_, not the
authoring format — and why it survives the shift away from humans writing code.

## The method: analogical transfer, filtered by don't-cry-wolf

The whole competitor field is ad-hoc structural linters; none think in transferable CS
principles. So the generative method is: **take a mature technique (type theory, object
capabilities, effect systems, taint analysis, formal methods) and map it onto the harness —
even if it looks crazy at first.** The "looks crazy" ones are where the edge is, because
nobody else will have them. The filter that keeps it honest: **a transfer earns its place
only if it yields a deterministic, high-signal check or gate that shrinks the state space.**
If it needs a model or only emits a fuzzy 0–100 score, it's a cute analogy, not a moat.

## The bets (expanded)

### Moat bets (mostly transfers → deterministic check classes)

**Foundational — the two FP principles applied to the USER's instruction files** (vigiles's
own `ts-essentials` rule uses both internally; the move is to point them at the object
domain — the user's CLAUDE.md/SKILL.md — not just vigiles's code). Everything below is a
query _over_ these:

- **0a. Make illegal states unrepresentable → schema-as-sum-types.** Design the
  SKILL.md/agent/hook schema — the typed-spec builders AND the `generate-schema` JSON Schema
  — as precise discriminated unions so illegal _combinations_ can't be authored; where
  markdown can't forbid authoring, the JSON Schema (`oneOf`/`required`/`not`/`enum`) rejects
  them at edit time and lint hard-errors them. Each illegal state is a real silent-failure
  bug: model-invocable skill with no description/trigger (never fires) →
  `{invocable:"model", description, trigger}` XOR `{invocable:"user", command}`; a
  never-available/typo'd tool (silently dropped) → `tools: ClaudeTool[]` over a closed
  catalog; an incomplete `mcp_tool` hook (never runs) → `{event} & McpToolAction{server,tool}`;
  mutually-exclusive fields (`disable-model-invocation` ∧ trigger examples) forbidden by the
  union; ephemeral state (`Current Task`/version/date) → **no such slot exists**, so it has
  nowhere to go. Enforce structure by CONSTRUCTION (spec) + SCHEMA (markdown), not
  after-the-fact prose checks.
- **0b. Parse, don't validate → parse-the-harness-once.** Read the whole harness
  (CLAUDE.md + SKILL.mds + agents + hooks + plugin.json/MCP) ONCE at the boundary into a
  typed `Harness` model whose types have already eliminated the illegal states; lint, scan,
  hooks, and tests all consume THAT, never re-parsing raw markdown. So: "fails to parse into
  the typed model" IS the error (a SKILL.md that can't yield a valid `Skill` is rejected at
  the boundary, not re-checked at five call sites); no detector drift (one parse = one source
  of truth — `one-detector-no-drift` is a corollary); normalize once (`string|string[]`
  tools, braced/unbraced plugin-root). The lenient `frontmatter-read` + `loadPlugin` are the
  seed; the discipline is "no consumer touches raw md again," and the parse emits the
  diagnostics (lint findings) AND the typed value (what hooks/tests run on) — **parsing IS
  the verification.** The trifecta check (#1) is just a query over this parsed capability set.

1. **Capability-graph + lethal-trifecta forbidden-state check.** Object-capability +
   taint analysis. The dangerous _state_ is the co-occurrence of {private-data access} ∧
   {untrusted-content intake} ∧ {exfiltration channel} in one agent's capability set —
   forbid it. A **deterministic** check over a plugin's declared tools/MCP/hooks (no
   model). Security scanners look for malicious _patterns_; the linter crowd checks
   _structure_; nobody checks the _capability state space_. Timely, novel, viral-by-finding.
2. **Capability minimization (least privilege).** Flag inherits-all (the no-`tools:`
   footgun), granted-but-never-used tools (over-grant is OWASP Agentic #1), and
   broader-than-needed MCP scopes. The "reduce ambient authority" transfer. Deterministic;
   pairs with #1.
3. **Effect system: declared-vs-observed effects.** Type each skill/hook's effect surface
   (net / fs / shell / paid-API); declare it, then prove it. The egress allowlist is
   already the net case — generalize. The observed≠declared flag is the roadmap flagship;
   the effect-signature is what makes it a principle, not a one-off.
4. **Consistency / contradiction class.** The harness containing internally contradictory
   states. Four deterministic checks no one ships: **instruction-vs-config** (file says
   "tabs", prettier enforces spaces), **instruction-vs-hook** ("run tests before commit"
   with no hook to enforce it, or a hook blocking what an instruction encourages),
   **file-vs-file** (CLAUDE.md vs a sub-AGENTS.md), **ephemeral-in-durable** (a `Current
Task`/version literal/date in a file meant to be stable).
5. **Totality of hooks.** Every hook must decide for every event it's registered on; a
   happy-path-only hook is a partial function that silently falls through. `propertyHook`
   is the test; the framing generates the check. Small, clean, deterministic.
6. **MDL / derivability.** If a section is deterministically derivable (from config, README,
   or the filesystem), it shouldn't be hand-written prose — it's redundant tokens the agent
   pays for _and_ a drift source. The principled version of dedup; feeds computed-from-FS.
7. **Lint-as-hook + agent-consumable JSON.** The agent-native _delivery_ of all the above:
   structured `--json` with did-you-mean fixes + a PostToolUse hook that gates bad refs as
   the agent writes them. Corollary: FP-calibration becomes a **safety** property (an agent
   "fixes" every finding). Already on the roadmap.
8. **Harness testing as the apex (grows with agent authorship).** A probabilistic author
   produces output you can't trust by inspection → you must verify behaviorally (does the
   hook fire, does the skill trigger). `runHarness`/`measureTriggerRate`/`runEval`. The one
   layer that gets _more_ valuable as agents write more.
9. **Shareable typed presets bundled with evals.** The one place "TS to the fullest"
   survives: an expert authors a typed, composable preset once (dependent types, `extends`,
   type-state), thousands consume its compiled markdown + bundled trigger-rate evals. Code
   reuse with verification, not pasted text.
10. **Cross-harness differential.** Same instruction file on Claude Code vs Codex, diff the
    behavior — the cross-harness _depth_ moat expressed as a method (model-gated → eval tier).
11. **Metamorphic / paraphrase-invariant triggering.** Rephrasing a prompt shouldn't flip
    whether a skill fires; measure robustness, not just rate (model-gated → eval tier).
12. **Content-addressed references (Unison-style).** Reference by content-hash so renames
    can't break refs (the integrity hash is a baby version). Heavy; parked.

### Viral / distribution bets

13. **OSS-PR / fix-it flywheel (the delivery multiplier) — INVITED, not cold.** vigiles
    finds **high-signal** defects (stale refs, never-available tools, the trifecta,
    contradictions) and ships a **fix-with-a-test**, crediting vigiles. **Critical 2026
    reality** (sourced below): unsolicited automated PRs are now _presumptively spam_ —
    curl ended its bug bounty over AI-slop reports, Jazzband shut down, tldraw auto-closes
    external PRs, GitHub is weighing a PR kill switch. So the **cold** version (mass PRs on
    strangers' repos) is now high-risk and would get vigiles lumped with the slop. The
    **working** version is the _invited_ model (Dependabot/Renovate/CodeRabbit all grew
    this way): a GitHub App the maintainer installs (merges with #16), pull-based discovery
    (#14/#15) instead of push, and PRs only on opt-in repos. The **one narrow cold
    exception**: a genuine security vuln (a real trifecta finding) via responsible
    disclosure, one-per-repo, fix+test, automation disclosed — "a CVE is a CVE" is the only
    thing maintainers still thank a bot for. Guardrails below are non-negotiable.
14. **Public "is your harness broken?" leaderboard.** Scan popular marketplaces, rank
    plugins by harness health (`scoreReport` exists). Shareable, drives "fix yours".
15. **Free hosted web validator.** Paste a CLAUDE.md / repo URL → instant report → funnel to
    the CLI/PR. Exactly how agentlinter.com / SkillCheck seed adoption; low-friction
    top-of-funnel.
16. **GitHub App with sticky PR comments.** Auto-review harness changes in any PR (the
    prod-grade GHA already exists); a marker-updated sticky comment. CodeRabbit's growth
    pattern — distribution via CI presence.
17. **Security disclosure pipeline (press engine).** The trifecta/over-grant checks produce
    scary, shareable findings ("this popular plugin can exfiltrate your secrets").
    Responsible disclosure → press → virality (the MoltX-incident shape). Handle with care.
18. **"Harness verified" badges / per-repo `COVERAGE.md` scorecard.** Repos display a
    shields.io badge → passive distribution. Roadmap already has per-plugin COVERAGE.md.
19. **One-command agent-install demo.** "Point your agent at vigiles → it sets up + writes a
    passing trigger-rate eval." The great-agent-flow as a shareable gif/video.
20. **Standards play.** Contribute the consistency/trifecta checks to the AGENTS.md / AAIF
    standard → become the reference implementation. Slow but durable.
21. **Preset gallery.** A community gallery of shareable verified presets (#9) → network
    effect.

## The lethal-trifecta check, concretely (the Tier-1 detail)

Simon Willison's [lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)
(June 2025): an agent is dangerous when it simultaneously holds **private-data access +
untrusted-content intake + an exfiltration channel** — because indirect prompt injection in
any untrusted-content surface can redirect a private read to an external write. It maps to a
**pure set-intersection over a plugin's declared `tools:` and `mcpServers`** — zero model,
zero runtime, reviewable in a PR diff:

- **Leg A — private data:** `Read`, `mcp__filesystem__*`, `mcp__github__get_file_contents`,
  `computer_use`; MCP servers `filesystem`/`github`/`google-drive`/`notion`/`slack`/`gmail`.
- **Leg B — untrusted intake:** `WebSearch`, `WebFetch`, `mcp__fetch__*`, anything reading
  URLs/user docs.
- **Leg C — exfiltration:** `Bash` (curl/wget reachable), `mcp__github__create_pull_request`/
  `add_issue_comment`, `computer_use`, any HTTP-outbound or external-write MCP.

A subagent holding all three legs is **structurally dangerous regardless of its
instructions**. This is `verifyToolContract`'s sibling: same detector shape (read the
declared surface, intersect against the dialect's tool/MCP catalog), new property.

**Why it goes viral (responsibly):** the press hook is already written. The **Jan 2026
cluster — four name-brand exploits in five days** ([Breached.Company](https://breached.company/the-lethal-trifecta-strikes-four-major-ai-agent-vulnerabilities-in-five-days/))
— Notion AI, Superhuman, Claude Cowork, IBM Bob — were **all** Leg A+B+C, different surfaces,
identical structure: _you don't need a new attack, you need a different config._ Plus
**CVE-2026-21852** (Claude Code API-key exfil on startup in a cloned repo,
[THN](https://thehackernews.com/2026/02/claude-code-flaws-allow-remote-code.html)), the
**Sept-2025 first malicious MCP package**, **VIPER-MCP's 106 MCP zero-days**, and the
recurring **"40% of MCP servers have no auth"** finding. vigiles's angle: **flag the trifecta
_before the agent runs_, statically, at commit time, for free** — every other approach
(runtime observability, red-teaming, model scanning) costs tokens or needs a live run. See
`agent-supply-chain-security.md` for the prior stance this sharpens.

## Ranked (ordered) — criteria: moat defensibility × adoption pull × low effort × timeliness × fits-the-engine

**Tier 0 — the foundation under everything (build/solidify first):**

- **Schema-as-sum-types (0a)** + **parse-the-harness-once (0b).** Not flashy, but every
  Tier-1 check is a _query over the parsed, sum-typed harness model_ — the trifecta query is
  cheap only because the harness was parsed once into a typed capability set, and structural
  enforcement is "illegal states won't construct/validate." Partly built (`frontmatter-read`,
  `loadPlugin`); the work is making it THE discipline + the public `generate-schema`
  constraints.

**Tier 1 — do now (highest combined ROI):**

1. **Capability-graph / lethal-trifecta + capability-minimization (#1, #2).** The single
   "looks-crazy-but-ship-it" bet: deterministic, novel, the hottest problem in agent-land,
   a perfect instance of the principle, viral by finding, and unoccupied. THE bet.
2. **Pull-based virality: leaderboard + free web validator (#14, #15).** Top-of-funnel on
   the existing `scan`/`scoreReport`, near-zero new engine, and — given the 2026 PR-spam
   backlash — the _safe_ growth vector: maintainers come to the finding instead of being
   blasted with PRs. This is now the front of the distribution engine, ahead of the bot.
3. **Lint-as-hook + agent-consumable JSON (#7)** — cheap, operationalizes the principle in
   the agent loop, makes FP-calibration a safety property. On the engine already.
4. **Invited fix-it flywheel (#13 + #16)** — the GitHub-App, opt-in, fix-with-a-test
   version (NOT cold PRs), with the security-disclosure exception. The distribution
   multiplier, de-risked per the guardrails. Higher effort + trust-sensitive, so it follows
   the pull-based funnel rather than leading.

**Tier 2 — next (strong; more effort or model-gated):**

5. **Consistency/contradiction class (#4)** — novel deterministic checks that populate the
   thesis; instruction-vs-config is the standout.
6. **Effect system: declared-vs-observed (#3)** — generalize the egress work into a
   principle; near the flagship.
7. **Harness testing + auto-write-tests-on-install (#8, #19)** — the growing moat + the
   killer adoption demo, fused.
8. **GitHub App sticky PR comments (#16)** — CI-presence distribution; reuses the GHA.
9. **Security disclosure pipeline (#17)** — press virality from #1's findings, responsibly.

**Tier 3 — explore / opportunistic:**

10. Shareable typed presets + gallery (#9, #21) · 11. Totality of hooks (#5, cheap, do
    opportunistically) · 12. MDL/derivability (#6) · 13. Cross-harness differential (#10) · 14. Metamorphic trigger robustness (#11) · 15. Badges/scorecards (#18) · 16. Standards
    play (#20) · 17. Content-addressed refs (#12, parked).

**Avoid / handle-with-care:** the **cold** OSS-PR play. In 2026 unsolicited automated PRs
are presumptively unwelcome — the fastest way to get blocked by GitHub and publicly hated.
So the virality engine leads with **pull-based** discovery (free web validator + leaderboard,
#14/#15) and the **invited** GitHub App (#16); cold PRs are reserved for the narrow
responsible-disclosure security exception. FP-calibration is the precondition, not a nicety.

## The fix-it flywheel — guardrails (so it's distribution, not slop)

The 2026 bar (sourced): the tools that grew without backlash (Dependabot, Renovate,
CodeRabbit) were all **invited, bounded, and obviously valuable within 30 seconds of
review**; the ones that got blocked (Hacktoberfest "Spamtoberfest" 2020; the curl /
Jazzband / tldraw AI-slop-PR wave of 2024–26) **maximized volume over signal**. The
non-negotiable rules:

- **Invited / opt-in only** — a GitHub App the owner installs, or a repo config/topic.
  Unsolicited mass PRs are spam by definition now; do not cold-open on strangers' repos.
- **Pull before push** — let maintainers _come to_ a finding (web validator, leaderboard,
  PR-time review on repos that installed the app) rather than blasting PRs out.
- **Signal threshold = the confident subset only** (never-available tool, broken hook
  script, the trifecta, a stale ref that resolves nowhere) — never a style nitpick or a
  fuzzy score. A false positive isn't UX noise; it's a maintainer who blocks you.
- **Fix-with-a-test, don't nag** — the change _repairs_ the defect + adds the verifying
  test; "a PR that creates work without doing work is the definition of slop."
- **One PR per repo, rate-limited per _maintainer_ not per repo** (don't open 40 across a
  maintainer's 40 repos), automation disclosed with an opt-out, honoring CONTRIBUTING.md
  and any already-declined issue.
- **The only welcome cold PR is a real security fix** (#1/#17) via responsible disclosure —
  "a CVE is a CVE." Everything else must be invited.

This is the same don't-cry-wolf moat pointed outward: the FP-calibrated engine is what lets
the bot be _invited_ and welcome rather than blocked. Sources: [curl ends bug bounty](https://www.theregister.com/2026/01/21/curl_ends_bug_bounty/),
[GitHub weighs a PR kill switch](https://www.theregister.com/2026/02/03/github_kill_switch_pull_requests_ai/),
[Renovate noise-reduction](https://docs.renovatebot.com/noise-reduction/),
[Hacktoberfest 2020 → opt-in](https://dev.to/devteam/an-update-on-hacktoberfest-37a).

## Refinements / decisions (this session)

- **0a vs 0b — which principle does what.** "Make illegal states unrepresentable" (0a) is
  the **product** principle — it generates user-facing checks (model-invocable-needs-trigger,
  tools-absent-vs-empty footgun, allowed∩disallowed contradiction, guidance-needs-a-`why`,
  ephemeral-state-has-no-slot). "Parse, don't validate" (0b) is the **substrate** — how
  vigiles is built (one parse → typed model **+** a rich `Diagnostic[]` carrying span +
  did-you-mean; the invalid branch is an explicit `unresolved` variant, never dropped). Plain
  TS discriminated unions + a runtime diagnostics stream; the only type-state flourish is the
  existing phantom pipeline (`RawSpec → … → ReadyToEmit`). Don't sell 0b as a moat — it's good
  engineering, not a new check.
- **Trifecta severity = `warn` + explicit sign-off.** Not a block (a deploy/CI subagent
  legitimately holds all three legs; blocking makes an agent strip a needed tool — FP-as-
  safety). Fire only when all three legs are unambiguously in the _declared_ set; suppress via
  a `vigiles:allow-trifecta "<reason>"` marker that records the reason. The forbidden state is
  **unacknowledged** trifecta, not trifecta. Escalate to `error` in CI; surface in a `scan`
  security column + the disclosure finding.
- **Totality → matcher-coverage (demote the pure version).** Full totality of an arbitrary
  hook script is undecidable. The shippable deterministic slice is **matcher-coverage**: a CC
  hook's `matcher` too-narrow/typo'd so it silently never fires on cases it should gate (the
  `hook-matcher` rule). Pure totality is a test-tier idea (`propertyHook` fuzz). It's the
  softest bet — lead with matcher-coverage, keep totality Tier-3.
- **Derivability = exact-structural-subset, not semantic.** To stay deterministic + FP-safe,
  do NOT detect "semantically redundant prose" (a model job — the fuzzy ctxlint version).
  Flag only an **exact reconstructable subset of a structured source**: a Commands section
  whose bullets ⊆ `package.json` scripts; a Structure listing whose paths ⊆ the real dir tree;
  a rule list ⊆ the enabled lint rules. Yields a true `% derivable` number per file (the
  leaderboard column), and "compute it with `fromScripts()`/`fromGlob()`" is the fix.

## See also

- `positioning-funnel.md` — the cross-axis moat analysis (mother-harness / test-framework /
  leaderboard / …) and the viral→moat→delivery funnel these bets serve.
- `shareable-presets.md` — the preset API design (the typed-preset bet #9 expanded).
- `instruction-file-linter-landscape.md` — the competitor map; why the cross-ref engine +
  testing (not rule count) is the moat.
- `lightweight-spec-authoring.md` — the spec/templates design; where "TS to the fullest"
  survives (preset library).
- `agent-supply-chain-security.md` — the prior security stance this sharpens into the
  capability-graph check.
- `harness-protocol-flow-moat.md` — the SEQUEL: the dynamic axes a capability SET can't see
  (ORDER/FLOW/REPLAY) framed as the **reliability RUNTIME** moat, grounded in the 2026-06
  failure corpus. This doc is the static-SET axis; that one is time/provenance/cardinality.
- `roadmap.md` — where the Tier-1/2 bets land.
