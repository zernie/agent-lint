---
status: active
topic: positioning
---

# Reference verification — what's deterministic, what isn't, what to delegate

> Status: synthesis (2026-06-08). The conceptual boundary of vigiles's core:
> which references can be verified deterministically, which fundamentally cannot,
> the existing-tool landscape, and the delegate / ignore / own rule. Companion to
> `benchmarks-runtime-gates.md` (the evidence) and `symbol-verification.md` (the
> shipped design).

## The thesis: verify the map, don't police the route

The benchmarks (`benchmarks-runtime-gates.md`) drew a hard line. A runtime gate
that **forces a behaviour** (run tests, write a test first, mark a reference)
re-checks what a capable agent already does, or is gamed when the check is a
proxy. But the **truth of a reference the agent reads** — does this rule exist
and is it enabled, does this file/symbol exist — is something the agent _cannot_
self-check (it trusts the doc), is _not_ gameable (existence is a static fact),
and is _not_ model-dependent. vigiles verifies the map the agent reads; it does
not police the route the agent takes.

## The gap: proxy vs judgment

Determinism has a precise boundary, and it is the difference between a _fact_ and
a _judgment_:

- **Verifying a declared reference is a fact** → gap-free. Given the mark
  `` `vigiles:symbol src/x.ts#foo` ``, "does `src/x.ts` define `foo`" is decidable
  and unfakeable.
- **Forcing the agent to declare references is a judgment** → gameable. "Should
  this prose token be a verified reference?" is undecidable, so any hook that
  forces it must offer an opt-out (`vigiles:ignore`), and the opt-out _is_ the gap.

> A deterministic check that forces a behaviour is always a deterministic
> **proxy** for an underlying **judgment**. The proxy is decidable; the judgment
> isn't. Satisfying the proxy without the judgment is "gaming." The gap is the
> distance between them.

Benchmark #4 measured this for the `refs-hook`: told to mark its references, the
agent averaged **2.8 `vigiles:ignore` per run** (3 of 6 runs ignore-gamed
everything) — it satisfied "marked-or-ignored" without the judgment "declare your
real references." Same shape as the TDD gate's fake-red tests.

## Prose references: the undecidable core, and the real trade

You cannot mechanically tell a load-bearing code reference (`` `chargeCard` ``)
from code-shaped prose (`` `name` ``, `` `id` ``). So prose verification has two
designs, and you cannot have both halves of either:

| design                           | mechanism                                                     | catches renames in unmarked prose? | gameable?                   | severity                                                                                       |
| -------------------------------- | ------------------------------------------------------------- | ---------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------- |
| **active** (mark + hook)         | author/agent writes `vigiles:symbol`; hook forces it          | no (only what's marked)            | yes (`vigiles:ignore`)      | hard **error**                                                                                 |
| **passive** (symbol-table sweep) | flag distinctively-code-shaped tokens ∉ the project's symbols | **yes**                            | **no** (no per-ref opt-out) | **warning** only (false positives on illustrative names; can't tell rename from never-existed) |

The trade is irreducible: **hard-gate + gameable** vs **warning + ungameable**.
The passive sweep is the better backstop for the real failure mode (renames in
_unmarked_ prose — what the corpus shows people actually write), precisely because
there is no per-reference opt-out to game; its cost is that it can only warn.

## The corpus reality

Across ~174 real official + community skills (corpus analysis, this PR): file/path
references ~**19%** of inline code spans (the dominant verifiable reference),
commands ~3%, and the file-qualified symbol form **0%** — nobody writes
`path#symbol` unprompted. Real symbol references appear as bare identifiers or
`module.member` — exactly the ambiguous, resolution-needing forms. So the
_safely verifiable_ surface of real instruction files is **files and commands**;
symbols are rare and mostly need resolution we delegate.

## The doc-format landscape — and why plain markdown can't self-fix

Every mature system that catches a renamed symbol in docs falls into two classes:

- **Explicit-link systems** — Sphinx (`` :py:func:`x` ``, nitpicky errors),
  rustdoc intra-doc links (`[x]`), TypeDoc (`{@link x}`), Doxygen (`\ref x`).
  These resolve **explicit, author-written links** against the symbol table. They
  are `vigiles:symbol` with a mature ecosystem — same category, same omission gap.
  None verify a bare backtick in prose.
- **Identity-based systems** — Unison (content-addressed; doc refs point at a
  definition's **hash**, so a rename is a metadata op that can't break a ref),
  structured/projectional editors, IDE symbol-IDs, Notion/Roam block-refs. These
  _truly_ fix it: the reference is bound to identity at authoring time, so there
  is nothing to verify later. But they require an **identity-aware authoring
  environment** — not a plain `.md` file.

CLAUDE.md / SKILL.md are deliberately **plain, portable markdown** (any agent,
any tool, no special editor). That permanently places them in the **name-based**
world, which cannot structurally self-fix — _which is exactly why an external
verifier has to exist._ A content-addressed format wouldn't need vigiles; plain
markdown does.

## Delegate / ignore / own

Existing tools split by **artifact**, and only one group is even about ours:

- **Group A — API-docs generators** (Sphinx, rustdoc, TypeDoc, Doxygen): verify
  links inside _source doc-comments / their own doc projects_, not a repo-root
  CLAUDE.md. → **Ignore** — different artifact; not delegable, not competing.
- **Group B — markdown code-block testers** (`typescript-docs-verifier`,
  rustdoc doctests, `pytest-markdown-docs`, `deno check --doc`): compile/run
  fenced blocks in `.md` as real code — the compiler is the cross-referencer, so
  it's **gap-free** (no detection heuristic, no opt-out). → **Delegate** —
  orchestrate them like vigiles already orchestrates 6 linters; never reimplement.
- **Group C — inline prose references + cross-linter rule/file/cmd**: no tool
  verifies a bare prose backtick, or "is `eslint/no-console` enabled," for an
  instruction file. → **Own** — the unfilled niche and the moat.

> **Update (2026-06-19): the niche filled, but unevenly.** A whole category of
> dedicated instruction-file linters appeared in 2025–2026 (agnix, AgentLint,
> claudelint, cclint×2, ctxlint, agents-lint, AgentEval, …). The cheap half of
> Group C is now **commoditized** — file-path and npm-script existence ship in
> agents-lint/ctxlint/agnix, so vigiles's `file()`/`cmd()` are at parity, not
> ahead. What stayed **uncontested** is the harder half: catalog _resolution_
> (vs the competitors' hardcoded tool/event sets and prose heuristics), the
> harness-surface cross-references (subagent tool contracts, MCP tool→server,
> hook-event typos), and FP-calibration against real plugins. The linter-rule
> catalog check specifically is real but **narrow/low-incidence** and should not
> lead the moat story. Full landscape + the honest moat assessment:
> `instruction-file-linter-landscape.md`.

## The floor

**Omission is irreducible.** No tool forces you to document something — "you
should have referenced X here" is pure judgment. So the honest ceiling for plain
markdown is: **verify the declared reliably (gap-free), warn on a passive
symbol-table sweep (ungameable, lossy), and accept that what was never written
cannot be checked.** Push references toward _compilable_ form (code blocks, typed
spec imports) and the gap shrinks to omission alone; leave them as prose and the
gap is the whole undecidable judgment.

## See also

- `research/benchmarks-runtime-gates.md` — the evidence that forcing is gamed.
- `research/symbol-verification.md` — the shipped `vigiles:symbol` design.
- `research/harness-testing.md` — testing the harness (the no-undecidability-ceiling pillar).
- `research/skill-authoring-pains.md` — the drift pain this addresses.
- `research/instruction-file-linter-landscape.md` — the 2026 competitor wave (agnix, AgentLint, cclint, …) and where the moat actually holds.
