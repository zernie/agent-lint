# Harness-testing coverage matrix — what we test, what we should

> Status: roadmap / gap analysis (2026-06-09). The companion to
> [`docs/testing-matrix.md`](../docs/testing-matrix.md) (which maps the _current_
> API to its tests). This doc takes the **whole potential surface** of testing a
> Claude Code harness and marks, cell by cell, what vigiles provides today and
> what it _should_. Design rationale lives in
> [`research/harness-testing.md`](harness-testing.md); the sandbox capability is
> [`research/feature-ideas.md`](feature-ideas.md) §13.

## The three test types (columns)

The standard pyramid, lowest cost first. Each maps to a vigiles entry point — and
for the **prose** surfaces (skills, agents, commands, CLAUDE.md) the "unit" tier
is **static verification** (vigiles' other pillar), not logic execution, so every
surface has _some_ unit-level check.

- **Unit / static** — isolated, model-free, deterministic. Two flavours: a hook's
  _logic_ in isolation (`runHook` — synthesize an event, read the block/allow
  decision), and _reference / contract verification_ of instruction / skill /
  agent / command files (`vigiles audit` / `refs` — do the cited rules, files,
  commands, and symbols actually exist?). Milliseconds.
- **Integration** — the _assembled_ harness: real `claude` CLI + real
  hooks/settings against a **scripted mock model** (`runHarnessTest`), plus
  structural assembly (`loadPlugin`). No API key, no cost. Proves **wiring** — the
  surface fires / loads inside the real machine.
- **E2E / eval** — the whole machine under the **real model**, N trials per arm
  (`runEval`). _Measures_ **behaviour** — does the surface change what the agent
  does, and by how much. Statistical, real cost, non-deterministic.

Legend: ✅ shipped · 🟡 partial / caveated · 🔴 gap (should build) · ⬜ n/a.

> **A note on the third column.** Unit and integration are _verification_ —
> deterministic, pass/fail, run on every commit. Eval is a different axis:
> _measurement_ — an A/B delta (mean ± se) you read, not a green/red you assert,
> run occasionally on a keyed job. **It is non-deterministic by construction** —
> the same eval run twice yields different numbers, so a single run never "passes"
> or "fails"; you read the mean ± se across N trials and ask whether the arm gap is
> significant. It's kept in the table for **surface-coverage
> completeness** (for skills/subagents/commands it's the _only_ handle, so the row
> would otherwise look like a dead end), but it isn't a "test" in the same sense.
> Its own machinery — trials, variance, significance, LLM-judge — lives in
> [`docs/harness-testing.md`](../docs/harness-testing.md) and
> [`research/benchmarks-runtime-gates.md`](benchmarks-runtime-gates.md), not in
> the cells below.

## Surface × test type

| Surface                                       | Unit / static                       | Integration (assembled, mock model)  | E2E / eval (real model, **non-deterministic**) |
| --------------------------------------------- | ----------------------------------- | ------------------------------------ | ---------------------------------------------- |
| Hook — PreToolUse / PostToolUse (Bash)        | ✅ logic (`runHook`)                | ✅ fires in machine                  | ✅ behaviour                                   |
| Hook — UserPromptSubmit                       | ✅ logic                            | ✅                                   | ✅                                             |
| Hook — SessionStart                           | ✅ logic                            | ✅                                   | ✅                                             |
| Hook — Stop                                   | ✅ logic                            | ✅                                   | ✅                                             |
| Hook — PreToolUse / PostToolUse (Edit/Write)  | ✅ logic                            | 🟡 headless-gated (drive via Bash)   | ✅                                             |
| Hook — SubagentStop                           | ✅ logic                            | 🔴 mock can't trigger                | 🟡 partial                                     |
| Hook — PreCompact / Notification / SessionEnd | ✅ logic                            | 🔴 mock can't trigger                | 🟡 partial                                     |
| CLAUDE.md / instruction files                 | ✅ refs verified (`audit`)          | 🟡 present in context, not behaviour | ✅ moves behaviour                             |
| Skills — procedure / outcome                  | 🟡 SKILL.md refs via `audit`/`refs` | 🔴 body present, activation n/g      | 🟡 outcome only, activation **faked**          |
| Subagents (`agents/`)                         | 🟡 refs via `audit` (if marked)     | 🔴 materialized, not invoked         | ✅ via Task                                    |
| Slash commands (`commands/`)                  | 🟡 refs via `audit` (if marked)     | 🔴 materialized, not invoked         | ✅ via invocation                              |
| MCP servers                                   | 🟡 declaration detected (warned)    | 🔴 not wired                         | 🔴 bring-your-own                              |
| settings.json — permissions / env             | 🟡 assert merged                    | ✅ applied to sandbox                | ✅                                             |

**The honest read of this table:** every surface has a **unit / static** check —
for hooks it's logic, for prose it's reference verification (vigiles' first
pillar). But the **integration (wiring) reach is hooks + settings only**;
everything model-driven — skills, subagents, slash commands — drops straight from
the static tier to the costly, statistical **e2e** tier, with no deterministic
middle. The loader _materializes + warns_ for those, but materialization is not a
test.

## Fidelity caveats (why some ✅/🟡 are softer than they look)

1. **Skill activation is faked, even at the eval tier.** A `SKILL.md` in the
   working dir is not auto-loaded the way an _installed plugin_ skill is, so the
   canonical eval delivers the arm difference by **telling the agent to read it**
   (`examples/harness/skill-outcome.eval.mjs`). We measure "if the agent reads
   this prose, does output change" — **not** "does Claude trigger this skill by
   its description." The activation mechanism, the thing that makes a skill a
   skill, is untested. _(Update: a 2026-06-09 spike shows activation **is**
   testable via `--plugin-dir` — see the Spike section below. Fix identified, not
   yet built.)_
2. **Edit/Write hooks are headless-gated.** The Edit/Write tools don't fire via
   the mock in headless mode, so the deterministic tier can't drive Edit/Write
   tool-event hooks; you fall back to the unit tier (logic) or the eval tier.
3. **Subagents / slash commands need a real model.** The deterministic tier never
   invokes them — it only writes their files into the sandbox.
4. **No safe execution of untrusted code.** Hooks run as real child processes with
   full `env`; there is no sandbox (temp cwd + timeout only). So running a
   _third-party_ plugin's side-effectful hook is unsafe — the dogfood tier only
   _parses_ (`loadPlugin`), never executes.

## Cross-cutting capabilities (provided vs. should)

| Capability                                                                            | Status | Notes                                                                                              |
| ------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| Plugin loader — real layouts, materialize, surface warnings                           | ✅     | `src/plugin-loader.ts`; never silently tests an empty machine                                      |
| Real-plugin dogfood — pinned, vendored snapshots                                      | ✅     | `examples/harness/real-*.harness.mjs` (superpowers, wshobson)                                      |
| Eval aggregation — mean ± se, variance, report                                        | ✅     | `src/eval.ts`                                                                                      |
| LLM-as-judge — verdict parsing                                                        | 🟡     | parser unit-tested; the model spawn is not (`src/judge.ts`)                                        |
| **Native plugin-install in the sandbox** (skills/agents/commands activate as shipped) | 🔴     | fix for caveat #1 — **spike-confirmed via `--plugin-dir`** (whole-plugin vendoring); not yet wired |
| **Deterministic Edit/Write driver** (un-gate tool events)                             | 🔴     | the fix for caveat #2 — a headless path that fires Edit/Write                                      |
| **Scripted subagent / command stubs** (wiring without a model)                        | 🔴     | test that a Task/slash surface is _wired_ deterministically                                        |
| **MCP server harness** (loader stands the server up)                                  | 🔴     | today the loader warns and stops                                                                   |
| **Sandboxed untrusted exec** (bwrap / docker)                                         | 🔴     | feature-ideas §13 — turns dogfood from parse-only into execute-and-verify                          |
| Line-coverage tooling (c8/nyc) on the suite                                           | 🔴     | no coverage % exists today                                                                         |
| CI guard: fail (not skip) when `claude` is absent                                     | 🔴     | the deterministic tier silently skips off-box                                                      |

## What we should build, prioritized (value × cost)

1. **Native plugin-install fidelity for skills** — _highest value._ Closes the
   biggest real-world gap: makes skill/subagent/command **activation** real
   instead of faked, which unlocks honest testing of the dominant popular plugin
   shape (skill/agent marketplaces like wshobson/agents). Medium cost.
2. **Sandboxed exec tier (bwrap, then docker)** — unlocks safely _running_
   untrusted third-party hooks/skills, the prerequisite for execute-and-verify
   dogfood. Medium cost; feature-ideas §13.
3. **Deterministic Edit/Write driver** — closes the headless hole so the most
   common _editing_ hooks get a no-key tier. Cost unknown (may be infeasible
   headless; fall back to a documented unit+eval split).
4. **Scripted subagent / command stubs** — cheap wiring assurance for the Task /
   slash surfaces without paying for a model. Low–medium cost.
5. **MCP server harness** — wire declared MCP servers into the sandbox. Medium.
6. **Coverage tooling + fail-not-skip guard** — make "how much do we test"
   answerable as a number, and stop the deterministic tier from silently
   skipping. Low cost.

## Spike — is skill activation testable for real? (2026-06-09, claude 2.1.169)

Caveat #1 said skill activation is _faked_. A spike against the real CLI settles
it: **it is testable — via `--plugin-dir`, not file materialization.**

Method: load the vendored obra/superpowers snapshot with
`claude --plugin-dir <dir> --print --output-format stream-json` against the real
model (haiku), from a clean temp dir so the plugin is the only context.

Findings:

1. **`--plugin-dir` natively registers the plugin's skills.** A/B self-report
   ("do you have skill `test-driven-development`?") → **YES** with the flag,
   **NO** without.
2. **The model genuinely _activates_ a skill.** Given a TDD-shaped task it emitted
   a real `Skill` tool call — `{"skill":"superpowers:test-driven-development",
"args":"isPrime(n)…"}` — under the `<plugin>:<skill>` namespace. That is native
   activation, not the working-dir file-read the current eval fakes.
3. **Fidelity lesson:** native install resolves the plugin's _internal_
   references, so a partial vendor breaks — the TDD skill `cat`-ed a sibling
   `using-superpowers/SKILL.md` we hadn't vendored and errored. Vendor the **whole
   plugin** (or its dependency closure), not an arbitrary slice.

Consequences:

- **#1 is feasible.** The mechanism is `--plugin-dir`; the build is to have
  `loadPlugin` / `runHarnessTest` / `runEval` install plugins that way (and
  vendor whole plugins). Closes caveat #1.
- **Bonus deterministic win.** Because activation surfaces as a `Skill` tool call,
  a _scripted mock model_ can emit that exact `tool_use`, so `runHarnessTest` can
  assert a skill **resolves and runs** deterministically (wiring) — distinct from
  the eval tier, which is whether the model _chooses_ it. That moves the Skills
  **integration** cell from 🔴 toward ✅.
- **Still open:** the Edit/Write headless question (caveat #2 / build #3) is a
  separate, key-free probe — `scriptModel` an Edit `tool_use` and see if it fires.

## See also

- [`docs/testing-matrix.md`](../docs/testing-matrix.md) — the current API → test map.
- [`docs/harness-testing.md`](../docs/harness-testing.md) — the user-facing guide.
- [`research/harness-testing.md`](harness-testing.md) — three-tier design rationale.
- [`research/feature-ideas.md`](feature-ideas.md) §13 — sandboxed harness exec.
- [`research/benchmarks-runtime-gates.md`](benchmarks-runtime-gates.md) — the evals run in anger.
