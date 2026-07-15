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

## The five enforcement homes — every prose rule lands in exactly one

| Home | What it is | Enforces or checks? | Cost to vigiles |
| --- | --- | --- | --- |
| **1. Off-the-shelf lint** | prose maps to an existing linter rule → flip one config line (`select`/`rules`) | **enforces** (CI blocks) | free, deterministic |
| **2. Synthesized custom lint** | no off-the-shelf rule → generate a checker (custom AST rule / `no-restricted-syntax`) | **enforces** (CI blocks) | **$0** (user's sub, see below) |
| **3. Hook / gate** | a "do X before Y" / "never do Z" / boundary rule → a PreToolUse / pre-commit **hook** that BLOCKS the action in the loop (`vigiles/hook`, compiled-hook instrument; classify `hook` category) | **enforces** (runtime block) | free, deterministic |
| **4. Ref / command verification** | commands, file/script/path refs → check they *resolve* (do the named script/path/tool exist?) — NOT a norm to enforce | **checks** (are the instructions truthful) | free, deterministic |
| **5. Prose** | genuinely semantic/judgment ("comment sparingly", "prefer self-documenting APIs") | neither | n/a |

> **The `~35%` "commands/process/boundaries" bucket is NOT monolithic** — it splits across homes
> 3, 4, 5: boundary / "do-X-before-Y" / "never-Z" rules are **hooks** (home 3, they *enforce* via a
> runtime block — the compiled-hook instrument, the 2/7→7/7 finding); commands + path refs are
> **verification** (home 4, check they resolve); pure process is prose (home 5). An earlier 4-home
> framing lumped hooks into "verified, not enforced" — wrong: a hook *enforces*.

## Measured distribution on real OSS (7 real AGENTS.md, 2026-07-15)

Corpus: openai/codex (Rust), getsentry/sentry + apache/airflow + langchain + browser-use +
mcp-python-sdk (Python), cloudflare/workers-sdk (TS). 125 segmented rules.

- **Off-the-shelf routing: ~10% today** (measured reuse-rate; mcp is a 71% outlier, most files 0–17%).
- **Synthesizable custom: ~40%** (biggest bucket — project-specific rules; probe 5/5 mechanized,
  25–32 LOC each).
- **Off-the-shelf once gaps closed: ~+15%** (clippy for Rust is UNMAPPED → codex routes 0% purely
  from that; plus segmentation-recall misses rules the file even names).
- **Commands/refs/boundaries: ~35%** → splits across homes #3 (hooks — the boundary / "do-X-before-Y"
  / "never-Z" rules, enforced by a gate) and #4 (verification — commands/paths resolve). The DOMINANT
  content of a real AGENTS.md (per GitHub's 2,500-repo study — commands + snippets + boundaries).
- **Genuinely semantic: ~10%** → home #5.

**Net: ~65% of rules mechanizable via LINT (homes 1+2, off-the-shelf + synthesized); hooks
(home 3) enforce many boundary rules on top; verification (home 4) covers commands/refs → ~90%
of a real file gets some vigiles surface, and only ~10% is pure semantic prose (home 5).** NOT the
"~10% niche" an off-the-shelf-only reading implies.

## Breadth benchmark — 21 real rulebooks, Fable-audited (2026-07-15)

The 85%-figure below is of a favorable **code-quality-only** subset. A **broad** run (21 real OSS
rulebooks — codex/sentry/airflow/cloudflare/prisma/vercel/opencode/cal.com/…, 327 segmented items)
gives the honest, less-rosy picture, and it's the one to cite:

- **Off-the-shelf routing: ~4%** (measured; negligible at breadth — the default teaser catches
  almost nothing on its own).
- **Sampled breakdown of the 87% "unrouted"** (n=48, actually synth+run with adversarial edges;
  Wilson CI ≈ ±13pp): **~⅓ compiled into a checker that survived an adversarial probe · ~⅓
  genuinely semantic · ~⅓ not-even-a-rule** (commands / headings / pointers).

**The honest headline (do NOT overclaim):** *"a third of a rulebook is mechanizable, a third is
prose, a third isn't a rule."* Fable's audit killed the "~61% / ~45% enforceable" point estimates —
they stack a **strong-model ceiling** (capable synth-agent, self-judged edges; the production skill
does less), unexecuted router buckets, and a self-judged "not-a-rule" denominator. So: **31% is a
CEILING, not a product number; the 2/13 (~15%) leak rate is a FLOOR.** Don't publish 61%.

**The finding that survives the noise (the durable claim):** **verification soundness tracks
representation depth** — every AST-level checker held its adversarial edge; the only 2 leaks (of 13)
were a regex checker and a context-blind config-selector. AST-not-regex + the gate-must-abstain,
measured on 13 independent real rules. This is the paper's spine, not the enforceable-%.

**Product read:** off-the-shelf routing is a rounding error at breadth → the value is (a) ref/command
verification (home 4, the ~⅓ not-a-rule that's commands/pointers), (b) the opt-in **synthesis tier**
(home 2, the enforceable ⅓, gated), and (c) honest abstention on the semantic ⅓. The highest-leverage
product fix is segmenter **precision** (stop extracting headings/commands as "rules").

> **Segmenter precision — first pass shipped 2026-07-15** (`src/segment.ts`, see `roadmap.md`
> enforcement-tier #1). Two verified-safe gate rejects added — colon-terminated `leadin` headers
> (signal-less procedure/enumeration lead-ins, content lives in the sub-list) and determiner-led
> `description` facts ("The v1 README lives on `v1.x`"). Measured **818 → 789 segments** on the
> 22-file corpus (−29), hand-verified ≈28 clean non-rule drops + 1 edge-case-advice loss, 0
> real-rule test regressions. This tightens the "not-even-a-rule ⅓" toward the true rule surface;
> the remaining E-bucket is pointer / `Label: command` reference rows (home-4 verification targets).

## Synthesis success — measured (code-quality subset benchmark, 2026-07-15)

**Of 34 real code-quality rules** extracted from the 7-file corpus (Py/TS/Rust), each turned into
the least-power enforcement and **actually run** against violating + compliant + adversarial-edge
snippets:

- **off-the-shelf: 53%** (existing ruff/eslint/clippy rule, configured + run)
- **config-selector: 6%** (eslint `no-restricted-*`)
- **custom-AST-works: 26%** (a real AST checker, 9–22 LOC, held on the adversarial edge)
- **genuinely-semantic: 15%** (no sound deterministic check — e.g. "`time.monotonic` *for
  durations*", "action-verb function names")

→ **~85% of code-quality rules mechanizable with a deterministic checker** (defensible range
75–85%). Four load-bearing caveats, or the number lies:

1. **This is 85% of CODE-QUALITY rules, NOT of a whole AGENTS.md.** Code-quality is a *minority*
   of a real file — the rest is commands/process/boundaries (homes #3 hook / #4 verify) + prose
   (home #5). Do not
   read "85%" as "85% of a file." (Reconciles with the ~65%-of-all-rules figure above.)
2. **Synthesizer-sensitive.** The benchmark's model-in-the-loop picked the least-power, *sound*
   enforcement. A weaker synthesizer defaults to regex and ships **leaky** checkers → the gate must
   abstain them (fewer "works", not more false-enforced). This is exactly what the trust-gate is for.
3. **Env-sensitive (Rust).** All 6 Rust rules ran because `clippy-driver`/`syn` were cached offline;
   a colder env drops the mechanizable % by ~15pt (Rust rules become "custom-hard").
4. **Qualifier-stripping.** Some off-the-shelf verdicts enforce a sound *superset* ("ban all
   `eval`") of a semantic rule ("no `eval` on user input") — close, not exact.

**Soundness finding (validates the gate):** of 11 custom checkers, the 2 that used a naive
regex/line pass **leaked** on the edge (flagged `Tester` for a "no `Test` class" rule; flagged a
doc-comment token); the **AST-level version held every time**. The 2 rules whose proxy stayed
leaky are precisely the genuinely-semantic ones — a good adversarial gate makes those *abstain*,
not ship. Direct evidence for AST-not-regex + the trust-gate.

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
| Clippy (Rust) | ✅ route-only (2026-07-15, 7 restriction lints) | ⏳ (Cargo.toml `[lints.clippy]` ConfigProbe pending) | closed the Rust 0% blind spot (`.unwrap`/`panic!`/`unreachable!`/`todo!`/`dbg!`/wildcard-arm); Rust-unambiguous keywords |
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
