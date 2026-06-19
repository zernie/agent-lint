# Codex prototype — does the adapter kit actually generalize?

> Started as an internal, non-shipped Codex adapter (`src/adapters/codex/`) to
> validate the harness-adapter architecture against a real second harness; it is
> **now SHIPPED** — registered in `ADAPTERS` (the CLI auto-detects a Codex repo)
> and exported as `vigiles/codex`. **Pillar 2 (harness testing) is full and proven
> against the real `codex` binary; pillar 1 (compile) is format-correct for the
> surfaces that map** — AGENTS.md + minimal SKILL.md, CC output byte-identical
> (subagents are a deliberate boundary, not a gap — see below). This doc records
> how the bet was validated and what remains. Built from
> `research/harness-landscape.md`.

## UPDATE (2026-06-14): the transport tier is now PROVEN against real codex ✅

The original verdict below proved the **format + layout** axes and flagged the
**transport** (runtime + ModelMock) as unbuildable here "because `codex` isn't
installed." That premise was wrong: **`@openai/codex` (0.139.0) installs and runs
in this environment with no API key** (and now in CI). With the real binary in
hand, the two deferred transport gaps are closed against reality:

- **Wire format — confirmed by live traffic.** Pointed real `codex exec` at a
  logging mock: it sends `POST /v1/responses` (`wire_api=responses`,
  `Accept: text/event-stream`, `Authorization: Bearer <env_key>`) with a Responses
  body (`instructions`, `input[]` messages, `tools[]`, `stream:true`). The
  `codexModelMock` descriptor (`openai-responses` + `/v1/responses`) was right.
- **ModelMock renderer — BUILT + proven (gap #2 closed).**
  `src/adapters/codex/mock-model.ts` (`renderResponsesSSE` / `parseResponsesRequest`
  / `startCodexMock`) serves the exact 9-event Responses SSE sequence; a gated test
  drives **real `codex exec`** against it and asserts the turn completes (the
  scripted assistant text is printed). No API key, deterministic.
- **`wireMock` — PROVEN as a keyless flag recipe (gap #1 closed).** Codex points
  at the mock via `-c model_provider=mock -c model_providers.mock.{base_url,
wire_api,env_key,requires_openai_auth,request_max_retries,stream_max_retries}`
  (+ `CODEX_HOME` + a dummy `env_key` value), exported as
  `codexMockArgs`/`codexMockEnv`. This **corrects** the prototype's guess that the
  `OPENAI_BASE_URL` env var was the path.

Codex is now **shipped**: `codexAdapter` is registered in `ADAPTERS` (CLI
auto-detect) and exported as `vigiles/codex`. The hard, previously-blocking
transport half is done and proven. **The pillar-2 runner is now adapter-driven**:
`runHarnessTest(spec, { adapter: codexAdapter })` drives real `codex exec` through
the public API (a per-harness `HarnessTestDriver` behind the `wireMock` runtime
seam; CC stays the default, byte-identical), verified by a gated real-codex test.
What remains is purely the format-axis polish (gaps #3–#5 below): the
instruction/skill renderers behind the dialect, TOML manifest/MCP reads, and
relocating the shared loader — so pillar-1 `compile` output for a Codex repo is
CC-shaped until then. `runEval` follows the same driver seam (not yet done). The
rest of this doc is the original prototype verdict, kept for the record.

## Verdict: the format + layout axes generalize with ZERO core changes ✅

`codexAdapter` — the five Codex ports bundled — **passes the full conformance
kit** and drives the real engine against Codex-shaped fixtures:

- `assertAdapterConformance(codexAdapter)` ✅ — every port populated; cross-port
  invariants hold (all names `"codex"`, `instructionFile` `"AGENTS.md"` ∈
  `instructionTargets`, plugin-root tokens agree).
- `assertAdapterLoadsHooks(codexAdapter)` ✅ — a **TOML** `config.toml [hooks]`
  block round-trips through the loader (the `settingsFormat` axis works).
- `compileAgent(spec, { dialect: codexDialect })` ✅ — the **same** compiler
  accepts a Codex built-in (`shell`) and flags a Claude Code tool (`Read`) under
  the Codex catalog. The dialect injection is real.
- `loadPlugin(dir, codexLayout)` ✅ — a real Codex repo (AGENTS.md + a `skills/`
  surface + TOML `[[hooks.PreToolUse]]` with `${PLUGIN_ROOT}`) loads: instruction
  file picked up, surface materialized under `.codex/`, hooks parsed from TOML,
  `${PLUGIN_ROOT}` expanded.

So the **format axis (`HarnessDialect`) and layout axis (`PluginLayout` +
`settingsFormat`) are proven** — adding Codex's _authoring/verification_ support
is writing value objects, no core edits, exactly as designed. `HookProtocol`
came out **identical** to Claude Code (the thin port was right).

## Gaps the prototype concretely exposed (the honest part)

Building it surfaced real, specific limitations — each maps to a deferred item:

1. **[CLOSED — see UPDATE] `HarnessRuntime` "point at the mock" is half-shaped.**
   Was: Codex's single `modelBaseUrlEnv` only works via the `OPENAI_BASE_URL`
   override ("messy"). RESOLVED: the proven path is the keyless
   `-c model_provider=mock` flag recipe (`codexMockArgs`/`codexMockEnv`), NOT the
   env var — the prototype's guess is corrected.
2. **[CLOSED — see UPDATE] `ModelMock` is a descriptor, not yet a renderer.**
   Was: the OpenAI Responses SSE renderer didn't exist and `codex` wasn't
   installed. RESOLVED: `codex` installs here + in CI, and
   `src/adapters/codex/mock-model.ts` serves the Responses SSE that real
   `codex exec` completes a turn against (gated test). Built against live traffic.
3. **[CLOSED] The layout port was JSON-shaped for manifest + MCP.** Was:
   `loadPlugin`'s manifest read and `hasMcp` were JSON-only, so Codex's
   `[mcp_servers]` TOML table was silently missed. RESOLVED: a format-aware
   `safeReadManifest(root, layout)` reads the manifest in the layout's
   `settingsFormat` (JSON or TOML); both the hooks-manifest read and `hasMcp` route
   through it, so Codex's TOML `[mcp_servers]` is detected (gated test in
   codex.test.ts). CC output unchanged (same key/file → identical warning).
4. **Config-defined surfaces aren't captured.** `surfaceDirs` is dir-based;
   Codex subagents are a `[agents]` TOML table (config, not a directory), and the
   skills dir is ambiguous (`.agents/skills` vs `~/.codex/skills`). (Deferred gap #7.)
5. **[CLOSED] The generic loader lived in the CC adapter.** Was: `loadPlugin`
   sat in `src/adapters/claude-code/plugin-loader.ts`, so codex/opencode imported
   it **cross-adapter**. RESOLVED: the generic `loadPlugin`/`resolveHarness` moved
   to the composition root (`src/plugin-loader.ts`, layout required, zero adapter
   imports); the CC adapter keeps a thin wrapper that supplies `claudeCodeLayout`
   as the default (so `vigiles/claude-code` + `vigiles/plugin-loader` are
   unchanged). codex/opencode/conformance import the generic and pass their own
   layout — **no adapter imports a sibling adapter anymore.**
6. **[CLOSED] Instruction-file + SKILL.md renderers are now dialect-correct for
   Codex.** `compileClaude` is format-neutral (plain markdown, no frontmatter =
   the AGENTS.md shape; the h1 target comes from the dialect), and `compileSkill`
   now reads `dialect.skillFrontmatter`: under Codex's `"minimal"` profile it
   emits ONLY `name` + `description`, dropping the CC-only keys
   (disable-model-invocation / argument-hint). CC output stays byte-for-byte
   identical (the dogfood integrity hash is unchanged). The CLI passes the
   detected adapter's dialect into `compileSkill`, so a Codex repo compiles
   Codex-shaped skills.

## Non-goal: compiling vigiles subagents to Codex

Deliberately NOT implemented (a model mismatch, not a missing renderer). vigiles's
`agent()` is a **verified tool contract** rendered to a Claude-Code-shaped subagent
markdown file. A Codex "subagent" is an `[agents.<name>]` **TOML concurrency table**
(`max_threads` / `max_depth`) — a runtime-orchestration knob, not a tool contract.
The two models don't map, so `compileAgent` does not emit a TOML `[agents]` block,
and there is no plan to add one. The Codex dialect still **verifies** an `agent()`'s
tool contract against its built-in catalog; only the OUTPUT renderer is CC-only.
(Comment at `compileAgent` in `src/core/compile.ts`.)

## What this means

The bet held end-to-end: the **format/layout half** was one object set (no core
changes), and the **transport half** — once we stopped assuming the binary was
unavailable — was built and proven against real `codex` (gaps 1–2 closed). On that
basis Codex is now **registered + exported** (`vigiles/codex`). The instruction-file
and SKILL.md renderers are now dialect-correct (gap 6, closed). The remaining
format-axis polish: extend the layout port for TOML manifest/MCP + config-surfaces
(gaps 3–4) and move `loadPlugin` to a shared location (gap 5). Compiling subagents
to Codex is a non-goal (above), not on this list.

The boundary holds for the prototype too: `src/adapters/codex/**` is a
`codex-harness` element in `eslint.config.mjs`, and `verify-core` may import
neither it nor `cc-harness`.

## UPDATE (2026-06-18): native Codex EVAL tier — spike + increment 1

The behavioral eval tier (`measureTriggerRate` / `runEval`) is **Claude-only**
today: it hardcodes the `claude` runner (`spawnAgent`) AND parses Claude's
stream-json (`makeContext`). Pointing it at a Codex plugin (e.g. fleytman/haretrail,
an `AGENTS.md` skill pack) required wrapping it as a Claude plugin. This records
the spike (done from code, no live binary in the build env) and the build plan.

### Spike findings (code + docs, no live `codex`)

1. **Spawn side — solved.** `codexDriver` already runs real `codex exec`
   (`buildCodexArgs` + the keyless `-c model_provider=mock` recipe). The
   per-adapter spawn machinery exists and is proven for layer 2.
2. **Trace side — not built, by design.** `parseCodexRun` returns
   `{ toolCalls: [], hooks: [], output: stdout.trim() }` — the JSONL tool-call
   stream is unparsed. So today the eval tier literally cannot detect a Codex
   tool/skill call: every `fired`/`skillResolved` predicate reads an empty
   `toolCalls` → recall always 0 (false). This is THE long pole.
3. **The gating unknown (needs the binary).** Claude trigger-rate detects an
   explicit `Skill` tool_use. Codex skills are `SKILL.md` instructions surfaced
   via progressive disclosure — it is UNCONFIRMED whether a skill activation
   appears as a discrete event in `codex exec --json` at all. If it does not,
   "trigger-rate" has no Codex trace analog and "did the skill fire" becomes a
   behavioral/judged check, not a trace predicate. **This is the one thing that
   genuinely needs a live `codex` run to settle.**

### Increment 1 — SHIPPED (env-independent): the trace-parser seam

`makeContext` now takes an injectable `ModelOutputParser` (default
`parseClaudeRun`, extracted from the old inline body); `measureTriggerRateWith`
accepts it as a 3rd arg and threads it through `TriggerRunConfig.parse`. Proven
by a unit test that drives a NON-Claude line protocol + a custom parser end-to-end
through `measureTriggerRateWith` and detects firing — exactly the slot a Codex
parser plugs into. Zero behavior change for Claude (default param).

### Increment 2 — SCAFFOLDED (env-independent), pending live-binary validation

`src/adapters/codex/eval.ts` (exported on `vigiles/codex`).
`parseCodexEvalRun(out): ParsedModelRun` is a TOLERANT, multi-shape parser that
probes BOTH plausible Codex JSONL models (the older `{msg:{type,…}}` event stream
and the newer `{type:"item.*", item:{…}}` thread/item stream), degrading to
empty / `output = trimmed stdout` on anything unrecognised — each extractor
isolated so finishing against captured JSONL is a field-name edit, not a rewrite.
`codexEvalRunner` spawns `codex exec --json` (v8-ignored; flags + skill-install
wiring are best-guess pending the binary). Unit-tested over synthetic fixtures for
both shapes (`src/adapters/codex/eval.test.ts`). Now finalized + wired (see the 2026-06-19
update + increment 3 below).

### Increment 3 — BUILT (env-independent), pending live end-to-end validation

**`{ evalDriver }` dispatch** on `measureTriggerRate` (the trigger-rate seam
`scan --trigger` rides), mirroring `runHarnessTest`'s `{ adapter }`. An
`EvalDriver = { runner, parse, runError? }` bundles a harness's
`AgentRunner` + `ModelOutputParser` + an optional errored-run detector;
`claudeEvalDriver` (default) and `codexEvalDriver` (`codexEvalAgentRunner` +
`parseCodexEvalRun` + `codexRunError`) are the two impls. `measureTriggerRate(spec,
{ evalDriver })` selects one; a trial whose `runError` fires is EXCLUDED from the
denominator (an errored/rate-limited turn isn't a clean miss) and counted as
`errored` in the report. `src/scan-behavioral.ts` carries a `HarnessProbe`
(`buildProbe(dir, harness)`) that picks the driver + the per-harness "fired"
predicate (`skillResolved` for Claude with stubbed bodies, `codexSkillFired` for
Codex), so `scan --trigger --harness=codex` routes through the Codex driver. Wired

- fake-tested (`src/eval.test.ts`, `src/scan-behavioral.test.ts` drive the dispatch
  with an injected fake driver, no binary); the one remaining step is a live
  end-to-end run (the haretrail EN-vs-RU eval natively), gated on Codex quota.

## UPDATE (2026-06-19): live capture — schema CONFIRMED, skill question ANSWERED

Authed real codex (ChatGPT device-auth, **codex-cli 0.139.0** — `0.141.0` has a
model-metadata regression that breaks the keyless mock recipe, so pin 0.139) and
captured real `codex exec --json` turns. Findings:

- **Schema confirmed (thread/item):** assistant = `item.completed` with
  `item.type:"agent_message"` → `item.text`; tool = `item.type:"command_execution"`
  → `item.command` (+ `aggregated_output`, `exit_code`); usage rides
  `turn.completed` (`input_tokens` / `output_tokens` / `cached_input_tokens`). An
  `item.started` repeats the same `id` mid-flight, so count `item.completed` ONLY.
- **The gating unknown is ANSWERED — no discrete skill event.** Codex's CLI has no
  Skill-tool concept; when a skill triggers, the model **reads the skill's
  `SKILL.md` via a `command_execution`** (`sed/cat … skills/<name>/SKILL.md`) and
  usually says so in an `agent_message`. So the Codex "fired" predicate is the
  SKILL.md read (`codexSkillFired`), not a trace event — best-effort, pair with a
  judged check for certainty.
- **Increment 2 finalized + live-validated:** `parseCodexEvalRun` rewritten to the
  confirmed schema, fixtures replaced with REAL captures, `codexSkillFired` added;
  the shipped `codexEvalRunner → parseCodexEvalRun → codexSkillFired` chain was run
  end-to-end against the live binary (a marker skill fired and was detected).
- Spawn gotcha: stdin must be `/dev/null` (`stdio:["ignore",…]`) — codex otherwise
  blocks on "Reading additional input from stdin…".

Increment 3 (the `{ evalDriver }` dispatch) is now BUILT + fake-tested (see
above). Remaining is purely a LIVE validation: run the haretrail EN-vs-RU eval
natively via `scan --trigger --harness=codex` once the Codex quota resets. Needs
network egress to the model backend on each run.

### Env-validation checklist

- [x] Install + auth: `npm i -g @openai/codex` (pin **0.139.0**; 0.141 regressed);
      auth in a
      remote/headless box via `codex login --device-auth` (URL + one-time code, no
      `localhost` callback — the only flow that works in a sandbox), or
      `printenv OPENAI_API_KEY | codex login --with-api-key`. Deterministic tier is
      keyless; only the eval tier needs this + network egress. See the auth section
      in `docs/harness-testing-codex.md`.
- [x] Capture `codex exec --json` JSONL for (a) a plain text turn, (b) a
      tool-calling turn, (c) a skill-activating turn → confirm the line schema.
- [x] Answer the gating unknown — ANSWERED: a skill activation is NOT a discrete
      event; it's the model reading `skills/<name>/SKILL.md` via a
      `command_execution`, so the Codex "fired" predicate is `codexSkillFired`
      (the SKILL.md read), best-effort, pair with a judged check.
- [x] Finish `parseCodexEvalRun` against the real schema; replace the synthetic
      fixtures with captured ones.
- [x] Wire `codexEvalDriver` → `measureTriggerRate({ evalDriver })` +
      `scan --trigger --harness=codex` (the `HarnessProbe` dispatch); fake-tested
      end-to-end with an injected driver (no binary).
- [x] LIVE dispatch validation: `scan --trigger --harness=codex` was run NATIVELY
      against the real binary (2026-06-19) — the CLI dispatched through the Codex
      `EvalDriver`, spawned real `codex exec --json`, and `codexRunError` correctly
      EXCLUDED the errored trials (report showed `recall 0% (0 runs)` = `n=0`, not
      scored as misses). The plumbing + error-exclusion are proven against reality.
- [ ] LIVE numbers: the recall/precision MEASUREMENT is still gated on the Codex
      usage limit (every trial errored "try again at 8:37 AM"). Retry the cluster
      probe (`research/fixtures/haretrail-cluster.json`) once quota resets to get
      actual debrief/lessons/postmortem precision numbers.
