# Compiled hooks — author a hook that can't be wrong

A hook is the harness's deterministic gate: the one place that can _stop_ the
agent before it does something irreversible. But a hook today is opaque shell
(`bash guard.sh`) — and the parts you hand-write are exactly the parts that fail
silently. The [README](../README.md) has the pitch; this is the full guide.

vigiles lets you author a hook as a **pure typed function** `(event) => Decision`
against a **closed vocabulary** (`vigiles/hook`), then compiles it to the harness
protocol. The point isn't ergonomics — it's that **whole classes of hook bugs
become unrepresentable**: you can't write the bug because the API has no way to
express it.

## Contents

- [The bug classes it eliminates](#the-bug-classes-it-eliminates)
- [The three roles](#the-three-roles)
- [The vocabulary](#the-vocabulary)
- [Compile and run](#compile-and-run)
- [Proof: the OSS dogfood](#proof-the-oss-dogfood)
- [Honest scope — the delivery floor](#honest-scope--the-delivery-floor)
- [See also](#see-also)

## The bug classes it eliminates

Each is a _verified_, common failure of hand-written hooks (full corpus:
[`research/hook-pain-points.md`](../research/hook-pain-points.md)). A compiled hook
makes each one impossible **by construction**, not by catching it after the fact:

| Bug class                                                                                                                                                                                                 | Why it can't happen                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **False confidence** — the #1 pain. `exit 1` instead of `exit 2`, the wrong JSON field (`decision` vs `permissionDecision`), a wrong `jq` path → a guard that _looks_ like it blocks and silently allows. | You never write the protocol. You return `deny(reason)`; the compiler emits the correct exit code / JSON field for the event. The bug has no place to live.                                                                                   |
| **Matcher bypass** — `Bash(git push:*)` (or a hand-written `grep`) misses `cd repo && git push -f` ([#30519](https://github.com/anthropics/claude-code/issues/30519)).                                    | `command.runs("git push", { force: true })` is **AST-backed** — it sees the real `git push` leaf however it's wrapped (compound, subshell, pipeline). A `grep` false-_positive_ is gone too.                                                  |
| **Capability creep / supply chain** — a hook is arbitrary code; a copied or edited one can read secrets or phone home.                                                                                    | **Capability = API surface.** An `import` of anything but `vigiles/hook` (or `eval`/`Function`) **does not compile**. And the compiled artifact is **stamped** (SHA-256) — a later hand-edit breaks the stamp and the runtime **refuses** it. |
| **Category mistakes** — "block on a `SessionStart`/`PostToolUse` hook" (a documented no-op, since those events can't block).                                                                              | Each role has its own return type. An inject/react hook has **no `deny`** in its vocabulary, so the mistake is a **`tsc` type error**, not a silent no-op.                                                                                    |

The unifying idea: a hook is a tiny program, and a closed, typed vocabulary
shrinks its state space until the bad states are simply not expressible. (The
[analogical-transfer thesis](../research/harness-state-space.md): make invalid
harness states unreachable.)

## The three roles

A hook's _output_ depends on _when_ it fires. vigiles gives each its own builder
and its own return type, so the wrong output for an event won't type-check:

- **`defineHook` / `defineFileGate`** — a **gate** (`PreToolUse`). Returns a
  `Decision`: `allow()`, `deny(reason)`, or `ask(reason)`. `deny` is the only
  thing that blocks; the compiler maps it to `exit 2`.
- **`defineInject`** — an **inject** (`SessionStart` / `UserPromptSubmit`).
  Returns an `Injection` (`inject(text)`) — context added to the model. It has
  **no `deny`**: a no-decision event can't block.
- **`defineReact`** — a **react** (`PostToolUse`). Returns a `Reaction` —
  `run(cmd)`, `notice(msg)`, or `nothing()`. The tool already ran, so it **can't
  block**; and `run(cmd)`'s effect is **classified at construction** (read-only /
  side-effecting), so every reaction is auditable without running it.

## The vocabulary

The entire surface a hook may touch (that's the safety guarantee):

```ts
import { defineHook, tool, deny, allow } from "vigiles/hook";

// Block any force-push to a protected branch — including one hidden in a
// compound command, which a glob/grep matcher misses.
export default defineHook({
  on: "PreToolUse",
  match: tool("Bash"),
  decide: (e) =>
    e.command.runs("git push", { force: true })
      ? deny("no force-push to a protected branch")
      : allow(),
});
```

- **`tool(name)` / `tools(...names)`** — which tool(s) the hook matches.
- **`e.command`** (Bash) — an AST-backed `CommandView`:
  - `runs(program, { force? })` — a leaf runs `program` (e.g. `"git reset --hard"`), optionally forced.
  - `touches(prefixes)` — a leaf references a path under one of `prefixes` (e.g. `["~/.ssh", ".env"]`) — secret reads.
  - `pipesToShell()` — pipes into a bare shell (`curl … | sh`) — remote-code execution. A shell _with_ a script file (`sh deploy.sh`) is **not** flagged.
  - `isSideEffecting()` — the deterministic Bash-effect classifier's verdict.
- **`e.path`** (Edit/Write) — a `PathView` with `under(prefixes)` for path confinement.
- **`allow()` / `deny(reason)` / `ask(reason)`** — the gate decision.
- **`inject(text)`** — inject output. **`run(cmd)` / `notice(msg)` / `nothing()`** — react output.

## Compile and run

```bash
npx vigiles compile-hook my-guard.mjs
```

`compile-hook` runs the capability check (an out-of-vocabulary import fails the
build), prints the **settings block** to paste into your hooks config, and writes
a **tamper-evident stamp** sidecar:

```jsonc
// .claude/settings.json — the emitted block routes the live event to the runtime
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "npx vigiles run-hook-program my-guard.mjs",
          },
        ],
      },
    ],
  },
}
```

`run-hook-program` is the runtime the block points at: it loads your typed
program, **verifies the stamp** (a hand-edited artifact is refused — fail closed),
and dispatches by role — a gate `exit 2`s on `deny`, an inject prints
`additionalContext`, a react runs its classified command. You wrote none of that
protocol.

Hooks can be authored in JavaScript (`.mjs`) or TypeScript (run under `tsx` /
Node ≥ 23.6). `vigiles/hook` is the **only** import a compiled hook may use.

**Multi-harness.** The typed program is harness-neutral; only the emitted block
differs. `compile-hook --harness=codex` writes a Codex `config.toml`
`[[hooks.<event>]]` block (an anchored-regex matcher) instead of Claude Code's
`settings.json` JSON — and the gate runtime is shared, since Codex vetoes a tool
call via `exit 2` exactly as Claude Code does. Inject/ask **output** on Codex is
the one deferred piece (its field shape is CC-confirmed only); `compile-hook
--harness=codex` warns loudly on an inject/react hook rather than ship a
maybe-no-op — see [`research/compiled-hooks-codex.md`](../research/compiled-hooks-codex.md).

## Proof: the OSS dogfood

We pointed the [`DISASTER_CATALOG`](../README.md#-test--does-your-harness-do-its-job)
battery (force-push, compound force-push, `reset --hard`, `rm -rf`,
`--no-verify`, private-SSH-key read, `curl | sh`) at the widely-copied
`disler/claude-code-hooks-mastery` safety hook: it blocks **2 of 7**, silently
missing the other five. The compiled equivalent
([`examples/harness/safe-bash-guard.mjs`](../examples/harness/safe-bash-guard.mjs))
blocks **7 of 7** by construction — same intent, no blind spots, no protocol bug.
The contrast is a runnable, model-free regression test
([`src/hook-dogfood.test.ts`](../src/hook-dogfood.test.ts)). Full finding:
[`research/hook-pain-points.md`](../research/hook-pain-points.md).

## Honest scope — the delivery floor

Compiling a hook fixes its **authoring** and its **logic** — that it is correct,
safe, AST-accurate, capability-bounded, and tamper-evident. It does **not** change
how the harness **delivers** events to it. In particular, Claude Code's
[#34692](https://github.com/anthropics/claude-code/issues/34692) (closed
not-planned) means a `PreToolUse` hook **does not fire for a subagent's tool
calls** — so a gate, compiled or hand-written, is a **strong default, never an
unbypassable wall**. A compiled hook removes the bugs that are _yours_ to remove;
it can't remove the harness's.

The corollary: the most robust claim is about **logic**, not live enforcement —
which is why [guardrail verification](harness-testing.md) (prove your hook blocks
the disaster battery) survives the delivery bug, and a gate is positioned as a
default, not a guarantee.

## See also

- [Testing your harness](harness-testing.md) — the test tiers; `runHook` unit-tests a hook's decision, and `assertBlocksDisasters` proves a guardrail blocks.
- [Verifying your instruction files](verifying-instruction-files.md) — the linting layer (references are _true_); compiled hooks are the **gate** instrument beside it.
- [CLI & GitHub Action](cli.md) — `compile-hook` / `run-hook-program` reference.
- [`research/hook-pain-points.md`](../research/hook-pain-points.md) — the verified failure corpus + the design record.
