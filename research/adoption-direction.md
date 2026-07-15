---
status: active
topic: adoption
created: 2026-07-15
---

# Adoption direction — the source of truth (v2, committed 2026-07-15)

> **This is the committed DIRECTION, not yet the shipped behavior.** Current code is still
> spec-first (`init` adopts a CLAUDE.md into a typed spec; the spec is treated as the source of
> truth; the markdown is a build artifact). This doc **supersedes that framing** and governs new
> work. When a claim here conflicts with another doc, this doc wins and that doc is on the
> reconciliation ledger below. Red-teamed by a Fable pass (2026-07-15); design record + the
> private strategy/visa framing live in `zernie/mine` `vigiles/s49.md`.

## The one principle (decidable boundary)

No **decidable** property (does file X exist, is lint rule Y enabled, does this prose rule map
to a real linter rule, is it violated right now) is left to the model unchecked; no
**undecidable** property (is this refactor good) is faked as enforced. Freedom in the model's
search; determinism at the boundary and the verification. Everything below is this principle
applied to adoption.

## What changed vs the old spec-first framing

| | OLD (superseded) | NEW (v2, committed) |
| --- | --- | --- |
| Front door | `init` → scaffold/adopt a typed spec | **`audit`** — read-only, any repo, zero setup |
| Source of truth | the `.spec.ts`; markdown is a build artifact | the **markdown** the user already hand-edits |
| Enforcement home | rules live in the spec | **the repo's NATIVE linter config** (ruff/eslint) for code-quality rules |
| The spec | the default you adopt into | an **optional authoring layer** for harness-structure rules only (JS/TS) |
| Adoption | an "adopt" event that ports your file | not an event — you `audit`, then `fix`; a spec materializes lazily, only if needed |

## The pipeline

1. **`audit` (front door — read-only, any repo, zero setup, zero writes).** Lighthouse-style
   graded report (rings, A–F) + TRUE findings: broken refs · rules that are **enforceable AND
   violated right now** (the wow) · enforceable-but-unenforced + disabled-rule one-flip wins ·
   the honestly-labeled undecidable residue. Never cry-wolf — every finding is true, or it isn't
   shown (the ~1% real broken-ref rate is the whole credibility of the leaderboard).
2. **Fix (one command → one reviewable PR).** Writes the picked rules into the repo's **native**
   linter config (ruff.toml/.eslintrc) + optionally fixes the current violations, batched and
   cherry-pickable. CI then catches regressions. No new runtime, no shadow config layer, no TS.
   Surfaced by the `audit` finding's inline fix + the `strengthen` skill — **not a new verb.**
3. **Spec (optional, lazy, JS/TS-native only).** Materializes only for the power features no
   linter can express — subagent tool contracts, purity floors, railway typed outcomes,
   composition, hook AST analysis. A Python repo may never need one; its enforcement lives in
   ruff. `init` is this **graduation** step, not the front door.
4. **`eject` anytime** → plain hand-owned markdown / remove the added config lines. Never a
   one-way door.

## Rule-class routing (why the typed spec loses nothing)

Two classes of rule, two homes:

- **Code-quality** ("imports at top", "no bare except", "type hints", "fn length") → maps to a
  rule the linter already has → **native config**. A typed spec adds nothing here.
- **Harness-structure** (subagent contracts, purity, railway `result()`/`assertAgentOk`, hook
  AST analysis, skill collisions, composition, CLAUDE.md ref-integrity) → **no linter can
  express these** → typed spec + runtime gate. The moat.

The dissolving insight: **the typed spec is the AUTHORING layer; the native linter is the
RUNTIME.** Every spec pro (compile-time contracts, railway composition, purity typing) is an
authoring-time property — the spec *produces* enforcement (native config lines for code-quality;
a generated eslint rule file for synthesized rules), it is not replaced by it. Same architecture
as `@vigiles/rule-compiler`: model 1× at compile-time, CI = clean native linter, $0. This is the Rule
of Least Power applied to enforcement homes.

## The command surface — why each verb exists, and how they cohere

The verbs are not a toolbox to browse — they are **one funnel at rising commitment levels**,
and a newcomer only ever touches the first. Everything downstream of `audit` is a choice the
user makes *after* seeing a grade, never a door they have to pick at the start. The set is
deliberately small: **new capability is a new finding in `audit` + an existing skill, never a
new verb** (anti-surface-sprawl). And each verb sits cleanly on one side of the decidable
boundary (§ "The one principle") — deterministic (`audit`-read, `lint`, `init`/`compile`,
`test`) vs the model-gated residual (`eval`, trigger-rate) — so nothing straddles it.

| Verb | Why it exists | Funnel role | Axis / boundary side |
| --- | --- | --- | --- |
| `audit` | See any harness's health in one read — zero setup, zero writes, any repo | **The ONE front door.** Lighthouse grade + true findings; the adoption vehicle | Format: advisory · **decidable** (deterministic read) |
| `lint` | Turn the deterministic findings into a stable CI gate (refs · integrity · contracts) | The **gate** — regressions fail the build (exit 0/1/2) after you've fixed | Strictness: gate · **decidable** |
| `init` | Scaffold a typed spec + wire CI/plugin — only when a rule needs one | **Graduation**, not the front door; for harness-STRUCTURE rules no linter expresses | Format: markdown→spec · **decidable** |
| `compile` | Render every typed authoring artifact (spec, hooks) → native config + `.md` | Produces the enforcement `init` set up; model 1× at compile-time, CI = native linter | Format: spec→native · **decidable** |
| `eject` | Hand a managed file back as plain markdown, anytime | The **reverse door** — proves the spec is opt-in, never one-way | Format: spec→markdown · **decidable** |
| `test` | Run `*.harness.*` deterministic tests, no API key | Harness-testing tier 1 — assert the assembled harness's logic, free/every-commit | Strictness: gate · **decidable** |
| `eval` | Run `*.eval.*` against the **real model** (trials, mean ± se) | Harness-testing tier 2 — the statistical residual a unit runner can't hold | **model-gated** (the residual side) |

**Skills are not verbs — they are the fix path, and that's the whole anti-sprawl mechanism.**
`strengthen` writes a picked finding into the repo's **native** linter config (code-quality
rules) — the "fix" step of the funnel, no new runtime, no new command. `adopt-spec`, `edit-spec`,
`debug-my-harness`, `test-harness` drive the spec / harness layers conversationally. A finding
becomes an action through a skill, so the verb count stays fixed while capability grows.

**Two axes, kept separate** (§ "First-contact hygiene"): the **format** axis is *how you write
it* — markdown ↔ typed spec, moved only by `init`/`compile`/`eject`; the **strictness** axis is
*how much it binds* — advisory `audit` read → native-config enforcement (`strengthen`) → CI gate
(`lint`/`test`). No verb moves both dials, and nothing moves either until the user chooses.

**Why not more verbs:** every capability we could add is already reachable as an `audit` finding
routed to a skill, or a flag on a verb that already owns that axis — so a bigger surface would
only give newcomers a door to choose wrong. One front door, a small fixed set behind it.

## The adoption model — audit-as-score is the vehicle

`audit` gives a grade you want to make green (Lighthouse mechanic). **Fixing** moves the score,
not an "adopt" event. The first honest audit can reveal MORE than the user knew (hidden
violations of their own rules) → the score dips → the one-PR fix + CI lock → it climbs and stays.
Reveal, then relief. Feel-good receipts (X refs verified · Y rules enforced · Z violations fixed
· N contracts checked · blast-radius bounded) + "you score A vs ecosystem median C" (audit
already ranks multiple harnesses). This vehicle IS the measurement-authority engine — the
adoption funnel and the leaderboard moat are one artifact.

## First-contact hygiene (never fight the user)

`audit` and the first pass **write nothing** and **assert nothing false**. Ref-verification is
advisory (a nudge, never blocks, never written into the file) because it can false-positive
(globs, build-time files, refs inside code examples, URLs). Enforcement is always an explicit
opt-in the user drives. Format (how you write it) and strictness (how much it binds) are
**separate dials**; nothing moves a dial until the user chooses.

## Reconciliation ledger — docs that still assert the old framing

Fix these when v2 ships (do NOT rewrite unbuilt behavior into user-facing docs prematurely; the
canonical stance is HERE):

| Doc | Superseded claim | Corrected stance |
| --- | --- | --- |
| `CLAUDE.md` (Positioning para) | "spec-first… typed spec is the source of truth… `init` adopts a CLAUDE.md into one… markdown compiled as a build artifact" | audit-first; markdown is source of truth; native config is the enforcement runtime; spec is optional authoring layer. (Edit `CLAUDE.md.spec.ts` + recompile — dogfood.) |
| `docs/spec-format.md` | "The spec is the source of truth; the markdown is a build artifact." | true only for JS/TS harness-structure specs; for a hand-edited CLAUDE.md the markdown is the source; the spec (if any) is a sidecar authoring layer |
| `docs/markdown-mode.md` | markdown as the "on-ramp" beneath the spec; "graduate to a spec" | markdown is the DEFAULT source, not a lesser on-ramp; the spec is an optional graduation for harness-structure only |
| `docs/verifying-instruction-files.md` | spec-managed lint framing | verification is advisory-first and runs on the native markdown; enforcement lands in native linter config |
| `docs/rules/require-instructions-spec.md` | nudges every CLAUDE.md toward a `.spec.ts` | off by default; a typed spec is a graduation, not a requirement — never nudge a code-quality-only CLAUDE.md toward TS |
| `docs/README.md`, `docs/agent-setup.md`, `docs/cli.md`, `docs/comparison.md` | "spec-first with a markdown on-ramp" positioning | audit-first; spec is optional JS/TS power-tool |
| `src/cli-commands.ts` | `init`/adopt as the primary path | `audit` is the front door; `init` is graduation |
| `README.md` (Lint subsection, Quick-start, FAQ) | "`init` writes a spec… `compile` turns that back into the `CLAUDE.md`… your agent edits the spec" (markdown = build artifact); "adopt it into a spec" | hero is already v2 (audit-first, native ESLint in Proof 3); reconcile the lower copy to match — lint reads the hand-edited markdown (source of truth), enforcement lands in native config, spec is optional graduation. (Edits applied 2026-07-15 on `claude/adoption-direction-v2`; the hero already ships the v2 claim, so this removes an internal contradiction rather than adding an unshipped one.) |

## See also

- `zernie/mine` `vigiles/s49.md` — full design record (A–F) + private strategy/visa framing.
- `research/audit-lighthouse-design.md` — the audit report design (the vehicle).
- `rule-compiler/README.md`, `rule-compiler/RESULTS.md` — the compile-1×-run-in-native-CI architecture.
- `docs/railway-subagents.md`, `docs/spec-format.md` — the harness-structure power features the spec keeps.
