<p align="center">
  <img src="logo.png" width="140" alt="vigiles logo" />
</p>

<h1 align="center">vigiles</h1>

<p align="center">
  <strong>Lint &amp; test the harness your AI agent runs on.</strong>
</p>

<p align="center">
  Your CLAUDE.md, hooks, and skills steer the agent — but nothing checks they're <em>true</em>, and nothing tests they <em>work</em>. vigiles does both.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/vigiles"><img src="https://img.shields.io/npm/v/vigiles?color=orange" alt="npm version" /></a>
  <a href="https://github.com/zernie/vigiles/actions"><img src="https://img.shields.io/github/actions/workflow/status/zernie/vigiles/ci.yml?branch=main" alt="CI" /></a>
  <a href="https://github.com/zernie/vigiles/blob/main/LICENSE"><img src="https://img.shields.io/github/license/zernie/vigiles" alt="License" /></a>
</p>

---

`Agent = Model + Harness`. You'd never ship an app without a linter and a test
suite — yet the harness steering your agent runs on vibes. vigiles[^name] is the
deterministic layer for it, and does two independent things — adopt either, or both:

|             |                                                                                                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **🔎 Lint** | Every file path, script, code symbol, and linter rule your CLAUDE.md cites is checked against reality — so a renamed file or a disabled rule can't silently mislead the agent. **[→](docs/verifying-instruction-files.md)**                      |
| **🧪 Test** | Hooks, skills, and subagents are code. vigiles tests they _do their job_ — and almost all of it is **deterministic, no API key**; the real-model evals run on your **Claude subscription**, not metered tokens. **[→](docs/harness-testing.md)** |

Pick the one that hurts today. **Works with Claude Code and Codex**
([`vigiles/codex`](docs/harnesses.md)), and you can
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

It's interactive in a terminal and non-interactive for agents/CI (or with
`--yes`), so "set up vigiles" from a Claude Code / Codex prompt Just Works — and
it installs a model-invocable **`test-harness` skill**, so afterward you can just
tell your agent _"test my skills"_ and it picks the tier and writes the test.

<details>
<summary>What <code>init</code> sets up</summary>

- **Both lint and test** by default; scope with `--lint` / `--test` (one or both).
- Adds `vigiles` to your `devDependencies`.
- Installs the Claude Code plugin (skills + hooks) via the marketplace —
  globally, never vendored into your repo.
- Wires CI as a `zernie/vigiles@v1` workflow (a composite over the same CLI):

  ```yaml
  - uses: actions/checkout@v4
  - uses: zernie/vigiles@v1 # lints by default; posts a sticky PR comment + a `valid` output
  ```

Prefer to write tests yourself? They can be JS **or** TS
(`*.harness.{mjs,ts}`) — run them with `npx vigiles test`.

</details>

## ① Lint — your CLAUDE.md lies to your agent

Your CLAUDE.md points the agent at `src/auth/login.ts` and tells it to run
`npm run check`. But the file moved to `src/auth/session.ts` six commits ago, and
the script was renamed. The agent trusts the stale claim and acts on fiction.

`npx vigiles lint` resolves every reference against reality:

```text
CLAUDE.md:
  ✗ src/auth/login.ts — no such file (renamed or moved?)
  ✗ npm run check — not in package.json. Did you mean: "check:types"?
  ✓ @typescript-eslint/no-floating-promises — exists and enabled in eslint config
```

File paths, scripts, and code symbols — plus linter rules across **7 catalogs**
(the rule exists **and is enabled**). Start with one inline comment, no new files;
step up to a typed `.spec.ts` (compiled to CLAUDE.md, compiler-grade) when you want
it. **[Full guide →](docs/verifying-instruction-files.md)**

## ② Test — does your harness do its job?

A hook can be wired wrong. A skill's description can fail to trigger — or hijack
unrelated prompts. Injected context can never reach the model. All of it passes a
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
- **Behaviour is good** — score a skill's output directly, or A/B it on-vs-off for the real lift over no-skill (`measure` / `runEval`, with significance testing).
- **Safety holds** — the agent _didn't_ push to the wrong branch or hit a paid API; `interceptTools` catches the attempt so the side effect never happens.

**The eval you can actually afford.** Almost every tier runs with **no model and
no API key** — milliseconds, on every commit. The rest drive your own `claude` CLI:

|                        | Runs on                 | Cost                                        |
| ---------------------- | ----------------------- | ------------------------------------------- |
| promptfoo, DeepEval, … | metered API SDK         | billed **per token, every run**             |
| **vigiles**            | your Claude Pro/Max sub | **$0 extra** — and most tiers need no model |

That's why you can eval your harness on every change, not just once.
**[How it works →](docs/harness-testing.md)** · **[Why it's affordable →](docs/eval-architecture.md)** · **[Safety model →](docs/safety.md)**

## More

- **[Audit any plugin →](docs/cli.md#scan-dir)** — `npx vigiles scan <repo>` reports what a plugin ships and what's structurally broken (dead refs, no-description skills, broken hook paths) with **no key**; point it at a marketplace (e.g. `wshobson/agents`) and it ranks every plugin by health (0–100, A–F). Add `--trigger` for the model-gated column: do the skills actually fire?
- **[CLI & GitHub Action →](docs/cli.md)** — every command, the Action (inputs / output / versioning), the Claude Code plugin, and the five `lint` rules.
- **[Skills →](docs/skills.md)** — consumer skills installed as a Claude Code plugin: `/plugin marketplace add zernie/vigiles` then `/plugin install vigiles@vigiles` (or let `vigiles init` do it). The model-invocable ones (`test-harness`, `strengthen`, `edit-spec`) fire on their own — ask _"test my skills"_, _"strengthen my rules"_, or _"add a rule to CLAUDE.md"_ and the agent reaches for them; `migrate-to-spec` and `linter-docs` are user-invoked.
- **[Docs index →](docs/README.md)** · **[Research →](research/README.md)** · **[Related tools →](docs/related-tools.md)** (ast-grep, Dependency Cruiser, Ruler, rulesync).
- Companion to [Feedback Loop Is All You Need](https://zernie.com/blog/feedback-loop-is-all-you-need).

## License

[MIT](LICENSE)

[^name]: **vigiles** — the watchmen of ancient Rome, who guarded the city (and fought its fires) by night. _Quis custodiet ipsos custodes?_ — "who watches the watchmen?" (Juvenal, _Satire VI_).
