---
status: active
topic: positioning
---

# Instruction-file linter landscape (mid-2026) — the crowded category and the real moat

> Status: competitive synthesis (2026-06-19). What the 2025–2026 wave of dedicated
> CLAUDE.md / AGENTS.md / SKILL.md linters actually check, where vigiles still has a
> defensible edge, and where it is now at parity or commoditized. Companion to
> `reference-verification-limits.md` (the conceptual boundary — its "Group C is the
> unfilled niche" claim is corrected here) and `ai-native-linting.md` (the AI-reviewer
> wave). Sourced from a wide multi-tool sweep; tool facts are point-in-time and move fast.

## The two relationships a tool can have with an instruction file

Every tool falls into one of two camps — the sharp cut that frames the whole space:

- **(A) USE as prompt** — read CLAUDE.md/AGENTS.md as trusted context to steer
  behaviour. The file is an _input signal_, never checked. Every mainstream AI reviewer
  does this: **CodeRabbit** ("automatically reads your `claude.md`"), **Greptile**
  ("automatically index existing rule files like Claude.md, AGENTS.md"), and Anthropic's
  own **Code Review** ("tune what Claude flags by adding a `CLAUDE.md`") all _read_ the
  file; none verifies that its claims are true. A CLAUDE.md naming a fictional rule is
  silently used as guidance.
- **(B) VALIDATE the contents** — treat the file as an _artifact under verification_:
  do its references resolve against the real repo/toolchain? This is vigiles's frame —
  and, since ~2025, a dozen other linters' frame too.

vigiles is a (B) tool. The 2025–2026 surprise is that **(B) is now a crowded category**,
not the empty niche the earlier boundary doc assumed.

## The crowded category — deterministic instruction-file linters (mid-2026)

| Tool                                                  | ~Stars           | Surface / what it checks                                                                                                                                                                                                       | Catalog x-ref? |
| ----------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| **agnix** (agent-sh)                                  | ~293             | The incumbent: Rust, **LSP** (VS Code/JetBrains/Neovim/Zed), **425 rules** across 11 harnesses, auto-fix, GH Action. Structural/schema + script/import existence. Endorsed in `anthropics/skills#354` as "the missing linter." | No             |
| **skill-validator** (agent-ecosystem)                 | ~173             | SKILL.md spec conformance + optional LLM quality scoring (Go).                                                                                                                                                                 | No             |
| **AgentLinter** (seojoonkim) / **Codacy AgentLinter** | ~67 / commercial | 8-dimension scoring, secrets, cross-file contradictions. Codacy's variant is **on-by-default for new repos**.                                                                                                                  | No             |
| **AgentLint** (0xmariowu)                             | ~41              | "The linter for your agent harness." 51 deterministic checks; hook-event typo via a **hardcoded list**.                                                                                                                        | No             |
| **cclint** (carlrannaberg / felixgeelhaar)            | ~19 / ~6         | CC config + CLAUDE.md structure, `@path` imports, tool names vs a **hardcoded `KNOWN_CLAUDE_TOOLS` set**, hook events vs a **hardcoded 9**.                                                                                    | No             |
| **claudelint** (pdugan20)                             | ~9               | 114 rules: size/imports/circularity, hook event names, MCP transport, plugin manifest.                                                                                                                                         | No             |
| **ctxlint** (two unrelated repos)                     | —                | File paths + npm scripts vs disk/`package.json`; staleness vs git; token budget. `no-style-guide` is a **prose heuristic**, not rule-ID resolution.                                                                            | No             |
| **agents-lint** (giacomo)                             | ~8               | Paths + npm scripts + deprecated packages + framework staleness. The strongest path/script cross-referencer.                                                                                                                   | No             |
| **AgentEval** (Metzler)                               | ~4               | Lint **+ harvest/run/compare** — measures an instruction-file change's _behavioural_ impact. The only one gesturing at an eval layer.                                                                                          | No             |
| **SkillCheck**                                        | —                | SKILL.md quality + OWASP Agentic; $79 Pro adds LLM judgment.                                                                                                                                                                   | No             |

All are deterministic at the core (a few add optional LLM scoring). The category is real,
active, and growing — `agnix` alone ships an LSP, four IDE integrations, and weekly
releases.

## Capability matrix (capability × tool)

Legend: ✓ full · ~ shallow/partial (e.g. a hardcoded list, presence-only) · ✗ none.
Columns: **vig**=vigiles, **agnx**=agnix, **AgL**=AgentLint, **cll**=claudelint,
**ccl**=cclint, **ctx**=ctxlint/agents-lint, **AgE**=AgentEval, **rev**=CodeRabbit/Greptile.

| Capability                                          | vig | agnx | AgL | cll | ccl | ctx | AgE | rev |
| --------------------------------------------------- | --- | ---- | --- | --- | --- | --- | --- | --- |
| Structure / frontmatter schema                      | ✓   | ✓    | ✓   | ✓   | ✓   | ✓   | ✓   | ✗   |
| Secrets / security scan                             | ~   | ✓    | ✓   | ✓   | ~   | ✓   | ~   | ✓   |
| Prose quality (vague language)                      | ✗   | ✓    | ✓   | ~   | ✓   | ✓   | ✓   | ✗   |
| File-path exists                                    | ✓   | ✓    | ✓   | ~   | ~   | ✓   | ✓   | ✗   |
| npm-script exists (package.json)                    | ✓   | ✗    | ~   | ✗   | ✗   | ✓   | ✗   | ✗   |
| **Linter-rule catalog (exists + enabled, 7 APIs)**  | ✓   | ✗    | ✗   | ✗   | ✗   | ✗   | ✗   | ✗   |
| **Subagent tool-contract (catalog + did-you-mean)** | ✓   | ✗    | ✗   | ✗   | ~   | ✗   | ✗   | ✗   |
| **MCP tool → declared-server resolution**           | ✓   | ✗    | ✗   | ~   | ✗   | ✗   | ✗   | ✗   |
| **Hook-event typo (catalog, framework-aware)**      | ✓   | ✗    | ~   | ~   | ~   | ✗   | ✗   | ✗   |
| **Cross-lang symbol refs / description-overlap**    | ✓   | ✗    | ✗   | ✗   | ✗   | ✗   | ✗   | ✗   |
| **FP-calibration vs real plugins**                  | ✓   | ✗    | ✗   | ✗   | ✗   | ✗   | ✗   | ✗   |
| Auto-fix                                            | ~   | ✓    | ✓   | ✓   | ✓   | ✓   | ✗   | ✓   |
| LSP / IDE integration                               | ✗   | ✓    | ✗   | ✗   | ~   | ✗   | ✗   | ~   |
| Templates / scaffolding                             | ✓   | ✗    | ~   | ~   | ✗   | ~   | ✗   | ✗   |
| **Cross-harness DEPTH** (compile + test + x-ref)    | ✓   | ✗    | ✗   | ✗   | ✗   | ✗   | ✗   | ✗   |
| Cross-harness BREADTH (formats covered)             | ~   | ✓    | ✓   | ✗   | ✗   | ✓   | ✓   | ~   |
| Ease of adoption (agent-run init, md on-ramps)      | ✓   | ~    | ~   | ~   | ~   | ~   | ~   | ✓   |
| **Harness TESTING (hooks fire / skill trigger)**    | ✓   | ✗    | ✗   | ✗   | ✗   | ✗   | ~   | ✗   |

The bold rows are where vigiles is alone or near-alone. Note the two cross-harness rows are
different bets: **agnix wins breadth** (11 formats, structural rules per format); **vigiles
wins depth** (the only tool that compiles, tests, AND cross-references per harness via
adapters — but on 2 harnesses today). Don't claim breadth; claim depth.

## Do their rules make sense, or is most of it noise?

Rule **count is a vanity metric**. The axis that matters is **signal per rule**: does a
rule catch a _silent failure_ (something that breaks the agent and nothing tells you), or
is it a style/opinion nitpick? The field skews hard to the second, because style rules are
cheap to write by the hundred.

- **High-signal (catches a silent failure):** hook script missing, hook-event typo (the
  hook never fires), circular `@import` (infinite loop), MCP server can't start, a
  never-available/typo'd tool silently dropped, a rule named but not enabled. The
  "valid is not true" class — the bug doesn't surface until the agent quietly does the
  wrong thing.
- **Noise / vanity:** kebab-case naming, file-size/line caps, "vague language" / "generic
  instruction" detection (agnix flags `Be helpful and accurate` as a finding),
  emphasis-density, token-budget heuristics, and 0–100 "quality scores" across subjective
  dimensions (AgentLint's findability/clarity, AgentLinter's 8 weighted dims). Opinionated,
  fuzzy, and the first thing a team mutes.

Per tool: **agnix's 425** and **claudelint's 114** have a real high-signal _core_ (circular
import, hook-script existence, MCP transport) that **overlaps vigiles**, wrapped in a long
structural/style tail padding the count across 11 harnesses. **AgentLint / AgentLinter** are
the most noise-heavy — their product _is_ the subjective 0–100 score. **cclint**'s
`karpathy` rules are explicitly opinion. None of the noisy tail catches a silent failure; it
catches taste.

So a big rule count signals **breadth of opinion, not depth of verification**. vigiles's
posture is the inverse — **a small set of rules each tied to a silent-failure class,
FP-calibrated against real plugins so it doesn't cry wolf** (the vendored-plugin FP-guard +
true-positive tests). That is itself an _adoption_ argument: a noisy linter gets disabled
within a week; a high-signal one that only speaks when something is actually broken stays
wired into CI. **Fewer-but-true beats 425-but-mostly-taste.**

## Commoditized vs. still-uncontested

Three buckets, and only the third is a durable edge:

- **Table stakes** (10+ tools): structure, required sections, frontmatter schema,
  secrets, vague-prose, file-size/token budget, cross-file contradictions.
- **Commoditized in 2026** (agents-lint, ctxlint, agnix): **file-path existence** and
  **npm-script existence**. vigiles's `file()` / `cmd()` are now at _parity_ here, no
  longer ahead — the field caught up.
- **Still uncontested** — the only durable linting edge:
  1. **Catalog resolution, not hardcoded sets.** Competitors validate tool/hook/rule
     names against _hardcoded lists_ (cclint's `KNOWN_CLAUDE_TOOLS`, its 9-event list)
     or _prose heuristics_ (ctxlint's `no-style-guide`). vigiles resolves against live
     catalogs (7 linter APIs; the harness tool/event/MCP catalog via the dialect) with
     **did-you-mean / edit-distance + framework-extension awareness** — a custom event
     like `TeammateIdle` is not flagged, a close typo is.
  2. **Harness-surface cross-referencing no one else does:** subagent tool _contracts_
     (a never-available or typo'd tool — the `AskUserQuestion`-never-available class of
     bug), MCP tool→declared-server resolution, MCP-config startability, the
     disallowed-tools mirror, description-overlap (NCD precision proxy), and
     cross-language symbol refs (ast-grep).
  3. **FP-calibration against real plugins** — the "don't cry wolf" discipline
     (`confidentToolIssues` / close-typo-only), proven by the vendored-plugin FP-guard +
     true-positive tests. A linter that is noisy on real marketplaces gets ignored;
     vigiles is tuned not to be. This is the genuinely un-copyable part — hardcoded-set
     linters are either noisy or shallow.

## On the linter-rule catalog check specifically — narrow, do not lead with it

The headline "verifies a rule exists **and** is enabled across 7 catalogs" is **real but
narrow**: few hand-written instruction files cite exact rule IDs (the corpus shows
file/command refs dominate; rule-IDs are rare), and the drift it catches — a named rule
not actually enabled — is low-incidence and low-severity. It mostly matters when you
author rules in the vigiles `enforce()` format **and** wire deterministic enforcement (a
`guard()` / hook / CI gate) that relies on the rule being on. It is a clean, uncontested
check, but it is **one member of the cross-referencing family, not the headline**, and
should not anchor the moat narrative.

## So what _is_ the biggest linting-side moat?

Not the rule catalog, and **not templates** — templates are a spec-tier _authoring
ergonomic_ that is both off the market's preferred surface (every competitor lints
markdown directly; none uses a typed spec) and cheaply replicable ("required sections"
already ships in claudelint/cclint). The durable linting moat is the **calibrated,
multi-surface cross-referencing engine**: one shared detector family (tool-contract,
hook-events, mcp-tool, mcp-config, description-overlap, symbol/file/cmd refs) that
(a) resolves against **live catalogs instead of hardcoded sets**, (b) covers **harness
surfaces competitors don't touch**, and (c) is **FP-tuned against real plugins** — reused
identically by `lint` and `scan` (one-detector-no-drift). That combination is what the
hardcoded-set / prose-heuristic incumbents cannot cheaply copy.

The bigger moat **overall** is **layer 2 — harness testing** (`runHook` /
`runHarnessTest` / `runEval`): does the assembled harness actually fire its hooks, trigger
its skills, behave? No instruction-file linter in this survey tests that; **AgentEval** is
the only one gesturing at it (harvest/run/compare), and it is early. That is the most
uncontested ground vigiles holds — but it is the _testing_ side, not the linting side.

## Markdown extraction should ride a CommonMark AST (parity, not polish)

Settled across implementations: **lychee** (pulldown-cmark), **remark-validate-links**
(mdast), and **markdownlint** (micromark) all **skip code fences and inline code natively**
via the parse tree — lychee defaults `include_verbatim=false`; mdast `code`/`inlineCode`
nodes carry no `url`. A path or command inside a ` ``` ` fence is a non-problem for an AST
extractor; the regex "code blocks make it ambiguous" worry is solved prior art.
`agnix` is **already AST-based**, so an AST extractor is **competitive parity to reach,
not a nicety** — vigiles's markdown-mode reference extraction should walk a CommonMark AST
(remark / `markdown-it` tokens) rather than hand-rolled regex.

## Named threats to track

- **agnix** — the capability incumbent (LSP, 425 rules, 4 IDEs, ~293★). Structural
  today; if it adds catalog resolution it closes the gap. The one to watch on coverage.
- **Codacy AgentLinter** — distribution muscle (on-by-default for new Codacy repos).
- **AgentLint** — positioning collision: ships the exact "Agent = Model + Harness / lint
  the harness" tagline. The _category_ is ours to sit in; the _phrase_ is contested.
- **AgentEval** — closest to the layer-2 eval frame (measures behavioural impact of an
  instruction-file change); early (≈67 commits) but the one to watch on the testing axis.

## Strategy: beat, subsume, delegate — and the one wedge

You don't out-rule agnix (425 structural rules, an LSP, 4 IDEs) and you shouldn't try.
Split the field three ways.

**BEAT** (widen and lead — structurally ahead, not cheaply copyable):

- The **cross-referencing engine** — catalog resolution + harness surfaces + FP-calibration
  (the bold matrix rows). Fewer-but-true, each rule a silent-failure class.
- **Harness testing** (layer 2) — uncontested, no ceiling. The apex.
- **Cross-harness DEPTH** — the only tool that compiles + tests + cross-references per
  harness via adapters. Lead on depth, never breadth.
- **Ease of adoption** — agent-run `init` (non-interactive, the agent installs it), the
  markdown ladder (inline → frontmatter → spec), install-as-the-agent flow. A high-signal
  linter that an agent wires up unattended is a different product from a 425-rule CLI a
  human has to configure and then mute.

**SUBSUME** (reach parity cheaply so nobody needs a second tool): the table-stakes
structural / secrets / path / script checks — fold the **high-signal subset** into
`scan`/`lint` so "I'll also run agnix" loses its reason. Do **not** chase 425 rules or the
noisy tail; absorb the silent-failure catchers (circular import, hook-script-exists, MCP
startability — much already shipped) and skip the taste-scoring.

**DELEGATE / don't fight:**

- **LSP / IDE polish** — agnix is far ahead; a thin LSP is a maybe-later, not the moat.
- **Sync / distribution** — Ruler / rulesync; compose, don't absorb (existing stance).
- **AI code review** — CodeRabbit / Greptile; a different product (they _use_ the file,
  don't validate it).
- **Deep security scanning** — SkillSpector / Semgrep; delegate.

**The one wedge — and it is NOT templating.** Templating is a feature, not an identity:
spec-tier, off the market's preferred surface, and already half-shipped by claudelint/cclint.
The sharpest single wedge is: **"test your harness, don't just lint it" — cross-harness, and
easy enough that the agent installs it.** Lint the references for free (the high-signal
floor); then test that the hooks fire and the skills trigger, on your Claude subscription.
Everyone else lints a markdown file; only vigiles tests the assembled machine, across
harnesses, with an adoption path an agent runs unattended. **Make the linting the free
funnel; make the testing the identity.**

Supporting moves: AST-ify markdown extraction (parity with agnix, not polish); own the
"harness engineering" category (Faros / Atlan / Linux-Foundation AAIF coined it — aware
AgentLint already uses the phrase); keep the rule set small, true, and FP-calibrated.

## See also

- `reference-verification-limits.md` — the conceptual boundary (proxy vs judgment; the
  Group A/B/C map). Its "Group C is the unfilled niche" framing predates this wave and is
  corrected there.
- `ai-native-linting.md` — the AI code-review wave (CodeRabbit/Greptile/Semgrep), which
  _use-as-prompt_ rather than validate.
- `lightweight-spec-authoring.md` — the `doc()` primitive + templates the "authoring
  ergonomic, not a moat" point refers to, grounded in a real-CLAUDE.md corpus sweep.
- `divergent-bets.md` — the plugin-health leaderboard bet (scan over real marketplaces).
- `agent-supply-chain-security.md` — the security-scan surface (SkillCheck/SkillSpector
  territory), orthogonal to reference verification.
