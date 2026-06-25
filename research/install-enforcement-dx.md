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

| Group            | Rules                                                                                                                                                                                                                                                                               | Confidence / why                                                                   | default   | `--strict` | `--report-only` |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------- | ---------- | --------------- |
| **`structural`** | subagent-tool-contract, subagent-frontmatter, hook-events, hook-script-exists, mcp-config, mcp-tool-resolves, mcp-hook-target-resolves, disallowed-tools-contract, description-overlap (+ `integrity`, on-by-default at warn, conceptually structural but not re-written by `init`) | correctness / FP-safe — fires only on a genuine defect; a clean plugin stays green | **error** | error      | warn            |
| **`workflow`**   | require-instructions-spec, untested-skill, untested-subagent, untested-hook                                                                                                                                                                                                         | opinionated — a CLEAN repo can fail (you haven't written the spec/test yet)        | off       | **error**  | warn            |
| **`nudge`**      | frontmatter-valid, skill-frontmatter, unmarked-refs (warn); prefer-compiled-hooks (off)                                                                                                                                                                                             | recommendation / acknowledged-noisy — never gate                                   | warn/off  | warn       | warn            |

- **Default `init`** = `recommended` = the `structural` group (the 9 high-precision
  rules) at error; `nudge` rules sit at their own defaults (warn, or off for
  `prefer-compiled-hooks`). Catch breakage out of the box; never cry wolf.
- The named group constants live in `src/setup-plan.ts` as `STRUCTURAL_RULES` /
  `WORKFLOW_RULES` / `NUDGE_RULES`; `mergeProjectConfig` writes the structural set
  (and, under `--strict`, the workflow set) as explicit severities.
- **`--strict`** = also enable the `workflow` group (the Clippy-`pedantic` / TS-`strict`
  analog — ONE opinionated opt-in).
- **`--report-only`** (a.k.a. relaxed) = an ORTHOGONAL severity dial that writes the
  whole gate at `warn` (nothing fails CI) — the migration/observe mode (Biome
  only-warn). NOT a rule set; it composes with the group selection.
- `frontmatter-valid` / `skill-frontmatter` are **nudge**-group — they stay `warn`
  even under `--strict` (never gated). `prefer-compiled-hooks` defaults **off** (a
  recommendation that shouldn't fire unasked); the rest of the nudge group is `warn`.

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

## Auto-adopt — resolving the `require-instructions-spec` inconsistency

### The inconsistency

`require-instructions-spec` (the renamed, narrowed `require-spec` — see "The rename"
below) fails an instruction file (`CLAUDE.md` / `AGENTS.md`) that has no compiled
`.spec.ts` behind it. As a _workflow_-tier rule that's defensible (you opted into
specs). But it was a **nag, not a help**: it tells you to write a spec by hand —
exactly the work `init` is supposed to do for you. A rule that demands the thing the
installer could have produced is a DX smell.

### The resolution — `init` adopts, so the rule is satisfied BY CONSTRUCTION

`vigiles init` **faithfully auto-adopts every instruction file it finds**: for each
`CLAUDE.md` / `AGENTS.md` (and, where asked, each `SKILL.md`), it generates a
`<file>.spec.ts` and compiles it back over the file. After `init` the integrity
header is present and matches → `require-instructions-spec` is **green by
construction**.

This flips the rule's character: it stops being a _nag_ ("go write a spec") and
becomes a **safety net** ("you hand-added a NEW instruction file after install and it
has no spec — adopt it"). That is a rule worth gating on, because it only fires on a
genuinely un-adopted file, never on the steady state `init` leaves behind. The
workflow tier now _forces nothing a clean `init` hasn't already satisfied_ — which
removes the tension between "default gating" and "don't make a clean repo fail".

### The faithful-by-default contract

Adoption MUST be **faithful**: the spec compiles back to (approximately) the file you
already had, so adopting is safe to run on a repo with a rich, hand-tuned `CLAUDE.md`.
Three commitments:

1. **Round-trip fidelity.** `compile(adopt(file)) ≈ file`. The committed instruction
   file after `init` is vigiles's _rendering_ of the adopted spec, so it may reflow
   whitespace or normalize heading spacing — but no rule is invented, no content is
   dropped, no wording is rewritten. **The contract to the user is "review the diff,"
   and for a well-structured file that diff is small.**
2. **`guidance()`, never `enforce()`.** Adoption transcribes prose as-is into
   `guidance()` blocks. It does NOT guess that "no floating promises" maps to
   `@typescript-eslint/no-floating-promises` — that cross-referencing is `strengthen`'s
   job, run later and deliberately. Adoption is lossless transcription; strengthening
   is the lossy, valuable upgrade. Keeping them separate is what makes adoption safe to
   run unattended.
3. **Idempotent.** Re-running `init` over an already-adopted file is a no-op (the hash
   already matches); it never double-wraps or clobbers a hand-edited spec.

### The fidelity ladder (how faithful, at what structural cost)

| Tier             | What it produces                                                        | Round-trip         | When                                                              |
| ---------------- | ----------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------- |
| **raw**          | one verbatim block wrapping the whole file in a single `guidance()`     | **byte-identical** | irregular prose a structural parse would mangle; the safe floor   |
| **structured**   | `claude({ sections })` + one `guidance()` per heading/rule              | small reflow diff  | the default — a normal headed `CLAUDE.md`; gives a real spec      |
| **strengthened** | `guidance()` upgraded to `enforce()`/`guard()` where a linter rule fits | semantic upgrade   | opt-in `strengthen` AFTER install + commit, reviewed deliberately |

Default to **structured** (the value: a spec with real sections you can edit per
rule); fall back to **raw** when the file resists clean structural parsing, so
adoption _never fails_ — worst case you get a faithful container the user can split
later. `strengthen` is always a separate, post-commit step.

### Two adoption paths (same contract, different engine)

- **Agentic (model-driven, via the `adopt-spec` skill).** When an agent runs `init`
  ("set up vigiles"), the model reads the instruction file and writes the spec —
  handling irregular structure, semantic section grouping, and odd prose far better
  than a parser. This is the primary path and the one we dogfood; faithful-by-default
  is the skill's stated contract.
- **Deterministic (bare `npx vigiles init`, no model).** A best-effort structural
  converter parses headings → sections and paragraphs/list-items → `guidance()`
  blocks. It is honest about its limits: the post-install summary says **"adopted N
  files — very close to the originals; review the diff before committing."** For an
  irregular file it drops to the **raw** tier rather than guess.

Both paths obey the same faithful contract; the only difference is how cleanly they
hit the _structured_ tier vs falling back to _raw_.

### The end-to-end "great DX" flow

```
$ (agent) "set up vigiles"
  → npx vigiles init
    detects: CLAUDE.md, .claude/skills/foo/SKILL.md
    adopts:  CLAUDE.md → CLAUDE.md.spec.ts (faithful, guidance-only) → recompiled
    writes:  .vigilesrc.json (structural rules = error)
    gates:   require-instructions-spec now GREEN (spec exists, hash matches)
  → "Adopted CLAUDE.md into a spec (faithful — review the diff).
     Structural gating is on. Want me to also enforce specs+tests? [workflow tier]
     Run the `/strengthen` skill later to upgrade prose rules to real linter rules."
  → commit
  → (optional, deliberate) /strengthen   # guidance() → enforce()
```

You end with **specs, not homework**. Nothing forced you to write one; the installer
produced faithful ones, the gating rule is satisfied because the work is done, and the
_valuable_ upgrade (strengthen) is an opt-in you reach for when you're ready.

### Use cases the flow must handle

- **Greenfield (no instruction file).** `init` scaffolds a starter `CLAUDE.md.spec.ts`
  (today's behavior) — nothing to adopt, nothing to gate.
- **Existing rich `CLAUDE.md`.** The headline case: adopt faithfully, small diff, the
  user keeps their content and gains a spec. This is what makes "spec-first" non-scary.
- **Multiple instruction files** (`CLAUDE.md` + `AGENTS.md`, or a mirror). Adopt each
  to its own spec; honor the existing mirror/sync-tool handling (one canonical spec for
  a byte-identical mirror — the `compose-with-sync-tools` rule).
- **Selective.** `--target=CLAUDE.md` adopts just that file; a future
  `--adopt=<glob>` / interactive multi-select lets a user adopt some files now and
  others later. Adoption is per-file and idempotent, so partial adoption is fine.

### Explicit tradeoffs applied (the install-UX principle)

The adopt choice states its cost at the point of choosing, same as the group opt-in:

- _Agent:_ "I'll adopt your CLAUDE.md into a spec so vigiles can verify it — it stays
  faithful (I won't rewrite your rules), and you can `vigiles eject` anytime to get
  plain markdown back."
- _Deterministic summary:_ "Adopted 2 files (best-effort, very close — review the
  diff). For prose I couldn't structure cleanly I kept it verbatim."

The escape hatch is always named: **`vigiles eject`** strips the integrity header and
removes the spec, returning a hand-owned file — so adoption is never a one-way door.

### Build sequence (proposed — confirm before building)

1. **Agentic path first** (highest leverage, lowest risk): tighten the `adopt-spec`
   skill's faithful-by-default contract + wire `init` to invoke adoption for every
   detected instruction file (not just scaffold a fresh one). Most users meet vigiles
   through an agent, so this covers the headline DX immediately.
2. **Deterministic converter as fast-follow**: a pure `adoptMarkdown(md) → specSource`
   (structured tier with raw fallback), reusing the existing markdown-mode parsers
   where possible (`prefer-existing-solutions`). Round-trip-tested: `compile(adopt(f))`
   diff stays within a whitespace-normalization tolerance, raw tier is byte-identical.
3. **`strengthen`-after** stays as-is (already a skill); just ensure the post-adopt
   summary points at it.

Rationale for the order: the agentic path needs no new deterministic engine and ships
the "set up vigiles → I have specs" moment now; the deterministic converter is the
zero-model floor for `prefer-existing-solutions` / CI and can land behind it without
blocking the DX win.

## See also

- `CLAUDE.md` rules: `install-enforcement-model`, `smooth-adoption`,
  `progressive-adoption`, `great-agent-flow`, `cohesive-cli-surface`.
- `docs/cli.md` — the `init` flags + the gating model (user-facing).
- Biome config discussion (groups vs presets): biomejs/biome#689; only-warn: #3106.
