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
drives real `codex exec` against it. See
[`research/codex-prototype-findings.md`](../research/codex-prototype-findings.md)
for how the recipe was proven.

## What maps, and what doesn't

| Surface                  | Codex                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Instructions             | `AGENTS.md` (plain markdown) — Lint compiles + verifies it; CC output byte-identical                                                                               |
| Skills                   | minimal `SKILL.md` (`name`/`description`, via `dialect.skillFrontmatter`)                                                                                          |
| Deterministic harness    | ✅ `runHarnessTest({ adapter: codexAdapter })` against real `codex exec` (keyless)                                                                                 |
| Hook veto                | ✅ same wire level as CC — block via exit 2                                                                                                                        |
| Plugin/MCP manifest      | TOML (`config.toml` + `[mcp_servers]`), read format-aware by the loader                                                                                            |
| Subagents                | ⛔ **deliberate non-goal** — a Codex subagent is a TOML concurrency table, not a contract                                                                          |
| `runEval` / trigger-rate | 🚧 **in progress** — the eval tier's trace-parser seam landed; the Codex runner + JSONL parser + `{ adapter }` dispatch are pending live-binary validation (below) |

**Subagents are a boundary, not a gap.** A Codex subagent is an `[agents.<name>]`
TOML concurrency table (`max_threads` / `max_depth`), not a tool-contract file —
vigiles's `agent()` builder doesn't map onto it, so it isn't compiled to Codex
(references in it are still _verified_). Tool-contract subagent testing
(`agent-runtime`, the railway result contract) is Claude Code only. See
[`docs/harnesses.md`](harnesses.md) footnote ¹.

**Tool-call / hook stream parsing is minimal.** The Codex driver parses the final
assistant text into `output`; `toolCalls` and `hooks` are left empty (the codex
JSONL schema isn't parsed for the output check). A test that needs to assert on
tool sequences or hook firing uses Claude Code today.

**`runEval` / trigger-rate for Codex is in progress** — not yet usable
end-to-end, so use Claude Code for evals today. What's done: the eval tier's
trace parsing is now an injectable `ModelOutputParser` (default
`parseClaudeRun`), so a Codex parser can plug in without touching the Claude path.
What's left, gated on validating against the live `codex` binary:

1. a `codex exec --json` `AgentRunner` + a `parseCodexEvalRun` over Codex's CLI
   JSONL (today `parseCodexRun` returns `toolCalls: []` by design, so the eval
   tier can't yet detect a Codex tool/skill call);
2. `{ adapter }` dispatch on `measureTriggerRate` / `runEval` (mirrors
   `runHarnessTest`);
3. **the open question only the binary can answer:** Claude trigger-rate keys on
   an explicit `Skill` tool_use — Codex skills are progressive-disclosure
   `SKILL.md` instructions, and whether a skill activation surfaces as a discrete
   `codex exec --json` event is unconfirmed. If it doesn't, the Codex "fired"
   predicate becomes a behavioral/judged check rather than a trace predicate.

See the spike + env-validation checklist in
[`research/codex-prototype-findings.md`](../research/codex-prototype-findings.md)
(2026-06-18 update). (Matches the [`docs/harnesses.md`](harnesses.md) matrix
footnote ² — still don't gate on it.)

## See also

- [`docs/harness-testing.md`](harness-testing.md) — the harness-agnostic core: levels, the `Trace` model, the runners, evals, vitest/jest, CLI, CI.
- [`docs/harness-testing-claude-code.md`](harness-testing-claude-code.md) — the Claude Code parallel (`scriptModel` + the Anthropic mock, `${CLAUDE_PLUGIN_ROOT}`, the bubblewrap sandbox).
- [`docs/harnesses.md`](harnesses.md) — the adapter/import model + the capability matrix (where Codex sits, with the subagent + `runEval` footnotes).
- [`research/codex-prototype-findings.md`](../research/codex-prototype-findings.md) — how the keyless recipe + the Responses SSE renderer were proven against the real `codex` binary.
- [`research/harness-landscape.md`](../research/harness-landscape.md) — the Codex extraction map and the full harness landscape.
