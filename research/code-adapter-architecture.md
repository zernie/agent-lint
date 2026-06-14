# Harness Adapter Architecture — extracting Claude Code behind ports

> The plan for decoupling vigiles from Claude Code so a second harness (Codex is
> the likely first) can sit beside it without touching the core. Ports-and-
> adapters as the _mental model_, kept thin: extract interfaces only where a
> second harness would actually differ, keep Claude Code as the single concrete
> adapter, and let adapter #2 pull the abstraction into its real shape. The
> boundary is enforced today by `eslint-plugin-boundaries` and dogfooded via
> `enforce("boundaries/dependencies")`.

## Verdict: thin hexagonal, two axes, one adapter

Hexagonal is the right frame — vigiles has a harness-agnostic core and a
replaceable edge — but don't build the ceremony (registry, a `Harness` god-
interface, runtime resolution) speculatively. With one adapter, a generalized
plugin system grows the _wrong_ abstraction.

The key structural fact: **there is no single "Claude Code" coupling — there are
two independent coupling axes.** Conflating them into one interface is the
mistake to avoid.

| Axis                    | Pillar        | What's Claude-Code-specific                                                                                                                                   | Touches                                                                                 |
| ----------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Format / dialect**    | 1 (authoring) | `CLAUDE.md` vs `AGENTS.md`, `SKILL.md` frontmatter, `tools:` contract syntax, `${CLAUDE_PLUGIN_ROOT}`, plugin layout (`.claude-plugin/`, `skills/*/SKILL.md`) | `compile.ts`, `scan.ts`, `frontmatter.ts`, `plugin-loader.ts`, `spec.ts` (`ClaudeTool`) |
| **Runtime / transport** | 2 (testing)   | the `claude` binary spawn, the hook event protocol (`PreToolUse`…), the Anthropic SSE mock                                                                    | `harness-test.ts`, `eval.ts`, `run-hook.ts`, `mock-model.ts`, `agent-runtime.ts`        |

A Codex adapter would reuse the **format** axis (`AGENTS.md`) but bring a totally
different **transport**. They version independently — one interface would force a
fake binding. Everything else (`spec.ts` builders, `linters.ts`, `stats.ts`, the
`Trace` predicates, the rule kinds) is already the domain core and barely knows
Claude Code exists.

## How a consumer selects a harness: import, not config

For a **library**, the adapter is chosen at **compile time by which subpath you
import** — not a `harness:` string in a config file.

```ts
// core — harness-agnostic, stable surface
import { runHarnessTest, runEval } from "vigiles/testing";
// adapter — named explicitly
import { loadPlugin, scriptModel } from "vigiles/claude-code";
//   later:                          from "vigiles/codex";
```

Why import over runtime selection:

- Consumers write `.spec.ts` / `*.harness.mjs` **in code** — they already import;
  naming the adapter is one more import, zero magic, types flow through.
- Tree-shaking drops unused adapters (and their spawn/SSE/bwrap baggage). A
  runtime registry forces every adapter into the bundle.
- A config string means a runtime lookup and "adapter not found" at runtime —
  the failure class branded types exist to kill.

The **one exception is the CLI.** `vigiles compile|scan|audit` can't ask the user
to import — it must **auto-detect** the layout (`.claude-plugin/` present?
`AGENTS.md`?), with a `vigiles.config` key as an override escape hatch later.
Programmatic API names the adapter; the CLI detects it. This keeps "zero config
by default" intact while the library stays explicit.

The seam already exists: `src/claude-code.ts` re-exports the Claude-Code-specific
pieces and is documented as "the adapter, so a future `vigiles/<other-harness>`
can sit beside it."

## The ports

Extraction status, by axis:

- **Format axis — `HarnessDialect` (DONE).** `src/core/dialect.ts` defines **only
  the interface**: the built-in subagent tool catalog, never-available tools, the
  MCP tool shape, hook events, instruction targets, and the plugin-root token. The
  CC values that were hard-coded literals in `compile.ts`
  (`KNOWN_AGENT_TOOLS`/`NEVER_AVAILABLE_TOOLS`/`MCP_TOOL_RE`) now live in
  `claudeCodeDialect` — **defined in the adapter** (`src/adapters/claude-code/dialect.ts`),
  symmetric with the other four ports, so the core defines no concrete dialect and
  has no `defaultDialect`. `compileAgent(spec, { dialect })` **requires** an injected
  dialect (the CLI/composition root supplies `claudeCodeDialect`; the conformance
  kit supplies the adapter-under-test's). `src/core/dialect.test.ts` proves a second
  dialect swaps the catalog. A Codex adapter defines `codexDialect` and injects it —
  no core edit. **Remaining format-axis work:** the instruction-file/skill/agent
  frontmatter _renderers_ in `compile.ts`/`compile-generator.ts` still emit the
  CC shape directly; fold those behind the dialect too when AGENTS.md/Codex
  output diverges.
- **Layout axis — `PluginLayout` (DONE).** `src/core/layout.ts` defines where a
  harness's instruction file / skills / agents / commands / hooks / settings live
  on disk + the plugin-root token; `loadPlugin(path, layout = claudeCodeLayout)`
  reads every path/token/surface from the descriptor instead of hard-coding
  Claude Code's `.claude-plugin/` / `.claude/` conventions.
  `src/adapters/claude-code/layout.test.ts` loads a Codex-shaped plugin through
  the same loader. A Codex adapter supplies `codexLayout` — same loader, no fork.
- **Transport axis — `HarnessRuntime` (DONE).** `src/core/runtime.ts` defines the
  agent binary to spawn + the env a no-key mock is reached through (base-URL var,
  API-key var, dummy key). `harness-test.ts`, `eval.ts` and `sandbox.ts` read
  `claudeCodeRuntime.agentBinary` / `mockModelEnv(...)` instead of the `claude` /
  `ANTHROPIC_*` literals; `runtime.test.ts` proves an alternate runtime maps the
  URL onto its own env var. **Remaining transport work:** the hook event protocol
  (`run-hook.ts` field names + `decideHook` decision decode) and the Anthropic
  SSE mock (`mock-model.ts`) are still CC-shaped — promote them to `HookProtocol`
  / `ModelMock` interfaces when the Codex transport (a different hook JSON + model
  API) actually lands, shaped by two real implementations.

`LoadedPlugin`, `Trace`, and `EvalArm.settings: unknown` are already the agnostic
shapes — they stay in `vigiles/testing`; the adapter just produces them.

## Enforcing the boundary: eslint-plugin-boundaries (done)

The hexagon is only real if something stops the core from importing the adapter.
After the reshape the two element types are whole directories
(`eslint.config.mjs`, rule `boundaries/dependencies`):

- **`verify-core`** = `src/core/**` — the pure reference-verification domain
  (spec, compile, linters, dialect, proofs, …).
- **`cc-harness`** = `src/adapters/claude-code/**` — the Claude Code transport /
  harness adapter (harness-test, run-hook, eval, mock-model, plugin-loader,
  sandbox/egress, agent-/skill-runtime, judge, stats, …).

The application/composition-root layer at `src/` root (`cli`, `scan`, the
`testing`/`integration`/`unit`/`e2e` barrels, `action`, `harness-assert`) is
deliberately **unclassified** — it's allowed to wire adapter to core, so the
rule doesn't false-positive on it.

**Rule:** `verify-core` may not import `cc-harness`. **Direction:** the adapter
depends on the core (allowed); the core never depends on the adapter (forbidden)
— the inward dependency rule that defines a hexagon. It holds today with zero
violations, so it ships in **error** mode and prevents regressions. The
TypeScript resolver (`eslint-import-resolver-typescript`) maps the NodeNext
`./x.js` specifiers to `x.ts` so dependencies are classified correctly.

Per vigiles's own positioning ("vigiles does NOT do architectural linting —
reference their rules via `enforce()`"), we dogfood it: `enforce("boundaries/
dependencies")` in `CLAUDE.md.spec.ts` makes vigiles verify the boundary rule
exists and is enabled. The architecture invariant becomes a verified reference,
not a prose hope — `vigiles compile` now reports it among the linter-verified
rules.

## Adding a harness (the Codex path)

When a second harness is real, the additive recipe (core untouched — the
Open/Closed payoff of ports). Three of the ports now exist, so the first steps
are "implement these interfaces":

1. Add `src/adapters/codex/` implementing the ports as value objects:
   `codexDialect: HarnessDialect` (Codex's tool catalog / `AGENTS.md` target),
   `codexLayout: PluginLayout` (`.codex/` conventions), `codexRuntime:
HarnessRuntime` (spawn `codex`, its model env). Pass them in:
   `compileAgent(spec, { dialect: codexDialect })`, `loadPlugin(path,
codexLayout)`, and a Codex runner reading `codexRuntime`.
2. Promote the still-CC-shaped seams to ports as you go — the SKILL.md/agent
   frontmatter renderers (`compile.ts`), the hook protocol (`run-hook.ts`), the
   model mock (`mock-model.ts`) — shaped now by two real implementations.
3. Add a `vigiles/codex` subpath export beside `vigiles/claude-code`.
4. Classify `src/adapters/codex/**` as a `codex-harness` element in
   `eslint.config.mjs`; the same `verify-core` ⊄ adapter rule applies unchanged.
5. Teach the CLI auto-detector to recognize the Codex layout.
6. Cross-harness eval falls out for free: `runEval` arms can be different
   harnesses, because `Trace` is already unified (the parked `measure-model ×
harness` bet).

## Adapter-readiness gaps (what adding adapter #2 exposes)

The kit makes a harness _declarable_ (five descriptors + `HarnessAdapter`); the
gaps are in the _behaviour_ the descriptors front. Triaged into "fixed now"
(concrete from the Codex research, testable without the binary) and "deferred to
the Codex build" (shape needs the real second implementation — fixing them
speculatively is the wrong-abstraction trap).

**Fixed:**

- **Settings-format axis** — `PluginLayout.settingsFormat: "json" | "toml"`;
  `loadPlugin` parses Codex's `config.toml` `[hooks]` (`@iarna/toml`) instead of
  silently reading zero hooks. Behaviourally covered by `assertAdapterLoadsHooks`.
- **Detect specificity + `--harness` override** — `detect(root)` returns a
  specificity score (manifest 3 > settings 2 > bare CLAUDE.md 1), the registry
  picks the highest and reports `ambiguousWith` (a CLAUDE.md + AGENTS.md repo),
  and `resolveAdapter(root, harness?)` honours an explicit `--harness`.
- **Deeper conformance** — cross-port invariants (port names agree,
  `instructionFile` ∈ `instructionTargets`, plugin-root tokens match) +
  `assertAdapterLoadsHooks` (the settings round-trip that catches the JSON-vs-TOML
  trap). Conformance is no longer purely structural.

**Built + PROVEN against the real `codex` binary** (was deferred; the binary
installs here and in CI — `@openai/codex`, no API key — so these were shaped
against reality, not guessed; see `research/codex-prototype-findings.md`):

- **`ModelMock` SSE renderer** — DONE. `src/adapters/codex/mock-model.ts`
  (`renderResponsesSSE`/`parseResponsesRequest`/`startCodexMock`) serves the
  OpenAI **Responses** event sequence; a gated test drives real `codex exec`
  against it and asserts the turn completes (the scripted reply is printed). The
  exact `POST /v1/responses` request shape + the 9-event SSE sequence are captured
  from live codex traffic, not assumed.
- **`HarnessRuntime.wireMock`** — DONE as a recipe. Pointing codex at the mock is
  the keyless `-c model_provider=mock -c model_providers.mock.{base_url,wire_api,
env_key,requires_openai_auth,…}` flag set (proven), exported as
  `codexMockArgs`/`codexMockEnv` from the codex runtime — not the env-var route
  the prototype guessed (that finding is now corrected).

**Still deferred** (genuinely needs the divergent output / surface shape):

- **Instruction/skill renderers** — `compile.ts` still emits structured CLAUDE.md;
  fold behind the dialect once AGENTS.md/Codex output actually diverges.
- **Config-based surfaces** — Codex subagents are a `[agents]` TOML table, not an
  `agents/` dir; `surfaceDirs` materialization is dir-shaped.

## See also

- `research/codex-prototype-findings.md` — an internal, non-shipped Codex adapter
  (`src/adapters/codex/`) built to **validate** this architecture: it passes the
  conformance kit + drives the real compiler/loader against Codex fixtures (format
  - layout axes proven, zero core changes), and the gaps it exposed.
- `research/harness-landscape.md` — the mid-2026 research backing the Codex
  recipe: confirmed Codex facts (TOML config, AGENTS.md, SKILL.md, hooks **with
  veto**, Responses-API mock), the port-by-port extraction verdict (both deferred
  seams now extractable), and the ranked next-adapter shortlist.
- `docs/harnesses.md` — the user-facing how-to (which import, what's supported).
- `research/sync-tool-compatibility.md` — the _format-axis_ composition with
  Ruler/rulesync (a different kind of "other tool").
- `research/divergent-bets.md` — the parked `measure-model × harness` bet.
