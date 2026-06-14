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

|       | Pillar                            | What it does                                                                                                                                                                                                |
| ----- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **①** | **Verify your instruction files** | Every linter rule, file path, script, and code symbol your CLAUDE.md cites is checked against reality, so stale references can't silently mislead the agent. → [guide](docs/verifying-instruction-files.md) |
| **②** | **Test your harness**             | Your hooks and skills are code — vigiles tests they actually fire, **deterministically and free** (no model, no API key) before you pay for an eval. → [guide](docs/harness-testing.md)                     |

Neither pillar depends on the other — pick the one that hurts today. **Works with
Claude Code and Codex** ([`vigiles/codex`](docs/harnesses.md)) behind a five-port
adapter; [custom adapters welcome](docs/authoring-an-adapter.md).

## ① Verify — your CLAUDE.md lies to your agent

Your CLAUDE.md says _"enforce `eslint/no-console`."_ But it was switched off
months ago — and the agent trusts the claim. (Same story for the file path it
cites that got renamed, and the script that was deleted.)

**Without vigiles:** nobody checks. The agent acts on fiction.

**With vigiles:** `npx vigiles audit` resolves every reference against reality —

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
A/B with a significance gate). **[Full guide →](docs/harness-testing.md)**

## Quick start

```bash
npx vigiles init   # auto-detects the project, scaffolds a spec, wires CI + hooks
```

Write harness tests in JS **or** TS (`*.harness.{mjs,ts}`) and run `npx vigiles
test`. Drop vigiles into CI with the GitHub Action — a composite over the same
CLI, so it runs the artifact you'd run locally:

```yaml
- uses: actions/checkout@v4
- uses: zernie/vigiles@v1 # audits by default; posts a sticky PR comment + a `valid` output
```

## More

- **[CLI & GitHub Action →](docs/cli.md)** — every command, the Action (inputs / output / versioning), the Claude Code plugin, and the five `audit` rules.
- **[Skills →](docs/skills.md)** — 8 skills (`strengthen`, `migrate-to-spec`, `test-harness`, …) via `npx skills add zernie/vigiles`.
- **[Docs index →](docs/README.md)** · **[Research →](research/README.md)** · **[Related tools →](docs/related-tools.md)** (ast-grep, Dependency Cruiser, Ruler, rulesync).
- Companion to [Feedback Loop Is All You Need](https://zernie.com/blog/feedback-loop-is-all-you-need).

## License

[MIT](LICENSE)
