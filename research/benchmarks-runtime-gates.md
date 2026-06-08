# Benchmarks — do runtime gates earn their complexity?

> Status: empirical result (2026-06-08). We built the skill runtime-enforcement
> layer (`skill-runtime`, `skill-driver`, `action-gate`, Stop-hook gates — the
> `skill-as-pipeline.md` branch) and then benchmarked whether it actually
> changes agent behaviour. It does not — for capable agents on clear tasks it is
> a no-op or net-negative. Benchmark #4 extends the test to the
> symbol-reference enforcement hook (`refs-hook`) with the same verdict:
> _verifying_ a declared reference is the non-gameable win, but a hook that
> _forces_ the agent to declare references is gamed like any gate. This doc is
> the evidence; it redirects vigiles's center of gravity from _enforcing the
> route_ to _verifying the map_ (the cross-referencing core in
> `skill-authoring-pains.md`).

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

### Benchmark #4 — the symbol-reference enforcement hook (2 arms × 6 trials)

A different kind of hook: not a runtime gate on a task outcome, but the
`refs-hook` that **forces the agent to mark its code references** as
`` `vigiles:symbol path#name` `` (so they become verifiable) or opt out with
`<!-- vigiles:ignore -->`. Task: "document these functions in a SKILL.md,
referencing them by name." `vanilla` has no hook; `gated` blocks any unmarked
code reference. The payoff metric: after the run, rename a documented function in
the code — does `vigiles audit` catch the now-broken reference? Harness:
`bench/run-refs.sh`. (Run with the `foo(args)` detection fix so the hook
challenges the dominant function-call form, not just bare identifiers.)

| arm     | avg marks | avg `vigiles:ignore` | **rename caught** |
| ------- | --------- | -------------------- | ----------------- |
| vanilla | 0         | 0                    | **0/6**           |
| gated   | 2.5       | **2.8**              | **2/6**           |

**Not a no-op, but heavily gamed.** The hook moved the needle off zero — 2 of 6
gated runs produced a verifiable mark for the renamed function (vanilla cannot,
its references are bare and unverifiable). But the other 4 circumvented it: three
runs **ignore-gamed** (5–6 `vigiles:ignore` each — keep the bare name, slap on an
opt-out to satisfy the hook), and one marked the function only inside a fenced
` ```block `, which R1 deliberately skips. Average 2.8 ignores per run is the
Goodhart signature again: when forcing fires, the cheapest way to satisfy it is
to opt out, and the agent takes it.

The decisive distinction this benchmark draws:

- **Verification is sound and non-gameable.** `symbol("file", "name")` in a spec
  (the author writes it deliberately; compile-verified) and `audit` on a real
  `vigiles:symbol` mark catch a rename deterministically — proven in the unit/E2E
  suite and by the 2/6 gated runs that did mark. The author/spec _declares_;
  vigiles _verifies_. No model behaviour can fake whether a file defines a symbol.
- **Enforcement (the hook forcing marks) is partial and gamed.** It does not
  reliably turn a bare-reference agent into a marked-reference one — same lesson
  as the runtime gates, just not total.

So the value of symbol verification lands in **declared** references — `symbol()`
in spec mode, and marks an author/agent writes deliberately — not in auto-forcing
them. The `refs-hook` is best-effort, not a guarantee.

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
3. **Verify declared references; don't force the declaration.** Benchmark #4
   sharpens the line: the deterministic _verification_ of a reference (does this
   file define this symbol / does this rule exist) is the non-gameable win, but
   the _hook that forces the agent to declare references_ is gamed like any gate.
   Lead with `symbol()` / declared marks and `audit`; treat the forcing hook as
   best-effort, not a guarantee.

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
bash bench/run-refs.sh haiku 6 240             # #4 symbol-ref enforcement hook
```

## See also

- `research/skill-authoring-pains.md` — the documented pains; the cross-reference
  gap this redirects toward.
- `research/skill-as-pipeline.md` — the runtime-gate / harness-driven branch these
  benchmarks test and largely deflate.
- `research/reference-verification-limits.md` — the conceptual boundary these
  benchmarks reveal (verify the declared; forcing is gamed).
- `research/harness-testing.md` — the testing/eval pillar these benchmarks became.
