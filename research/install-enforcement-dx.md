# Install enforcement DX — rule groups, presets, and the agentic install flow

> The design record behind the `install-enforcement-model` rule (root `CLAUDE.md`).
> Captures not just WHAT we landed on but the IDEAS that guided it — the linter
> landscape, why we rejected a strictness-preset menu, and the agentic-install
> principle. Written 2026-06-25.

## The question

`vigiles init` decides what gates a user's CI. How should it present that choice
— one strict/relaxed knob? a preset menu? per-rule severities? — to balance
ease-of-adoption against control, and what does the agentic install (an LLM agent
running `init` when a human says "set up vigiles") present?

## Landscape — what mature linters actually do (verified 2026-06)

Every modern linter organizes rules into **GROUPS keyed by confidence**, with ONE
curated `recommended` set, and treats "strictness" as opt-in groups — NOT a band
of `relaxed/standard/strict` presets:

- **Clippy** (the model the others cite): lint groups by confidence/kind —
  `correctness` (almost-certainly-bugs → **deny by default**), `suspicious`/`style`/
  `complexity`/`perf` (**warn**), `pedantic`/`nursery`/`cargo` (**allow by default,
  opt-in** — noisier/opinionated). The separation is by FALSE-POSITIVE RATE.
- **Biome**: groups `correctness` / `suspicious` / `style` / `complexity` /
  `nursery`; a `recommended` flag turns on the high-confidence ones. Biome's own
  config-design discussion is blunt: **"presets are a poor emulation of rule
  groups,"** and ESLint's habit of adding `strict`/`stylistic` presets is **"a sign
  of a lack of consistent rule grouping — Clippy solved that with proper rule
  groups."** (biomejs/biome#689). "Make everything a warning" is tracked as a
  SEPARATE, orthogonal request (biomejs/biome#3106), not a preset.
- **Ruff**: a small, safe default `select` (Pyflakes + a pycodestyle subset);
  everything else is an explicit opt-in by rule FAMILY. `ALL` exists but is
  discouraged (too noisy).
- **TypeScript**: one `strict` meta-flag expands to a bundle; community `@tsconfig`
  bases (recommended / strictest) are the tiers. ONE opinionated opt-in, not a menu.

**Takeaway:** organize by group/confidence; ship ONE recommended default; make the
opinionated tier a single opt-in; treat "downgrade to warnings" as an orthogonal
severity dial. A `relaxed/standard/strict` preset MENU is the ESLint anti-pattern.

## The decision

vigiles already had the right STRUCTURE (two rule lists split by confidence); it
just wasn't named. Formalize **three groups**, NO preset menu:

| Group            | Rules                                                                                                                                                                                             | Confidence / why                                                                   | default   | `--strict` | `--report-only` |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------- | ---------- | --------------- |
| **`structural`** | subagent-tool-contract, subagent-frontmatter, hook-events, hook-script-exists, mcp-config, mcp-tool-resolves, mcp-hook-target-resolves, disallowed-tools-contract, description-overlap, integrity | correctness / FP-safe — fires only on a genuine defect; a clean plugin stays green | **error** | error      | warn            |
| **`workflow`**   | require-spec, untested-skill, untested-subagent, untested-hook                                                                                                                                    | opinionated — a CLEAN repo can fail (you haven't written the spec/test yet)        | off       | **error**  | warn            |
| **`nudge`**      | frontmatter-valid, skill-frontmatter, prefer-compiled-hooks, unmarked-refs                                                                                                                        | recommendation / acknowledged-noisy — never gate                                   | warn      | warn       | warn            |

- **Default `init`** = `recommended` = `structural` at error + `nudge` at warn (catch
  breakage out of the box; never cry wolf). This is what shipped this session.
- **`--strict`** = also enable the `workflow` group (the Clippy-`pedantic` / TS-`strict`
  analog — ONE opinionated opt-in).
- **`--report-only`** (a.k.a. relaxed) = an ORTHOGONAL severity dial that downgrades
  the gating groups to `warn` (nothing fails CI) — the migration/observe mode (Biome
  only-warn). NOT a rule set; it composes with the group selection.
- `frontmatter-valid` stays `warn` even under `--strict` (acknowledged js-yaml-stricter-
  than-CC noise — don't gate on it).

Presets EXPAND to explicit config; they are NOT a runtime key. `init` writes the
explicit per-rule severities into `.vigilesrc.json` (greppable, editable, downgrade
any single rule) — the same explicit > magic ethos that put the rules in the config
rather than relying on code defaults.

## Explicit about tradeoffs (the install UX principle)

Every choice in the install flow states **what you get AND what it costs, at the
point of choosing** — and the SAME tradeoff text is reused across three surfaces
(one source, no drift):

1. **CLI prompt** — one terse tradeoff line per option.
2. **The agent's `AskUserQuestion`** — the tradeoff is the option's `description`;
   the tool's automatic **"Other"** takes a custom answer (e.g. "strict but skip
   untested-skill").
3. **Post-install summary** — what landed + the implication + how to change it
   ("Standard: a broken subagent/hook/MCP now fails `vigiles lint`. `--preset` later
   to add specs+tests, or `--report-only` to downgrade to warnings").

The agent presents the **group opt-in with its tradeoff** ("also enforce the workflow
group? — fails until you've written specs+tests"), NEVER an abstract strictness band.

## Agentic-install DX — no prior art

A 2026-06 sweep found **no linter with an LLM-agent-driven install** — vigiles is
early here, so there's no best practice to copy. The nearest analog is the `create-*`
scaffolder family (clear option descriptions, one recommended path). The borrowed
principle: a strong `recommended` default, ONE opinionated opt-in presented WITH its
tradeoff, and the choice expressed as a group ("enforce the workflow group?"), not a
band. The agent uses `AskUserQuestion` (descriptions = tradeoffs, "Other" = custom).

## Philosophy reconciliation (supersedes the old "start permissive")

The old `smooth-adoption` / `progressive-adoption` framing said "start permissive
(warnings), tighten via `--strict`." That conflicted with default gating. The
reconciled stance (user-agreed):

> **"Permissive" means vigiles doesn't FORCE specs/TS on you and doesn't CRY WOLF
> (the default rules are FP-safe). It does NOT mean ignoring genuine breakage.**

So the on-ramp is: `--report-only` (see warnings, fix gradually) → default (catch
breakage) → `--strict` (also require specs+tests). Progressive about ENFORCEMENT
DEPTH, not about whether obvious breakage fails.

## See also

- `CLAUDE.md` rules: `install-enforcement-model`, `smooth-adoption`,
  `progressive-adoption`, `great-agent-flow`, `cohesive-cli-surface`.
- `docs/cli.md` — the `init` flags + the gating model (user-facing).
- Biome config discussion (groups vs presets): biomejs/biome#689; only-warn: #3106.
