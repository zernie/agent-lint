---
status: shipped
topic: hooks
---

# Compiled hooks vs the originals — an OSS comparison

> Internal research (2026-06-24). A head-to-head between vigiles's COMPILED hooks
> and the hand-written shapes the Claude Code ecosystem actually ships. Every
> number here is checked in CI, model-free, by `src/hook-oss-comparison.test.ts`
> and `src/hook-dogfood.test.ts` (the oracle is the `DISASTER_CATALOG` in
> `src/guardrail-check.ts`). Public summary: the "Proof: the OSS dogfood" section
> of `docs/compiled-hooks.md`.

## Method (and its honesty caveats)

- **Oracle:** the `DISASTER_CATALOG` — 7 textbook-dangerous PreToolUse events
  (force-push, compound force-push, `reset --hard`, `rm -rf /`, `--no-verify`,
  private-SSH-key read, `curl | sh`). A guard "passes" an event iff it BLOCKS it
  (`runHook` → exit 2 / deny).
- **Originals = faithful RECONSTRUCTIONS of widely-copied idioms** (substring
  blocklist, prefix/glob matcher, grep guard, wrong-exit-code), authored in the
  test. The canonical sources are unlicensed (disler) so we reproduce the SHAPE,
  not the file — same posture as the existing dogfood; provenance below.
- **Two honesty rules** so this isn't a strawman:
  1. **Apples-to-apples on intent.** The evasion/precision/protocol tests compare
     guards that INTEND the same thing (block a force-push) — the compiled one
     wins on a STRUCTURAL property, not on "it enumerated more rules".
  2. **Breadth is labelled as breadth.** The headline "2/7 vs 7/7" is partly a
     function of the compiled guard being WRITTEN to cover all seven — a diligent
     hand-written guard could list seven clauses too. The breadth number shows
     that hand-written guards in the wild DON'T; the _structural_ wins below are
     what a careful author still can't get right by hand.

## The structural wins (non-circular — a careful author can't fix these by hand)

| #   | Win            | Original shape                                | What it does                                                                                                                                      | Compiled                                                                   |
| --- | -------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | **Evasion**    | substring/prefix force-push guard             | catches `git push --force`, **misses** `cd repo && … && git push -f` (compound, [#30519](https://github.com/anthropics/claude-code/issues/30519)) | `command.runs("git push",{force})` is AST-leaf-matched → catches **both**  |
| 2   | **Precision**  | `grep -q "git push --force"`                  | **false-positives** on a benign `echo "…git push --force…"`                                                                                       | sees the only leaf is `echo` → **allows** it                               |
| 3   | **Protocol**   | `exit 1` (not `2`)                            | **looks** like it blocks, enforces **nothing** (false confidence)                                                                                 | the exit code is **emitted**, never hand-written — can't be wrong          |
| 4   | **Capability** | arbitrary shell can read secrets / phone home | unbounded                                                                                                                                         | an import outside `vigiles/hook` **doesn't compile**; artifact **stamped** |

Wins 1–3 are each isolated in `src/hook-oss-comparison.test.ts` (one failure mode
per test); win 4 is the capability/stamp suite in `src/hook.test.ts`.

## The breadth headline (labelled)

| Guard                                   | Blocks (of 7)          | Notes                                                                                               |
| --------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| copy-paste 2-string blocklist           | **2/7**                | only the literals it lists (force-push, `rm -rf /`); the rest are silent gaps                       |
| the real disler `pre_tool_use.py` shape | ~1–2/7 on THIS battery | targets `rm -rf` variants + `.env` — a DIFFERENT subset; the point is enumeration is always partial |
| **compiled `safe-bash-guard.mjs`**      | **7/7**                | by construction — and wins 1–3 hold for each clause                                                 |

The disler row is the honest one: its low score here is because it targets a
different danger subset, not because it's "bad". The lesson isn't "hand-written
scores low" — it's that **a hand-written guard blocks exactly the strings it
enumerates, and the gaps (enumeration AND evasion AND protocol) are silent**. The
compiled guard removes the evasion + protocol failure modes outright, and makes
the enumeration auditable.

## What compiled hooks do NOT do better (the honest other side)

- **Stateful guards** (token-approval / rate-limit / ordering, e.g.
  alexknowshtml/dcg) — the pure vocabulary has no cross-call state. Deliberate
  non-goal; the shell lane (or the `guards.ts` prototype) owns it.
- **Broad I/O actions** (auto-format, TTS, structured logging, dynamic-context
  inject) — these NEED I/O; they belong in `react run("./script.sh")` or the shell
  lane, not the pure gate. See `research/hook-modes-and-testing.md`.
- **Delivery** — a compiled gate is a STRONG DEFAULT, never an unbypassable wall:
  CC's #34692 means a subagent's tool calls bypass any PreToolUse hook. Compile
  fixes a hook's logic, not how the harness delivers events.

So the claim is precise: for the **safety-gate slice** a hook is most often
written for, compiled hooks remove the evasion, precision, and protocol failure
modes that hand-written guards can't reliably avoid — and stay honest about the
stateful / I/O / delivery edges that aren't theirs to solve.

## Provenance & licensing

The originals are SHAPES, not vendored files. disler/claude-code-hooks-mastery is
unlicensed → never copied; we reproduce its substring-blocklist idiom and cite the
measured 2/7. The MIT-licensed alternatives (alexknowshtml/claude-code-safety-hooks)
pull `jq` + `/tmp` runtime deps that would make a committed CI test flaky, so they
stay a documented reference, not a vendored fixture (the don't-cry-wolf bar). See
`examples/harness/vendor/SOURCES.md` for what IS vendored (MIT only).

## See also

- `docs/compiled-hooks.md` — the public guide (bug-class table + the dogfood summary).
- `research/hook-pain-points.md` — the verified failure corpus + the per-capability dogfood matrix.
- `src/hook-oss-comparison.test.ts` / `src/hook-dogfood.test.ts` — the CI-backed measurements behind every number here.
