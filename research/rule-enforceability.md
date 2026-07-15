---
status: active
topic: linters
---

# How much of a real CLAUDE.md/AGENTS.md is enforceable, and by what mechanism (the one place)

> **Read this before reasoning about "how much of a user's instruction file can vigiles
> enforce."** It is the single cohesive answer, because the picture was scattered across
> `rule-enforcer-design.md` (engine), `audit-rule-compile-tier.md` (how audit surfaces it),
> `adoption-direction.md` (the funnel) and the root `CLAUDE.md` — and that scatter caused
> repeated mis-statements. Distinct from `enforcement-model.md` (which is about the *severity*
> of vigiles's OWN checks — the A/B/C decidability gradient); THIS doc is about routing a
> *user's* prose rule to an enforcement home and the resulting enforceable ceiling.

## The load-bearing correction (the thing that keeps getting mis-stated)

**"No off-the-shelf lint rule exists" does NOT mean "not enforceable."** Off-the-shelf routing is
only the *cheapest* tier. A project-specific rule that no linter ships (e.g. "a function with a
`session` param must not call `session.commit()`") is still mechanizable — a ~25-line custom AST
checker enforces it (empirically verified, 2026-07-15, 5/5 real rules). Conflating "no off-the-
shelf rule" with "not enforceable" under-counts the enforceable surface by ~5×.

## The four enforcement homes — every prose rule lands in exactly one

| Home | What it is | Cost to vigiles | Cost to user |
| --- | --- | --- | --- |
| **1. Off-the-shelf** | prose maps to an existing linter rule → flip one config line (`select`/`rules`) | free, deterministic | none (config edit) |
| **2. Synthesized custom** | no off-the-shelf rule → generate a checker (custom AST rule / `no-restricted-syntax` selector) | **$0** — see below | user's own sub, a few tokens/rule |
| **3. Verified, not enforced** | commands, file/script/path refs, boundaries → check they *resolve* (not "enforce a norm") | free, deterministic | none |
| **4. Prose** | genuinely semantic/judgment ("comment sparingly", "prefer self-documenting APIs") | n/a | n/a |

## Measured distribution on real OSS (7 real AGENTS.md, 2026-07-15)

Corpus: openai/codex (Rust), getsentry/sentry + apache/airflow + langchain + browser-use +
mcp-python-sdk (Python), cloudflare/workers-sdk (TS). 125 segmented rules.

- **Off-the-shelf routing: ~10% today** (measured reuse-rate; mcp is a 71% outlier, most files 0–17%).
- **Synthesizable custom: ~40%** (biggest bucket — project-specific rules; probe 5/5 mechanized,
  25–32 LOC each).
- **Off-the-shelf once gaps closed: ~+15%** (clippy for Rust is UNMAPPED → codex routes 0% purely
  from that; plus segmentation-recall misses rules the file even names).
- **Commands/refs/boundaries: ~35%** → home #3 (the DOMINANT content of a real AGENTS.md, per
  GitHub's 2,500-repo study — commands + snippets + boundaries, not code-quality rules).
- **Genuinely semantic: ~10%** → home #4.

**Net: ~65% mechanizable (homes 1+2); ~90% covered by some vigiles surface (1+2+3).** NOT the
"~10% niche" an off-the-shelf-only reading implies.

<!-- SYNTH-SUCCESS BENCHMARK: pending (running 2026-07-15). Update the "~40% synthesizable" figure
with the measured fraction of real rules that yield a gate-PASSING checker once it lands. -->

## How synthesis works (home #2) — opt-in copy-prompt, $0 to vigiles

The mechanism that keeps getting mis-stated as "vigiles runs/charges for a model." It does NOT.
(`audit-rule-compile-tier.md` is the design of record.)

1. **Default `audit` runs no model** — a deterministic *divergence teaser* ("these rules map to
   linter rules your config has OFF"). Free, safe on any repo.
2. Each un-compiled rule row carries a **copy-command / `CopyPrompt` button**
   (`report/src/components/RuleInventory.tsx`, reusing the `Adopt.tsx` pattern).
3. Click → drives the **`compile-rules` skill in the USER's own agent**, on the **user's Claude
   sub — "$0 metered, like `eval`"**. vigiles itself never calls a model.
4. **Deterministic trust-gate** (`runGate`, blind adversarial gold-set): a synthesized checker
   ships as a real finding ONLY if it passes. This is what makes home #2 trustworthy.

So home #2 costs vigiles nothing — a button that spends the user's own sub, gated for soundness.

## Soundness — the cry-wolf guard (why the gate is load-bearing)

**Soundness scales with parser power. Use the target language's AST (`ast`/`syn`/eslint), never
regex.** A regex/line checker works for conventional code but leaks on edge cases (multi-line
`#[derive]`, `cfg_attr`, aliased imports) → a false "enforced" → the exact cry-wolf failure the
tool's credibility rests on. The adversarial trust-gate rejects the fragile checker before it
ships. Never claim a rule is enforceable off a checker that hasn't passed the gate.

## Linter support (routing + config-state), current

| Linter | Routing (prose→rule) | Config-state (enabled?) | Notes |
| --- | --- | --- | --- |
| ESLint (+TS) | ✅ | ✅ | mature; `no-restricted-syntax` covers many custom rules |
| Ruff (Python) | ✅ net-new intents (2026-07-15) | ⏳ route-only (ConfigProbe pending) | the modern Python default |
| Pylint (Python) | ✅ route-only | ⏳ (on-by-default polarity) | shared Python intents |
| Clippy (Rust) | ❌ GAP | ❌ | Rust AGENTS.md route 0% purely from this — a ruff-like win when added |
| Stylelint / RuboCop / Cedar | verification only (`enforce()`) | — | cross-reference, not prose-routing |

## The naming (a repeat confusion)

- `vigiles compile` = the **spec** compiler (`.spec.ts` → `.md`). Reserved.
- **`@vigiles/rule-enforcer`** (dir `rule-enforcer/`, was `compiler/`) = the **rule** engine
  (prose → enforceable checker: route → synthesize → gate). NOT the spec compiler.

## See also
- `enforcement-model.md` — the SEVERITY/decidability gradient of vigiles's own checks (companion).
- `audit-rule-compile-tier.md` — how `audit` surfaces homes #1/#2 (the copy-prompt tier).
- `rule-enforcer-design.md` — the engine (classify → reuse/synthesize → trust-gate).
- `adoption-direction.md` — the funnel (audit → fix → spec), audit-as-score.
- `src/rule-routing.ts` / `src/rule-inventory.ts` — the routing map + config-state code.
