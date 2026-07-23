---
status: idea
topic: spec
---

# `loop()` combinator — a checkable stop condition for iterating orchestrators

Design idea. Extends [`railway-subagents.md`](railway-subagents.md), which
deliberately ships **no loop combinator** — `railway({ steps, recover })` is a
finite step list + bounded recovery, so *termination is structural* (it cannot
spin forever by construction). That is the safe end of the control-flow spectrum.
This doc asks the next question: real orchestrators **do** loop
(discover → plan → execute → verify, *until done*), and today that "until done"
is **prose**, not a checkable gate. So a `loop()` combinator has to earn its
termination guarantee the way `railway()` gets it for free.

## The framing (why this is a vigiles-shaped problem)

A widely-shared distinction (Jason Zhou, "wtf is graph engineering") makes the
gap crisp: **"a loop is a single-node graph with an edge back to itself"** — and
therefore **stop conditions and verification live at the *loop* level, not the
graph level.** "A graph of weak loops is just a more expensive way to produce
slop."

That is our thesis restated for control flow: **the stop condition is prose, not
policy.** An orchestrator's "keep going until the tests pass / until it looks
done" is an LLM judgment, unverified — the same shape as an unenforced CLAUDE.md
rule. vigiles already turns prose rules into deterministic gates; a `loop()`
combinator turns a **prose stop condition into a compiled one**.

## Sketch

```ts
loop(
  body,                          // a railway step / delegate() — the work per pass
  {
    until: cmd("npm test"),      // MUST be a deterministic gate (cmd() or a
                                 // predicate over typed state) — NOT prose.
    maxIters: 5,                 // MANDATORY cap — the runaway backstop.
  },
)
```

- **`until` must be deterministic — prose ⇒ compile error / abstain.** `until:
  "when it looks done"` does not compile; it degrades to advisory. This mirrors
  the two-stage adversarial gate in the rule-compiler (`@vigiles/compiler`): if a
  condition can't be expressed as a checkable predicate, vigiles refuses to claim
  it enforces one, rather than emitting a fake gate.
- **`until` compiles to a `Stop`-hook** — the loop's termination check *is* the
  gate, reusing the shipped `Stop`-gate emission (`skill-hook`,
  [`runtime-enforcement.md`](runtime-enforcement.md)).
- **`maxIters` compiles to a hook-counter cap** — the same backstop shape as the
  spawn-depth cap for nested subagents in `railway-subagents.md`; guarantees
  termination even if `until` is never satisfied.
- **Blast-radius is per-iteration, not widened.** Each pass reuses the existing
  `PreToolUse` tool-contract / purity rail (`src/adapters/claude-code/agent-runtime.ts`);
  a loop repeats the rail N times, it does not grant new authority.
- **`assertLoopTerminates`** in `src/harness-assert.ts` — the testing-framework
  payoff: an eval (pass^k) that the `until` gate is actually *reachable*, not just
  that the railway type-checks. Reuses the eval tier that would score a railway.

## Boundary (same as railway Option 3)

**Do not build a loop engine.** vigiles emits + verifies the loop (the `until`
gate, the `maxIters` cap, the per-iteration rail) and delegates *execution* to the
harness's native `Stop`-hook + state-file pattern. The moat is "the stop condition
is a compiled gate, not prose" — not a runtime.

## Relation to the measurement / paper angle

The **measurement** side — a *terminatability probe* over real agent-loop
templates (what fraction have a deterministic vs LLM-judged stop condition) — is
the external research artifact and lives in the private KB
(`migratsiya/papers/research/2026-07-23-deep-research-agent-control-loop-taxonomy.md`,
`zernie/mine`), tied to the "Prose Isn't Policy" paper lane. **This doc is the
product idea**; that one is the study. Keep them cross-linked, not merged.

## Open questions

- Can a `Stop`-hook read enough between iterations to evaluate `until`
  deterministically over the run's state — or is it limited to a command gate?
  (Same open question as the railway Option 3 driver in `railway-subagents.md`.)
- Is `loop()` a combinator inside `railway()`, or a mode of the future
  `command()` compilation target (where real flow lives)? Leaning: same home as
  `railway()` resolves to.

## See also

- [`railway-subagents.md`](railway-subagents.md) — the finite railway this extends
  (the "no loop combinator, termination is structural" decision).
- [`spec-syntax-and-railway-scope.md`](spec-syntax-and-railway-scope.md) — railway/Result is subagent-only.
- [`runtime-enforcement.md`](runtime-enforcement.md) — the `Stop`-gate emission this reuses.
