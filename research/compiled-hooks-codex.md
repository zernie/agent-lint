# Compiled hooks — the Codex adapter (design)

Status: **design, not yet built.** The compiled-hooks feature
([`docs/compiled-hooks.md`](../docs/compiled-hooks.md), core in
`src/core/hook-program.ts`, public `vigiles/hook`) ships for Claude Code. This is
the plan to make a single typed hook program compile to **Codex** too, through
the existing adapter ports — no core changes, mirroring how `compile`/`scan`/the
test tiers already dispatch per harness.

## The thesis: one program, the emit is the only harness-specific part

A compiled hook is a pure `(event) => Decision` (or `Injection`/`Reaction`)
against the closed `vigiles/hook` vocabulary. Almost none of it is
Claude-Code-specific:

| Piece                                                                   | Harness-specific? |
| ----------------------------------------------------------------------- | ----------------- |
| The typed program (`defineHook`/`defineInject`/`defineReact`, `decide`) | **No** — pure     |
| The AST matcher (`command.runs`/`touches`/`pipesToShell`, `path.under`) | **No** — bash AST |
| Capability check (`checkHookImports`) + stamp (`stampHook`)             | **No**            |
| The runtime decision (`decideProgram`/`decideFileGate`/`runReact`)      | **No**            |
| **Block signalling** — `exit 2`                                         | **Shared** (★)    |
| **The emitted settings block** (format + matcher syntax)                | **Yes** — emit    |
| **The inject/ask OUTPUT JSON shape**                                    | **Mostly shared** |

★ The load-bearing finding from [`harness-landscape.md`](harness-landscape.md):
Codex's hook protocol is a **near-1:1 port of Claude Code's** — stdin JSON, and a
`PreToolUse` veto via `permissionDecision` / `decision:block` / **`exit 2`**. So
`run-hook-program`'s "deny ⇒ exit 2" path **already works for Codex unchanged**.
That's why this is small: the gate _decision_ and its _enforcement_ are shared;
only the _wiring artifact_ (`compile-hook`'s output) is per-harness.

## What differs, concretely (the two emit axes)

1. **Settings format (PluginLayout.settingsFormat: `json` | `toml`).** Today
   `compileHookProgram` returns a CC `{ hooks: { <event>: [{ matcher, hooks:
[{ type, command }] }] } }` JSON object. Codex hooks live in `config.toml`
   `[hooks]` as `[[hooks.PreToolUse]]` with `matcher = "..."` + a command. The
   loader already reads both (`@iarna/toml`, `safeReadManifest`); the emit must
   _write_ both. The layout port already carries `settingsFormat`.

2. **Matcher syntax (a small dialect/protocol formatter).** CC matchers are a
   glob/exact tool name (`"Bash"`, `"Edit|Write"`). Codex matchers are a
   **regex** (`matcher = "^Bash$"`, `"^(Edit|Write)$"`). `hookRouting` already
   computes the neutral `{ on, matcher? }`; the per-harness step is formatting
   that matcher (raw vs anchored-regex) and the tool names (CC `Bash`/`Edit` vs
   Codex `shell`/`apply_patch` — the **dialect** already maps tool vocabularies).

3. **Event names (validate against the dialect).** A compiled hook's `on` must be
   a real event for the target harness. The event sets overlap on the ones that
   matter (`SessionStart`, `PreToolUse`, `UserPromptSubmit`, `Stop`) but differ
   at the edges — Codex **has `SubagentStart`** (CC has only `SubagentStop`), and
   Codex's `Stop` uses `continue:false`. Reuse `verifyHookEvents(events, dialect)`
   (the existing moat) so a hook targeting an event the harness lacks is a
   compile error, not a silent dead hook.

4. **Inject/ask output JSON (HookProtocol, minor).** Deny is `exit 2` (shared).
   The inject `additionalContext` shape and the `ask` `permissionDecision` shape
   are emitted by the runtime; if Codex's field names differ, that formatting
   moves behind `HookProtocol` (which already encodes `blockExitCode` +
   `denyDecisionValues`). **To confirm against the real `codex` binary** before
   building — gate, like the rest of the Codex transport work.

## The build (small, port-shaped — no core edits)

- **Generalize the emit** `compileHookProgram(source, hook, gateCommand)` →
  `compileHookProgram(source, hook, { dialect, layout, hookProtocol,
gateCommand })`. Keep the current signature working (default to the CC ports)
  so it's strictly additive. Internally:
  - validate `hook.on` via `verifyHookEvents` against `dialect`;
  - format the matcher (raw for CC, `^…$` regex for Codex) — a `formatMatcher`
    on the protocol/dialect;
  - serialize via `layout.settingsFormat` — JSON object (today) or a TOML
    `[[hooks.<event>]]` block (`@iarna/toml`, already a dep).
- **CLI:** `compile-hook` already resolves the adapter path the rest of the CLI
  uses (`resolveHarnessSelection` — `--harness=` / `.vigilesrc.json` / detect);
  thread `adapter.{dialect,layout,hookProtocol}` into the generalized emit. The
  printed block becomes "add to `config.toml`" for Codex.
- **`run-hook-program`:** unchanged for the gate path (exit 2). Only the
  inject/ask output formatter routes through `hookProtocol` once Codex's shape is
  confirmed.
- **The stamp** is harness-neutral — keep it.

## Boundary + dogfood

- **Boundary:** the generalized emit stays in `src/core/hook-program.ts` and
  takes the ports by **injection** (core ⊄ adapter — the dogfooded
  `boundaries/dependencies` rule). No `${CLAUDE_PLUGIN_ROOT}`/`.claude/` literal
  enters the neutral path; CC specifics stay in the injected CC ports.
- **Dogfood (the adapter-aware-lint discipline):** a CC-shaped fixture can't
  catch a CC-hardcoding regression, so the Codex test must assert a **TOML
  `[[hooks.PreToolUse]]`** block with a **regex matcher** round-trips and that
  `run-hook-program` denies a disaster event under `codexAdapter` — paired with
  the existing `assertAdapterLoadsHooks(codexAdapter)`.

## Why not OpenCode (yet)

OpenCode hooks are **in-process TS plugin modules**, not shell processes
(`shellHooks: false` in its prototype adapter). A compiled hook that emits a
"run this command" settings block doesn't map; the OpenCode form would emit a
**module** that imports the same typed program and calls `decideProgram`. That's
a different emit target — noted, not in this design.

## See also

- [`docs/compiled-hooks.md`](../docs/compiled-hooks.md) — the shipped CC feature this generalizes.
- [`codex-prototype-findings.md`](codex-prototype-findings.md) — the Codex adapter status (layout/runtime/mock proven against the real binary).
- [`harness-landscape.md`](harness-landscape.md) — the hook-protocol near-1:1 finding + the per-port extraction map.
- [`hook-pain-points.md`](hook-pain-points.md) — the verified hook failure corpus the feature answers.
