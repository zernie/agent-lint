---
status: idea
topic: audit
---

# Adoption-gateway preview — "what would vigiles catch in YOUR repo?"

> Internal design doc (the user-facing how-to, when this ships, will live in
> `../docs/`). Written 2026-06-27, in PR #49's review thread, after the founder
> challenged the deterministic-spec-creation premise. The conclusion that survived:
> **extraction is an LLM job; verification is the deterministic moat — compose them,
> don't pick one.** No code yet — this is the frame to build against.

## The problem this solves

`vigiles audit` today grades the **hygiene of what already exists** — tool
contracts, MCP, hook events, description overlap, untested surfaces. That's useful
for someone already on vigiles. It does **nothing** for the newcomer, who needs the
one answer that drives adoption:

> **"What would vigiles catch in MY repo, right now, if I adopted it?"**

The whole positioning calls `audit` the adoption front door (see
`audit-lighthouse-design.md`), but the front door
currently opens onto a hygiene report, not a personalized proof of value. This doc
is the missing piece: a preview that shows a non-adopter the concrete bugs a spec
would catch in their harness today.

The user framed the target metric well: **`refs added` = N** (the verifiable
reference surface vigiles would protect) and **`caught errors` = M** (of those, how
many are broken in this repo _right now_). M is the proof.

## The premise we rejected: deterministic spec creation

The first sketch was "deterministically generate sibling specs for every CLAUDE.md /
skill / subagent and count the refs." **That doesn't work, and our own code already
says so.**

- **Extraction is a semantic job.** Turning prose into a marked reference —
  "always await your promises" → `enforce("@typescript-eslint/no-floating-promises")`,
  "the auth module" → `dir("src/auth")` — is a mapping a regex can't do. Regex can
  only catch tokens that are **already machine-shaped**: `npm run build`, a backticked
  `src/foo.ts`, an already-namespaced rule name.
- **Those machine-shaped tokens are the LOW-value cases.** If the author already
  wrote `@typescript-eslint/no-floating-promises` in prose, they did the hard part;
  catching it is cheap and the adoption upside is small. The **high-value** case is
  the prose intent that _isn't_ machine-shaped — and that's exactly what deterministic
  extraction misses.
- **`adopt.ts` already conceded this.** The deterministic markdown→spec path
  explicitly infers **no rules** — it produces guidance-only specs, with a comment
  that cross-referencing is "strengthen's later job" (i.e. the model's). We decided
  long ago that deterministic inference is unreliable; the gateway must not contradict it.

So: deterministic _creation_ is out. But that does **not** mean "just run an LLM and
trust it" — an LLM that both extracts AND judges can hallucinate a rule name and
report a false pass. The fix is to split the two jobs across the two engines.

## The architecture: LLM proposes, deterministic disposes

Two engines, each doing what it's good at, with the deterministic half **guarding**
the probabilistic half:

1. **LLM drafts** the sibling spec — reads the CLAUDE.md / skill / subagent prose and
   proposes marked refs (`enforce(...)`, `file(...)`, `cmd(...)`, `dir(...)`). High
   recall, including natural-language intent the regex can't see. _May hallucinate._
2. **Deterministic engine verifies** every drafted ref against the 7-catalog
   cross-ref engine (`linters.ts`) + `existsSync` + `package.json`. A hallucinated
   rule → "doesn't exist." A real-but-disabled rule → **"broken right now."**

The elegant property: **the headline number is trustworthy even though the
extraction was probabilistic.** The model never gets to _assert_ a pass — only the
deterministic verifier does. The LLM supplies recall; the moat supplies the verdict.
This is the same division the whole product rests on (probabilistic compliance vs.
deterministic constraints), applied to adoption.

### Honesty boundary

- **False positives are bounded** by the verifier (the model can't make a broken ref
  read as passing). So M ("broken now") is a floor you can trust.
- **False negatives remain** — even the LLM won't extract every reference, and
  undecidable prose stays undecidable (`reference-verification-limits.md`). So the
  surface number N is "**at least** N verifiable references," framed as a floor, never
  "we found everything." Underclaiming is the honest failure mode and still compelling.

## Where it sits in `audit`

It is a **model-gated tier behind the same one consent as the trigger tier** — NOT a
new free deterministic ring.

- **The free rings stay deterministic.** This preview costs model tokens (the LLM
  draft), so it runs only when the user says yes at the consent prompt, exactly like
  "do your skills fire?" The audit's read-vs-run line is unchanged.
- **It does not mutate the repo.** The draft is ephemeral (in memory / a temp dir);
  the preview reports "vigiles would catch M issues — run `vigiles init` to adopt."
  Writing the spec is `init`/`strengthen`'s job, not the preview's (keeps `audit`
  side-effect-free even in its model-gated lane — the only thing it spends is tokens,
  the only thing it touches is read-only catalogs + fs reads).
- **Multi-harness by construction.** Drafts from the instruction file the active
  layout declares (CLAUDE.md for Claude, AGENTS.md for Codex) and the per-layout
  skill/subagent surfaces; thread the resolved adapter, no CC literal
  (`adapter-aware-lint-rules`).

### The output

```
Adoptability — what vigiles would lock in
  vigiles drafted a spec from your CLAUDE.md + 4 skills:
    23 verifiable references found
     3 broken right now:
       ✗ eslint rule "import/no-cycle" is referenced but not enabled
       ✗ `npm run typecheck` referenced — no such script in package.json
       ✗ file "docs/api.md" referenced — not found
  → run `vigiles init` to adopt the spec and catch these at edit time.
```

A separate **Adoptability** section, deliberately **not folded into the A–F rings** —
a non-adopter shouldn't have their grade tanked for not using vigiles yet. It's an
invitation, not a judgment.

## What we already have vs. the gap

| Piece                                            | Exists?                    | Notes                                                               |
| ------------------------------------------------ | -------------------------- | ------------------------------------------------------------------- |
| LLM draft: guidance→enforce                      | ✅ `strengthen` skill      | model-driven rule mapping                                           |
| LLM draft: markdown→spec                         | ✅ `adopt-spec` skill      | model-driven adopt (vs. the guidance-only deterministic `adopt.ts`) |
| Deterministic verify: 7 catalogs                 | ✅ `linters.ts`            | the moat                                                            |
| Deterministic verify: paths/scripts              | ✅ `compile.ts` validators | `existsSync` / `package.json`                                       |
| **Compose into a preview + the M-broken number** | ❌                         | the gap                                                             |
| **`audit` invokes it behind consent**            | ❌                         | the gap                                                             |

So the build is mostly **composition**, not new primitives: drive the existing LLM
draft skills headlessly, feed their drafted refs through the existing verifier,
count + report. The novel surface is the ephemeral-draft orchestration and the
Adoptability section/number.

## Open questions (decide before building)

1. **Cost / scope of v1.** Drafting a spec per skill + subagent is many model calls.
   Start with the **instruction file only** (one draft, highest signal, cheapest)?
   Then add skills/subagents behind a flag.
2. **Caching.** Reuse the eval record/replay cache (`eval-cache.ts`) so re-running the
   preview after a small edit replays the draft instead of re-spending tokens?
3. **Draft fidelity.** Do we keep the ephemeral draft around for the user to inspect
   (`--write-draft`) or strictly in-memory? Leaning in-memory; `init` is the writer.
4. **Scoring shape.** Adoptability as a standalone number (0–100 = M/N resolved?) or
   purely a count + list? Leaning count + list — a ratio invites gaming and the raw
   "3 broken now" is the more visceral pitch.
5. **Headless honesty.** In `--json`/CI (no consent), it stays a one-line nudge like
   the other model-gated checks — never silently spends tokens.

## Build increments (when greenlit)

1. **Spike:** headlessly drive the `adopt-spec`/`strengthen` LLM draft on a fixture
   CLAUDE.md → drafted refs → run through `linters.ts` + fs validators → print N / M.
   Prove the "LLM proposes, deterministic disposes" loop end-to-end.
2. **`adoptability.ts`** detector + the ephemeral-draft orchestration (instruction
   file only, v1), reusing the eval driver for the model call.
3. **Wire into `audit`** as a model-gated tier under the existing `decideExecute`
   consent; add the Adoptability section + the `AuditReport` JSON field (versioned,
   additive) + the HTML section (`report/`).
4. **Extend** to skills/subagents behind a flag; caching; multi-harness (AGENTS.md).

## See also

- `audit-lighthouse-design.md` — the audit model + every decision in the rings arc.
- `reference-verification-limits.md` — the undecidability ceiling the honesty
  boundary respects.
- `install-enforcement-dx.md` — `init` auto-adopt (the writer the preview hands off to).
- `skill-authoring-pains.md` — the refs-rot pain the preview makes visible.
