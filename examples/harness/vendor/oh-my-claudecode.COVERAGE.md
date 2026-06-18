# Coverage scorecard — oh-my-claudecode@deee3a4

> Dogfood of the three-rung model (`research/eval-coverage-and-isolation.md`) on a
> real vendored plugin. Rungs: **R1** cheap/deterministic (no model) · **R1-MG**
> model-gated trigger/behavior (runs on the sub, written-not-run here) · **R2**
> record-replay shell-out (PATH stub) · **R2-MG** model decides to shell out ·
> **R3** real disposable service. The pinned snapshot is never modified.

## Artifacts → rung → what a proper eval needs → tested?

| Artifact                              | Kind          | Rung   | What a proper eval needs                                                                 | Test written?                        |
| ------------------------------------- | ------------- | ------ | ---------------------------------------------------------------------------------------- | ------------------------------------ |
| `keyword-detector` (UserPromptSubmit) | hook          | R1     | pipe a prompt; assert routing context injected on a keyword, nothing on a plain prompt   | ✓ `vendor-coverage.test.ts` (2)      |
| `keyword-detector` egress / fs        | hook          | R1     | confine + record: phones home to nothing, writes only `.omc/`                            | ✓ `run-hook.test.ts` (bwrap-gated)   |
| `session-start` (SessionStart)        | hook          | R1     | run it; assert it reaches ONLY the npm registry for its update check                     | ✓ `run-hook.test.ts` (egress-gated)  |
| `ask` skill (description)             | skill         | R1-MG  | `measureTriggerRate`: fires on advisor-routing prompts, quiet otherwise (recall+prec.)   | model-gated (description present ✓)  |
| `ask` skill (behavior)                | skill         | R2-MG  | model runs `omc ask`; stub `omc` on PATH, assert artifact path consumed                  | model-gated (R2 helper proven elsew.)|
| `verify` skill (description)          | skill         | R1-MG  | `measureTriggerRate`: fires on "make sure it works" prompts                              | model-gated (description present ✓)  |
| `verify` skill (behavior)             | skill         | R2-MG  | model runs a test runner; stub the runner on PATH, assert it reports pass/fail evidence  | model-gated                          |
| `code-reviewer` agent                 | agent         | R1     | tool-contract: declares `disallowedTools: Write, Edit` — assert Write/Edit blocked       | covered by agent-runtime patterns    |
| `code-reviewer`/`critic` (review)     | agent         | R1-MG  | does the review FIRE on dispatch + find planted defects (judged)                         | model-gated                          |
| `critic` agent                        | agent         | R1     | same disallowedTools contract surfaced by scan                                           | covered by scan/agent-runtime        |
| `t` MCP server (`.mcp.json`)          | mcp           | R2/R3  | record one tool result + replay (R2); live server semantics = R3                         | flagged by scan ✓ (not wired)        |
| plugin structure (skills/mcp)         | structure     | R1     | scan: skills have descriptions, MCP flagged                                              | ✓ `vendor-coverage.test.ts`          |
| `loadPlugin` invariants               | structure     | R1     | layout parses, `${CLAUDE_PLUGIN_ROOT}` resolves, no spurious dangling refs               | ✓ `vendor.test.ts`                   |

## Distribution + testability grade

Counting the distinct surfaces above (2 hook behaviors, 2 skills, 2 agents, 1 MCP,
plus structure):

- **Free / deterministic (R1 + R2, no model): ~60%** — both hooks (fire, egress, fs),
  both agent tool-contracts, all structural facts, and the R2 shell-out pattern are
  testable for free; most RUN in CI today.
- **Model-gated (R1-MG / R2-MG, runs on the sub): ~33%** — skill triggering
  (`ask`/`verify` recall+precision), the two reviewer agents' judged behavior, and
  the model-driven decision to shell out (`omc ask`, the test runner).
- **Needs a container (R3): ~7%** — only the `t` MCP server's *live* semantics, and
  then only if a recorded replay (R2) cannot faithfully stand in.

**Grade: B+.** Most of OMC's surface is cheaply testable; the irreducible cost is
the model-gated half, which is the *point* of the eval pillar (it runs on the
subscription, not metered API).

## R3 shortlist

- **`t` MCP server (`bridge/mcp-server.cjs`)** — a live MCP endpoint. Only R3 if its
  real semantics are under test; otherwise record one tool result and replay (R2).

## Verdict

vigiles can comprehensively test OMC's **deterministic spine for free**: both hooks
(routing decision, egress, filesystem blast radius), both agents' tool-contracts,
and the whole structural surface — and it can replay any tool the `ask`/`verify`
skills shell out to via the PATH-stub (R2) helper. What it cannot do cheaply is
prove the *behavioral* claims — whether `ask`'s description fires, whether the
reviewer agents actually catch defects — which require a model and run on the
subscription (written-not-run here). No part of OMC forces a container except the
optional live-MCP semantics. Net: a large majority is in the free/sub-priced tiers.
