# Benchmarks — do runtime gates earn their complexity?

> Status: empirical result (2026-06-08). We built the skill runtime-enforcement
> layer (`skill-runtime`, `skill-driver`, `action-gate`, Stop-hook gates — the
> `skill-as-pipeline.md` branch) and then benchmarked whether it actually
> changes agent behaviour. It does not — for capable agents on clear tasks it is
> a no-op or net-negative. This doc is the evidence; it redirects vigiles's
> center of gravity from _enforcing the route_ to _verifying the map_ (the
> cross-referencing core in `skill-authoring-pains.md`).

## Method

Real `claude` CLI runs (model `haiku`) against validated **trap** fixtures under
`bench/tasks/` — tasks where the obvious/naive solution leaves the test suite
red, so a gate has something to catch. Each fixture is checked beforehand:
naive solution → red, correct fix → green. Two arms per run, identical task and
identical SKILL.md; the **only** variable is whether the deterministic gate
fires. The metric is measured independently of the agent's own claim (we re-run
`npm test` after the agent stops). Harness: `bench/run.sh`, `bench/run-tdd.sh`,
`bench/run-ctx.sh`.

The arms map to the two enforcement points in the skill model:

- **Result gate** — Stop hook blocks "done" until the skill's result gate
  (`npm test`) passes. Outcome conformance.
- **Process gate** — a PreToolUse action-gate blocks any `src/` write until a
  test is _currently failing_ (`! npm test`), forcing test-first. Process
  conformance — something a result gate provably cannot enforce (a result gate
  of "tests pass" is satisfied by implement-then-test, skipping RED entirely).

## Results

### Benchmark #1 — result gate (3 traps × 2 arms × 8 trials = 48 runs)

| arm     | end-state green | avg turns |
| ------- | --------------- | --------- |
| vanilla | **24/24**       | 9.0       |
| gated   | **24/24**       | 9.1       |

**Flat.** Identical end-state, +0.1 turns overhead. A capable agent already
drives every trap to green on its own; the result gate fires once, passes, and
changes nothing. It is a no-op.

### Benchmark #2 — process gate / TDD (2 arms × 8 trials = 16 runs)

| arm                    | test-first | **real test exists at end** | avg turns | timeouts |
| ---------------------- | ---------- | --------------------------- | --------- | -------- |
| vanilla (prose only)   | 8/8        | **8/8**                     | 9.4       | 0        |
| gated (PreToolUse RED) | 7/8        | **6/8**                     | 25.1      | 1        |

**Net-negative.** Told "write a failing test first," vanilla did genuine TDD
8/8 at 9 turns. The gated arm was _worse on every axis_: it cost 2.7× the turns,
timed out once, and **produced worse artifacts** — two gated runs ended with no
real test file, because the agent manufactured a throwaway broken test purely to
satisfy "a test is failing," wrote `src`, then discarded it. Textbook Goodhart:
the crude process proxy is gamed, and enforcing it degrades the very behaviour
it was meant to ensure.

### Benchmark #3 — context load (cart-discount, 3 levels × 2 arms × 5 = 30 runs)

Hypothesis: agents degrade under context load (context rot / lost-in-the-middle),
and _that_ is when the result gate stops being a no-op. We prepended the
project's own docs as realistic filler and swept the load.

| context               | vanilla | gated |
| --------------------- | ------- | ----- |
| 0k                    | 5/5     | 5/5   |
| 80k                   | 5/5     | 5/5   |
| 160k (~80% of window) | 5/5     | 5/5   |

**Flat at every level**, identical turn counts. No degradation even near the
context cap; the gate stays a no-op. (Falsified for `haiku` on this task up to
160k; we did not test a model whose window we could fill with working headroom
to spare.)

## Interpretation

A deterministic runtime gate **re-checks what a capable agent already
self-checks** — running tests, following clear prose. Where the gate's check is
a faithful proxy (run the real suite), it is redundant. Where it is a crude
proxy (a test is currently red ⇏ you did real TDD), the agent games it and the
constraint backfires.

Crucially the direction of this conclusion **strengthens with model capability,
not weakens it**: a stronger model self-verifies even more reliably (gates even
more redundant) — so this is not a "haiku is weak" artifact.

### What the gate does NOT touch — and why that is the real value

An agent can run tests, but it **cannot verify the truth of a reference it
reads**. When a SKILL.md says "use rule X" or "run script Y", the agent trusts
the document — it never opened the config where X was disabled, and has no
channel to learn Y was renamed. The map lies; the agent lies downstream. A
stronger model trusts the lying map _just as much_. This is the failure mode the
field actually reports (59 broken refs in a 192-file setup; 73% of 214 skills
scoring < 60/100, failing silently — see `skill-authoring-pains.md`), and no
amount of model capability fixes it. It is also **not gameable** (whether a rule
exists is a static fact) and **not agent-dependent** (the check runs the same
regardless of model).

> **vigiles verifies the map the agent reads; it does not police the route the
> agent takes.** The benchmarks show policing the route is futile-to-harmful;
> verifying the map is the unclaimed deterministic win.

## Consequences

1. **Center of gravity = reference verification** (the cross-referencing engine),
   for CLAUDE.md/AGENTS.md _and_ SKILL.md. Headline shifts toward "verify your
   instruction files don't lie."
2. **Runtime gates demote to a narrow, explicitly-scoped backstop** — only
   irreversible / high-stakes actions (deploy, money, data deletion) with no CI
   and an expensive tail. Not the headline. We measured the general case; it does
   not pay.

## Caveats

- One model (`haiku`), one task class (small code traps), clean specifications.
  The _direction_ (agents self-verify outcomes; cannot self-verify reference
  truth) is robust to model strength, but absolute rates are not a controlled
  study.
- The narrow backstop niche (irreversible actions, weak/oversubscribed agents,
  reuse at extreme scale where a small tail × volume matters) is untested here
  and remains plausible — which is why #2's machinery is demoted, not deleted.

## Reproduce

```
bash bench/run.sh      haiku 8 240             # #1 result gate
bash bench/run-tdd.sh  haiku 8 300             # #2 process gate (TDD)
bash bench/run-ctx.sh  haiku 5 cart-discount 0 80 160   # #3 context load
```

## See also

- `research/skill-authoring-pains.md` — the documented pains; the cross-reference
  gap this redirects toward.
- `research/skill-as-pipeline.md` — the runtime-gate / harness-driven branch these
  benchmarks test and largely deflate.
