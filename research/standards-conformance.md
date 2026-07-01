---
status: active
topic: positioning
---

# Cross-tool standards conformance: should vigiles become the neutral verification layer?

> Status: research (2026-06-13). Adjacent to [sync-landscape-analysis](sync-landscape-analysis.md),
> [reference-verification-limits](reference-verification-limits.md), and
> [distribution-strategy](distribution-strategy.md). Does NOT re-cover the rule-_sync_ tool
> comparison (rulesync/Ruler/rule-porter/vibe-cli — see sync-landscape), the deterministic-vs-judgment
> boundary or the doc-format identity-vs-link discussion (see reference-verification-limits), or the
> adoption-funnel diagnosis (see distribution-strategy). Covers: the 2026 standardization of agent
> config formats/protocols and whether vigiles should reposition as the neutral, tool-agnostic
> **conformance + reference-verification** layer riding that wave.

## TL;DR

The agent-config world standardized hard in late 2025 / early 2026. **AGENTS.md** is now Linux-Foundation-stewarded
(Agentic AI Foundation), read natively by 20+ tools, 60k+ repos. **SKILL.md** became an open standard in
Dec 2025 and was adopted by ~32 tools within months. **MCP** has a community registry and a real
conformance suite (a SEP can't reach Final without a conformance scenario). **ACP** (Agent Client Protocol)
gives editor↔agent a registry too. The "five near-identical files" era is ending; the format wars are over.

So the obvious move — "be the neutral validator for the new standards" — is **already contested**. At least
four agent-config linters shipped in 2026: **agnix** (423 structural rules across 8 tools), **agents-lint**
(path/script/dependency staleness), **AgentLinter** (33 harness-layer checks), **AgentLint**. The generic
"lint your AGENTS.md" niche is taken.

But none of them do what vigiles does. agnix is **structural/schema only** — it does NOT check whether a cited
linter rule exists and is _enabled_, nor resolve paths/scripts/symbols/MCP-tools against real sources.
agents-lint checks paths + npm scripts (overlap) but has **no cross-linter-catalog rule resolution**. Nobody
runs `eslint --print-config` to prove `@typescript-eslint/no-floating-promises` is actually on, across 7
catalogs, for an instruction file. And nobody pairs reference verification with **harness testing** (Pillar 2).

**Recommendation: extend, don't pivot.** Keep the Claude-Code-deep harness pillar as-is. Make Pillar 1
(reference verification) **format-neutral** — accept AGENTS.md / SKILL.md / MCP configs as first-class input
artifacts, not just CLAUDE.md — because the standardization wave gives free distribution and the verification
engine is already format-agnostic underneath. Lead the wedge with the one thing a JSON-schema validator
structurally cannot do: **semantic cross-referencing against live tooling** ("exists AND enabled," "this MCP
tool is really exported," "this script is in package.json"). Do not chase generic-validator breadth — that's
the focus-diluting trap, and agnix already owns it.

## Landscape 2026

**AGENTS.md is the de-facto base layer.** Plain Markdown, no required fields, no frontmatter (v1.1 _proposes_
optional `description`/`tags`), no official schema, no official validator. Stewarded by the Agentic AI
Foundation under the Linux Foundation; original backers OpenAI, Amp, Google (Jules), Cursor, Factory. Native
in Codex, Cursor, Copilot coding agent, Gemini CLI, Windsurf, Aider, Zed, Factory, Jules, Devin, Amp, Junie,
Warp, Kilo, RooCode, and more. ~60k repos. **The spec's deliberate minimalism is the opening**: "just
Markdown, use any headings" means there is no native notion of whether the things it _names_ are real.

**SKILL.md is the portable skill format.** Anthropic published the Agent Skills spec 2025-12-18; within 48h
Microsoft (VS Code) and OpenAI (ChatGPT + Codex CLI) integrated it; by March 2026 ~32 tools read the same
`SKILL.md` + directory layout (Gemini CLI, Junie, Kiro, Goose, Cline, Windsurf, OpenCode…). YAML frontmatter
with required `name` + `description`, optional `version`/`author`/`tags`/`agents`. There ARE competing
"open standard" sites (agensi.io, agentskills.io, agentskills.my) and a `skills-ref` validation library —
i.e. frontmatter-shape validators already exist. None verify the **body's** references.

**MCP is infrastructure, with conformance built in.** Registry (API frozen v0.1, Oct 2025); 2026 spec
(2026-07-28) adds a stateless core, MCP Apps (UI), Tasks (long-running), tighter OAuth/OIDC. Crucially:
a [conformance suite](https://github.com/modelcontextprotocol/conformance) gates the spec process
(SEP-2484 — no Final without a conformance scenario; it scores the SDK tier system). Proposed **Server Cards**
expose capabilities at `.well-known` URLs. So MCP _server_ conformance is owned by the project. What's NOT
owned: **does the MCP tool your SKILL.md/AGENTS.md cites actually exist on the server you point at** (the
"`create_issue` → `issue_write` rename silently broke my skill" failure — already vigiles's
`` `vigiles:mcp server#tool` `` wedge).

**ACP standardizes the editor↔agent socket.** JSON-RPC over stdio (LSP-for-agents), Zed-driven, now with a
[registry](https://zed.dev/blog/acp-registry). Adjacent to vigiles, not its turf — but it confirms the
direction: every layer of the agent stack is getting a registry + a conformance story in 2026.

**The neutral-validator niche is contested but shallow.** [agnix](https://github.com/agent-sh/agnix):
423 structural/schema rules across Claude Code/Kiro/Skills/Cursor/AGENTS.md/MCP/Copilot/Cline + IDE plugins +
autofixes — but verifies _shape_, not whether referenced rules/paths/scripts/symbols/MCP-tools are real.
[agents-lint](https://github.com/giacomo/agents-lint): filesystem paths + npm scripts + deprecated-dep +
framework-staleness + cross-file consistency — overlaps vigiles on paths/scripts, but no cross-linter rule
resolution and no harness testing. AgentLinter: 33 "harness-layer" checks incl. prompt-injection / API-key
exposure / an MCP validator. The field is real, funded by the standardization wave, and **moving fast**.

## The gap / whitespace

Two verification capabilities are structurally absent from every tool above, and both are vigiles's existing
core:

1. **Semantic cross-referencing against live tooling.** A JSON-schema/structural validator can prove
   `eslint/no-console` is _well-formed_; it cannot prove it _exists and is enabled_ in this repo's resolved
   ESLint config — that requires running the linter's own config resolution across 7 catalogs (ESLint,
   Stylelint, Ruff, Clippy, Pylint, RuboCop, Cedar). agnix explicitly does not; agents-lint does paths/scripts
   but not rules. **This is unduplicated.** It's the difference between "your YAML is valid" and "your YAML is
   _true_."

2. **Harness conformance (Pillar 2).** Nobody tests the assembled machine — that the hooks/skills/settings an
   instruction file declares actually _fire_ — across tiers (runHook / runHarnessTest / runEval). The 2026
   linters check files at rest; none execute the harness. This has no standards competitor at all.

The whitespace, stated as the ownership question: **"Is your AGENTS.md / SKILL.md / MCP config valid AND are
its references _real_ AND does the harness it declares actually work — across every tool?"** Today the first
clause is owned (agnix et al.); the second and third are not.

## Relation to vigiles's two pillars

**Pillar 1 (reference verification) is already format-neutral underneath; only the front door is
CLAUDE-shaped.** The engines — `checkLinterRule` across catalogs (`src/linters.ts`), `existsSync` paths,
`package.json` scripts, symbol extraction (`src/symbols.ts`), MCP tool resolution — don't care which file
named the reference. The inline (`src/inline.ts`) and frontmatter (`src/frontmatter.ts`) parsers already read
arbitrary markdown. Accepting AGENTS.md is nearly free (it _is_ a target already in `spec.ts`); accepting
SKILL.md frontmatter + body refs is small; verifying MCP-config-cited tools extends the existing
`` `vigiles:mcp` `` mark. **The standardization wave means one verifier now covers many tools' files** — the
neutrality is a distribution multiplier, not a rewrite.

**Pillar 2 (harness testing) is the moat that no standard or competitor touches**, and it's deliberately deep
on Claude Code because that's where the harness primitives (hooks, PreToolUse rails, skills, subagents) are
richest and testable today. **Do not dilute this by going broad.** Its value is depth; ACP/AGENTS.md don't yet
have a comparable assembled-machine to test. Keep it Claude-Code-anchored; let format-neutrality live in
Pillar 1.

## Bold ideas (ranked: improvement → new direction → pivot)

### 1. [improvement] First-class AGENTS.md + SKILL.md verification as input artifacts

- **Bet:** The cheapest ride on the biggest wave. AGENTS.md (60k repos) and SKILL.md (32 tools) are where the
  audience already is; vigiles's engines work unchanged. Verifying a SKILL.md body's refs is something
  `skills-ref`/agnix structurally don't do.
- **Risk:** Low. Mostly a parser + docs + positioning change. Risk is _perceived_ scope creep if marketed as
  "now a generic AGENTS.md linter" — must stay framed as _reference verification_, not generic lint.
- **Smallest first step:** Make `vigiles lint` accept a hand-written `AGENTS.md` / `SKILL.md` and verify its
  backticked + marked refs (reusing inline/frontmatter parsers), emitting the same exists-AND-enabled report.
  One worked example: scan a popular OSS repo's real AGENTS.md, publish the findings (the E1 lever from
  distribution-strategy, now retargeted at the larger AGENTS.md corpus).

### 2. [improvement] Lead the wedge: "valid is not true" — counter-position vs the structural linters

- **Bet:** agnix/agents-lint validate shape; vigiles validates truth-against-live-tooling. A one-paragraph
  positioning + a side-by-side demo ("agnix says your config is well-formed; vigiles says
  `@typescript-eslint/strict` it cites was removed from your eslint.config.js three commits ago") converts the
  crowded field into a clarifying contrast, not a me-too.
- **Risk:** Competitors add config-resolution later (agents-lint already does paths/scripts — rules are the
  natural next step). The 7-catalog engine is the defensible part; a generic linter won't reimplement
  `eslint --print-config` × 7 cheaply, but it's not impossible. Window, not moat.
- **Smallest first step:** A comparison row in `docs/comparison.md` + README: structural validators vs
  reference verification, with the one example a schema validator provably cannot produce.

### 3. [new-direction] MCP-reference conformance as a standalone, standards-shaped wedge

- **Bet:** MCP owns _server_ conformance but nobody owns "does the tool your instruction file _cites_ still
  exist on the server you point at." With the registry + Server Cards (`.well-known`) landing in the 2026 spec,
  vigiles can resolve a cited `server#tool` against the live server (already prototyped via
  `` `vigiles:mcp` ``) OR against a registry/Server-Card without even starting the server. This is a sharp,
  current, MCP-ecosystem-shaped pain (the `issue_write` rename) and rides MCP's own momentum.
- **Risk:** Depends on registry/Server-Card uptake; live-server resolution needs the server runnable in CI.
  Medium. Could over-index on an ecosystem detail that shifts.
- **Smallest first step:** Teach the MCP check to read a Server Card's `.well-known` tool list as a no-launch
  fallback when the server isn't runnable; ship it as the headline of the AGENTS.md/SKILL.md scan above.

### 4. [pivot — NOT recommended] Become the generic cross-tool agent-config linter (the agnix lane)

- **Bet:** Own "lint every agent file across every tool" — 400+ structural rules, IDE plugins, autofixes.
- **Risk:** **This is the focus-diluting trap.** agnix already shipped 423 rules + IDE plugins; agents-lint
  - AgentLinter + AgentLint crowd it further. Competing on rule-count and tool-coverage breadth means
    abandoning both differentiators (live cross-referencing, harness testing) for a commodity in which vigiles
    is late and outgunned. It also drags vigiles back toward the sync-territory positioning it explicitly
    rejected (see sync-landscape-analysis). **Listed for completeness; do not do this.**
- **Smallest first step:** none — record the decision _not_ to.

## Honest case against extending at all (stay narrow, Claude-Code-deep)

- **Reach isn't the only bottleneck.** distribution-strategy argues the funnel breaks at Stage 1–3 even for
  CLAUDE.md. Adding AGENTS.md/SKILL.md widens the _addressable_ slice but doesn't fix resolution friction;
  more breadth on a tool nobody finds is still nobody finding it. Format-neutrality only pays off _after_ the
  scan/demo distribution moves land.
- **The crowded field is a signal, not just an opening.** Four linters in 2026 means the obvious framing
  ("validate your agent config") is saturated; arriving as #5 — even with a better engine — fights for
  attention the deep harness pillar doesn't have to.
- **Depth is the actual moat.** Pillar 2 (harness testing, no undecidability ceiling) is genuinely
  uncontested. Every hour spent broadening Pillar 1's format surface is an hour not spent compounding the one
  thing nobody else has. A focused tool that's the _best_ at testing a Claude Code harness may beat a broad
  tool that's _fine_ at validating everyone's config.
- **Standards move.** v1.1 frontmatter, MCP 2026-07-28, ACP registry — betting Pillar 1's surface on
  fast-moving specs incurs the exact maintenance burden vigiles avoided by refusing to be a sync tool.

The rebuttal: idea #1 is _nearly free_ because the engine is already format-agnostic, and #2 is pure
positioning. The case-against bites only against #4 (the generic-linter pivot) and against _front-loading_
breadth before distribution. So: extend cheaply (#1, #2), ride MCP opportunistically (#3), and refuse the
pivot (#4). Keep the harness pillar deep and Claude-Code-anchored.

## See also

- [sync-landscape-analysis](sync-landscape-analysis.md) — the rule-_sync_ tool comparison (Ruler et al.) and
  the compose-don't-absorb stance this doc inherits.
- [reference-verification-limits](reference-verification-limits.md) — the deterministic-vs-judgment boundary
  and why plain markdown (AGENTS.md/SKILL.md included) can't structurally self-fix references.
- [distribution-strategy](distribution-strategy.md) — the funnel diagnosis; the AGENTS.md corpus is the bigger
  target for the E1 "scan popular repos, publish findings" lever.
- [competitive-landscape](competitive-landscape.md) — the broader tool field.
- [harness-testing](harness-testing.md) — Pillar 2, the uncontested moat this doc says to keep deep.

### Sources (2026 state)

- [agents.md](https://agents.md/) · [AGENTS.md guide 2026](https://codersera.com/blog/agents-md-complete-guide-2026/)
- [SKILL.md open standard](https://www.agensi.io/learn/agent-skills-open-standard) ·
  [Agent Skills spec](https://agentskills.io/specification)
- [MCP conformance suite](https://github.com/modelcontextprotocol/conformance) ·
  [MCP registry](https://github.com/modelcontextprotocol/registry) ·
  [MCP 2026-07-28 RC](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/)
- [ACP registry](https://zed.dev/blog/acp-registry) · [Zed ACP](https://zed.dev/acp)
- [agnix](https://github.com/agent-sh/agnix) · [agents-lint](https://github.com/giacomo/agents-lint)
