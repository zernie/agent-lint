<p align="center">
  <img src="logo.png" width="140" alt="vigiles logo" />
</p>

<h1 align="center">vigiles</h1>

<p align="center">
  <em>Quis custodiet ipsos custodes?</em> — Who watches the watchmen?
</p>

<p align="center">
  <strong>The missing linting + testing layer for agentic coding.</strong><br />
  vigiles <strong>lints</strong> the references your instruction files make — linter rules, file paths, scripts, code symbols — and <strong>tests</strong> whether your hooks, skills, and CLAUDE.md actually change what the agent does.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/vigiles"><img src="https://img.shields.io/npm/v/vigiles?color=orange" alt="npm version" /></a>
  <a href="https://github.com/zernie/vigiles/actions"><img src="https://img.shields.io/github/actions/workflow/status/zernie/vigiles/ci.yml?branch=main" alt="CI" /></a>
  <a href="https://github.com/zernie/vigiles/blob/main/LICENSE"><img src="https://img.shields.io/github/license/zernie/vigiles" alt="License" /></a>
</p>

---

`Agent = Model + Harness`. You'd never ship an app without a linter and a test
suite — yet an AI agent steering your repo is trusted on vibes. vigiles is the
deterministic layer for the harness: it **lints** the references your instruction
files make and **tests** that your hooks and skills actually fire. Two independent
pillars — adopt either, or both:

|       | Pillar                          | What it does                                                                                                                                                                                                |
| ----- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **①** | **Lint your instruction files** | Every linter rule, file path, script, and code symbol your CLAUDE.md cites is checked against reality, so stale references can't silently mislead the agent. → [guide](docs/verifying-instruction-files.md) |
| **②** | **Test your harness**           | Your hooks and skills are code — vigiles tests they actually fire, **deterministically and free** (no model, no API key) before you pay for an eval. → [guide](docs/harness-testing.md)                     |

Neither pillar depends on the other — pick the one that hurts today. **Works with
Claude Code and Codex** ([`vigiles/codex`](docs/harnesses.md)) behind a five-port
adapter; [custom adapters welcome](docs/authoring-an-adapter.md).

## ① Lint — your CLAUDE.md lies to your agent

Your CLAUDE.md says _"enforce `eslint/no-console`."_ But it was switched off
months ago — and the agent trusts the claim. (Same story for the file path it
cites that got renamed, and the script that was deleted.)

**Without vigiles:** nobody checks. The agent acts on fiction.

**With vigiles:** `npx vigiles lint` resolves every reference against reality —

```text
CLAUDE.md (inline mode):
  ✗ line 1: Rule "eslint/no-console" exists but is disabled in eslint config
  ✓ line 2: eslint/eqeqeq
  ✗ line 3: Rule "no-consoel" not found in eslint. Did you mean: "eslint/no-console"?
```

It resolves rule names across **7 linter catalogs** — the rule exists **and is
enabled** — and checks file paths, scripts, and code symbols the same way. Start
with one comment, no new files:

```md
<!-- vigiles:enforce eslint/no-console "Route output through logger.ts" -->
```

Step up to a typed `.spec.ts` (compiled to CLAUDE.md, compiler-grade) when you
want it. **[Full guide →](docs/verifying-instruction-files.md)**

## ② Test — does your harness actually fire?

A hook can be wired wrong, a skill's description can fail to trigger, injected
context can never reach the model — silently, all passing a naive "did it run?"
check.

**Without vigiles:** you assume your `--no-verify` guard blocks. You don't know.

**With vigiles:** a deterministic test proves it — no model, no API key,
milliseconds:

```typescript
import { runHook } from "vigiles/testing";

const r = runHook(guard, {
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command: "git commit --no-verify" },
});
assert(r.blocked); // a red ✗ here means your hook silently lets it through
```

```text
  ✓ guard blocks --no-verify and allows a clean commit

2 passed.
```

Three tiers, cheapest first: **`runHook`** (a hook's logic), **`runHarnessTest`**
(the real agent CLI against a scripted mock model), **`runEval`** (the real model
A/B with a significance gate). **Testing a skill?** `measureTriggerRate` checks
its description actually **fires** across varied prompts (recall) without
hijacking unrelated ones (precision). **[Full guide →](docs/harness-testing.md)**

## Quick start

**Paste into Claude Code or Codex:**

```text
Install vigiles in this repo and run it. Verify my CLAUDE.md / AGENTS.md
references and show me what's stale, then write and run a harness test for one
of my hooks or skills. Use good defaults (both pillars, non-interactive), but
ask me first whether to gate it in CI, whether to add a real-model eval, and
whether to enforce strictly (--strict).
```

Or do it yourself:

```bash
npx vigiles init   # sets up BOTH pillars: spec + harness test + CI + plugin
```

It's interactive in a terminal and non-interactive for agents/CI (or with
`--yes`), so "set up vigiles" from a Claude Code / Codex prompt Just Works — and
it installs a model-invocable **`test-harness` skill**, so afterward you can just
tell your agent _"test my skills"_ and it picks the tier and writes the test.

<details>
<summary>What <code>init</code> sets up</summary>

- **Both pillars** by default; scope with `--lint` / `--test` (one or both).
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

## More

- **[CLI & GitHub Action →](docs/cli.md)** — every command, the Action (inputs / output / versioning), the Claude Code plugin, and the five `lint` rules.
- **[Skills →](docs/skills.md)** — consumer skills (`strengthen`, `migrate-to-spec`, `test-harness`, `edit-spec`, …) installed as a Claude Code plugin: `/plugin marketplace add zernie/vigiles` then `/plugin install vigiles@vigiles` (or let `vigiles init` do it).
- **[Docs index →](docs/README.md)** · **[Research →](research/README.md)** · **[Related tools →](docs/related-tools.md)** (ast-grep, Dependency Cruiser, Ruler, rulesync).
- Companion to [Feedback Loop Is All You Need](https://zernie.com/blog/feedback-loop-is-all-you-need).

## License

[MIT](LICENSE)
