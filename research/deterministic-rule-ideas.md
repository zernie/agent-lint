# Deterministic rule ideas — the next moat surfaces

> Status: ideas backlog (2026-06-19), grounded in the mid-2026 OSS plugin sweep
> (~13 marketplaces / 444 plugins — `research/plugin-structural-findings.md`) and
> the shipped rule set. The unifying thesis: **every good deterministic rule is
> the same "valid is not true" cross-reference — a declared thing checked against
> reality — applied to a new harness surface, and calibrated HIGH-PRECISION** so
> it never cries wolf when auditing third-party plugins (the recurring lesson:
> `TaskCreate` tools, `han` hook events, `*` wildcards, array-shaped hooks all
> forced precision fixes). Free, no-model, every-commit. The model-gated column
> (`--trigger`) is the deliberate exception and stays out of `lint`.

## Shipped (the baseline these build on)

First wave: `agent-tool-contract` · `hook-events` · `agent-frontmatter` ·
`skill-frontmatter` · `mcp-config` — each one detector reused by `scan` + `lint`
(+ `compileAgent` for tools). Plus FP-hardening of the existing structural checks.

Second wave (2026-06-19, this + the competitor-poach round —
[competitor-rule-matrix](competitor-rule-matrix.md)):

- ✅ **`mcp-tool-resolves`** (#1 below) — the MCP half of the tool moat.
- ✅ **`hook-script-exists`** — promoted scan's missing-hook status to a lint
  rule (poach: matches Anthropic's `claude plugin validate`).
- ✅ **`disallowed-tools-contract`** — deny-side mirror of agent-tool-contract
  (poach from SkillCheck; a check no one else has).
- ✅ **`description-overlap`** (#6 below) — the NCD precision proxy showpiece.
- ✅ **agent `model:`/`color:` validity** — folded into `agent-frontmatter`
  (poach: matches the official validator + cclint).

Still open below: `hook-matcher` (#2), `frontmatter-valid` (#3),
`duplicate-names` (#4), `hook-shape` (#5), plus `mcp-hook-target-resolves` and
duplicate/reserved MCP server names (from the competitor matrix).

## Tier 1 — ship next (high yield, FP-safe, grounded, moat-aligned)

### 1. `mcp-tool-resolves` — an `mcp__server__tool` whose server isn't declared

A subagent/skill lists `mcp__ide__getDiagnostics` in its tools, but no MCP server
`ide` is declared in `.mcp.json` / the manifest → the tool **can't exist**, a
dead contract entry. This is the _exact_ moat (cross-reference the tool's server
prefix against the declared `mcpServers`), and it's the natural completion of #1
(`agent-tool-contract`), which currently passes ANY `mcp__*` token unverified.

- **Grounded:** ananddtyagi's `codebase-documenter` lists `mcp__ide__*`; MCP
  servers are declared separately, so the link is checkable.
- **FP-safety:** flag only when the plugin SHIPS an `.mcp.json`/manifest with
  `mcpServers` (so we know the declared set) and the prefix isn't among them; a
  user-global server is unknowable → warn, plugin-scoped. Reuses the `mcp-config`
  reader + the tool-contract parser. **Effort: low.**

### 2. `hook-matcher` — a tool-event hook whose matcher names a non-existent tool

A `PreToolUse`/`PostToolUse` hook with `matcher: "Edt|Write"` never fires on
`Edit` — the moat applied to the **matcher** surface, exactly as
`agent-tool-contract` applies it to `tools:`. Parse the matcher's alternation
into tool-like tokens, flag a close typo (≤2) of a real catalog tool.

- **Grounded:** every hooks block in the sweep keys on matchers; a typo there is
  the same silent-no-fire bug as a typo'd event name (#2 hook-events).
- **FP-safety:** matchers are regexes (`Edit|Write`, `Bash(*)`, `*`, `.*`) — only
  flag a bare token that's a close typo of a known tool; never flag a wildcard or
  a regex with metachars. High-precision, same calibration as the tool check.
  **Effort: medium** (matcher tokenizing).

### 3. `frontmatter-valid` — malformed YAML frontmatter (silently unparsed)

A `SKILL.md`/agent whose `---` block is invalid YAML (a literal tab indent, a
duplicate key, an unterminated quote) — Claude Code can't parse it, so the surface
silently misbehaves or doesn't load. A whole class of silent breakage that
hand-written plugins hit constantly.

- **Grounded:** the sweep is full of hand-authored frontmatter; our own
  `readField` exists precisely because naive frontmatter parsing is fragile.
- **FP-safety:** a real YAML parse error is unambiguous — the highest-confidence
  signal there is. **Effort: medium** (needs a YAML parse of the block; today
  vigiles hand-parses fields — this wants a real parser for the block, or a
  targeted check for the common breakers: tabs, duplicate top-level keys).

## Tier 2 — strong, a touch more nuance

### 4. `duplicate-names` — two skills (or two agents) with the same name

Within a plugin, two `agents/*.md` declaring `name: reviewer`, or two skill dirs
resolving to the same name → one silently shadows the other.

- **Grounded:** marketplaces alias names heavily (han: 338 names → 159 dirs — we
  already DEDUPE that for the leaderboard); within-plugin collisions are the
  authoring-time version. **FP-safety:** exact collision is unambiguous.
  **Effort: low.**

### 5. `hook-shape` — an incomplete hook entry

A hook `{ "type": "command" }` with no `command`, or an entry missing `type`, or a
`hooks` value that isn't the expected shape → the hook never runs. The hook-config
analog of `mcp-config` (a declared thing that can't execute).

- **Grounded:** hand-written `hooks.json` across the sweep (incl. the
  ananddtyagi/sugar ARRAY-shaped custom format we already skip). **FP-safety:** a
  command hook with no command is unambiguous; skip non-CC array formats (as the
  hook-event check already does). **Effort: low.**

### 6. `description-overlap` — near-duplicate skill descriptions (precision proxy) ⭐

Two skills whose descriptions are near-identical (NCD ≥ threshold) can't be told
apart by the selector → a **precision collision** (the wrong one fires). This is
the standout idea: a **deterministic proxy for a behavioral risk**, reusing the
NCD engine already in `proofs.ts` (the same one `findSimilarRules` uses) — it
catches a `--trigger`-class problem with **no model**.

- **Grounded:** fleytman/haretrail's `debrief` vs `lessons` vs `postmortem` (and
  `task` vs `research`) overlap — flagged by hand in the behavioral findings;
  this makes it automatic and free. **FP-safety:** high NCD threshold, warn,
  report the pair (not a unilateral defect). **Effort: medium** (reuse NCD; pick
  a threshold against the sweep). Bridges the deterministic ↔ behavioral columns —
  on-brand and genuinely novel vs every other plugin linter.

## Tier 3 — useful, lower priority

- **`agent-model`** — an agent/skill `model:` that isn't a real model (typo of
  `sonnet`/`opus`/`haiku`/`inherit`). Moat (model catalog); FP-risk from aliases/
  dated ids → close-typo only. **Low effort.**
- **`plugin-manifest`** — `plugin.json` missing `name`, bad `version`, malformed
  `hooks`/`mcpServers` shapes (won't install). FP-safe. **Low effort.**
- **`marketplace-sources`** — a `marketplace.json` member whose on-disk `source`
  doesn't exist (broken entry). Partly covered by `inspectMarketplace`; promote
  to a flagged finding. **Low effort.**

## Deliberately NOT rules (the undecidable-prose floor)

- A subagent BODY that says "use the X tool" while X isn't in its `tools:`
  contract; a skill body referencing a file/command in prose. These need prose
  interpretation — the same floor `reference-verification-limits.md` refuses.
  They belong to the MARKED-reference path (`vigiles:` marks) or the behavioral
  column, not a deterministic structural rule.

## Recommended order

1. `mcp-tool-resolves` (#1) — cheapest real-bug yield, completes the tool moat.
2. `hook-shape` (#5) + `duplicate-names` (#4) — low-effort, FP-safe, real.
3. `description-overlap` (#6) — the novel showpiece; deterministic precision.
4. `frontmatter-valid` (#3) — highest class-of-bug coverage, needs a YAML parse.
5. `hook-matcher` (#2) — completes the hook moat.

## See also

- [plugin-structural-findings](plugin-structural-findings.md) — the sweep these
  are grounded in (+ the FP lessons that mandate high-precision calibration).
- [roadmap](roadmap.md) — where these slot into Now/Next (pillar 1).
- [reference-verification-limits](reference-verification-limits.md) — why the
  prose-floor ideas are deliberately excluded.
