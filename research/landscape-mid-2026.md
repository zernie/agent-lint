---
status: active
topic: positioning
---

# Landscape Mid-2026: Deep Dives and Next Steps

Follow-up research to `competitive-landscape.md`, focused on items surfaced in mid-2026 that warrant deeper analysis: ContextCov (academic post-hoc extraction), Harness Engineering (positioning frame), AgentProof (workflow verification), AWS Bedrock AgentCore + Cedar (runtime policy as code), Compiled AI (paradigm validation). Closes with a unified comparison matrix and concrete next-step proposals.

---

## ContextCov — does post-hoc extraction actually work?

**Paper:** arxiv 2603.00822, March 2026. Evaluated on 723 repos, claims 46K+ executable checks extracted with 99.997% syntax validity.

**What it does.** Parses natural-language constraints out of existing AGENTS.md/CLAUDE.md files. For each extracted constraint, synthesizes an executable check from a fixed template library: static AST patterns, runtime shell shims, architectural validators. Output is a runnable script that asserts the constraint.

**Why the headline number is misleading.** "99.997% syntax validity" means the generated scripts parse — not that they catch real violations or avoid false positives. A `grep -q "TODO" .` check is 100% syntactically valid and 0% useful. The paper doesn't publish:

- False positive rate per check category
- True positive rate against seeded violations
- How many extracted checks were semantically wrong (constraint misunderstood) vs. just trivial

Without those, the 46K number is a count of generated artifacts, not a count of working enforcement.

**Why it validates vigiles anyway.** It proves the demand at scale. 723 real repos have natural-language constraints that should be executable. The reason ContextCov exists is that markdown is already deployed and nobody wants to rewrite it. vigiles solves the same problem from the other end: start from a typed spec, compile to markdown, never do post-hoc extraction at all. ContextCov is the workaround you need when you can't change the source — vigiles is changing the source.

**What we could learn from it.** The paper presumably has a taxonomy of constraint categories (assertions about files, commands, code patterns, etc.). If they published the taxonomy, it would be a free menu of rule patterns vigiles could ship as builders — `enforceFileExists()`, `enforceCommandSucceeds()`, etc. Worth reading the paper for the categories alone.

**Verdict.** Crazy idea executed at scale. The mechanical work is impressive; the semantic guarantee is weak. vigiles's compile-from-source approach is fundamentally better, but their taxonomy is worth mining.

---

## Harness Engineering — positioning language to adopt

Coined formally in early 2026, with framework writeups from OpenAI, Martin Fowler, and the LangChain team. Core formula: **Agent = Model + Harness**. Empirical: swapping the harness changes SWE-bench scores by up to 22 points — more than swapping the model.

Two enforcement categories named in the literature:

- **Probabilistic compliance** — prompts, system messages, "follow these rules." Compliance rate ~80% on good days.
- **Deterministic constraints** — linter blocks the PR, hook blocks the tool call, type checker rejects the call site. Compliance rate 100% by construction.

vigiles is unambiguously in the deterministic constraints category. The harness engineering frame is the language the market now uses to talk about exactly the thing vigiles does. Adopt it.

**Concrete:** README opening line could change from "vigiles compiles .spec.ts files to instruction files" to "vigiles is a deterministic-constraints layer for agent harnesses — compiles .spec.ts to instruction files with linter cross-references that the TS compiler can prove valid." Same content, language the market already understands.

---

## AgentProof — workflow verification, applicable to spec evolution

**Project:** github.com/NordicAgents/AgentProof, March 2026.

**What it does.** Static verification of agent workflow graphs. Extracts a unified graph from LangGraph, CrewAI, AutoGen, or Google ADK source. Runs six structural checks (cycles, unreachable nodes, missing terminal states, etc.) plus temporal safety policies compiled to a DFA. Sub-second verification up to 5K nodes. Found 27% of benchmark workflows have structural defects, 55% violate "human approval gate" policies.

**Why this is interesting for vigiles.** Different domain (workflow topology vs. instruction files) but the technique transfers. vigiles already has Merkle DAG infrastructure in `src/proofs.ts` for self-evolving specs. The **spec evolution history itself is a graph** — rules added, removed, downgraded, strengthened over time. Structural checks on that graph are missing today.

Examples of structural rules vigiles could add:

- **No rule depends on a deleted file.** Already partly covered by stale-ref detection, but evolution-graph version is stronger: detect "rule X was added after file Y was deleted."
- **Downgrade chain length cap.** Reject specs where the same rule was downgraded N times — likely the rule is wrong, not the enforcement.
- **Human-gate invariant.** Every `enforce → guidance` transition must be tied to a commit with a `BREAKING` or `chore(spec):` marker. Mechanical check, no human judgment needed.
- **No reintroduction of removed rules without justification.** If rule X was deleted in v2.0 and reappears in v2.3, require a commit message referencing the removal.

This is exactly the kind of thing the existing `proofs.ts` monotonicity lattice gestures at but doesn't fully enforce yet. AgentProof is proof-of-concept that DFA-compiled policies are sub-second to evaluate even at 5K nodes — way bigger than any plausible vigiles spec history.

**Proposal:** prototype `vigiles lint --structural`. Walk the Merkle DAG of spec history (or the rule snapshot file from idea 1 in `enforce-over-guidance.md`), apply structural checks, fail on violations. Reuse AgentProof's six structural checks as a starter set.

---

## AWS Bedrock AgentCore + Cedar — vigiles as a 7th-linter integration target

**Status:** GA March 2026. Amazon Bedrock AgentCore Policy uses Cedar policy language to intercept every tool call agents make. Sub-millisecond deterministic evaluation, no dynamic logic during evaluation by design (security guarantee).

Cedar policies look like:

```
permit (
  principal == Agent::"deploy-bot",
  action == Action::"shell_execute",
  resource
) when {
  resource.command in ["npm test", "npm run build"]
};
```

**Why this matters for vigiles.** vigiles cross-references 6 linters today. Cedar policy files in `.cedar/` or wherever the project stores them are exactly the same shape: a catalog of named rules with semantics, referenced from a spec. Adding Cedar as the **7th cross-referenced "linter"** is the natural play.

Mechanical:

```ts
"shell-command-allowlist": enforce(
  "cedar/shell-execute-allowlist",
  "Agents may only run npm test or npm build via shell.",
),
```

vigiles compile would:

1. Locate the project's Cedar policy files (`.cedar/*.cedar` or configured path).
2. Parse them (Cedar has a published grammar).
3. Verify a policy named `shell-execute-allowlist` exists and references the actions claimed.
4. Surface in compilation errors if the policy is missing or contradicts the spec.

`generate-types` would emit the Cedar policy IDs as a type union, same as ESLint rules today.

**Strategic angle.** If anyone deploys agents via Bedrock AgentCore, vigiles becomes the natural place to declare and verify their runtime policies. AWS owns the runtime; vigiles owns the compile-time guarantee that the runtime policies match what the spec promises. Cedar is also used outside Bedrock (Vectimus already exists), so the integration generalizes.

**Proposal:** add Cedar to `src/linters.ts` as the 7th provider. Same shape as the existing six — `checkCedarPolicy(policyId, basePath)` returns `LinterCheckResult`. Add policy ID extraction to `generate-types`. Estimated scope: small, since Cedar has a stable grammar and a Rust reference parser.

---

## Compiled AI — academic backing for the vigiles paradigm

**Paper:** arxiv 2604.05150, April 2026. Paradigm: LLMs generate executable code artifacts at compile time; the resulting workflows execute deterministically without further model invocation. Reports 96% task completion with **zero execution tokens** and 57× token reduction at scale.

The paper isn't about instruction files specifically — it's about the broader paradigm of moving LLM invocation from runtime to compile time. But it's the cleanest academic statement of exactly what vigiles does:

- Author writes `.spec.ts` (the LLM may help; the author edits).
- vigiles compiles once.
- Agent reads deterministic markdown forever after.
- Zero further LLM invocation needed to interpret the spec.

**What this changes for vigiles.** Mostly positioning, not implementation. The paper gives us:

- A citable academic source for the "compile once, execute deterministically" thesis. Useful in the README and in any conference talks or pitch decks.
- A token-reduction number (57×) to ground claims about cost. vigiles compiles a spec once per release; agents read it on every task. The compile-time amortization is real and now has a number attached.
- An argument against tools that re-invoke an LLM at every agent action to interpret the rules (ai-rulez's "AI-Powered Rule Enforcement" falls in this category). Compiled AI's paper effectively says: don't do this, compile the rules ahead of time.

**Proposal:** add a one-paragraph "Why compile?" section to the README citing the paper. Frame ai-rulez and similar runtime-LLM-interpreted rule tools as the "uncompiled AI" approach — works, but burns tokens and gives weaker guarantees. vigiles is the compiled-AI approach for instruction files.

---

## "Agents Need Control Flow" — independent statement of the vigiles thesis (2026)

**Source:** Brian Suh, [`bsuh.bearblog.dev/agents-need-control-flow/`](https://bsuh.bearblog.dev/agents-need-control-flow/) — a software-engineer manifesto, not a product.

**Thesis (verbatim):** _"Reliable agents tackling complex tasks need deterministic control flow encoded in software, not increasingly elaborate prompt chains."_ Prompts are _"non-deterministic, weakly specified, and difficult to verify"_; the fix is to move logic _"out of prose and into runtime"_ via _"deterministic scaffolds: explicit state transitions and validation checkpoints that treat the LLM as a component, not the system."_

**Why it's relevant.** This is vigiles's exact positioning arrived at from the outside — the **Agent = Model + Harness** frame and the **deterministic-constraints over probabilistic-compliance** split (see `CLAUDE.md`). His three failure modes for systems lacking _"deterministic orchestration AND aggressive error detection"_ — **"human babysitting, exhaustive post-run audits, or accepting outputs on faith"** — map 1:1 onto the pain points the 2026-06-21 research surfaced (the "verify the agent did what it claimed" white space) AND onto vigiles's answer: the verify layer + the test/eval layers are the "aggressive error detection," the typed railway/control-flow is the "deterministic scaffold."

**The double edge (record this — don't only cheer).** It's external **validation** of the frame, but it also **confirms the commoditization signal** from the same-day competitive double-check (riftmap = capability-diff, Mastra = typed workflow handoffs, promptfoo = deterministic contract asserts): "deterministic control flow for agents" is now a **named, spreading idea**, so the _thesis_ is no longer differentiating — others will build scaffolding. The article is a manifesto with **no implementation** ("doesn't detail specific technologies"), which is the opening, but the direction is crowding. Consistent with the spec-value-model conclusion: vigiles's edge is the **substrate** (the instruction-file harness compiled as a typed program) + the **sub-affordable measurement** identity, NOT ownership of the control-flow thesis itself.

**Verdict.** Cite it as third-party validation of the positioning (README/landing "why deterministic constraints" — alongside the Compiled-AI paper); do NOT read it as a moat. The moat is execution on the substrate + measurement, not the idea.

---

## Market-segmented competitive matrix (2026-06-21) — the corrected cut

The single most important competitive insight (a same-day correction of an earlier
market-conflation): **the "typed-spec capabilities are commoditizing" worry was wrong
because it mixed three different MARKETS.** Segment by who the tool is FOR, and vigiles's
actual competition shrinks to a handful of pure surface linters. Grounded by reading each
tool's own docs.

### Market A — App-building (NOT vigiles competitors)

You write code to ship an LLM product. Different audience; zero contact with
CLAUDE.md/skills/hooks. Listed only to stop conflating them with vigiles.

| Tool                                      | For                             | Lang  | License         |
| ----------------------------------------- | ------------------------------- | ----- | --------------- |
| Mastra                                    | build AI apps/agents in TS      | TS    | Apache-2.0 + ee |
| LangGraph / CrewAI / AutoGen / Google ADK | build agents                    | Py/JS | MIT/Apache      |
| Pydantic AI / Vercel AI SDK               | build agents                    | Py/TS | MIT/Apache      |
| promptfoo / DeepEval                      | eval YOUR app's prompts/outputs | TS/Py | MIT/Apache-2.0  |

### Market B — Infra / MCP-server security (adjacent, different substrate)

| Tool                                               | Substrate                        | Static/Runtime  | License        |
| -------------------------------------------------- | -------------------------------- | --------------- | -------------- |
| riftmap                                            | infra deps (Terraform/Helm/CI)   | static PR-diff  | closed SaaS    |
| AgentAuditKit                                      | 3rd-party MCP servers (rug-pull) | static CI-diff  | MIT            |
| PolicyLayer / Waxell / Straiker / Operant / Pillar | live MCP traffic                 | runtime gateway | closed/partial |

### Market C — Agentic-coding-harness verification (vigiles's ACTUAL market)

All confirmed **pure static surface linters** (their own docs) — none do cross-ref,
typed specs, test/eval, or capability-diff. Adoption (reviews pass, 2026-06-21): stars +
the mindshare tell. **No incumbent; near-zero mindshare** (none listed in
awesome-claude-code, 47k★; npm downloads are CI-inflated vanity — agnix is 28k/mo but its
Show HN got **1 point**).

| Tool                         | Surface lint  | Cross-ref (exists **+ enabled**) | Typed spec / compile | Test/eval       | Capability-diff | Multi-harness / LSP  | Stars / signal        | Lang  | License   |
| ---------------------------- | ------------- | -------------------------------- | -------------------- | --------------- | --------------- | -------------------- | --------------------- | ----- | --------- |
| **agnix** (agent-sh)         | ✅ ~414 rules | ❌                               | ❌                   | ❌              | ❌              | ✅ 7 harnesses + LSP | 296★ / 1 HN pt        | Rust  | OSS       |
| **claudelint** (114 rules)   | ✅            | ❌                               | ❌                   | ❌              | ❌              | CC-only              | 9★ / 13k npm (CI)     | TS    | MIT       |
| **AgentLint** (0xmariowu)    | ✅ 51 checks  | ❌                               | ❌                   | ◑ AI checks     | ❌              | CC/Codex/Cursor      | 41★                   | JS    | OSS       |
| **cclint** (×2)              | ✅            | ❌                               | ❌                   | ❌              | ❌              | CC-only              | 20★ / 6★              | TS    | MIT       |
| **SkillCheck**               | ✅ skills     | ❌                               | ❌                   | ◑               | ❌              | cross-tool           | 32★ / commercial      | shell | freemium  |
| **`claude plugin validate`** | ✅ manifest   | ❌                               | ❌                   | ❌              | ❌              | CC-only              | 1st-party (the floor) | —     | 1st-party |
| **vigiles**                  | ✅ ~20 rules  | ✅ **only one in-market**        | ✅ **only one**      | ✅ **only one** | ◑ prototyped    | ✅ CC+Codex          | **11★ (friends)**     | TS    | OSS       |

> **Rule-count is apples-to-oranges — do NOT read this as "agnix wins on lint."** agnix's
> ~414 and claudelint's 114 are MICRO-checks (one per structural assertion); vigiles ships
> ~20 SEMANTIC rules, several of which do something the others structurally can't —
> **cross-reference** the named rule against the real linter config, the named tool against
> the harness catalog, the named MCP tool against the declared servers. One vigiles
> `subagent-tool-contract` ≠ one agnix style-check. Read the CAPABILITY columns
> (cross-ref / typed / test-eval), not the count. And the star column is the real story:
> **vigiles is at 11 (friends); the whole category is pre-mindshare** — a land-grab, not a
> catch-up.

**Read of Market C (adoption-calibrated):**

1. **The field is WIDE OPEN — no incumbent, near-zero mindshare.** Biggest is agnix at
   296★ (1 HN point); the rest are 6–41★; none appear in awesome-claude-code (47k★). npm
   downloads (agnix 28k/mo, claudelint 13k/mo) are CI-inflated, not users. The only
   genuinely entrenched thing is Anthropic's `claude plugin validate` — but it's a shallow
   manifest validator (the floor, not depth). **Nobody has won this. The real battle is
   DISTRIBUTION/mindshare, not capability** — which matches the "adoption engine, not more
   moat depth" sequencing.
2. **vigiles is OUT-engineered on the two things it can't win on:** surface-lint breadth
   (agnix ~414 + claudelint 114 rules vs vigiles ~31) and multi-harness+LSP polish (agnix
   ships 7 harnesses + a full LSP). Do NOT try to out-rule-count agnix or match its LSP.
3. **vigiles uniquely owns, in-market, the three capability gaps NONE of them have:**
   **cross-referencing** (rule-exists-AND-enabled across 7 catalogs), **typed/compiled
   specs**, and **testing/eval** (does a skill fire, does a hook block). agnix and
   AgentLint crowd the _positioning words_ (multi-harness, "lint your agent harness") but
   not these capabilities. Lead with the capabilities, not the words.
4. **The single best wedge = cross-referencing** — unique in-market, the founding feature,
   and works on **plain markdown, no spec required** (zero adoption barrier). That's the
   "valid is not true" line: every competitor checks your config is well-FORMED; only
   vigiles checks the reference it names actually EXISTS and RESOLVES.

> **REFINEMENT (2026-06-21) — lead with HARNESS-NATIVE cross-check, demote the
> linter-catalog leg.** Cross-referencing's value is NOT uniform across reference types:
>
> - **HIGH value — harness-native references** (the moat): a subagent's **tool** exists
>   (typo / never-available), an **MCP `server#tool` resolves on the LIVE server** (the
>   `create_issue`→`issue_write` rename rot), a **hook event** is real (typo → silently
>   never fires), a **file/script path** still exists, a **delegate/skill target** isn't
>   dangling. These are agent-era-specific, current, and fail SILENTLY — nobody else
>   checks them. **Deepen here**, esp. **live MCP tool resolution of the real
>   `mcp__server__tool` contract refs** (engine exists in `src/core/mcp.ts`, today only
>   wired to the explicit `vigiles:mcp` mark).
> - **LOW value — the 7-linter-catalog integration** (ESLint/Ruff/Clippy/…): the
>   founding feature, but the WEAKEST leg in the agent era — the linter self-enforces
>   regardless of the prose mention (redundant), it's a code-quality concern bolted onto
>   a harness concern, it's the heaviest engineering for the least harness-specific
>   payoff, and "we enforce rule X" is a small slice of real CLAUDE.md content. Keep it
>   (free, dogfooded), but it is **supporting, not the headline** — do NOT prioritize
>   more catalogs (Cedar/Biome) over harness-native resolution. The moat one-liner
>   sharpens to: **"the references in your agent's config — tools, MCP servers, hooks,
>   files, sub-agents — are real and live, not silently broken."**

Risk = a polished in-market linter (agnix/claudelint) ADDING cross-ref, or an adjacent
player porting in — not present-day direct competition. Full corrected synthesis:
`typed-spec-moat.md` § "Competitive reality check".

**Sources:** mastra.ai; promptfoo.dev/docs/intro; claudelint.com; github.com/pdugan20/claudelint; github.com/carlrannaberg/cclint; github.com/felixgeelhaar/cclint; github.com/agent-sh/agnix; github.com/0xmariowu/AgentLint; getskillcheck.com; code.claude.com/docs/en/plugins; hesreallyhim/awesome-claude-code; riftmap.dev; github.com/marketplace/actions/agentauditkit-mcp-security-scan.

### The agnix signal — linting-without-eval may simply not pull a community

The single most strategically useful data point: **agnix is the most-built tool in the
category by a mile** (414 rules, Rust, 7 harnesses, a full LSP, releases ~daily) and it
got **1 point on Show HN** and sits at 296★ with no community footprint. Two hypotheses:

1. agnix is just bad at promotion (a distribution miss); or
2. **comprehensive linting-without-testing/evals isn't interesting to the community** —
   a 414-rule structural linter is a chore-tool nobody gets excited about.

If (2) is even partly true it is **strong evidence FOR the measurement pivot**: the lint
layer is table-stakes/boring (so out-rule-counting agnix is a trap), and the thing that
generates PULL is the **eval/measurement layer** — "does my skill actually FIRE / does my
harness actually WORK / is the hyped skill vaporware" (the caveman-debunk shape). vigiles
should treat linting as the free floor and lead marketing with measurement. This also
reframes the wedge: not "a better linter" but "the only one that **tests** your harness."

### Poach list — non-competitors (Markets A/B) with ideas worth lifting

Not competitors (different market), but their mechanics are worth stealing:

- **Zod-schema'd contracts** (Mastra / Pydantic AI / Vercel AI SDK all do typed tool I/O
  via Zod/Pydantic): vigiles's `result()` currently hand-parses + shape-validates the
  `vigiles:ok/err` block (`agent-result.ts`). A **Zod-based `result()`** would unify ONE
  schema into (a) the compile-time type, (b) the runtime validator (`assertAgentOk`), and
  (c) the JSON Schema `generate-schema` already emits — one source, three artifacts.
  Strong candidate; record as a feature idea. **Full poach→typed-CLAUDE.md→moat
  synthesis (web-verified 2026-06-22): [`typed-claude-md-poach.md`](typed-claude-md-poach.md)**
  — the whole-harness registry is unique to vigiles; cross-agent handoff checking is
  universally weak even in Pydantic/LangGraph/Mastra.
- **promptfoo's named deterministic assertions** (`is-json`, `is-valid-openai-tools-call`,
  json-schema): a menu to expand vigiles's `check` vocabulary with.
- **riftmap's distribution model** — "one read-only token → queryable graph + ship the
  OpenAPI so any agent can call it as a tool." vigiles results-as-an-MCP-tool is a GTM
  idea (an agent can ASK "is my harness verified?"). Also riftmap/SkillCheck/PolicyLayer
  prove a **business CAN be built on this** (closed SaaS / freemium / self-host tiers) —
  vigiles's open-core + measurement-data is a defensible base others can build on top of.

---

## Benchmark / leaderboard prior art (2026-06-21) — what exists for the A1 leaderboard to beat

Before building the public plugin leaderboard, a web sweep of who ALREADY benchmarks/ranks
Claude Code skills. The space splits three ways, and the reproducible-claim-gated slice is
still open:

1. **Subjective "best skills 2026" listicles — ABUNDANT (SEO content).** Composio,
   firecrawl, turbodocx, mejba, raxxo, scriptbyai, "11 tested / 4 worth keeping"
   (buildtolaunch). Curated opinion, no reproducible measurement. Saturated but low-signal.
2. **Install / adoption leaderboards — EXIST (popularity, not effectiveness).**
   `quemsah/awesome-claude-plugins` auto-collects plugin adoption metrics via n8n; published
   install counts (Frontend Design 829k, Superpowers 752k, Context7 349k as of 2026-06-01).
   Ranks by POPULARITY, says nothing about whether a claim holds.
3. **One-off measured benchmarks — a few, each ad-hoc / single-skill.** caveman (SATURATED,
   see FINDINGS); a **superpowers 12-session A/B** (6 with / 6 without → 9% cheaper, 14%
   fewer tokens, "better quality" — a REAL controlled study that VINDICATES superpowers, so
   the leaderboard won't be all debunks); MindStudio "5 skills cut 70%" (claim-PUSHING,
   uncritical — live hype to verify); browser MCP-vs-CLI token tests (~4×).

**The open slice vigiles's leaderboard owns:** none of the above is **reproducible +
re-runnable + multi-skill + claim-VS-measured + correctness-gated + head-to-head +
continuous + open-method** all at once. Install leaderboards rank by popularity; listicles
by vibes; the A/Bs are one-off single-skill. So position the leaderboard NOT as "ranking
plugins" (install boards exist) or "I tested N skills" (listicles exist) but on the
**claim-gap + reproducibility + correctness** axes — "the published % vs what re-runs, with
a correctness gate, head-to-head, on the same corpus." Honest framing: some claims HOLD
(superpowers' own A/B is credible) — the leaderboard's value is sorting the real from the
hyped, not blanket debunking. Sources: buildtolaunch.substack.com/p/best-claude-code-plugins-tested-review;
mindstudio.ai/blog/5-claude-code-skills-cut-token-costs-70-percent-benchmarked;
github.com/quemsah/awesome-claude-plugins; composio.dev/content/top-claude-code-plugins.

---

## Unified comparison matrix

Combining the existing tables in `competitive-landscape.md` with mid-2026 entrants. Rows are projects; columns are the dimensions that matter for positioning vigiles.

| Project                                  | Type               | Stage         | Determinism                      | Scope                    | Overlap with vigiles                                      |
| ---------------------------------------- | ------------------ | ------------- | -------------------------------- | ------------------------ | --------------------------------------------------------- |
| **vigiles**                              | Compiler           | Compile-time  | Deterministic                    | Instruction files        | (this project)                                            |
| ContextCov                               | Extractor          | Compile-time  | Hybrid (NLP→checks)              | Instruction files        | Same problem, post-hoc; vigiles solves it from the source |
| agents-lint                              | Validator          | Compile-time  | Deterministic                    | Instruction files        | Subset of vigiles `file()`/`cmd()` validation             |
| ctxlint                                  | Validator          | Compile-time  | Deterministic                    | Instruction files        | Stale refs + token bloat, post-hoc on markdown            |
| AgentLinter                              | Scorer             | Compile-time  | Hybrid (rules + heuristics)      | Instruction files        | Grading angle; complementary                              |
| cursor-doctor                            | Validator          | Compile-time  | Deterministic                    | Cursor `.mdc`            | Format-specific; sync tools bridge                        |
| claudelint                               | Validator          | Compile-time  | Deterministic                    | Full Claude ecosystem    | Broader scope (hooks/MCP/plugins); same level             |
| Ruler, rulesync, rule-porter, vibe-cli   | Sync               | Build-time    | Deterministic                    | Cross-agent distribution | Orthogonal — vigiles is source, they distribute           |
| ai-rulez                                 | Hybrid             | Build/runtime | **Probabilistic** ("AI-powered") | Cross-agent              | Weaker guarantee; positioning contrast                    |
| ai-rules-sync, anywhere-agents           | Sync               | Build-time    | Deterministic                    | Cross-agent              | Orthogonal                                                |
| block/ai-rules                           | Sync + policy      | Build-time    | Deterministic                    | Enterprise multi-agent   | Orthogonal; potential integration                         |
| Microsoft AGT                            | Runtime governance | Runtime       | Deterministic                    | Tool-call enforcement    | Adjacent layer; complementary                             |
| AWS Bedrock + Cedar                      | Runtime policy     | Runtime       | Deterministic                    | Tool-call enforcement    | **Cross-reference target** — see proposal above           |
| Vectimus                                 | Runtime policy     | Runtime       | Deterministic                    | Tool-call enforcement    | Cedar-based; same as Bedrock case                         |
| Agent RuleZ                              | Runtime policy     | Runtime       | Deterministic                    | Claude Code hooks        | Adjacent; could be `enforce()` target                     |
| AgentProof                               | Static verifier    | Compile-time  | Deterministic                    | Workflow graphs          | **Technique transfers** — see proposal above              |
| AgentVerify                              | Static verifier    | Compile-time  | Deterministic                    | Memory + tool calls      | Complementary layer                                       |
| AgentGuard                               | Runtime verifier   | Runtime       | Probabilistic (MDP)              | Agent I/O                | Runtime, framework-agnostic                               |
| GitHub Spec Kit                          | Workflow tool      | Authoring     | Deterministic                    | Feature specs            | Different level (what to build, not how agent behaves)    |
| gh-aw                                    | Workflow runtime   | Runtime       | Deterministic                    | CI automation            | Different domain                                          |
| ContextCov, Compiled AI, Blueprint First | Academic           | —             | —                                | Paradigm validation      | Citation sources                                          |

Five clear non-overlapping categories emerge:

1. **Compile-time spec compilers** — vigiles, alone.
2. **Compile-time markdown validators** — agents-lint, ctxlint, AgentLinter, cursor-doctor, claudelint, cclint variants. Operate post-hoc on the artifact vigiles produces. Some are subsumed; most are complementary.
3. **Sync tools** — Ruler family. Orthogonal; vigiles is the source, they are the pipes.
4. **Runtime policy engines** — Cedar/Bedrock, Vectimus, AGT, Agent RuleZ. Different layer; vigiles can cross-reference into them.
5. **Formal verifiers** — AgentProof, AgentVerify, AgentGuard. Different scope (workflow graphs, not instruction files). Techniques transferable.

---

## Concrete next-step proposals

Ranked by leverage (impact / effort). Pick from the top.

### A. Position as harness engineering deterministic layer

- Effort: trivial (README + docs edits).
- Impact: high — gives vigiles a recognized market frame.
- Adopt "harness engineering" language in README, agent-workflows.md, and the README opener.
- Cite Compiled AI (arxiv 2604.05150) and the harness engineering frameworks as source material.

### B. Add Cedar as the 7th cross-referenced linter

- Effort: small (one provider in `src/linters.ts`, type emission in `generate-types`).
- Impact: high — opens the AWS Bedrock AgentCore deployment surface.
- Concrete: `enforce("cedar/policy-name", "...")` verifies the policy exists in the project's Cedar files. Same shape as existing 6.
- Also covers Vectimus (Cedar-based) and any future Cedar-using runtime by accident.

### C. Prototype `vigiles lint --structural` over spec evolution

- Effort: medium — reuses existing `proofs.ts` Merkle DAG; new check pass.
- Impact: medium — catches the "rule keeps regressing" pattern AgentProof found in 27% of workflows.
- Borrow AgentProof's six structural checks as starter set.
- Composes with idea 1 from `enforce-over-guidance.md` (snapshot-gated downgrades).

### D. Read the ContextCov paper for its constraint taxonomy

- Effort: small (reading + notes).
- Impact: medium — likely yields 3–5 new builder functions to ship.
- The taxonomy is the value; the extraction mechanism is what vigiles avoids.

### E. Update `generate-types` for ESLint v10 / Ruff 0.15 / Stylelint v17

- Effort: small (mechanical).
- Impact: low–medium (existing users benefit; no new use cases unlocked).
- Required maintenance regardless; pair with B for one combined release.

### F. Counter-position vs. ai-rulez's "AI-powered" enforcement

- Effort: trivial (positioning).
- Impact: low–medium (defensive).
- Add a short comparison row in README: deterministic (vigiles) vs. probabilistic ("AI-powered"). Reference Compiled AI paper's token-reduction numbers.

---

## Recommendation

Start with **A + B together**: rebrand under harness engineering language and ship Cedar as the 7th linter in the same release. A is free positioning work; B is concrete capability that opens a real deployment surface (Bedrock). C and D are the next quarter's work.

---

## Decisions log (mid-2026, post-review)

- **A** — shipped. Harness engineering positioning in README and spec.
- **B** — shipped. Cedar as 7th cross-referenced catalog, with tests.
- **E** — shipped. ESLint v9+/v10 via-string update; no functional changes needed.
- **F** — shipped. Counter-positioning vs "AI-Powered Rule Enforcement" in README and `competitive-landscape.md`.
- **C** (`vigiles lint --structural`) — **parked.** Useful idea, AgentProof-style structural checks over spec evolution. Honest verdict: regression-of-rules detection is not vigiles's core mission. Save as a known-good direction; revisit if a user pulls for it.
- **Idea 1** from `enforce-over-guidance.md` (snapshot-gated downgrades) — **parked.** Same reasoning as C. Documents the silent `enforce → guidance` regression class clearly, but isn't core to "compile typed specs to instruction files." Keep design ready; don't build until demand surfaces.
- **Domain preset library** (from `sync-landscape-analysis.md`) — **dropped.** Duplicates what linter shared-configs already do (`@typescript-eslint/strict`, `eslint-config-airbnb`, ruff selects, clippy::pedantic). Bundling them as vigiles presets creates a maintenance treadmill across N upstreams. Maybe one or two `examples/*.spec.ts` showing the _shape_ of a spec, treated as documentation not as a feature.
- **`block()` rule type** (from `sync-landscape-analysis.md`) — **dropped.** Settings.json is already structured config, not markdown. JSON Schema in VSCode covers what `block()` would add for the single-agent case. Reconsider only if real multi-agent setups appear or AGENTS.md proposal #105 (structured tool permissions) ships.
- **Fact-drift detector for markdown** (regex sweep of `**/*.md` for "N linter" / "N catalog" patterns vs computed `BuiltinLinter.length`) — **dropped.** Tempted to ship it after hitting one stale-copy sweep in this session, but the mechanism is fuzzy regex over English prose — the same pattern we rejected for keyword-overlap upgrade detection and for `block()`. Hit drift once: not a pattern, a one-off. Manual `grep`+`sed` took 5 minutes. Project rule: "Three similar lines is better than a premature abstraction." Revisit only if fact-drift recurs 2–3 more times. The real takeaway is dogfooding as practice: run `vigiles lint` (and the new orphan check) on the repo before each release, fix what it flags. No new code, use what's there.
- **Atomicity rules** (#5 `one-claim-per-rule` and #9 `sections-over-free-prose` from the original 10-proposal pass) — **parked.** Both express the same atomicity principle applied to different fields (rule `why` strings vs. section prose). #9 is already half-mechanical via `maxSectionLines` config; #5 has no equivalent knob yet. Useful idea, low priority — revisit alongside any major spec.ts type-system pass.
- **D** (mine ContextCov paper for constraint taxonomy) — **read, nothing to ship.** Paper confirmed real (arxiv 2603.00822, Reshabh K Sharma, Feb 2026). Taxonomy is four categories: Process constraints (build commands, package managers — enforced via shell-shim/PATH manipulation), Source constraints (style/naming/API patterns — Tree-sitter AST queries), Architectural-deterministic (module deps/layer boundaries — NetworkX over import graphs), Architectural-semantic (intent-dependent — LLM-as-judge). Honest take on their evaluation: weaker than the headlines. "99.997% syntax validity" measures whether 34,373/34,374 generated scripts parsed, not whether they catch real violations. No precision, recall, or false-positive numbers. Only 24% of generated checks ever fired on any of the 723 repos — ambiguous whether rules are rarely violated or checks are wrong.

  Mapping each category to candidate vigiles builders:

  | Category           | Candidate builder                               | Verdict                                                                                                                                                                                   |
  | ------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Process            | `intercept()` / `shim()` for command perception | **Skip.** Re-skin of the `block()` we just dropped. Settings.json PreToolUse hooks already cover it for Claude Code; AGENTS.md proposal #105 will cover it for the standard. Not our job. |
  | Source             | `astQuery(language, pattern)`                   | **Skip.** ast-grep already does this. We already say "use ast-grep" in `dont-reimplement-linters`. Wrapper only adds type-safety.                                                         |
  | Architectural-det. | `boundary(from, to, allowed)`                   | **Skip.** Dependency Cruiser and Steiger already do this. Same "not our job" rule that killed the domain preset library.                                                                  |
  | Architectural-sem. | LLM-as-judge                                    | **Skip categorically.** Breaks the determinism moat. Exactly the pattern vigiles counter-positions against.                                                                               |

  Net: zero actionable builders for vigiles. Useful side-finding: their Process / Source / Architectural-deterministic / Architectural-semantic split is a clean mental model agents could use when authoring specs. Worth one paragraph in `docs/spec-format.md` as a "thinking about your rules" guide — that's documentation, not code.
