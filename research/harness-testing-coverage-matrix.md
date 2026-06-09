# Harness-testing coverage matrix — what we test, what we should

> Status: roadmap / gap analysis (2026-06-09). The companion to
> [`docs/testing-matrix.md`](../docs/testing-matrix.md) (which maps the _current_
> API to its tests). This doc takes the **whole potential surface** of testing a
> Claude Code harness and marks, cell by cell, what vigiles provides today and
> what it _should_. Design rationale lives in
> [`research/harness-testing.md`](harness-testing.md); the sandbox capability is
> [`research/feature-ideas.md`](feature-ideas.md) §13.

**Contents:** [test types](#the-three-test-types-columns) · [surface × tier](#surface--test-type) · [fidelity caveats](#fidelity-caveats-why-some--are-softer-than-they-look) · [cross-cutting capabilities](#cross-cutting-capabilities-provided-vs-should) · [what to build next](#what-we-should-build-prioritized-value--cost) · [the spikes](#spike--is-skill-activation-testable-for-real-2026-06-09-claude-21169)

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

| Surface                                       | Unit / static                                         | Integration (assembled, mock model)                   | E2E / eval (real model, **non-deterministic**)                         |
| --------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Hook — PreToolUse / PostToolUse (Bash)        | ✅ logic (`runHook`)                                  | ✅ fires in machine                                   | ✅ behaviour                                                           |
| Hook — UserPromptSubmit                       | ✅ logic                                              | ✅                                                    | ✅                                                                     |
| Hook — SessionStart                           | ✅ logic                                              | ✅                                                    | ✅                                                                     |
| Hook — Stop                                   | ✅ logic                                              | ✅                                                    | ✅                                                                     |
| Hook — PreToolUse / PostToolUse (Edit/Write)  | ✅ logic                                              | ✅ fires (claude 2.1.169 — see spike)                 | ✅                                                                     |
| Hook — SubagentStop                           | ✅ logic                                              | 🔴 mock can't trigger                                 | 🟡 partial                                                             |
| Hook — PreCompact / Notification / SessionEnd | ✅ logic                                              | 🔴 mock can't trigger                                 | 🟡 partial                                                             |
| CLAUDE.md / instruction files                 | ✅ refs verified (`audit`)                            | 🟡 present in context, not behaviour                  | ✅ moves behaviour                                                     |
| Skills — procedure / outcome                  | 🟡 SKILL.md refs via `audit`/`refs`                   | ✅ scripted `Skill` resolves via `pluginDir`          | ✅ real activation via `pluginDir` arm (off: no skill → on: activates) |
| Subagents (`agents/`)                         | 🟡 refs via `audit` (if marked)                       | 🔴 deterministic hard (nested mock sessions)          | ✅ registers + runs via `pluginDir` + Task (probed)                    |
| Slash commands (`commands/`)                  | 🟡 refs via `audit` (if marked)                       | 🟡 expansion is pre-model (needs mock-prompt capture) | ✅ registers + runs via `pluginDir` + `/cmd` (probed)                  |
| MCP servers                                   | ✅ tool refs verified in `audit` (`vigiles:mcp` mark) | 🔴 not wired                                          | 🔴 bring-your-own                                                      |
| settings.json — permissions / env             | 🟡 assert merged                                      | ✅ applied to sandbox                                 | ✅                                                                     |

**The honest read of this table:** every surface has a **unit / static** check —
for hooks it's logic, for prose it's reference verification (vigiles' first
pillar). At the **e2e tier** _everything_ is now reachable: `pluginDir` natively
installs a plugin, so skills, subagents, and slash commands all register and run
(probed). The **integration (wiring) tier** covers hooks, settings, and skills (a
scripted `Skill` resolves). The only remaining deterministic gaps are the
non-Edit/Write events the mock can't trigger (PreCompact/Notification/etc.),
**slash commands** (expansion is pre-model — needs capturing the mock-received
prompt), and **subagents** (hard — nested mock sessions). For **MCP**, tool
_references_ are now verified in `audit` against a live server (the `vigiles:mcp`
mark), but the harness tiers (running a server inside a test) are still unwired.

## Fidelity caveats (why some ✅/🟡 are softer than they look)

1. **Skill activation is faked, even at the eval tier.** A `SKILL.md` in the
   working dir is not auto-loaded the way an _installed plugin_ skill is, so the
   canonical eval delivers the arm difference by **telling the agent to read it**
   (`examples/harness/skill-outcome.eval.mjs`). We measure "if the agent reads
   this prose, does output change" — **not** "does Claude trigger this skill by
   its description." The activation mechanism, the thing that makes a skill a
   skill, is untested. _(**Closed.** `pluginDir` now installs a plugin natively at
   both tiers: a scripted `Skill` resolves deterministically
   (`runHarnessTest({ pluginDir })`), and the **real model genuinely activates** a
   skill at the eval tier (`runEval` arm with `pluginDir` — verified: `off` has no
   skill, `on` activates it). The faked working-dir read in
   `skill-outcome.eval.mjs` is superseded by native install. Note: whether the
   model **spontaneously** activates a skill for a matching task is the eval
   measurement itself — often 0 for trivial skills — not a wiring gap.)_
2. ~~**Edit/Write hooks are headless-gated.**~~ _Disproven by the 2026-06-09
   spike on claude 2.1.169 — Edit/Write hooks **do** fire in the deterministic
   tier (PostToolUse 3/3; a PreToolUse `Edit` block held). The gating was
   real in an earlier version but is no longer reproducible. The fix is to add a
   regression test, not a "driver" — see the Spike section._
3. **Subagents / slash commands need a real model.** The deterministic tier never
   invokes them — it only writes their files into the sandbox.
4. **No safe execution of untrusted code.** Hooks run as real child processes with
   full `env`; there is no sandbox (temp cwd + timeout only). So running a
   _third-party_ plugin's side-effectful hook is unsafe — the dogfood tier only
   _parses_ (`loadPlugin`), never executes.

## Cross-cutting capabilities (provided vs. should)

| Capability                                                                                                                                                                               | Status | Notes                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin loader — real layouts, materialize, surface warnings                                                                                                                              | ✅     | `src/plugin-loader.ts`; never silently tests an empty machine                                                                                                                                              |
| Real-plugin dogfood — pinned, vendored snapshots                                                                                                                                         | ✅     | `examples/harness/real-*.harness.mjs` (superpowers, wshobson)                                                                                                                                              |
| Eval aggregation — mean ± se, variance, **pass^k**, report                                                                                                                               | ✅     | `src/eval.ts` (`MetricStat.passK` = succeeded every trial, alongside mean ± se)                                                                                                                            |
| **Unified `Trace` + bare predicates** (`usedTool`/`toolCount`/`skillResolved`/`toolUsedWith`)                                                                                            | ✅     | one `Trace` from `runHarnessTest` + `runEval`'s ctx; predicates are bare (eval reuses them as metrics), `assert*` are thin throw-wrappers; `trace.hooks` deferred                                          |
| **Action-invariant assertions** (`r.toolCalls` + `assertToolUsed`/`assertToolNotUsed`/`assertSkillResolved` + sequence/budget: `assertToolSequence`/`assertToolCount`/`assertToolCalls`) | ✅     | parse the transcript so tests assert on the agent's _actions_ and _workflows_ (ordering, budgets, "every Edit after a Read"), not a brittle stdout match; grounded on real superpowers + wshobson skills   |
| **MCP governance** (block a destructive `mcp__…` tool)                                                                                                                                   | ✅     | `runHook` covers it (no server) — `src/run-hook.test.ts` (`mcp__github__merge_pull_request`)                                                                                                               |
| LLM-as-judge — verdict parsing                                                                                                                                                           | 🟡     | parser unit-tested; the model spawn is not (`src/judge.ts`)                                                                                                                                                |
| **Native plugin-install in the sandbox** (skills/agents/commands activate as shipped)                                                                                                    | 🟡     | **skills done both tiers** via `pluginDir` (`runHarnessTest` + `runEval`); subagents/commands not yet verified to register                                                                                 |
| ~~Deterministic Edit/Write driver~~ → regression test                                                                                                                                    | ✅     | shipped: `src/harness-test.test.ts` (Write→PostToolUse fires; Read→Edit→PreToolUse blocks)                                                                                                                 |
| **Deterministic subagent / command wiring**                                                                                                                                              | 🔴     | both register via `pluginDir` (eval ✅); deterministic needs: command = capture the mock-received (expanded) prompt; subagent = hard (nested mock sessions)                                                |
| **MCP tool-reference verification** (`mcp.ts`: `listMcpTools` / `verifyMcpTool`)                                                                                                         | ✅     | starts a stdio MCP server, handshakes, lists tools, verifies a cited tool exists with Levenshtein "did you mean"; tested on a real fixture server + probed on `@modelcontextprotocol/server-everything`    |
| **MCP refs wired into `audit`** — the `` `vigiles:mcp server#tool` `` mark                                                                                                               | ✅     | `vigiles audit` parses the mark (like `vigiles:symbol`), reads `.mcp.json`, starts the referenced server, and flags missing tools / undeclared servers (exit 2). Only runs when a mark references a server |
| **MCP harness** — optional `mcp()` spec builder + `mcpConfig` option                                                                                                                     | 🟡     | remaining: a typed spec `mcp("server","tool")` reference (mirrors the markdown mark), and `mcpConfig` on `runHarnessTest`/`runEval` to run a live server for behavioral A/Bs                               |
| **Sandboxed untrusted exec** (bwrap / docker)                                                                                                                                            | 🔴     | feature-ideas §13 — turns dogfood from parse-only into execute-and-verify                                                                                                                                  |
| Line-coverage tooling (c8/nyc) on the suite                                                                                                                                              | 🔴     | no coverage % exists today                                                                                                                                                                                 |
| CI guard: fail (not skip) when `claude` is absent                                                                                                                                        | 🔴     | the deterministic tier silently skips off-box                                                                                                                                                              |

## What we should build, prioritized (value × cost)

1. **Native plugin-install fidelity for skills** — _skills done._ `pluginDir`
   ships at both tiers: `runHarnessTest({ pluginDir })` (deterministic resolve,
   tested) and `runEval` arm `{ pluginDir }` (real activation, verified off-vs-on).
   Closes caveat #1 for skills. **Subagents + slash commands also register via
   `--plugin-dir`** — probed end-to-end: a `/cmd` slash command and an `echoer`
   subagent (via Task) both ran (real model). So their **eval** cells are ✅; the
   only open part is _deterministic_ testing of them (below).
2. **Sandboxed exec tier (bwrap, then docker)** — unlocks safely _running_
   untrusted third-party hooks/skills, the prerequisite for execute-and-verify
   dogfood. Medium cost; feature-ideas §13.
3. ✅ **Edit/Write regression test** (was "build a driver") — **done.** The
   deterministic tier already fires Edit/Write on claude 2.1.169; shipped a
   lock-in test (`src/harness-test.test.ts`) guarding against a future re-gate.
   The deterministic **skill-wiring** test (the other planned lock-in) is coupled
   to #1 and ships with it (materialization doesn't register skills; `--plugin-dir`
   does).
4. **Scripted subagent / command stubs** — cheap wiring assurance for the Task /
   slash surfaces without paying for a model. Low–medium cost.
5. **MCP harness — reference verification + behavioral wiring.** _The standout
   vigiles-shaped item (not commoditized)._ **Mostly shipped:** `src/mcp.ts`
   (`listMcpTools` / `verifyMcpTool`) starts a stdio MCP server, handshakes, and
   verifies a cited tool exists with a Levenshtein "did you mean" (tested on a real
   fixture + probed on `@modelcontextprotocol/server-everything`); **and it's wired
   into `audit`** — the `` `vigiles:mcp server#tool` `` mark is parsed, the server
   from `.mcp.json` is started, and a missing tool / undeclared server fails the
   audit (exit 2). **Remaining:** an optional typed-spec `mcp("github","issue_write")`
   reference (mirrors the mark), and **(b)** a `mcpConfig` option on
   `runHarnessTest`/`runEval` that threads `--mcp-config` so behavioral tests run a
   live server and `r.toolCalls` asserts `mcp__*` usage.
6. **Coverage tooling + fail-not-skip guard** — make "how much do we test"
   answerable as a number, and stop the deterministic tier from silently
   skipping. Low cost.
7. **Turnkey triggering eval** (`measureTriggerRate`) — the #1 documented skill
   pain is non-deterministic activation (passive descriptions fire 37–87%,
   directive 94–100%). Built on `pluginDir`: drive the real model with N prompts
   and report the trigger rate per skill, so authors iterate a description from
   "never fires" to "always fires". Eval-tier (real cost). _Roadmap._

### Evaluated and dropped (covered elsewhere)

- **Skill frontmatter lint** — commoditized: [`skill-validator`](https://playbooks.com/skills/louloulin/claude-agent-sdk/skill-validator),
  the [Skill Specification Linter](https://mcpmarket.com/tools/skills/skill-specification-linter)
  (agentskills.io), and a [Plugin Validator](https://mcpmarket.com/tools/skills/plugin-validator-linter)
  already check name/description/version/YAML/broken-links. vigiles only adds
  _deep_ reference resolution (rule/symbol/command actually resolves), which
  `audit`/`refs` already do. Not worth a dedicated check.
- **Slash-command structure lint** — same: covered by the plugin validators above.

### Richer invariants (beyond bool asserts)

Sequence/budget invariants over `r.toolCalls` (idea 1) **shipped** —
`assertToolSequence` / `assertToolCount` / `assertToolCalls`. Two siblings parked
here for later:

8. **Property-based fuzzing for hooks** (idea 2) — generate hundreds of inputs and
   assert a hook's invariant holds for all (e.g. _"blocks iff the command matches
   the danger set"_), catching edge cases two examples miss. Hooks are pure
   decision functions — the ideal target. **Unit tier only** (never fuzz a
   `claude`-spawning test). Needs a generator (`fast-check` as an optional dep, or
   the home-grown `propertyTest` in `src/proofs.ts`). Medium cost.
9. **Monotonic / relational eval invariants** (idea 3) — instead of "arm A scored
   higher" (could be noise), assert a relationship that must always hold, e.g.
   `assertMonotone(report, { metric, direction, arm, baseline })`: _"turning the
   hook on never makes the forbidden-action rate worse"_, with the gap clearing the
   combined se. Separates signal from luck; the behavioural analogue of the spec
   `checkMonotonicity` proof (`src/proofs.ts`). Builds on the `se` `runEval` already
   computes. Small–medium cost.

### Trace unification & shared vocabulary (from the prior-art survey)

Prior art on testing non-deterministic AI tools
([`research/testing-nondeterministic-ai.md`](testing-nondeterministic-ai.md)) converges on
one model — **a shared `Trace` + a deterministic predicate vocabulary, with judge
a minority and eval a separate consumer**. The gaps it points at, in priority
(✅ items shipped in `feat: unified Trace + predicate vocabulary`):

10. ✅ **Unify the `Trace`.** One `Trace` interface (`src/harness-test.ts`:
    `toolCalls` + `output` + `turns` + `file`) is produced by **both** tiers — a
    `runHarnessTest` result _is_ a `Trace`, and so is `runEval`'s `measure` ctx
    (`RunContext extends Trace`, with the eval-only `sh` end-state probe on top).
    The keystone — everything below rides on it. (`hooks` deferred, see below.)
11. 🟡 **Capture `trace.output` (final answer) and `trace.hooks` (which fired +
    decision).** **Output shipped** — `parseOutput` reads the terminal `result`
    event from the stream both tiers already capture (eval switched to
    `stream-json` so its `ctx.toolCalls` populate too). **`hooks` deferred:** it
    needs new mock/harness instrumentation to _record_ hook invocations rather
    than infer them from marker files — punted until something needs it.
12. ✅ **Split predicates from `assert*`.** Bare `usedTool` / `toolCount` /
    `skillResolved` / `toolUsedWith` (return values) are exported from
    `src/harness-assert.ts`; each `assertTool*` is now a thin throw-wrapper over
    one, and an eval `measure` reuses the same bare predicates as metrics — no
    testing/eval conflation, never one dual-purpose function.
13. ✅ **`pass^k` reliability metric** — `MetricStat.passK` (1 iff the metric
    succeeded on every trial) sits alongside mean ± se in the eval report and
    `formatEvalReport`. The reliability question for a non-deterministic harness.
    Pairs with #9.
14. ✅ **Tool-_argument_ assertions** — `toolUsedWith(trace, name, inputMatcher)`
    - `assertToolUsedWith` assert on a tool call's `input`, not just its name
      (e.g. `Edit` targeted the right file).

**Execution plan (PR `feat: unified Trace + predicate vocabulary`) — SHIPPED**
(#10, #12, #13, #14 and #11-output; #11-`hooks` deferred). Done on a fresh branch
off `main` after #26 merged. It was **mostly additive / non-breaking** (the API
shape was set right while there are ~zero users, so breaking was free):

- **Additive, no migration** (#10–14 except hooks): export bare predicates
  (`usedTool` / `skillResolved` / `toolCount` / `toolUsedWith`) and make the
  existing `assert*` thin wrappers over them; give `runEval`'s `measure` ctx the
  same `tools` (+ `output`) the harness result has; add `r.output` (parse the
  final answer from the stream we already capture); add `pass^k` to the eval
  report alongside mean ± se; add a tool-argument predicate over `toolCalls[].input`.
- **The one hard part — defer:** `trace.hooks` (which hook fired + its decision)
  needs new mock/harness instrumentation to _record_ hook invocations rather than
  infer them from marker files. Not required for the rest; punt until something
  needs it.
- **Keep the two consumers separate** (the corrected model in
  [`research/testing-nondeterministic-ai.md`](testing-nondeterministic-ai.md)):
  predicates are bare; only the testing helpers carry `assert` and throw; eval
  consumes the same bare predicates as metrics. Don't make one dual-purpose fn.
- **Acceptance:** existing `src/harness-test.test.ts` / `src/harness-assert.test.ts`
  still green; the skill-wiring and real-plugin tests re-pointed onto the unified
  shape; `npm test` + `vigiles test` + `audit` all pass.

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
- **Bonus deterministic win — SHIPPED.** Activation surfaces as a `Skill` tool
  call, so a _scripted mock model_ emits that `tool_use` and `runHarnessTest`
  asserts the skill **resolves** (its body is injected) — wiring, no real model.
  Built as `runHarnessTest({ pluginDir, transcript })` + a 3-file
  `examples/harness/fixture-skill-plugin` + a test (`demo:greet` resolves 3/3; a
  bogus skill errors). **Why it needed `--plugin-dir`:** the harness's
  file-materialization (`.claude/skills/…`) does **not** register a skill for the
  `Skill` tool — only native install does.

### Edit/Write — is the deterministic tier really gated? (same spike)

Caveat #2 claimed Edit/Write tool-event hooks don't fire via the mock in headless
mode. **Disproven on claude 2.1.169** (key-free, mock model):

- Real model, headless `-p` + `--permission-mode acceptEdits`: the `Write` tool
  fired and a `Write|Edit` PostToolUse hook fired — so it's not a platform gate.
- **Mock-model tier** (`runHarnessTest`, scripted `Write` tool_use, no key): the
  Write executed and the `Write|Edit` PostToolUse hook fired **5/5** runs.
- **Mock-model PreToolUse block**: a scripted `Read`→`Edit` against a
  `PreToolUse: Edit → exit 2` hook fired the hook and left the file unchanged
  **4/4**.

Why it works now: `runHarnessTest` passes `--allowedTools Read Edit Write Bash`,
which allowlists the edit tools past the permission prompt; no `--permission-mode`
is needed (the eval tier additionally sets `acceptEdits`). The gating was real in
an earlier CLI but is **not reproducible on 2.1.169**.

Three gotchas found while writing the regression tests (each caused a
false-pass or a no-op until fixed):

1. **`Edit` requires a prior `Read`** of the file (Claude Code's rule) — without
   it the Edit never attempts, so the PreToolUse hook never fires. The block test
   must `Read` then `Edit`.
2. **A "file unchanged" assertion passes trivially** if the tool no-ops. The
   block test must also assert a **hook-fired marker**, or it proves nothing.
3. **A custom `prompt` made the mocked Write no-op** (the mock ignores prompt
   content, yet a non-default `prompt` suppressed the scripted turn). Letting
   `prompt` default to `"go"` is reliable. _(Worth a follow-up — why does the
   prompt affect a scripted mock?)_

Consequence: **build #3 collapses.** There's no "Edit/Write driver" to write — the
deterministic tier already drives them. Shipped as a **regression test**
(`src/harness-test.test.ts`: Write→PostToolUse fires; Read→Edit→PreToolUse blocks)
to catch a future re-gate, with the stale "headless-gated" comments removed.

## See also

- [`docs/testing-matrix.md`](../docs/testing-matrix.md) — the current API → test map.
- [`docs/harness-testing.md`](../docs/harness-testing.md) — the user-facing guide.
- [`research/harness-testing.md`](harness-testing.md) — three-tier design rationale.
- [`research/feature-ideas.md`](feature-ideas.md) §13 — sandboxed harness exec.
- [`research/benchmarks-runtime-gates.md`](benchmarks-runtime-gates.md) — the evals run in anger.
