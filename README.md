<!--
  README DIRECTION — read before editing; keep changes aligned.
  This file is the FRONT DOOR + a marketing asset for someone who already lives
  in Claude Code / Codex. Optimize for a phone-skimmer.

  1. LEAD WITH BENEFITS, not mechanics or vocabulary. Say what the user GETS
     (a guard that can't silently fail; a CLAUDE.md that stops lying) before how.
  2. COMPILED SPECS ARE EASY — reassure, never intimidate. You rarely hand-write
     a .spec.ts: model-invocable skills (edit-spec / strengthen / test-harness)
     author + edit it, and hooks auto-compile on save. Present the typed spec as
     the SMOOTH, AUTO-ENFORCED next step you don't think about — the natural
     evolution (JS→TS: gradual, strict opt-in), NEVER a wall. Markdown + inline
     mode work with zero TS for anyone not there yet (progressive adoption).
  3. ALL FOUR INSTRUMENTS stay first-class — including Eval (measuring whether a
     skill actually helps is core, not optional).
  4. SCANNABLE + SHORT — ~200-line cap; punchy table cells, bullets, runnable
     blocks; benefits over jargon. Push depth into docs/ and LINK it.
  5. NO INTERNAL VOCABULARY (moat / measurement-authority / flywheel) and NO
     research/ links — name the user benefit (see public-vs-internal-docs +
     readme-brevity in CLAUDE.md).
-->

<p align="center">
  <img src="logo.png" width="140" alt="vigiles logo" />
</p>

<h1 align="center">vigiles</h1>

<p align="center">
  <strong>Make the harness your AI agent runs on reliable.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/vigiles"><img src="https://img.shields.io/npm/v/vigiles?color=orange" alt="npm version" /></a>
  <a href="https://github.com/zernie/vigiles/actions"><img src="https://img.shields.io/github/actions/workflow/status/zernie/vigiles/ci.yml?branch=main" alt="CI" /></a>
  <a href="https://github.com/zernie/vigiles/blob/main/LICENSE"><img src="https://img.shields.io/github/license/zernie/vigiles" alt="License" /></a>
</p>

---

`Agent = Model + Harness`. The model gets the headlines — but the **harness** (your
CLAUDE.md, hooks, and skills) is the half you control, and it fails **silently**: a
stale reference, a guard that fails open, a skill that never fires. vigiles[^name]
makes it prove itself — verify, gate, test, measure — mostly free, no API key; the
real-model checks run on your **Claude Pro/Max subscription, not metered tokens**.
Four instruments, adopt any:

|              |                                                                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **🔎 Lint**  | Your CLAUDE.md stops lying to the agent — every path, script, symbol & linter rule checked against **reality**, not just well-formed. **[→](docs/verifying-instruction-files.md)** |
| **🛡 Guard** | A safety hook that **can't silently fail open** — write it as a typed function, vigiles compiles a guard that actually blocks. **[→](docs/compiled-hooks.md)**                     |
| **🧪 Test**  | Prove your hooks, skills & subagents actually do their job — **free, no API key**. **[→](docs/harness-testing.md)**                                                                |
| **📊 Eval**  | Know if a skill helps or just costs — **A/B on real tasks**: the bill + correctness, on your own subscription. **[→](docs/measuring-skills.md)**                                   |

Pick the one that hurts today. **No TypeScript?** `vigiles lint` + inline
`<!-- vigiles:enforce -->` comments work on any CLAUDE.md. **Ship plugins?**
`vigiles scan` ranks a marketplace by structural health, no key. **Works with
Claude Code and Codex** ([`vigiles/codex`](docs/harnesses.md)), or
[teach it your own harness](docs/authoring-an-adapter.md).

## Quick start

**Paste into Claude Code or Codex:**

```text
Set up vigiles in this repo with good defaults (lint + test, non-interactive).
Verify my CLAUDE.md / AGENTS.md references and show me what's stale, then write
and run a harness test for one of my hooks or skills. Ask me first before gating
it in CI, adding a real-model eval, or enforcing strictly (--strict).
```

Or do it yourself:

```bash
npx vigiles init   # sets up lint + test: spec + harness test + CI + plugin
```

Interactive in a terminal, non-interactive for agents/CI (or `--yes`).

**You don't hand-write specs — your agent does.** `init` installs model-invocable
skills, so a plain-English ask does the work. The typed spec is **TypeScript for
your harness** — opt-in, gradual, auto-compiled on save, never a chore:

- _"test my skills"_ → scaffolds **and runs** a trigger/behaviour test (`test-harness`)
- _"harden my rules"_ → upgrades prose guidance into enforced linter rules (`strengthen`)
- _"add a rule to my CLAUDE.md"_ → edits the typed spec and recompiles (`edit-spec`)

<details>
<summary>What <code>init</code> sets up</summary>

- **Both lint and test** by default; scope with `--lint` / `--test`.
- Adds `vigiles` to `devDependencies`; installs the Claude Code plugin (skills + hooks) via the marketplace — globally, never vendored.
- Wires CI as a `zernie/vigiles@v1` workflow (a composite over the same CLI) that posts a sticky PR comment + a `valid` output.

Prefer to write tests yourself? They can be JS **or** TS
(`*.harness.{mjs,ts}`) — run them with `npx vigiles test`.

</details>

## ① Lint — your CLAUDE.md lies to your agent

Your CLAUDE.md points the agent at `src/auth/login.ts` and says to run `npm run
check`. But the file moved six commits ago and the script was renamed — the agent
trusts the stale claim and acts on fiction. `npx vigiles lint` resolves every
reference against reality:

```text
CLAUDE.md:
  ✗ src/auth/login.ts — no such file (renamed or moved?)
  ✗ npm run check — not in package.json. Did you mean: "check:types"?
  ✓ @typescript-eslint/no-floating-promises — exists and enabled in eslint config
```

File paths, scripts, and code symbols — plus linter rules across **7 linters**
(ESLint, Ruff, Clippy, and four more): the rule exists **and is enabled**. Start
with one inline comment, no new files;
step up to a typed `.spec.ts` (compiled to CLAUDE.md) when you want it.
**[Full guide →](docs/verifying-instruction-files.md)**

> **Markdown is prose; a typed spec is a _program_.** Opt in and a mismatched
> hand-off between agents is a **type error** — `pipe(producer, pipeStep(consumer, needs({…})))`
> won't compile if step N's output doesn't supply step N+1's needs. Others lint
> prose; vigiles is a **compiler for harnesses**, graduated like `strict`.

## ② Guard — author a hook that can't be wrong

A safety hook is your last stop before something irreversible — and hand-written
ones **fail open**: `exit 1` where blocking needs `2`, the wrong JSON field, a
`grep` that sails past `cd x && git push -f`. The hook looks like a guard, blocks
nothing, and never tells you. Write it as a pure typed function instead — vigiles
emits the exit code, the JSON, and an AST-backed matcher for you:

```typescript
import { defineHook, tool, deny, allow } from "vigiles/hook";

export default defineHook({
  on: "PreToolUse",
  match: tool("Bash"),
  decide: (e) =>
    e.command.runs("git push", { force: true })
      ? deny("no force-push to a protected branch")
      : allow(),
});
```

This **eliminates an entire class of bugs**: you never write the exit code / JSON
field (false confidence), the matcher is **AST-backed** (catches the compound
bypass a glob misses), the only import allowed is `vigiles/hook` (capability = API
surface), and the artifact is **stamped** (a later hand-edit is refused). A real,
widely-copied OSS safety hook blocks **2/7** of the disaster battery; the compiled
rewrite blocks **7/7** — **measured** by vigiles's own disaster battery, not
asserted. Honest about the cons: this fixes a hook's _logic_, not
the harness's _delivery_ — a subagent's tool calls still bypass any PreToolUse
hook ([#34692](https://github.com/anthropics/claude-code/issues/34692)), so it's a
strong default, not an unbypassable wall. **[Compiled hooks — bug classes + trade-offs →](docs/compiled-hooks.md)**

## ③ Test — does your harness do its job?

A hook can be wired wrong; a skill's description can fail to trigger — or hijack
unrelated prompts; injected context can never reach the model. All of it passes a
naive "did it run?" check. vigiles tests the assembled harness for real:

```typescript
import { runHook } from "vigiles/testing";

const r = runHook(guard, {
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command: "git commit --no-verify" },
});
assert(r.blocked); // a red ✗ means your guard silently lets it through
```

It goes well past _"did it fire?"_:

- **Hooks block** what they must — `runHook`, or the real agent CLI via `runHarnessTest`.
- **Skills trigger** on the right prompts and stay quiet on the wrong ones — recall _and_ precision (`measureTriggerRate`).
- **Behaviour is good** — score a skill's output, or A/B it on-vs-off for the real lift (`measure` / `runEval`, with significance testing).
- **Safety holds** — the agent _didn't_ push to the wrong branch or hit a paid API; `interceptTools` catches the attempt so the side effect never happens.

Almost every tier runs with **no model and no API key** — milliseconds, on every
commit; only the real-model evals need a model, on your own `claude` CLI.
**[How it works →](docs/harness-testing.md)**

## ④ Eval — does it actually help, or just cost more?

A skill claims "65% fewer tokens." A plugin promises "3× faster." Stars and
vibes — **zero measurement**. vigiles A/Bs the claim on real coding tasks, the
harness loaded exactly as it ships, and reports the **metric triple**:

```typescript
import { measureArms } from "vigiles/testing";

const r = await measureArms({
  fixture: { "in.txt": "Implement a slug helper." },
  task: "Read in.txt, write slugify() to slug.js, explain. Stop.",
  arms: { baseline: {}, skill: { files: { "SKILL.md": THE_SKILL } } },
  measure: (ctx) => ({ cost: ctx.usage.costUsd, correct: check(ctx) }),
});
```

- **The bill (`costUsd`)** — weights cache ~0.1× / output 1×, so a "saved tokens" headline can't hide behind cheap cache.
- **The target** — whatever the skill claims to move (output tokens, latency, tool calls), verified on its own terms.
- **The blast radius** — correctness, a deterministic 1/0. A token win that breaks the code is **not a win**.

**Safe to repeat.** Each real-model run is sandboxed (ephemeral dir, egress blocked
or allow-listed), and `interceptTools` catches an irreversible external — a push, a
paid API — as an _attempt_, never running it. **[Safety, sandboxing & FAQ →](docs/safety.md)**

**The eval you can actually afford.** promptfoo / DeepEval / … hit a metered API
SDK and bill **per token, every run**. vigiles answers most questions with **no
model at all** (free in CI, no key), and runs the real-model rest on an
**individual dev's Claude Pro/Max subscription — $0 extra, never a CI token** — so
you can measure on every change. **[Eval a skill →](docs/measuring-skills.md)** · **[Why it's affordable →](docs/eval-architecture.md)**

## More

- **[CLI →](docs/cli.md)** — every command (incl. compiled hooks via `compile`) and the plugin · **[GitHub Action →](docs/github-action.md)** — run it in CI. The full **[lint rules matrix →](docs/verifying-instruction-files.md#the-validation-rules--the-full-matrix)** lives with the linting guide.
- **[Skills →](docs/skills.md)** — the skills `init` installs, and how the model-invocable ones trigger.
- **[Plugin health leaderboard →](docs/cli.md#scan-dir)** — point `scan` at a marketplace (e.g. `wshobson/agents`) and it ranks every plugin by structural health (0–100, A–F), worst issues first — **no key**. Add `--trigger` for the model-gated column: do the skills actually fire?
- **[Docs index →](docs/README.md)** · **[API reference →](https://zernie.github.io/vigiles/)** · **[Related tools →](docs/related-tools.md)** (ast-grep, Dependency Cruiser, Ruler, rulesync).
- **Not for you if** you want a model/capability benchmark or runtime guardrails in the request path — vigiles is build-/CI-time.
- Companion to [Feedback Loop Is All You Need](https://zernie.com/blog/feedback-loop-is-all-you-need).

## License

[MIT](LICENSE)

[^name]: **vigiles** — the watchmen of ancient Rome, who guarded the city (and fought its fires) by night. _Quis custodiet ipsos custodes?_ — "who watches the watchmen?" (Juvenal, _Satire VI_).
