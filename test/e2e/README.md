# vigiles E2E: driving real Claude Code against a mocked LLM

Deterministic end-to-end tests that run the **real `claude` CLI** but replace the
LLM with a **scripted mock Anthropic endpoint**, so we can assert vigiles'
skill runtime and Stop-hook enforcement in a live session — no real model, no
network, no nondeterminism.

## How it works

- **`mock-anthropic.mjs`** — a tiny, dependency-free Anthropic Messages API mock.
  Point a client at it with `ANTHROPIC_BASE_URL`. It serves a fixed _script_ of
  turns (`{ text }` or `{ tool, input }`), one per `POST /v1/messages`, over SSE,
  and implements the gotchas real clients need (`/v1/messages/count_tokens`,
  streamed `tool_use` blocks, trailing-slash + `HEAD` health checks).
- **`run.sh`** — starts the mock, then spawns `claude` as a direct child shell
  so it inherits auth (the managed OAuth fd in Claude Code on the web, or
  `ANTHROPIC_API_KEY` in normal CI), with `ANTHROPIC_BASE_URL` pointed at the
  mock. Asserts on claude's JSON output and the skill side effects.

## Scenarios

1. **simple** — the mock returns scripted text; assert claude relays it.
2. **tool-use loop** — the mock scripts a `tool_use`; assert claude runs the
   tool, sends `tool_result`, and the mock sees the follow-up (the loop closed).
3. **Stop-hook enforcement** — a project with a `vigiles hook-runtime skill` Stop hook
   and an active skill whose result gate is `true` (pass) vs `false` (block).
   Assert: passing gate → claude stops in 1 turn; failing gate → the hook
   blocks completion and claude is forced to keep going (hits `--max-turns`).

## Running

```bash
npm run test:e2e        # needs `claude` on PATH; skips cleanly if absent
```

In CI: install `@anthropic-ai/claude-code`, export `ANTHROPIC_API_KEY` (any value
works — the mock ignores it), and run `npm run test:e2e`.

## Extraction

`mock-anthropic.mjs` has no dependencies and `startMock(script, { port, onRequest })`
is a clean API — it can be lifted into a standalone mini-package and reused to
E2E-test any Anthropic-SDK or Claude Code based agent.
