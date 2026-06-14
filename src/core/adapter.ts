/**
 * HarnessAdapter — the bundle that makes a harness a single, addable unit.
 *
 * Each port (HarnessDialect, PluginLayout, HarnessRuntime, HookProtocol,
 * ModelMock) decouples one axis of Claude-Code coupling. A `HarnessAdapter`
 * groups a harness's five port implementations plus a `detect` predicate, so
 * **adding a harness is writing one object** — `codexAdapter`, `geminiAdapter`,
 * `myHarnessAdapter` — not editing the core. The library stays import-named
 * (`import { claudeCodeAdapter } from "vigiles/claude-code"`); the bundle is the
 * thing the CLI auto-detects and the conformance kit checks.
 *
 * See `docs/authoring-an-adapter.md` (third-party guide) and
 * `research/code-adapter-architecture.md` (the design).
 */
import type { HarnessDialect } from "./dialect.js";
import type { PluginLayout } from "./layout.js";
import type { HarnessRuntime } from "./runtime.js";
import type { HookProtocol } from "./hook-protocol.js";
import type { ModelMock } from "./model-mock.js";
import type { HarnessTestDriver } from "./harness-driver.js";

/**
 * Which vigiles pillars/tiers a harness can drive — the capability matrix made
 * executable (see `docs/harnesses.md`). Not every harness reaches every tier:
 * a closed, un-mockable one (Cursor, Devin, Amp, Amazon Q) can only ever do
 * pillar 1, and a harness whose hooks are in-process code modules (OpenCode)
 * has no shell-hook tier. Declaring this lets the conformance kit relax the
 * port requirements for what an adapter says it can't do (instead of forcing a
 * fake `runtime`/`modelMock`/`hookProtocol`), and lets the pillar-2 runners
 * refuse — rather than mysteriously hang on — an adapter that can't be mocked.
 */
export interface AdapterCapabilities {
  /**
   * Pillar 1 — reference verification (dialect + layout). Always `true`: every
   * harness with an instruction-file format can have its references verified.
   */
  readonly referenceVerification: true;
  /**
   * Pillar 2 — deterministic harness tests + evals: the binary can be spawned
   * and pointed at a mock model. Requires `runtime` + `modelMock`. `false` for
   * closed harnesses that route through a fixed backend (no BYOM): Cursor,
   * Devin, Amp, Amazon Q — they are pillar-1-only adapters.
   */
  readonly harnessTesting: boolean;
  /**
   * Hooks are shell processes speaking the exit-code/env block protocol —
   * Claude Code, Codex, Crush. Requires `hookProtocol`. `false` when hooks are
   * in-process code modules (OpenCode's TS plugins), so the `run-hook` unit
   * tier and the `HookProtocol` port do not apply.
   */
  readonly shellHooks: boolean;
}

export interface HarnessAdapter {
  /** Stable identifier, e.g. "claude-code". The CLI/registry key. */
  readonly name: string;
  /** What this harness can drive — gates which ports below are required. */
  readonly capabilities: AdapterCapabilities;
  /** Format axis: tool catalog, hook events, instruction targets, plugin-root token. */
  readonly dialect: HarnessDialect;
  /** Layout axis: where the instruction file / skills / agents / hooks live on disk. */
  readonly layout: PluginLayout;
  /** Transport axis: the agent binary to spawn + the mock-model env. Present iff
   *  `capabilities.harnessTesting`. */
  readonly runtime?: HarnessRuntime;
  /** Transport axis: how a hook signals a block/deny. Present iff
   *  `capabilities.shellHooks`. */
  readonly hookProtocol?: HookProtocol;
  /** Transport axis: the mock model's wire format + endpoints. Present iff
   *  `capabilities.harnessTesting`. */
  readonly modelMock?: ModelMock;
  /**
   * Pillar-2 deterministic-runner driver: how `runHarnessTest` builds this
   * harness's argv, starts its scripted mock, and parses its stdout. Present iff
   * `capabilities.harnessTesting` (it composes the runtime + modelMock into the
   * one seam the runner dispatches through). Carried on the bundle so the runner
   * never imports a sibling adapter to find it.
   */
  readonly harnessTestDriver?: HarnessTestDriver;
  /**
   * How strongly a repo at `root` looks like it targets this harness — the CLI
   * uses it to auto-detect which adapter to use (the library selects by import).
   * Returns a **specificity score**: 0 = not this harness; higher = a more
   * specific match. The registry picks the highest scorer, so a strong signal
   * (a `.claude-plugin/` manifest) beats a weak one (a bare `CLAUDE.md`, or an
   * `AGENTS.md` that many harnesses share) regardless of registration order.
   */
  detect(root: string): number;
}
