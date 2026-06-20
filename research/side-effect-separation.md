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

## Compile-time purity: the `pure: true` contract + the purity ladder

Can `compile` _statically ensure_ a skill has no side effects? **Yes — but enforce it on the
declared tool contract + the gate, NOT by analyzing the prose.** Analyzing the body to infer
tool use is the wonky, non-deterministic trap (the body is model-interpreted; what tools fire is
a runtime fact). Instead:

```ts
skill({ name: "review", pure: true, tools: ["Read", "Grep"] }); // ✓ compiles
skill({ name: "review", pure: true, tools: ["Read", "Write"] }); // ✗ compile error:
//   "Write is side-effecting; a pure skill cannot declare it"
```

- **Compile:** `pure: true` fails if the `tools:` contract holds **any** side-effecting tool —
  deterministic, because the tool list is static frontmatter and the read-only/side-effecting
  split is the published catalog. It's the existing `verifyToolContract` detector asserting
  "∅ side-effecting" (one-detector-no-drift).
- **Runtime:** the compiled skill ships a rail that **denies every side-effecting tool**, so a
  model that tries one anyway (or a hand-edited `.md`) is still blocked.

So purity is **guaranteed by the gate, not proven from the prose** — `pure:true` makes a pure
skill _holding_ an effect tool **unrepresentable** (compile) and _doing_ an effect
**unreachable** (runtime). It is the strict top of a **3-level ladder**, not forced on everyone:

| Level                      | Means                                | For                             |
| -------------------------- | ------------------------------------ | ------------------------------- |
| `pure: true`               | no side-effecting tools, period      | analysis / review / planning    |
| **bounded** (`effect\`\``) | effects only inside the marked block | the default (the `release` ex.) |
| unrestricted               | anything                             | legacy / escape hatch           |

The honest hole is the same `Bash` one: `pure:true` ⟹ **no `Bash`** (a side-effecting catch-all
— `Bash(git log)` and `Bash(rm -rf /)` are one tool). A read-via-`Bash` skill is therefore
`bounded`, not `pure`, unless it swaps to a typed read-only tool or opts into a narrow
command-pattern allowlist (brittle). The sandbox remains the indirect-effect backstop.

## Honest limits

- **`Bash` is undecidable at the tool-name level** (`cat` vs `rm -rf` are the same tool). Either
  pattern-match the command (brittle, needs an allowlist per command) or treat _all_ `Bash` as
  side-effecting (conservative — flags `ls` as an "effect," acceptable for forcing separation).
  The **real** guarantee for `Bash`/subprocess effects is the **sandbox**, not the hook.
- **MCP tools are unknown-effect by default** (only Codex has a `destructive` annotation) →
  treat unclassified MCP as side-effecting.
- **Full coverage = capability-gate (tool) + boundary-marks + sandbox (process).** All three
  compose; no single layer is sufficient, and the doc must say so (no false "fully sealed" claim).

## What vigiles already has (assemble, don't build from scratch)

- `decidePreToolUse` / the tool-contract rail = the capability gate (the FCIS pure core).
- The bubblewrap / Seatbelt sandbox = the process-level closure.
- `tool-intercept` / `notTool` = the boundary-as-test-seam.
- `/strengthen` = the natural home for the auto-marker pass.

So the work is mostly **wiring existing pieces** + three additions: (a) effect-classification
from the tool catalog (read-only vs side-effecting), (b) the effect-boundary mark + the gate
keyed on it, (c) the Haiku auto-mark pass in `/strengthen`/compile.

## Recommendation + first step

Ship the **deterministic capability gate + the effect-boundary mark first** (no model, robust,
reuses the rail + sandbox), default-deny side-effecting tools outside a marked boundary. Add the
**Haiku auto-marker as a pure convenience** in `/strengthen` — clearly a suggester, its output
confirmed at compile. Never let the model be the gate. First experiment: take one real
side-effecting skill, mark its boundary, and show (a) the gate blocks an effect outside it and
(b) the same boundary lets `tool-intercept` test it deterministically — the two payoffs from one
mark.

## See also

- `typed-contracts-for-agents.md` — the boundary as the test seam; side-effect boundaries make
  skills testable.
- `harness-state-space.md` — the effect-system bet (declared-vs-observed) + capability
  minimization; this is its enforcement design.
- `docs/safety.md` — the bubblewrap/Seatbelt sandbox that closes the indirect-effect hole.
- `spec-api-design.md` — how the effect boundary is declared in the typed contract.
