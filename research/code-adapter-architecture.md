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

- **Format axis — `HarnessDialect` (DONE).** `src/core/dialect.ts` defines the
  interface: the built-in subagent tool catalog, never-available tools, the MCP
  tool shape, hook events, instruction targets, and the plugin-root token. The
  CC values that were hard-coded literals in `compile.ts`
  (`KNOWN_AGENT_TOOLS`/`NEVER_AVAILABLE_TOOLS`/`MCP_TOOL_RE`) now live in
  `claudeCodeDialect` (the `defaultDialect`); `compileAgent(spec, { dialect })`
  takes an injected one. `src/core/dialect.test.ts` proves a second dialect swaps
  the catalog. A Codex adapter defines `codexDialect` and injects it — no core
  edit. **Remaining format-axis work:** the instruction-file/skill/agent
  frontmatter _renderers_ in `compile.ts`/`compile-generator.ts` still emit the
  CC shape directly; fold those behind the dialect too when AGENTS.md/Codex
  output diverges.
- **Transport axis (NEXT, interfaces not yet extracted):** `PluginLoader` (→
  `LoadedPlugin`, already the agnostic shape), `HookProtocol` (event names +
  stdin-event encode / stdout-decision decode — today scattered across
  `run-hook.ts` + `harness-test.ts`), `ModelMock` + `AgentProcess` (the spawn
  target + the SSE shape). These live in `src/adapters/claude-code/` already;
  promoting them to interfaces is the work that lands with the Codex transport.

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
Open/Closed payoff of ports):

1. Add `src/adapters/codex/` (or flat `codex-*.ts`) implementing the transport
   ports — a `CodexProcess` spawn + its mock — and the format dialect
   (`AGENTS.md`, Codex's `tools` shape).
2. Add a `vigiles/codex` subpath export beside `vigiles/claude-code`.
3. Classify the new modules as a `codex-harness` element in
   `eslint.config.mjs`; the same `verify-core` ⊄ adapter rule applies unchanged.
4. Teach the CLI auto-detector to recognize the Codex layout.
5. Cross-harness eval falls out for free: `runEval` arms can be different
   harnesses, because `Trace` is already unified (the parked `measure-model ×
harness` bet).

Until then, this is the spec the extraction builds against — moving files before
a second consumer exists is how you get the wrong abstraction.

## See also

- `docs/harnesses.md` — the user-facing how-to (which import, what's supported).
- `research/sync-tool-compatibility.md` — the _format-axis_ composition with
  Ruler/rulesync (a different kind of "other tool").
- `research/divergent-bets.md` — the parked `measure-model × harness` bet.
