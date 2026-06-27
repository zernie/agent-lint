# Harness testing — Codex specifics

The [harness-testing guide](harness-testing.md) is the harness-agnostic core: the
levels, the `Trace` model, the runners, evals. This page is the **OpenAI Codex
adapter** (`vigiles/codex`) — how you point the deterministic tier at real
`codex exec`, what maps from the agnostic API, and the one thing that doesn't
(subagents, by design).

Codex is **shipped**: registered in `ADAPTERS` (the CLI auto-detects a
`.codex/config.toml` or `AGENTS.md` repo) and exported as `vigiles/codex`. The
layer-2 **deterministic** path — `runHarnessTest(spec, { adapter: codexAdapter })`
— is full and proven against the real `codex` binary. See the capability matrix in
[`docs/harnesses.md`](harnesses.md) for where Codex sits relative to Claude Code.

## Contents

- [Select Codex by the `{ adapter }` option](#select-codex-by-the-adapter-option)
- [A worked deterministic example](#a-worked-deterministic-example)
- [The OpenAI Responses mock (`startCodexMock`)](#the-openai-responses-mock-startcodexmock)
- [What maps, and what doesn't](#what-maps-and-what-doesnt)
- [Authenticating Codex (for the eval tier)](#authenticating-codex-for-the-eval-tier)
- [See also](#see-also)

## Select Codex by the `{ adapter }` option

The agnostic runner defaults to Claude Code; you pick Codex by passing the
adapter object — the same surface, a different transport:

```ts
import { runHarnessTest } from "vigiles/testing";
import { codexAdapter } from "vigiles/codex";

const r = await runHarnessTest(spec, { adapter: codexAdapter });
```

`codexAdapter` carries Codex's five ports plus the layer-2 `HarnessTestDriver`
(argv + mock + parse), so `runHarnessTest` dispatches through it without the
agnostic surface importing the adapter — exactly the seam Claude Code rides. The
adapter must declare `capabilities.harnessTesting` and carry a
`harnessTestDriver`; `codexAdapter` does both.

## A worked deterministic example

Codex's non-interactive `codex exec` runs the scripted mock to completion, and the
final assistant text lands in the trace's `output`. The script is plain text turns
(`{ text }`) — there's no `scriptModel` wrapper on the Codex side; you pass the
`ModelTurn[]` directly. The example below mirrors the Claude Code "fired and
landed" shape: assert the scripted reply reached the agent's output **and** that
the mock recorded the prompt (so the request actually reached the model):

```ts
import { runHarnessTest } from "vigiles/testing";
import { codexAdapter } from "vigiles/codex";

const r = await runHarnessTest(
  {
    prompt: "say exactly HELLO_CODEX and nothing else",
    model: [{ text: "HELLO_CODEX" }],
    // Codex has no confined path; an inline-only spec is trusted, so the
    // default "auto" runs direct — pass false to be explicit.
    sandbox: false,
    timeoutMs: 60_000,
  },
  { adapter: codexAdapter },
);

r.output.includes("HELLO_CODEX"); // the scripted reply reached the output
r.exitCode === 0;
r.modelRequests.length >= 1; // …and the mock recorded the request
// the prompt reached the model:
r.modelRequests.flatMap((q) => q.messages.map((m) => m.text)).join("\n");
```

This is the shape exercised by the gated real-codex test in
`src/adapters/codex/harness-test.test.ts` — it runs when `codex` is on `PATH`
(installed in CI) and skips otherwise.

**Keyless.** `codex exec` is pointed at the in-process Responses mock via the
keyless `-c model_providers.mock.*` flag recipe (`codexMockArgs` / `codexMockEnv`
in the Codex runtime) — no `OPENAI_API_KEY`, no network. The driver places the
mock-wiring `-c` flags **after** `exec` (before it they're parsed as global flags
and ignored), runs `--ephemeral` +
`--dangerously-bypass-approvals-and-sandbox` so the turn runs unattended,
`--skip-git-repo-check` so it works in a bare temp dir, and `--ignore-user-config`
so the host's `~/.codex` stays out.

## The OpenAI Responses mock (`startCodexMock`)

Where Claude Code scripts the **Anthropic Messages** SSE, Codex speaks the OpenAI
**Responses API**: a turn-consuming request hits `POST /v1/responses` with
`Accept: text/event-stream`, and the mock answers with the proven
`response.created → … → response.completed` SSE sequence that makes `codex` emit
one assistant text message. There is no count-tokens endpoint.

`runHarnessTest` starts and stops the mock for you via the driver. To drive it
directly — or to assert over the captured requests — use `startCodexMock` from
`vigiles/codex`:

```ts
import { startCodexMock } from "vigiles/codex";

const mock = await startCodexMock([{ text: "HELLO_CODEX" }]);
try {
  // point a `codex exec` at mock.url via the keyless -c recipe…
  // mock.requests → each { prompt, model, toolNames } the mock received
} finally {
  await mock.close();
}
```

The wire format is **not guessed** — `renderResponsesSSE` emits the exact 9-event
sequence captured from live `codex` traffic (codex-cli 0.139.0), and a gated test
drives real `codex exec` against it.

## What maps, and what doesn't

| Surface                  | Codex                                                                                                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instructions             | `AGENTS.md` (plain markdown) — Lint compiles + verifies it; CC output byte-identical                                                                                                                                                                                 |
| Skills                   | minimal `SKILL.md` (`name`/`description`, via `dialect.skillFrontmatter`)                                                                                                                                                                                            |
| Deterministic harness    | ✅ `runHarnessTest({ adapter: codexAdapter })` against real `codex exec` (keyless)                                                                                                                                                                                   |
| Hook veto                | ✅ same wire level as CC — block via exit 2                                                                                                                                                                                                                          |
| Plugin/MCP manifest      | TOML (`config.toml` + `[mcp_servers]`), read format-aware by the loader                                                                                                                                                                                              |
| Subagents                | ⛔ **deliberate non-goal** — a Codex subagent is a TOML concurrency table, not a contract                                                                                                                                                                            |
| `runEval` / trigger-rate | 🚧 **built, live-validation pending** — runner + JSONL parser + skill-firing predicate confirmed against the binary, and `{ evalDriver }` dispatch (`audit --deep --harness=codex`) is wired + fake-tested; a live native eval run is the one remaining step (below) |

**Subagents are a boundary, not a gap.** A Codex subagent is an `[agents.<name>]`
TOML concurrency table (`max_threads` / `max_depth`), not a tool-contract file —
vigiles's `agent()` builder doesn't map onto it, so it isn't compiled to Codex
(references in it are still _verified_). Tool-contract subagent testing
(`agent-runtime`, the railway result contract) is Claude Code only. See
[`docs/harnesses.md`](harnesses.md) footnote ¹.

**Tool-call parsing differs by tier.** The deterministic driver (`parseCodexRun`)
reads `codex exec`'s plain text into `output` only. The **eval** tier reads
`codex exec --json` and parses tool calls + usage via `parseCodexEvalRun`.

**`runEval` / trigger-rate for Codex is built; one live run remains.** The parser,
runner, and skill-firing predicate (`parseCodexEvalRun` / `codexEvalAgentRunner` /
`codexSkillFired`) are validated against the real binary, and the public dispatch
is wired: `measureTriggerRate(spec, { evalDriver: codexEvalDriver })` and, through
the CLI, `vigiles audit --deep --harness=codex`. It's fake-tested end-to-end
(an injected driver, no binary); the one remaining step is a live native eval run,
gated on Codex quota. One thing worth knowing as a user: **Codex has no "skill
selected" event** the way Claude does, so a skill trigger is detected by the model
reading the skill's `SKILL.md` (`codexSkillFired`) — best-effort, so pair it with
a judged check. **Pin codex 0.139.0** (0.141 regressed the keyless mock), and real
eval turns need auth + network egress.

(Matches the [`docs/harnesses.md`](harnesses.md) matrix footnote ².)

## Authenticating Codex (for the eval tier)

The **deterministic** tier (`runHarnessTest`) is **keyless** — it points `codex
exec` at the in-process Responses mock, so it needs no login. Only the **eval**
tier (real model) needs Codex auth. Three ways, in order of fit:

1. **Device-code flow — best for a headless / remote / sandbox env** (no browser
   on the box, no `localhost` callback to forward):

   ```bash
   codex login --device-auth
   ```

   It prints a URL (`https://auth.openai.com/codex/device`) and a one-time code.
   Open the URL on **any** device, enter the code, and the CLI — which is polling
   — completes the login; the token is written to `~/.codex` on the box running
   the command. This is the flow to use when an agent/CI sets Codex up for you.
   Verify with `codex login status`.

2. **Browser flow — local dev only:** plain `codex login` opens a browser and
   redirects to `http://localhost:1455`. Fine on your laptop; it does **not** work
   in a remote sandbox (the callback hits the sandbox's loopback, not yours) —
   use `--device-auth` there.

3. **API key (no browser):** pipe a key in —

   ```bash
   printenv OPENAI_API_KEY | codex login --with-api-key
   ```

   Use this when you have a key and want a non-interactive setup, or when the
   ChatGPT plan on the account doesn't include Codex.

The eval tier also needs **network egress** to the Codex/OpenAI backend (the
deterministic tier doesn't — it only talks to the in-process mock). Install the
CLI with `npm i -g @openai/codex` (pin the version — the `codex exec --json`
event schema can shift between releases; validated against `codex-cli` 0.141.0).

## See also

- [`docs/harness-testing.md`](harness-testing.md) — the harness-agnostic core: levels, the `Trace` model, the runners, evals, vitest/jest, CLI, CI.
- [`docs/harness-testing-claude-code.md`](harness-testing-claude-code.md) — the Claude Code parallel (`scriptModel` + the Anthropic mock, `${CLAUDE_PLUGIN_ROOT}`, the bubblewrap sandbox).
- [`docs/harnesses.md`](harnesses.md) — the adapter/import model + the capability matrix (where Codex sits, with the subagent + `runEval` footnotes).
