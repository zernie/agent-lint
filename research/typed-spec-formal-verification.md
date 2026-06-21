# Typed-spec FORMAL VERIFICATION — model checking the harness protocol

> Cluster: formal verification & model checking. Round 2 — going deep on the
> verification direction `typed-spec-frontier.md` only name-dropped as **F8
> "model-checked protocol"** and ranked "aspirational, Low-Med" without actually
> evaluating it.

## What this round adds

The frontier doc parked F8 with one sentence of reasoning: _"F2 (typestate)
recovers the single highest-value invariant (plan-before-mutate) IN-LANGUAGE at
`tsc`."_ That is true **for the safety fragment of a LINEAR protocol**. It does
NOT cover the two things a model checker exists for and the type tier provably
cannot do:

1. **All-interleavings reasoning over a STATEFUL, CONCURRENT protocol** — the
   `.vigiles/active-agent.json` window state machine in
   `src/adapters/claude-code/agent-runtime.ts`, which is NOT a linear
   plan→mutate pipeline a typestate can encode. It is a stack discipline under
   nested dispatch, and types check one well-typed _program_; a model checker
   checks every _ordering_ of events that hit a shared file.
2. **Liveness / temporal properties** — "every dispatched subagent eventually
   reaches SubagentStop (no orphaned window)", "bounded recovery always
   terminates". These are `[]<>` and termination claims. No TypeScript type
   expresses them; F2's typestate is a pure safety automaton.

The headline result of this round is concrete and **uncomfortable**: a real
model checker (TLC) and a hand-rolled Node checker **independently find a
contract-escape bug that is already shipping in `agent-runtime.ts`** — the same
bug the code comment and `effect-boundary-design.md` admit in PROSE ("flat-only,
NOT nesting-safe"). Prose said "we think this is unsafe under nesting." The model
checker prints the exact 4-event trace and certifies the proposed fix. That gap
— between a prose hedge and a mechanical counterexample + a certified fix — is
the entire value proposition of this cluster, and it is real.

## The ranking

| #      | Idea                                                                                                                                | What a checker gives that types/lint/runtime cannot                                                                           | Buildability                          | Verdict                                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| **V1** | **One-time proof of OUR runtime** — model-check the `agent-runtime.ts` active-agent/effect-region state machine under nesting       | the **shortest contract-escape trace** over ALL interleavings + nesting depths; certifies the depth-aware fix before shipping | **one-time-proof** (DONE — see below) | **BUILD THIS ONE** — found a real bug, validated the fix               |
| **V2** | **Railway termination proof** — model-check `recover.max` bounded recovery always terminates (the sub-Turing claim)                 | a machine-checked **termination** proof for the orchestration loop (a liveness/well-foundedness claim no type carries)        | **one-time-proof** (DONE)             | **fold into V1** — same toolchain, proven trivially, low-cost rider    |
| V3     | **Liveness: no orphaned subagent window** — `[]( depth=0 ⇒ active=none )` under an abandoned child (no SubagentStop)                | a **stale-window** liveness witness — the parent mis-gated by a dead subagent's contract                                      | **one-time-proof** (DONE)             | **fold into V1** — the checker found this defect too                   |
| V4     | **`vigiles verify --model` — generate a TLA+/Alloy model FROM a user's railway spec**, per-repo, user runs TLC                      | per-user temporal invariants over THEIR pipeline                                                                              | **spec→model-gen** (sketched)         | **DON'T ship as a user feature** — wrong cost/benefit (see §Rejected)  |
| V5     | **Alloy structural model of the plugin graph** (skills/agents/hooks/MCP refs) — find unreachable / cyclic / dangling configurations | bounded structural counterexamples over the config relation                                                                   | aspirational                          | **DON'T** — `scan`'s deterministic detectors already cover this        |
| V6     | **Proof-gated evolution** (every Merkle mutation ships a discharged proof obligation)                                               | formally-verified spec mutations                                                                                              | aspirational (PhD-shaped)             | **DON'T** — already the crisp NO in `formal-proofs-for-agents.md` §5.3 |

The single genuine win is **V1** (with V2/V3 as free riders on the same model).
It is NOT a per-user feature — it is a **one-time verification of vigiles's own
runtime state machine**, the Cedar pattern (`formal-proofs-for-agents.md` §7)
applied to the one protocol in the codebase that is concurrent and stateful
enough to have an interleaving bug. V4–V6 are the academically-seductive,
practically-not-worth-it tail, rejected with reasons below.

---

## V1 — model-check OUR runtime state machine (the build) — DONE

### Why types/lint/runtime cannot touch this

`agent-runtime.ts` tracks "which subagent is active" in a SINGLE file,
`.vigiles/active-agent.json`, written by `setActiveAgent` (overwrite) and removed
by `clearActiveAgent` (`rmSync`). The `PreToolUse` rail reads that one slot and
gates each tool call against the active agent's `tools:` contract
(`decidePreToolUse`). The window is bracketed by harness events:
`PreToolUse(Task)` opens it, `SubagentStop` closes it.

The code comment is blunt about the hazard (lines 160–167):

> EXPERIMENTAL — parked (P3), flat-only … NOT nesting-safe — Claude Code v2.1.172
> added depth-5 nested subagents, so correct tracking needs a depth-aware STACK.

This is **not** a property the type tier can catch. F2's typestate proves
`plan*→mutating*` ordering for a LINEAR pipeline at `tsc`. But "the active-agent
slot correctly reflects the executing subagent under arbitrary nesting and
interleaving of Open/Stop/Call events" is a property of a **shared mutable
single-cell store under a stack discipline** — exactly what TLA+/model checking
was invented for, and exactly what no TS type sees (the type system checks the
program text, not the runtime sequence of file writes the harness drives).

### What the checker found (real captured output)

Two independent checkers, the SAME counterexample.

**Node bounded checker** (`prototypes/.../mini-checker.mjs`, no toolchain needed):

```
### FLAT model (ships today — single active-agent.json slot)
states explored: 17
VERDICT: ✗ invariant VIOLATED — counterexample found:
  trace: open:writer  →  open:writer  →  stop  →  call:Bash
  at the final call(Bash): the FLAT model says ALLOW, but the
  subagent actually executing forbids Bash — a CONTRACT ESCAPE.

### STACK model (the proposed nesting-safe fix)
states explored: 4497
VERDICT: ✓ invariant HOLDS for all interleavings up to bound
```

**TLC** (real model checker; `AgentWindow.tla` + `AgentWindow.cfg`, captured in
`tlc-output.txt`):

```
Error: Invariant NoContractEscape is violated.
State 2: Open  callStack = <<"writer">>           active = "writer"
State 3: Open  callStack = <<"writer", "writer">> active = "writer"
State 4: Stop  callStack = <<"writer">>           active = "none"
State 5: Call  lastCall = [tool|->"Bash", allowedFlat|->TRUE, allowedTrue|->FALSE]
89 states generated, 45 distinct states found.
```

Read the trace: a `writer` agent (contract `{Read,Write,Edit}`, **no Bash**)
spawns a NESTED `writer`. The inner subagent stops. The flat model's `rmSync`
clears the **whole** slot → `active = "none"` → `decidePreToolUse(null, …)`
returns `allow: true` (inherits-all) → the still-running PARENT `writer` is now
allowed to run `Bash`, which its contract forbids. **The contract is escaped by a
nested dispatch followed by a Stop.**

### The fix is certified, not guessed

The decisive half: the proposed depth-aware STACK fix is checked under the SAME
interleavings and **passes**. TLC on `AgentWindowStack.tla`
(`tlc-output-stack-fix.txt`):

```
Model checking completed. No error has been found.
275 states generated, 57 distinct states found, 0 states left on queue.
```

That is the irreplaceable value: a deterministic lint can _flag_ "you use a
single slot, that smells unsafe under nesting", but only the model checker
(a) produces the exact minimal escape trace and (b) **certifies that the
replacement is correct for all interleavings up to the bound** before a line of
production code changes. The fix (`Stop` = pop to parent, gate = stack top) is
small; the confidence that it is _complete_ is what the checker buys.

### The spec→model mapping (V1 is a hand-written model, not generated)

Crucially, V1 does NOT generate the model from a user's spec. It is a fixed
model of vigiles's own runtime, mapped by hand:

| `agent-runtime.ts` mechanism                       | TLA+ model element                       |
| -------------------------------------------------- | ---------------------------------------- |
| `agent("writer", { tools: [...] })` compiled `.md` | `Contracts[a]` (a CASE over Agents)      |
| `PreToolUse(Task)` → `setActiveAgent`              | `Open(agent)` action                     |
| `SubagentStop` → `clearActiveAgent`                | `Stop` action                            |
| `decidePreToolUse(parseAgentTools(md), tool)`      | `Permits(agent, tool)`                   |
| `.vigiles/active-agent.json` (single slot)         | `active` var (the flat bug)              |
| the proposed depth-aware fix                       | `callStack` var (ground truth + the fix) |
| nesting depth-5 (CC v2.1.172)                      | `MaxDepth` constant                      |

The model is ~60 lines of TLA+. The bound (traceLen 6, depth 3) suffices: the bug
surfaces at depth 2 in a 4-event trace, well inside the bound (the "small scope
hypothesis" — most concurrency bugs appear at tiny bounds).

---

## V2 — railway bounded-recovery termination (free rider) — DONE

The railway's `recover: { max, step }` (validated by `validateRailway` in
`compile.ts`, which enforces `max ≥ 1`) retries a failing step up to `max` times,
then falls to the `onError` track. The docs call this the **sub-Turing**
guarantee: bounded recovery ALWAYS terminates. That is a **termination** claim — a
liveness/well-foundedness property — and the type tier does not prove it (the
type checker happily types an unbounded loop).

`liveness-checker.mjs` model-checks it directly (captured in
`node-checker-output.txt`):

```
### L2 — railway bounded-recovery termination
max=3:   terminates=true  longest path=3 attempts
max=100: terminates=true  longest path=100 attempts
VERDICT: ✓ termination PROVEN (bounded) — every path reaches ok|err in ≤ max+1
  → the sub-Turing claim holds: recover.max is a hard decreasing measure.
```

Every outcome sequence (success/fail at each attempt) reaches a terminal
(`ok` | `err`) within `max+1` attempts — `retriesLeft` is a strictly decreasing
ranking function bottoming at the `onError` terminal. This is the standard
well-founded-measure termination argument, checked exhaustively for the bound.
**It is a one-line confirmation of a claim the docs already assert** — low value
on its own, but it costs nothing on top of V1's toolchain, and it converts a
documented assertion into a checked one.

## V3 — liveness: no orphaned subagent window (free rider) — DONE

Claude Code has `SubagentStop` but **no `SubagentStart`** (confirmed in
`effect-boundary-design.md` and `dialect.hookEvents`). So a child that errors out
or is abandoned _before_ its Stop fires leaves the single slot set. The checker
finds the defect in 5 states (`liveness-checker.mjs`):

```
### L1 — orphaned/stale active-agent window
VERDICT: ✗ liveness DEFECT — a stale window is reachable:
  trace: open:writer  →  drop(no-Stop)
  control returned to top level but active-agent.json is still set →
  the PARENT's next tool call is gated by a DEAD subagent's contract.
```

This is a SECOND, distinct way the flat slot misgates — not the nesting escape
of V1 but a stale-window leak. A type cannot express `[](depth=0 ⇒ active=none)`.
The stack model fixes it too (popping to empty clears the gate). Folds into V1.

---

## Honest practicality: where the line is

Model checkers are heavy: a separate toolchain (TLC needs a JVM + `tla2tools.jar`;
Alloy a separate analyzer), real authoring cost (you write the model by hand),
and state explosion past small bounds. The brutal question is whether
generate-and-check is worth it _for a per-repo harness_. The answer splits cleanly
on WHO writes the model and HOW OFTEN it runs:

- **As a per-USER feature (V4): not worth it.** Asking a vigiles user to install a
  JVM + TLA+ tools and read a TLC counterexample to verify _their_ railway is a
  non-starter — the audience overlap between "writes a `.spec.ts`" and "debugs a
  TLA+ trace" is ~zero (same argument `formal-proofs-for-agents.md` made for
  Lean). And F2's typestate already recovers the one safety invariant
  (plan-before-mutate) a linear user railway has, at `tsc`, in their loop. There
  is no per-user temporal invariant left that justifies the toolchain.

- **As a one-time proof of vigiles's OWN runtime (V1): clearly worth it.** The
  model is written ONCE by the vigiles maintainers, run ONCE in CI (or even just
  during the fix), and proves a property of the shipped `agent-runtime.ts` that
  bit real users' contracts. The cost is ~60 lines of TLA+ + a Node checker; the
  payoff is a found bug + a certified fix on the codebase's only genuinely
  concurrent state machine. This is exactly the Cedar / "verify the engine, not
  the user's policies" pattern: AWS model-checks the Cedar authorizer, not every
  customer's policy set.

**The line:** model checking earns its keep ONLY for the harness AUTHOR verifying
the harness's OWN protocol, NOT for the harness USER verifying their spec. The
cluster's seduction is to make it a product feature; the discipline is to use it
as an internal correctness tool, ship the _result_ (the fixed, certified
state machine), and ship nothing of the toolchain to users.

### The cheaper deterministic substitute (for the user-facing slice)

For everything V4/V5 would have generated per-user, a deterministic check already
covers the realistic cases at zero toolchain cost:

- `validateRailway` (unknown delegate target, `recover.max ≥ 1`, empty railway) —
  the structural safety V5/Alloy would re-derive.
- `danglingRefs` / `scan` (`plugin-loader.ts`, `scan.ts`) — unreachable / missing
  config refs, the plugin-graph structural properties V5 targets.
- F2's typestate at `tsc` — the plan-before-mutate ordering, in-language.
- The runtime PreToolUse rail itself — once V1's stack fix lands, the gate IS the
  enforcement; you don't need to re-check the user's spec against it.

So the honest product recommendation is: **build V1 (+ V2/V3) as a one-time
internal proof, ship the certified depth-aware fix, and do NOT expose any model
checker to users.** The cheaper substitute for the user-facing half already
exists and is deterministic, free, and in-loop.

---

## If we build ONE thing: V1 — and it's a BUG FIX, not a feature

The strongest pick is not "add a model-checking feature." It is: **use the model
checker that this prototype already wrote to drive the depth-aware-stack fix in
`agent-runtime.ts`, and keep the `.tla` model in the repo as a regression
artifact.** Concretely:

1. Land the stack-based active-agent tracking (push on `PreToolUse(Task)`, pop on
   `SubagentStop`, gate on stack top) — the fix `AgentWindowStack.tla` certifies.
   The code comment already names this fix; the checker proves it complete.
2. Commit `AgentWindow.tla` / `AgentWindowStack.tla` + the Node checkers as a
   `research/` artifact and (optionally) a CI job: re-run on any change to the
   window protocol so a future edit that reintroduces the flat bug fails the
   model check. This is the "proof receipt for the runtime" — cheap, one-time
   authored, re-runnable.

This is `formal-proofs-for-agents.md`'s §7 Cedar pattern realized for the one
place it pays: not the compiler (whose properties are structural and already
deterministically checked), but the **concurrent runtime window protocol**, which
is the only sub-system with an interleaving bug to find — and it had one.

## Most surprising idea

The model checker **agreed with the source-code comment and then beat it.** The
`agent-runtime.ts` comment already _says_ "flat-only, NOT nesting-safe." A
skeptic would call the model checker redundant — the author already knew. But the
checker did two things the comment could not: it produced the **exact minimal
4-event trace** (`Open writer; Open writer; Stop; Call Bash`) that a developer can
turn into a failing test verbatim, and it **certified the proposed fix is
complete** (TLC: "No error has been found", 57 distinct states, all
interleavings). A prose hedge ("we think this is unsafe") and a certified result
("here is the escape, and here is the proof the fix closes it for all orderings")
are different epistemic objects. The surprise is that the value of model checking
here is NOT discovering an unknown bug — it is converting a _known suspicion_ into
a _trace + a certificate_, which is precisely what you need to actually justify
spending the effort on the depth-aware rewrite.

The runner-up surprise: the railway "sub-Turing" termination claim, which reads
like marketing, is **literally true and trivially model-checkable** —
`recover.max` is a textbook decreasing well-founded measure, and the checker
confirms every path terminates in ≤ `max+1`. The grand-sounding claim is the
simplest thing in the whole cluster to verify.

## Rejected / cute-but-not-worth-it (the crisp NOs)

- **V4 — `vigiles verify --model` generating TLA+/Alloy from a user's railway.**
  The seductive "wild" idea F8 named. Rejected: it ships a JVM + TLA+ toolchain
  and a counterexample-debugging burden to an audience that won't use it, to check
  a temporal property (plan-before-mutate) F2 already gets at `tsc` in-loop. The
  ONE invariant rich enough to need a checker (the nesting window) is vigiles's
  OWN runtime, not the user's spec — so V1 captures the value without V4's cost.
- **V5 — Alloy structural model of the plugin graph.** Bounded relational
  analysis of skills/agents/hooks/MCP refs would find unreachable / cyclic /
  dangling configs — but `scan` + `danglingRefs` + `validateRailway` already find
  exactly these, deterministically, free, with no Alloy install. A model checker
  here is a heavier re-implementation of shipped detectors. No.
- **V6 — proof-gated evolution.** Every Merkle mutation ships a discharged proof
  that "the new rule implies the old." This is already the explicit crisp NO in
  `formal-proofs-for-agents.md` §5.3: rule semantics are NL prose; "implies" has
  no formal meaning until someone defines a specification logic for instruction
  files. PhD-shaped, not a sprint. Restated NO.
- **Per-function code proofs (Dafny/Lean of `compile`/hash).** Covered by
  `formal-proofs-for-agents.md` §5.1/§7 (the `dafny()`/`lean4()` enforce target,
  differential testing of the compiler). That doc owns the CODE-proof direction;
  this doc owns the PROTOCOL/temporal direction. Not duplicated here — see the
  cross-link.

---

## Prototype files (all under `research/prototypes/typed-spec-formal-verification/`)

- `mini-checker.mjs` — bounded explicit-state SAFETY checker in plain Node (no
  toolchain). Enumerates all Open/Stop/Call interleavings up to a bound and finds
  the flat-model contract-escape counterexample; the stack model passes. BFS, so
  the printed trace is a SHORTEST one. `node mini-checker.mjs` exits 0.
- `liveness-checker.mjs` — the TEMPORAL fragment: L1 (orphaned/stale window) finds
  a defect; L2 (railway recovery) proves bounded termination. Exits 0.
- `AgentWindow.tla` + `AgentWindow.cfg` — the hand-written TLA+ model of the flat
  runtime (the "what we'd hand to TLC"). Runs under real TLC and reports the SAME
  counterexample. `tlc-output.txt` is the captured run.
- `AgentWindowStack.tla` + `AgentWindowStack.cfg` — the proposed depth-aware fix
  modelled; TLC reports "No error has been found." `tlc-output-stack-fix.txt` is
  the captured run.
- `node-checker-output.txt` — captured Node safety + liveness output.
- `run.mjs` — orchestrator: runs both Node checkers always, runs TLC if a jar is
  present (env `TLA_JAR` or `/tmp/tla2tools.jar`), reports a missing jar LOUDLY
  (no-silent-skips). Exits 0.

Evidence is REAL: TLC 2.19 was fetched and run; both the Node checker and TLC
independently produce the trace `Open(writer); Open(writer); Stop; Call(Bash)` →
`allowedFlat=TRUE, allowedTrue=FALSE`, and TLC certifies the stack fix.

## See also

- `formal-proofs-for-agents.md` — the predecessor and the CODE-proof half (Dafny/
  Lean enforce targets, the Cedar "verify the engine" pattern §7, proof-gated
  evolution §5.3 NO). This doc BUILDS ON it: it applies §7's Cedar pattern to the
  one protocol §7 didn't model — the concurrent runtime window state machine —
  and owns the TEMPORAL/liveness direction §7's compiler-proofs left out.
- `typed-spec-frontier.md` — F8 named this cluster and parked it "aspirational";
  this round shows F8's _user-facing_ form is correctly rejected (V4) but its
  _runtime-proof_ form (V1) is the real win F8 missed. F2 (typestate) remains the
  right answer for the LINEAR user-railway safety fragment; V1 covers the
  NON-linear, stateful, concurrent fragment F2 cannot reach.
- `effect-boundary-design.md` — the "Why dropped" section that admits the
  flat-only / nesting hazard IN PROSE; V1 is the mechanical counterexample +
  certified fix behind that prose, and the depth-aware stack it calls for.
- `harness-state-space.md` — the model-checking seed ("make invalid states
  unreachable"); V1 is that thesis discharged for the active-agent window.
- `railway-subagents.md` — the orchestration layer V2's termination claim verifies.
