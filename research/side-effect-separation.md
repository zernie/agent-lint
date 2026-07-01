---
status: shipped
topic: hooks
---

# Robust-by-default side-effect separation for skills/agents

> Status: research synthesis (2026-06-19). The question: how robustly can we force pure /
> side-effect separation in skills/agents by default — "only marked places may have side
> effects" — and is a cheap-model (Haiku) auto-marking pass safe? Verdict: **yes, robust by
> default — because the gate is DETERMINISTIC (object-capability via a PreToolUse hook), the
> model only SUGGESTS the marks, and the failure direction is fail-closed.** Grounded in a
> 3-cluster sweep (effect-confinement prior art · agent gating SOTA · LLM-marking reliability).
> Companion to `typed-contracts-for-agents.md` (the boundary doubles as a test seam),
> `harness-state-space.md` (the effect-system bet), `docs/safety.md` (the sandbox).

## The key finding: the gate is deterministic; the model only suggests

An agent's side effects **are its tool calls** (`Bash`, `Write`, `WebFetch`, network, paid
API). So "confine effects to marked boundaries" maps onto **object-capability semantics
enforced by a `PreToolUse` hook** — the cleanest fit of all the prior art (Haskell IO / Koka
effect-rows / ocap / taint): the declared boundary is the _capability set_; the hook is the
_capability gate_ that denies any side-effecting tool outside it. **No model needed**, because:

- **The read-only vs side-effecting split is a published catalog.** Claude Code's Tools
  Reference has a "Permission Required" column — `Read/Glob/Grep/LSP/Agent/ToolSearch` are
  read-only; `Bash/Edit/Write/NotebookEdit/WebFetch/WebSearch/Skill` are side-effecting. vigiles
  classifies deterministically from the dialect's tool catalog.
- **`PreToolUse` is a deterministic gate** — returns `allow/deny/ask`, sees the full
  `tool_input` (so it can match on `command`/`path`/`url`, not just the tool name), `deny` is
  the hard outer envelope. This is vigiles's existing **tool-contract rail** (`decidePreToolUse`
  in `agent-runtime.ts`) — a pure `(tool, manifest) → allow|deny` already tested with `runHook`
  (no model). That's the **functional-core/imperative-shell** pattern, and it's exactly why the
  cheapest tier covers the most surface.

## The layered design (each layer covers what the one above can't)

1. **Capability gate — the deterministic floor (no model).** A `PreToolUse` hook denies every
   side-effecting tool unless the agent is at a **declared effect boundary**. Default-deny.
   Conservative on the undecidables (see limits): `Bash` and unclassified MCP tools are treated
   as side-effecting.
2. **The marked boundary — "side effects only here."** A skill/agent declares its effect
   boundary, structurally in the typed contract (`step({ effect: true })` / an effect region) or
   a `<!-- vigiles:effect -->` mark that sets the gate's allow-context (e.g. a
   `VIGILES_EFFECTS_ALLOWED` flag the skill wrapper sets only inside the boundary). This is
   literally **"auto mode, but for side effects"** — the Claude Code `dontAsk` model
   (only pre-approved points execute, else auto-deny) keyed on the marks.
3. **The sandbox — closes the indirect-effect hole.** Tool-gating cannot catch
   `Bash(python evil.py)` writing files or hitting the network — a subprocess is invisible to
   the hook. **Only an OS sandbox** (bubblewrap / Seatbelt) confines that. vigiles already has
   it; the two layers compose as defense-in-depth: the hook gates _tool-level_ effects, the
   sandbox gates _process-level_ effects.
4. **The Haiku / `/strengthen` pass — the auto-marker (SUGGESTER, never the gate).** At
   compile / via `/strengthen`, a cheap model **proposes** where the effect boundaries should be
   (reads the skill, suggests marks); the author/compile confirms; the deterministic hook
   **enforces**.

## Why it's robust: the failure direction is fail-closed

The research is blunt that an LLM is **a suggester, not a gate** — side-effect detection runs
~75% recall / 17–35% FPR, misses hidden effects, over-marks suggestively-named pure ops. The
"model proposes, deterministic enforces" pattern (AdaTaint, ACSL/Frama-C, VeriGuard) is
established precisely because **the guarantee lives in the deterministic layer; the model only
narrows the search.**

Here that gives a **safe failure direction.** Default = deny side-effecting tools _everywhere
except marked boundaries_, and marks only _add_ confirmed-permitted boundaries. So:

- **Haiku misses a boundary** → the agent is blocked at a place it needed → an annoying but
  **safe** over-block that surfaces the gap.
- **Haiku can NOT create an unsafe allow** — it can't widen the default; a proposed mark is
  confirmed at author/compile time, not trusted blind.

So the model's probabilism is a **UX optimization, not a correctness claim** — exactly the
property that makes "auto mode for side effects" safe to ship on by default.

## The double payoff: the boundary is also the TEST SEAM

A _marked_ side-effect boundary is identical to a test **seam** — the injection point where you
swap the real effect for a stub or a recorded response. So the same mark that gates the effect
in production is the mock/record-replay point in test (`tool-intercept` is already this). Naïve
record-replay without an explicit boundary hits ~62% fidelity (fragile); the mark makes
interception precise. This is the through-line to `typed-contracts-for-agents.md`: **declaring
"side effects only here" buys both the safety gate AND deterministic testability from one mark.**

## Compile-time purity: the `purity` contract + the purity ladder

> **Shipped** (`purity: "pure" | "bounded" | "dangerously-unrestricted"` on the skill/agent
> builder; `purityViolations` in `src/core/effects.ts`; enforced in `compileSkill`/`compileAgent`).
> The RUNTIME half now ships too: `decidePurityGate` (`src/core/effects.ts`) is the per-call
> gate, folded into the agent `PreToolUse` rail (`agent-runtime.ts`) — so `purity` is enforced
> IN THE LOOP, not only at compile.

Can `compile` _statically ensure_ a skill has no side effects? **Yes — but enforce it on the
declared tool contract + the gate, NOT by analyzing the prose.** Analyzing the body to infer
tool use is the wonky, non-deterministic trap (the body is model-interpreted; what tools fire is
a runtime fact). Instead:

```ts
skill({ name: "review", purity: "pure", tools: ["Read", "Grep"] }); // ✓ compiles
skill({ name: "review", purity: "pure", tools: ["Read", "Write"] }); // ✗ compile error:
//   "Write is side-effecting; a pure unit cannot declare it"
```

- **Compile:** `purity: "pure"` fails if the `tools:` contract holds **any** side-effecting tool —
  deterministic, because the tool list is static frontmatter and the read-only/side-effecting
  split is the published catalog. It's the `purityViolations` detector asserting "∅ side-effecting"
  (one-detector-no-drift, reused by `scan`). An **absent** `tools:` list inherits ALL tools, so it
  is checked as the `"*"` wildcard — a violation at the pure/bounded floors, never "trivially pure."
- **Runtime:** the compiled skill ships a rail that **denies every side-effecting tool**, so a
  model that tries one anyway (or a hand-edited `.md`) is still blocked.

So purity is **guaranteed by the gate, not proven from the prose** — `purity: "pure"` makes a pure
skill _holding_ an effect tool **unrepresentable** (compile) and _doing_ an effect
**unreachable** (runtime). It is the strict top of a **3-rung ladder**, not forced on everyone —
and the rung you _declare_ uses the same vocabulary `scan` _reports_ (zero drift):

| Rung (`purity:`)             | Means                                                 | For                             |
| ---------------------------- | ----------------------------------------------------- | ------------------------------- |
| `"pure"`                     | no side-effecting tools, period                       | analysis / review / planning    |
| `"bounded"`                  | Write/Edit + read-only `Bash` (runtime-gated); no MCP | the default (the `release` ex.) |
| `"dangerously-unrestricted"` | anything (the loud, in-review escape hatch)           | legacy / opt-out                |

The loosest rung is named `dangerously-unrestricted` (cf. React's `dangerouslySetInnerHTML`) so
opting OUT of the guardrail stands out in review; omitting `purity` is the same unenforced default
without typing the loud word. NOTE the asymmetry: the **report** (`scan`/`effectSurface`) stays
neutral `unrestricted` — a health report shouldn't scream "dangerous" at every legitimate `Bash`
user (don't-cry-wolf); the alarm lives only at the **declaration** site.

The `Bash` split is now sharp at the FLOOR: `purity: "pure"` ⟹ **no `Bash`** (a pure unit may only
observe; no Bash, fully static — `Bash(git log)` and `Bash(rm -rf /)` are one tool name). But
`bounded` now **admits `Bash`**, because its effect is decidable at the COMMAND level and the
runtime gate confines it: `decidePurityGate` (shipped, wired into the agent `PreToolUse` rail) sees
the live command and calls `isReadOnlyBash` — a read-only `Bash` (`git status`) runs as observation
inside a `bounded` boundary, a mutating `Bash` (`git push`) is denied. So a read-via-`Bash` skill is
`bounded` (not `pure`), and the deterministic Bash-effect classification from
`bash-effect-classification.md` is no longer a future thing but SHIPPED + wired into that gate. The
sandbox remains the indirect-effect backstop.

## Static effect-surface analysis (analyze the harness without running it)

The declared capability sets + effect boundaries make a harness **statically analyzable** —
with one precision: what's static is the **surface** (which capabilities, how many effect
boundaries, the capability graph), **not the runtime call count** (model/task-dependent). The
surface is the more useful thing anyway. Note the SURFACE-vs-FLOOR distinction: the static
**surface** (`effectSurface`, used by `scan`) still reports any `Bash` as `unrestricted` — the
command isn't visible statically — whereas the enforced **floor** (`purityViolations` /
`decidePurityGate`) is what ADMITS and CONFINES `Bash` under `bounded`, the runtime gate reading the
live command. So a `bounded` unit with `Bash` reports an `unrestricted` SURFACE yet enforces a
`bounded` FLOOR; the runtime gate is exactly what closes that gap. From the surface,
deterministically and for free:

- **Blast-radius / attack-surface map** — aggregate the capability graph (which skills/agents
  can write / network / exec / spawn / hit which MCP). The harness's total side-effect surface →
  the trifecta + over-grant checks _and_ a risk profile.
- **Least-privilege / purity audit — a harness-health number.** "9/14 skills pure, 3 bounded, 2
  unrestricted." Higher pure% = more constrained, safer, more analyzable. Deterministic.
- **Test-cost prediction (the big one).** A `pure` skill is deterministically testable (assert,
  no model); a `bounded` skill has _N_ seams to mock; an `unrestricted` skill needs a full
  model-eval. So the static surface **predicts the harness's test/measurement cost** — "X%
  deterministically testable, Y% needs the model tier" — making the R1/R2/R3 cost-tier
  classification (today _surveyed_) **deterministic**, a free `scan`/leaderboard column.
- **Change-impact diffing** — a PR that adds `Write` to a read-only skill _grows the surface_ →
  a privilege escalation, flagged statically in the harness diff.

The tie-back: **the effect surface is a static MEASURE of the harness state space** (pure ≈ 0
degrees of freedom, bounded = small, unrestricted = unbounded). "How constrained is your
harness" becomes a computable number — `harness-state-space.md`'s reduce-the-state-space
principle, made measurable for free before anything runs. Caveat: `unrestricted`/`Bash` skills
are the _unbounded_ cells — the analysis reports "unrestricted" (itself the signal: your blind
spots), not "does N things"; call counts + effect _values_ stay in the eval tier.

## Honest limits

- **`Bash` is undecidable at the tool-name level** (`cat` vs `rm -rf` are the same tool). Either
  pattern-match the command (brittle, needs an allowlist per command) or treat _all_ `Bash` as
  side-effecting (conservative — flags `ls` as an "effect," acceptable for forcing separation).
  The **real** guarantee for `Bash`/subprocess effects is the **sandbox**, not the hook. The
  command-level refinement that classifies the _decidable subset_ of `Bash` command strings by
  effect (AST + command catalog, fail-closed, no LLM — so `git status` ≠ `rm -rf`) is now
  **SHIPPED** (`isReadOnlyBash`) and **wired into the runtime gate** (`decidePurityGate`, on the
  agent `PreToolUse` rail), not just worked out in `bash-effect-classification.md` — so a `bounded`
  agent's `git status` is allowed and `git push` denied at the live call. It sharpens the gate; the
  sandbox remains the indirect/subprocess backstop.
- **MCP tools are unknown-effect by default** (only Codex has a `destructive` annotation) →
  treat unclassified MCP as side-effecting.
- **Full coverage = capability-gate (tool) + boundary-marks + sandbox (process).** All three
  compose; no single layer is sufficient, and the doc must say so (no false "fully sealed" claim).

## What vigiles already has (assemble, don't build from scratch)

- `decidePreToolUse` / the tool-contract rail = the capability gate (the FCIS pure core).
- The bubblewrap / Seatbelt sandbox = the process-level closure.
- `tool-intercept` / `notTool` = the boundary-as-test-seam.
- `/strengthen` = the natural home for the auto-marker pass.

So the work was mostly **wiring existing pieces**. SHIPPED now: (a) effect-classification from the
tool catalog (read-only vs side-effecting), plus the per-call FLOOR gate for agents —
`decidePurityGate` folded into the agent `PreToolUse` rail, refining `Bash` by the live command via
`isReadOnlyBash`. REMAINING: (b) the position-aware effect-BOUNDARY region mark (`effect`` `` —
denying effects OUTSIDE a marked region, vs the current per-call floor) + skill-parity (skills have
no `PreToolUse`rail yet), and (c) the Haiku auto-mark pass in`/strengthen`/compile.

## Recommendation + first step

The **deterministic capability gate at the per-call FLOOR level now SHIPS for agents** (no model,
robust, reuses the rail + sandbox + `isReadOnlyBash`) — `decidePurityGate` denies a side-effecting
tool that violates the declared `purity` floor on every call. The remaining work is the
**position-aware effect-BOUNDARY region mark** (`effect`` `` — denying effects OUTSIDE a marked
region, vs the per-call floor shipped now) + **skill-parity** (skills have no `PreToolUse`rail
yet), then the **Haiku auto-marker as a pure convenience** in`/strengthen`— clearly a suggester,
its output confirmed at compile. Never let the model be the gate. The boundary's double payoff
stands: the same mark that gates an effect lets`tool-intercept` test it deterministically.

## See also

- `typed-contracts-for-agents.md` — the boundary as the test seam; side-effect boundaries make
  skills testable.
- `harness-state-space.md` — the effect-system bet (declared-vs-observed) + capability
  minimization; this is its enforcement design.
- `docs/safety.md` — the bubblewrap/Seatbelt sandbox that closes the indirect-effect hole.
- `spec-api-design.md` — how the effect boundary is declared in the typed contract.
- [`effect-boundary-design.md`](effect-boundary-design.md) — the detailed design for the
  position-aware region mark: authoring surface, compile emission, region-tracking mechanism
  assessment, and recommended sequencing.
