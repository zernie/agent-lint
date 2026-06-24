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
- [The roles](#the-roles)
- [The vocabulary](#the-vocabulary)
- [Observe mode (shadow rollout)](#observe-mode-shadow-rollout)
- [Deciding on external state (context providers)](#deciding-on-external-state-context-providers)
- [Compile and wire](#compile-and-wire)
- [Where things live](#where-things-live)
- [Testing a compiled hook](#testing-a-compiled-hook)
- [Proof: the OSS dogfood](#proof-the-oss-dogfood)
- [Limitations & trade-offs (the cons)](#limitations--trade-offs-the-cons)
- [See also](#see-also)

## The bug classes it eliminates

A compiled hook **eliminates an entire class of bugs by construction** — not by
catching them after the fact, but by making them impossible to write. Each row
below is a _verified_, common failure of hand-written hooks (sources linked; full
corpus: [`research/hook-pain-points.md`](../research/hook-pain-points.md)):

| Bug class                                                                                                                                                                                                                                                                                                                                          | Why it can't happen                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **False confidence** — the #1 pain: `exit 1` instead of `exit 2`, the wrong JSON field (`decision` vs `permissionDecision`), a wrong `jq` path → a guard that _looks_ like it blocks and silently allows ([RFC #45427](https://github.com/anthropics/claude-code/issues/45427), [#24327](https://github.com/anthropics/claude-code/issues/24327)). | You never write the protocol. You return `deny(reason)`; the compiler emits the correct exit code / JSON field for the event. The bug has no place to live.                                                                               |
| **Matcher bypass** — `Bash(git push:*)` (or a hand-written `grep`) misses `cd repo && git push -f` ([#30519](https://github.com/anthropics/claude-code/issues/30519)).                                                                                                                                                                             | `command.runs("git push", { force: true })` is **AST-backed** — it sees the real `git push` leaf however it's wrapped (compound, subshell, pipeline). A `grep` false-_positive_ is gone too.                                              |
| **Capability creep / supply chain** — a hook is arbitrary code; a copied or edited one can read secrets or phone home ([CVE-2025-59536](https://www.cve.org/CVERecord?id=CVE-2025-59536)).                                                                                                                                                         | **Capability = API surface.** An `import` of anything but `vigiles/hook` (or `eval`/`Function`) **does not compile**. The compiled artifact is **stamped** (SHA-256) — a later hand-edit breaks the stamp and the runtime **refuses** it. |
| **Category mistakes** — "block on a `SessionStart`/`PostToolUse` hook", whose decision is a documented no-op ([#4362](https://github.com/anthropics/claude-code/issues/4362)).                                                                                                                                                                     | Each role has its own return type. An inject/react hook has **no `deny`** in its vocabulary, so the mistake is a **`tsc` type error**, not a silent no-op.                                                                                |

The unifying idea: a hook is a tiny program, and a closed, typed vocabulary
shrinks its state space until the bad states are simply not expressible. (The
[analogical-transfer thesis](../research/harness-state-space.md): make invalid
harness states unreachable.)

## The roles

A hook's _output_ depends on _when_ it fires. vigiles gives each its own builder
and its own return type, so the wrong output for an event won't type-check:

- **`defineHook` / `defineFileGate`** — a **tool gate** (`PreToolUse`). Returns a
  `Decision`: `allow()`, `deny(reason)`, or `ask(reason)`. `deny` is the only
  thing that blocks; the compiler maps it to `exit 2`. `defineHook` sees the Bash
  command (`e.command`); `defineFileGate` sees the file path (`e.path`).
- **`definePromptGate`** — a **prompt gate** (`UserPromptSubmit`). Sees the prompt
  **text** (`e.prompt`) and returns a `Decision` — `deny` blocks/erases the
  prompt (a security filter that refuses a prompt leaking a secret or carrying an
  injection).
- **`defineStopGate`** — a **stop gate** (`Stop` / `SubagentStop`). Returns a
  `Decision` — `deny` keeps the agent **going** (gate-until-tests-pass; the reason
  is fed back to the model). Honour `e.stopHookActive` (the loop guard): `allow`
  when it's set, or you can wedge the agent in a stop→continue loop.
- **`defineInject`** — an **inject** (`SessionStart` / `UserPromptSubmit`).
  Returns an `Injection` (`inject(text)`) — context added to the model. It has
  **no `deny`**: a no-decision event can't block.
- **`defineReact`** — a **react** (`PostToolUse`). Returns a `Reaction` —
  `run(cmd)`, `notice(msg)`, or `nothing()`. The tool already ran, so it **can't
  block**; it sees the tool's **response** (`e.response`, e.g. react only on a
  failure), and `run(cmd)`'s effect is **classified at construction** (read-only /
  side-effecting), so every reaction is auditable without running it.

Every **gate** (tool / prompt / stop) takes an optional `mode` — see
[Observe mode](#observe-mode-shadow-rollout).

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
- **`e.prompt`** (UserPromptSubmit) — the user's prompt text (a plain string).
- **`e.stopHookActive`** (Stop) — the loop guard; `allow()` when it's `true`.
- **`e.response`** (PostToolUse react) — a `ResponseView`: `isError()` (the tool failed) and `contains(needle)`.
- **`allow()` / `deny(reason)` / `ask(reason)`** — the gate decision (every gate role).
- **`inject(text)`** — inject output. **`run(cmd)` / `notice(msg)` / `nothing()`** — react output.

A prompt gate and a stop gate read like any other gate — they just decide over a
different event:

```ts
import { definePromptGate, deny, allow } from "vigiles/hook";

// Refuse a prompt that looks like it's pasting a secret key.
export default definePromptGate({
  on: "UserPromptSubmit",
  decide: (e) =>
    /sk-[a-z0-9]{20}/i.test(e.prompt)
      ? deny("your prompt looks like it contains a secret key")
      : allow(),
});
```

```ts
import { defineStopGate, deny, allow } from "vigiles/hook";

// Don't let the agent stop while the tests are red.
export default defineStopGate({
  on: "Stop",
  decide: (e) =>
    e.stopHookActive // a prior block already fired — let it stop now (loop guard)
      ? allow()
      : deny("keep going until `npm test` passes"),
});
```

## Observe mode (shadow rollout)

A brand-new gate is risky to switch straight to blocking — what if it's too
aggressive and stops work you wanted? Every gate takes a `mode`:

- **`enforce`** (default) — block on `deny`.
- **`observe`** — the **shadow / rollout** mode: compute the same decision,
  **record** what it _would_ have blocked, and **let everything through**. Watch
  the log, confirm it only flags the bad stuff, then promote to `enforce`.

```ts
export default defineHook({
  on: "PreToolUse",
  match: tool("Bash"),
  mode: "observe", // ← shadow: record, don't block
  decide: (e) =>
    e.command.runs("git push", { force: true })
      ? deny("force-push to a protected branch")
      : allow(),
});
```

In observe mode the runtime exits `0` (never blocks) and appends a record to
**`.vigiles/hook-observations.jsonl`** (`{ ts, hook, event, would, reason }`) plus
a one-line `⚠ [vigiles observe]` note. It's **harness-neutral** — exit 0 + a
local record behaves identically on Claude Code and Codex, no harness-specific
field names involved.

## Deciding on external state (context providers)

A pure gate can only see the command/path/prompt/response. But a real guard often
needs **external state** to decide — "is this a push to `main`?", "is the tree
dirty?". A hand-written hook would shell out (`$(git branch --show-current)`); a
compiled hook **can't do I/O** (that's the capability guarantee). The fix, the
same one Cedar/OPA/Gatekeeper use: **the hook never fetches — it declares what it
needs, and the trusted runtime gathers those read-only facts and hands them in**
as `e.ctx`.

```ts
import { defineHook, tool, deny, allow } from "vigiles/hook";

export default defineHook({
  on: "PreToolUse",
  match: tool("Bash"),
  needs: ["git.branch"], //                ← declared; gathered by the runtime
  decide: (e) =>
    e.ctx["git.branch"] === "main" && e.command.runs("git push")
      ? deny("no direct pushes to main")
      : allow(),
});
```

The guarantee is intact and **stronger**: the hook still does zero I/O; the
runtime runs `git branch --show-current` (provably read-only) and injects the
result. `needs` is **typed** — reading an undeclared fact (`e.ctx["cwd"]` here) is
a `tsc` error, and an unknown provider name **won't compile** — so the
capability surface stays explicit and auditable.

**Built-in providers:** `git.branch`, `git.isDirty`, `git.root`, `cwd`,
`os.platform`, `env.isCI` — zero-arg, read-only. (A provider that can't resolve —
e.g. not a git repo — yields its default, never an error.) The set is
deliberately small; a 20+ OSS survey found most facts a hook reads are already
event data, and the long tail belongs in the opt-out, not a growing catalog.
(`env.isCI` uses the [`ci-info`](https://www.npmjs.com/package/ci-info) library —
the one fact where a maintained lib beat hand-rolling; git facts stay read-only
shell commands, platform is `process.platform`.)

**The lightweight opt-out — `provide` / `dangerously`.** For a one-off,
off-catalog fact you don't want to register a whole provider for, declare an
**inline** command right in `needs`:

```ts
import { defineHook, tool, deny, allow, provide } from "vigiles/hook";

export default defineHook({
  on: "PreToolUse",
  match: tool("Bash"),
  needs: [provide("k8sCtx", "kubectl config current-context")], // read-only, inline
  decide: (e) =>
    e.ctx.k8sCtx === "prod" && e.command.runs("kubectl delete")
      ? deny("no kubectl delete against prod")
      : allow(),
});
```

The trusted runtime runs the command (so `decide` still does zero I/O) and hands
its stdout in as `e.ctx[name]`. `provide(name, cmd)` requires a **provably
read-only** command (compile rejects it otherwise); `dangerously(name, cmd)` is
the **loud, greppable escape** for a command that isn't (the
`dangerouslySetInnerHTML` / `unsafe` convention — a security review searches for
that one word).

**Reusable registered providers.** For a fact several hooks share, register it
once in `.vigiles/providers/<name>.{mjs,ts}` and reference it by name:

```ts
// .vigiles/providers/k8sCtx.mjs
import { defineProvider } from "vigiles/hook";
export default defineProvider({
  name: "k8sCtx",
  run: "kubectl config current-context",
});

// any hook:  needs: [provider("k8sCtx")]  →  e.ctx.k8sCtx
```

`vigiles compile` validates each provider is read-only (or `dangerous: true`) and
that every `provider()` ref resolves to a registered file.

**The opt-out ladder** (you're **never trapped**): built-in providers → inline
`provide` / `dangerously` → **registered `defineProvider`** (reusable, named) →
the **shell lane** (a hand-written `.sh` for arbitrary in-decision logic, verified
with the disaster battery). You always know which rung you're on. Full design +
the "every real-world hook maps to a tier" coverage proof:
[`research/hook-context-providers.md`](../research/hook-context-providers.md).

## Compile and wire

Put your hook source in **`.vigiles/hooks/`**. The typed program is
harness-neutral — it imports `vigiles/hook` and compiles to _whichever_ harness
you target — so it lives in vigiles's own dir, not a harness's `.claude/`. Then:

```bash
npx vigiles compile                                  # discovers .vigiles/hooks/* (and your specs)
npx vigiles compile .vigiles/hooks/safe-bash-guard.mjs   # …or target one file
```

There is **no separate `compile-hook` verb** — compiling a typed authoring
artifact into the harness's native format is _one_ verb, whatever the artifact (a
`.spec.ts` → markdown, a hook → a wired config). `compile`:

1. runs the **capability check** (an out-of-vocabulary import fails the build);
2. **merges** the hook block into the active harness's config —
   `.claude/settings.json` (JSON) or `.codex/config.toml` (TOML) — **idempotently**,
   keyed by the hook path, so recompiling updates in place and never clobbers
   your own hand-written hooks;
3. writes a **tamper-evident stamp** beside the source.

The merged block routes the live event to **`vigiles hook-runtime run-program <file>`**:

```jsonc
// .claude/settings.json — written (not pasted) by `vigiles compile`
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "npx vigiles hook-runtime run-program .vigiles/hooks/safe-bash-guard.mjs",
          },
        ],
      },
    ],
  },
}
```

`hook-runtime run-program` is a **hidden runtime entrypoint** — invoked by the
harness on every matching event, never typed by hand. It loads your typed
program, **verifies the stamp** (a hand-edited artifact is refused — fail
closed), and dispatches by role: a gate `exit 2`s on `deny`, an inject prints
`additionalContext`, a react runs its classified command. You wrote none of that
protocol. (`compile` is the one-time _wiring_ step; `hook-runtime` is the
per-event _executor_ the wiring points at — see the
[CLI surface](cli.md) for why they're distinct.)

Hooks can be authored in JavaScript (`.mjs`) or TypeScript (run under `tsx` /
Node ≥ 23.6). `vigiles/hook` is the **only** import a compiled hook may use.

**Multi-harness.** The typed program is harness-neutral; only the merged config
differs. `vigiles compile --harness=codex` merges a Codex `config.toml`
`[[hooks.<event>]]` block (an anchored-regex matcher) instead of Claude Code's
`settings.json` JSON — and the gate runtime is shared, since Codex vetoes a tool
call via `exit 2` exactly as Claude Code does. Inject/ask **output** on Codex is
the one deferred piece (its field shape is CC-confirmed only); `compile
--harness=codex` warns loudly on an inject/react hook rather than ship a
maybe-no-op — see [`research/compiled-hooks-codex.md`](../research/compiled-hooks-codex.md).

## Where things live

Everything is committed, and the source is **adapter-agnostic** — one hook
compiles to any harness you target:

| Artifact            | Location                                       | Why                                                                 |
| ------------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| **Hook source**     | `.vigiles/hooks/*.{mjs,ts}`                    | harness-neutral — one source, fans out to any harness               |
| **Provider source** | `.vigiles/providers/*.{mjs,ts}`                | registered context providers (`defineProvider`), referenced by name |
| **Tamper stamp**    | `.vigiles/hooks/<name>.json`                   | the runtime verifies it before running the hook                     |
| **Wiring**          | `.claude/settings.json` / `.codex/config.toml` | `compile` merges it in per harness (a multi-harness repo gets both) |

Hooks are **not** auto-discovered by sitting just anywhere — they must be under
`.vigiles/hooks/` (or named explicitly to `compile`). Because they share one
dir, basenames are unique, so the stamp keys safely on the basename.

## Testing a compiled hook

Because the decision is a **pure function**, you test it deterministically — no
model, and (cheapest) no subprocess. Three levels, by cost:

**1. In-process (cheapest).** Pass the hook and a raw event to `assertHookDenies`
/ `assertHookAllows` — no `node` spawn, no CLI, milliseconds:

```ts
import { it } from "vitest";
import { assertHookDenies, assertHookAllows } from "vigiles/unit";
import guard from "./safe-bash-guard.mjs"; // the hook's default export

it("blocks a force-push, even hidden in a compound command", () => {
  assertHookDenies(guard, {
    tool_name: "Bash",
    tool_input: { command: "cd x && git push -f" },
  });
  assertHookAllows(guard, {
    tool_name: "Bash",
    tool_input: { command: "git status" },
  });
});
```

`runHookProgram(hook, event)` is the underlying primitive — it returns a
normalized outcome (`{ kind: "decision" | "injection" | "reaction", … }`)
dispatched by role, so an inject or react hook is just as testable as a gate.

**2. Through the real runtime.** `runHook("node … hook-runtime run-program guard.mjs",
event)` drives the actual compiled CLI (stamp check + dispatch) — proves the
wired artifact behaves, still no model. Pair it with the disaster battery:
`assertBlocksDisasters("node … hook-runtime run-program guard.mjs")` proves the gate
blocks every textbook disaster.

**3. Does it fire in the assembled harness?** `runHarnessTest` (a scripted mock
model emits the tool call; assert the hook blocked) — the delivery question,
key-free, and capped by the [delivery floor](#limitations--trade-offs-the-cons).

See [Testing your harness](harness-testing.md) for the tiers in full.

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

Beyond the headline number, the **structural** wins over hand-written guards —
each isolated in CI ([`src/hook-oss-comparison.test.ts`](../src/hook-oss-comparison.test.ts))
so it's non-circular — are: **evasion** (the AST catches the compound `cd … && git
push -f` a substring/glob misses), **precision** (no `grep` false-positive on a
benign `echo`), and **protocol** (a mis-wired `exit 1` is false confidence; the
compiled exit code can't be wrong). The honest other side — stateful guards, broad
I/O, and delivery (#34692) are NOT compiled-hook wins — plus the full head-to-head
table and provenance, are in
[`research/hook-oss-comparison.md`](../research/hook-oss-comparison.md).

## Limitations & trade-offs (the cons)

Compiled hooks are neither free nor magic. The honest downsides:

- **Delivery floor — a gate is a strong default, not an unbypassable wall.**
  Compiling fixes a hook's _authoring_ and _logic_, **not** how the harness
  _delivers_ events to it. Claude Code's
  [#34692](https://github.com/anthropics/claude-code/issues/34692) (closed
  not-planned) means a `PreToolUse` hook **does not fire for a subagent's tool
  calls**, and the model can route around a tool entirely
  ([#45427](https://github.com/anthropics/claude-code/issues/45427) /
  [#32376](https://github.com/anthropics/claude-code/issues/32376) — e.g. a Bash
  heredoc instead of `Write`). A compiled hook removes the bugs that are
  _yours_; it can't remove the harness's. So the most robust claim is about
  **logic**, not live enforcement — which is why
  [guardrail verification](harness-testing.md) (prove the decision blocks the
  disaster battery) is the companion that survives this bug. **Never call a gate
  "unbypassable."**
- **Runtime cost.** Every matching event spawns `node` and dynamic-imports your
  program — tens to hundreds of ms per call. Fine for a `PreToolUse` gate; think
  twice before a hot-path `PostToolUse` react that fires on every edit.
- **Buy-in.** It's a dependency plus a build step, and you author in JS/TS, not a
  3-line inline `bash` hook. For a trivial one-liner the compiled path is heavier
  — the payoff is on the guards that actually have to be _correct_.
- **A bounded vocabulary is a ceiling, by design** — but be precise about which
  bound. (1) What a hook can _do_: `checkHookImports` forbids any import but
  `vigiles/hook` (no `fs`/`net`/`child_process`), so a hook that must _call a
  service, read a file, or hold cross-invocation state_ to decide can't be
  expressed. That is the **deliberate** ceiling — it _is_ the safety guarantee,
  and such hooks stay hand-written (keep a plain shell hook and verify it with
  the disaster battery). (2) What a hook can _see_: the AST matchers
  (`runs`/`touches`/`pipesToShell`/`under`) are a **soft, extensible** limit, not
  a fundamental one — if you need to match a shape they don't expose yet, the fix
  is a new matcher (e.g. `touches`/`pipesToShell` were added the same way), not a
  redesign.
- **Compiling proves the protocol, not your policy.** A compiled hook can't have
  the wrong exit code — but it can still `deny` the wrong thing. Compiling is
  necessary, not sufficient; test the _logic_ with
  [guardrail verification](harness-testing.md).
- **Codex inject/ask output is unconfirmed.** The gate (`deny` → exit 2) path is
  cross-harness today; an inject/react hook's _output_ shape is Claude-Code-confirmed
  only, so `compile --harness=codex` **warns loudly** on those rather than
  ship a maybe-no-op (see [Compile and wire](#compile-and-wire) and
  [`research/compiled-hooks-codex.md`](../research/compiled-hooks-codex.md)).

## See also

- [Testing your harness](harness-testing.md) — the test tiers; `runHook` unit-tests a hook's decision, and `assertBlocksDisasters` proves a guardrail blocks.
- [Verifying your instruction files](verifying-instruction-files.md) — the linting layer (references are _true_); compiled hooks are the **gate** instrument beside it.
- [CLI & GitHub Action](cli.md) — `compile` / `hook-runtime` reference.
- [`research/hook-pain-points.md`](../research/hook-pain-points.md) — the verified failure corpus + the design record.
