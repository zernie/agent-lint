# HANDOFF — volatile cross-session state

> **Overwrite each session; keep ≤120 lines.** The durable map is
> `research/roadmap.md` — this is the orientation pointer, not the record.
> The SessionStart hook injects this file as context so a new session starts
> oriented — **read it first.** It is git-TRACKED and the container is EPHEMERAL
> (repo re-cloned each session), so an update persists ONLY if you **commit + push**
> it. Refresh it on a "handoff" request or at end of session.

## RESUME HERE — CLI verb consolidation + docs/README overhaul (2026-06-24)

Branch `claude/hook-typing-guard-bugs-xa0g4h`, latest `ea53d4a`, tree clean once
this file is committed. All work pushed. **No PR opened yet** — open one when ready
(see the BREAKING note below). Local test baseline: ~1590 pass / ~11 skip / **1 fail
= `dialect-drift.test.ts` ONLY** (environmental: container CC is newer than
`VALIDATED_CC_VERSION` 2.1.187; CI pins it → green there). Everything else green.

### SHIPPED this session (don't rebuild)

- **CLI verb consolidation — BREAKING (`c9aac5b`).** 13 → 8 human verbs. `measure`→
  `scan --trigger`, `explain`→`scan --explain`, `refs`→folded into `lint`,
  `generate-types|schema|harness`→`generate <kind>`. Final surface:
  init/compile/lint/test/eval/scan/scaffold-test/generate (+ hidden `hook-runtime`).
  scan reuses handleMeasure/handleExplain behind the flags. Drove the ~73-ref sweep
  off the self-command-refs dogfood.
- **cli.md GHA split (`80ab875`).** GitHub Action section → `docs/github-action.md`;
  cli.md 718→619.
- **`compile` auto-refreshes an existing `harness.gen.ts` (`09be8ae`)** + **fixed the
  dist collision (`3eba1c5`)**: `src/CLAUDE.md.spec.ts` compiled to the same dist path
  as the root spec and clobbered CLAUDE.md → tsconfig now excludes `src/*.md.spec.ts`
  (nested specs load via the tsx fallback).
- **Nested `src/CLAUDE.md` + `high-bar-for-new-commands` rule (`069bc81`).**
- **`prefer-compiled-hooks` lint rule (`76ea52d`).** ONE repo-level recommendation
  (default warn, ℹ) nudging hand-written hooks → compiled `vigiles/hook`; message
  links docs/compiled-hooks.md. Detector `manualHookCount` in scan.ts (shared by
  lint+scan). NOT per-hook; opt-out; honest "form-based" caveat in its doc.
- **Public-docs hygiene (`cd597c9`,`2303f26`,`c26f711`,`632e9e9`).** Stripped ALL
  research/ links + bare name-drops + the word "moat" + the "what works vs hype"
  benchmark banner from README+docs/. Added `no-internal-links-in-public-docs` rule
  + a strategic-vocabulary clause in `public-vs-internal-docs`. New
  `research/eval-startups-positioning.md` (benchmark = flywheel NOT moat; attestation
  = the only defensible eval niche).
- **README overhaul (`620c99c`,`3d2d8ed`,`c54aa0b`,`ea53d4a`).** Multi-persona review
  fixes; benefits-forward hero (concrete failure modes, keeps Agent=Model frame);
  condensed table cells; **"you don't hand-write specs — your agent does"** reframe;
  downplayed typed-spec in callouts (benefit-first, not "a typed spec is a program");
  cost de-dupe; "Not for you if…" line. A **README DIRECTION comment block** is at the
  top of README.md — read it before editing the README.

### Decisions of record (don't relitigate)

- **Verb surface is 8 + hook-runtime.** Adding a verb must clear the
  `high-bar-for-new-commands` bar (src/CLAUDE.md). A PR for this branch is BREAKING —
  its title needs `!` (e.g. `refactor(cli)!: …`) so semantic-release bumps right.
- **Rejected: `require-hook-spec` AND a `hook-false-confidence` detector** — form-based
  / post-hoc / reimplements `guardrail-check`. The chosen shape is the single
  `prefer-compiled-hooks` nudge + the existing `untested-hook`/`guardrail-check`.
- **Benchmark = acquisition flywheel, NOT a moat** (eval-startups critique). Lead with
  verification (Lint/Guard); weight attestation (capability-diff, guardrail proof).
- **Public docs name the user BENEFIT** — no `moat`/`measurement-authority`/`flywheel`
  vocabulary, no `research/` links/name-drops; downplay the typed spec (it's the
  opt-in, auto-enforced next step, never a headline).

### Gotchas

- CC-on-web remote env: GitHub via `mcp__github__*` (NO `gh` CLI). `claude` CLI in the
  container is for harness tests (upgraded to match CI).
- Before commit: `npm run build` + `npx vitest run` + `npm run fmt:check`; recompile
  `CLAUDE.md` after editing `CLAUDE.md.spec.ts`; `self-command-refs` fails CI on a
  stale `vigiles <cmd>` ref (it only catches the INVOCATION form, not bare names/paths).
- Conventional commits + `!` on breaking. NO session links / model IDs in commits.
- Coverage gate (`npm run coverage`) 100% lines/funcs/stmts, 90% branches (explicit
  include list in vitest.config.mjs).

### Open threads / next

- **Open the PR** for this branch (BREAKING title). Then optionally subscribe to PR
  activity for autofix.
- **`write-hook`/`harden-hook` authoring skill** — the carrot `prefer-compiled-hooks`
  points at; NOT built.
- **P1 (roadmap):** deterministic `no-internal-links-in-public-docs` lint rule — the
  bare `research/X.md` name-drop form the link-check can't catch (hand-held for now).
- README optional follow-ups (user-judgment): a static/terminal-cast for Guard/Test
  parity; a harder JS→TS / asm→C analogy if wanted.

## Don't re-read unless the task needs it

- `research/roadmap.md` — the durable Now/Next/Later map.
- `research/eval-startups-positioning.md` — the benchmark-vs-attestation positioning.
- `research/measurement-authority.md` — the measurement pivot (now flagged: flywheel
  not moat).
- `docs/compiled-hooks.md` — compiled hooks (what prefer-compiled-hooks points at).
