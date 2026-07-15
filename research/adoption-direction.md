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
as `@vigiles/compiler`: model 1× at compile-time, CI = clean native linter, $0. This is the Rule
of Least Power applied to enforcement homes.

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

## See also

- `zernie/mine` `vigiles/s49.md` — full design record (A–F) + private strategy/visa framing.
- `research/audit-lighthouse-design.md` — the audit report design (the vehicle).
- `compiler/README.md`, `compiler/RESULTS.md` — the compile-1×-run-in-native-CI architecture.
- `docs/railway-subagents.md`, `docs/spec-format.md` — the harness-structure power features the spec keeps.
