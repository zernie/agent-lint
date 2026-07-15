---
status: spec
topic: audit
---

# `audit` rule-compile tier — make your CLAUDE.md rules real, from the report

> Design spec (2026-07-13). Turns `audit` from "here's what's broken in your config"
> into "here's what your own rules would catch **right now** — N real violations — and
> here's the enforcement, one click away." Engine is the sibling **agent-rules-compiler**
> (the `compile-rules` skill + `gate.js` `runGate`); vigiles `audit` is a CONSUMER, not a
> reimplementation. Locked after two Fable red-team passes.

## The one-liner

For each prose rule in the repo's `CLAUDE.md` / `AGENTS.md`: is it enforceable? If it maps
to a lint rule you already have, **compile it, run it, and show the real violations** in the
audit report; offer the rest on demand. Prose becomes proof.

## Two surfaces (the whole design hinges on this split)

|                                     | DEFAULT audit (no consent)                                                                           | OPT-IN tier (own-repo, consented)                                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runs a model?                       | **No**                                                                                               | **Yes — on the user's Claude sub ($0 metered, like `eval`)**                                                                                                             |
| Safe on a FOREIGN repo/marketplace? | Yes                                                                                                  | No — own-repo only                                                                                                                                                       |
| What it does                        | Cheap **divergence teaser** (deterministic): "some rules here map to lint rules your config has OFF" | Full analysis: extract every rule → classify → score → compile the easy ones → run → violations                                                                          |
| Consent                             | none                                                                                                 | the **existing** `decideExecute` consent (audit already asks once at a TTY, remembers `audit.measure` in `.vigilesrc.json`) — extend its disclosure wording; NO new gate |

The determinism guard exists ONLY for the default/foreign surface (vigiles's "audit is
read-only, safe on any repo, no model" promise). The moment you opt in on your own repo,
use the model freely — that's what the consent is for.

## The opt-in pipeline (per rule) — all model-driven, on sub

Reuses the `compile-rules` skill verbatim (classify → REUSE-over-synthesize → gate →
dry-run → manifest). vigiles drives it and renders the result. Per rule:

1. **Extract + classify** (model): atomic imperative rule → IR `{surface, polarity, target, exceptions}`.
2. **Difficulty score 1–10** (model, one-shot): displayed on the per-rule button so the user
   sees effort/cost _before_ spending. **The number is a DISPLAY, never the auto gate** (see invariants).
3. **Route by surface:**
   - `ast`/`imports` + **maps to an already-installed rule (tier-a reuse)** → the AUTO lane.
   - `ast`/`imports` needing a synthesized/meta-config checker (tier-b/c) → **button** (copy-command).
   - `vcs`/`process`/`shell` (hook surface) → **WARN only; create nothing** (see Hooks).
   - `docs`/semantic → **declared** honestly unenforceable.
4. **Gate** (`runGate`, deterministic): a compiled checker ships as a violation ONLY if `kept`
   (passed self-test + blind gold). `abstain-*` / `declare` → shown as "attempted, not
   enforceable, here's the counterexample," never as a violation.
5. **Dry-run** the kept checkers against the repo → real violations with file:line.

### The auto-showcase (the "wow", ≤3 rules)

Auto-build lane = **tier-(a) direct-installed-rule reuse ONLY** (not "difficulty ≤3" — that
would smuggle in leak-prone tier-b selectors that _look_ easy). These are model-free to route,
gate-trivial (the installed rule was validated upstream), fast. Cap ~3, sorted by hit count.
Everything else waits for a button.

### Show-off never lands empty — tier the fallbacks

- **A** tier-a match + ≥1 hit → real violations (the demo case).
- **B** tier-a match + 0 hits → "prose rule verified clean — enable it" (a POSITIVE finding).
- **C** rules exist, no reuse match → inventory + per-rule compile buttons ("N candidates need the compiler").
- **D** no `CLAUDE.md`/`AGENTS.md` or foreign repo → section absent (same as the existing `adoptable` field).

Framing must NEVER promise violations. Demo value concentrates on own-repo JS/TS.

## Buttons = copy-command (reuse `Adopt.tsx` verbatim)

The report is a static single-file HTML rendered from `AuditReport` JSON; it CANNOT execute.
vigiles already emits CLI commands for exactly this (`report/src/components/Adopt.tsx`:
static → copy the command; `--serve` → live-trigger). Each un-compiled rule row carries a
`command` (`npx vigiles compile --rule=<slug>`, or the agent-flow phrasing "ask your agent to
run compile-rules on rule N" — arguably more honest since the pipeline is a skill). Copy on click.
**Report NEVER spends** — the click copies; the user/agent runs it in a terminal where cost is
visible and per-rule. The button copy must say a synth compile can legitimately conclude
"not enforceable (gate-abstained), here's the counterexample" — so the first abstain doesn't
read as a broken purchase. **CUT for v1:** a `--serve` live-compile endpoint (breaks serve's
no-exec/no-model/tiny-blast-radius contract), queue mechanics.

## Hard invariants (do not violate)

1. **Difficulty ⟂ gate.** Difficulty selects candidates (cheap prefilter); the gate is the trust
   filter (catches the measured 84–96% silent-leak). Even a score-1 rule must pass the gate
   before its violations show.
2. **Hooks NEVER auto-build, at any difficulty.** A bad lint rule = a false warning (annoying,
   reversible, CI-visible). A bad hook = blocked legit work OR **false safety** — which is
   _literally vigiles's flagship finding_ (copied hooks 2/7, compiled 7/7). Auto-installing an
   under-blocking hook reproduces the exact defect vigiles exists to expose. Free tier **WARNS
   only, creates nothing** (a green "hook created" makes users stop watching — the same
   false-safety failure). The explicit button may create an **experimental-labeled, own-repo,
   consent-gated, gated** hook; shell/dangerous rules route to vigiles's **compiled-hook path**,
   not a synth grep guard (the seam the skill already draws).
3. **No denominator in the free tier.** You can't get "X of 40 rules" without a model. Free tier
   speaks divergence ("some rules map to a lint rule your config has OFF"), not a count.
4. **Report never spends.** Model runs inside the invoked skill on the user's sub; the report
   only copies commands / renders results.
5. **No duplication.** One engine (skill + `gate.js`), two entry points (the compiler plugin +
   this tier). vigiles depends on the engine as a library, loaded ONLY in the opt-in tier.

## Data model

Additive optional `rulesInventory` on `AuditReport` (schemaVersion unchanged), per candidate:
`{sourceLine, intent, surface, mappedRule?, configState: "on"|"off"|"unknown", difficulty?, gateStatus?, violations?, command}`.
Rendered as ONE report section, not a 6th ring.

## MVP + cuts

MVP: (1) additive `rulesInventory` field; (2) default divergence teaser (deterministic, textual
config grep — NOT config-exec, which is the RCE path; word-boundary-tightened keyword match,
FP-measured on ~10 real CLAUDE.md files first); (3) opt-in tier behind the existing consent
(own-repo): drive `compile-rules` → auto-showcase tier-a top-≤3 with A/B/C/D framing; (4) buttons
= copy-command via the `Adopt.tsx` pattern, with difficulty displayed.
CUT: `--serve` compile endpoint, tier-b/c auto, all auto-synthesis, queue mechanics, per-rule
consent UI, denominators, hook auto-build.

## Paper note

The paper artifact (the adversarial gate + blind gold-set + inter-rater measurement) lives in
agent-rules-compiler and is UNAFFECTED — strengthened, actually: this tier is its real-world
deployment (the gate powering LLM-authored rules against production code inside a shipped tool).

## Build status (2026-07-13)

- **DONE — the deterministic detector** (`src/rule-inventory.ts` + test): pure
  `buildRuleInventory(instructionText, configText, {linters?})` → `RuleInventoryItem[]`.
  FP-safe (rule-name/code-token keywords, whole-token match, every bare-word trigger
  dropped; measured 107 raw garbage hits → 0). **Multi-linter by shape, ESLint-first by
  data** — Ruff/Clippy/Pylint/RuboCop/Stylelint are additive entries, no code change; the
  opt-in tier should resolve enablement via the existing `checkLinterRule` engine.
- **NEXT:** wire `rulesInventory?` onto `AuditReport` (mirror `adoptable`) + a report
  section + copy-command buttons (`Adopt.tsx`); then the opt-in model tier (drive
  `compile-rules` → gate → run). Public README/docs update only once it renders for a user
  (no vaporware).

## Provenance

Two Fable red-team passes + the founder's refinements (difficulty score, hook handling,
model-on-sub, "audit should be incredibly useful"). Engine: `zernie/agent-rules-compiler`
(`skills/compile-rules/`, `rule-compiler/gate.js`, `rule-compiler/catalog/rule-map.json`).
