---
status: active
topic: skills
---

# Skill-authoring pains — research + strategic note

> Status: research capture (2026-06-06). Pauses no code; informs whether vigiles's
> center of gravity should shift from "compile CLAUDE.md" toward "verify SKILL.md
> procedures." Companion to `research/distribution-strategy.md` and
> `research/landscape-mid-2026.md`.

## Why this exists

Working hypothesis from the team: for **CLAUDE.md / AGENTS.md** a typed spec is hard
to justify — these files are essentially _documentation_ (passive context). For
**SKILL.md** a verifiable contract may genuinely earn its place, because a skill is a
_procedure_: it wraps real scripts, commands, and tools and produces a result. To test
that, we ran three parallel research sweeps on the real pains of authoring agent skills
(Claude Code Skills / Anthropic Agent Skills and the now-open `agentskills.io` standard,
adopted by Codex, Cursor, Copilot, Gemini CLI).

**Source caveat:** the strongest evidence is Anthropic's own docs/engineering blog and
`anthropics/claude-code` GitHub issues. Magnitude figures ("73% of 214 skills broken",
"650 trials / 50% activation", "59 broken references") come from individual practitioner
blogs and self-reported audits, not controlled studies — treat as directional.

## Findings

### Structure & volume

- **Triggering is non-deterministic.** A skill activates only if Claude semantically
  matches the free-text `description`; practitioners report wildly phrasing-dependent
  activation (passive descriptions 37–87%, directive "ALWAYS invoke when…" 94–100%).
  No algorithmic matching. (paddo.dev; medium "650 Trials")
- **Over-triggering with no off switch.** Skills fire when unwanted (a "research" skill
  on "research why this test fails"); `disable-model-invocation` is per-skill only.
  (github.com/anthropics/claude-code#30355)
- **Silent frontmatter contract violations.** `name` must be lowercase/hyphen, ≤64 chars,
  no reserved words ("anthropic"/"claude"); description must be third-person; malformed
  frontmatter makes Claude ignore the skill with no error. Undocumented `paths` field made
  a skill completely undiscoverable. (platform.claude.com best-practices; #49835)
- **Volume vs progressive disclosure.** Official guidance: SKILL.md body < 500 lines,
  details in one-level-deep reference files loaded on demand. Authors err both ways —
  bloated (wastes context) or too terse. (anthropic.com/engineering; best-practices)

### Testing, reliability & drift ← vigiles's wheelhouse

- **Bundled-resource / path breakage fails silently.** Relative script paths fail on first
  run; metadata gets injected while SKILL.md isn't mounted, so "Claude is instructed to use
  skills that literally don't exist." (#11011, #26254)
- **Referenced refs rot silently.** One practitioner found _59 broken references in a
  192-file setup_: "Claude reads the instruction, gets nothing, and continues silently."
  (buildtolaunch substack)
- **Quality rot at scale.** Community audit: _73% of 214 skills scored < 60/100, most
  failed silently, no error message._ Snyk: 1,467 of 3,984 public skills flawed, 76 with
  malicious payloads — nobody verifies skill internals. (dev.to audit; Anthropic eng blog)
- **Official evals don't cover existence.** Anthropic's `skill-creator` eval system tests
  **triggering and output quality**, plus regression detection across model updates — but
  **not** whether bundled scripts/commands/paths actually resolve. (claude.com blog)

### Distribution & maintenance

- **No auto-update anywhere.** Skills/plugins update only by reinstall / `git pull` / hand
  edit, then session restart. (agensi; code.claude.com plugin-marketplaces)
- **Skill drift / sprawl.** "Silent divergence when you create and edit skills across
  multiple environments"; duplicates drift apart, neither knows the other exists.
  (mindstudio; buildtolaunch)
- **Fragmented discovery, under-specified standard.** Rival registries, no canonical index;
  Simon Willison calls the standard "quite heavily under-specified." (simonwillison.net)

## The documentation-vs-procedure distinction is real — and Anthropic draws it

- Claude Code docs: create a skill **"when a section of CLAUDE.md has grown into a
  _procedure rather than a fact_."** (code.claude.com/skills)
- Anthropic engineering: skills are **"capabilities, not documentation… procedural
  knowledge."**
- Skills can run executable scripts and restrict tools (`allowed-tools`); **"neither
  CLAUDE.md nor AGENTS.md can do this."** (termdock; danielmiessler separates "how-to-do-X"
  files from passive context)

So the split the team intuited is endorsed by the platform itself: CLAUDE.md/AGENTS.md =
documentation; SKILL.md = procedure with a runnable, verifiable surface.

## Strategic implication for vigiles

**The single most-documented skill pain — referenced scripts/commands/paths drift and the
skill silently lies to the agent — is vigiles's core competency (cross-referencing
engine), and it is unclaimed.** Existing skill linters (`agent-skill-linter`,
`skill-validator`, SkillCheck, `agent-skills-lint`) are **schema/regex-only**: frontmatter
shape, required fields, body length. Research conclusion, verbatim: _"none cross-references
the wrapped scripts/linter-rules to prove they're real and enabled. That cross-referencing
gap is unclaimed."_

This suggests shifting the center of gravity:

- **CLAUDE.md / AGENTS.md = documentation.** Light verification (rule/file/script refs in
  prose), markdown-first, spec optional. (Matches the markdown-mode + file/cmd direction
  already in flight.)
- **SKILL.md = procedure.** Here a stricter verified contract is justified. vigiles's
  cleanest, least-contested value: _"verify the commands / scripts / tools / rules your
  skill references actually exist and are enabled."_ Beyond file/cmd this means
  skill-specific checks: bundled `scripts/` resolution, `allowed-tools` validity, the
  frontmatter contract (name/description constraints), reference-file resolution.

**Refinement to "skills need a spec":** consistent with the rest of our thinking
(edit-time TS proof is irrelevant when an agent authors), _"spec for skills"_ should mean a
**verified contract**, not necessarily a `.spec.ts`. The value is deterministic
verification — which works in markdown-mode on the SKILL.md itself _and_ in the typed
`skill()` spec. Same level ladder; the asymmetry is in policy: **`require-instructions-spec` mild for
CLAUDE.md, strict for SKILL.md.**

## Open questions (for continued discussion before changing scope)

1. Does the headline become "verify your skills" rather than "compile your CLAUDE.md"?
2. What exactly does a skill _contract_ verify beyond file/cmd — `allowed-tools`, bundled
   `scripts/` paths, the name/description frontmatter rules, reference-file resolution?
3. Triggering quality (the biggest activation pain) is largely prompt-quality, not
   deterministic verification — is that in scope, out of scope, or a `guidance()`-style
   advisory check?
4. Does `require-skill-spec` get strengthened while `require-instructions-spec` (CLAUDE.md) relaxes?

## See also

- `research/skill-as-pipeline.md` — the concrete model that came out of these pains: a skill as
  a harness-driven control-flow graph with deterministic gates (Railway out, monads in), and
  the resulting markdown↔spec boundary (linear → markdown, branching → spec).
- `research/benchmarks-runtime-gates.md` — the empirical test of that pipeline/gate branch:
  runtime gates are a no-op or net-negative for capable agents, which redirects the center of
  gravity back to the cross-referencing core this doc identifies.
- `research/symbol-verification.md` — design & requirements for extending the cross-reference
  engine from file/cmd to cross-language symbol references (the core competency this doc names).
