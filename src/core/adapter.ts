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

export interface HarnessAdapter {
  /** Stable identifier, e.g. "claude-code". The CLI/registry key. */
  readonly name: string;
  /** Format axis: tool catalog, hook events, instruction targets, plugin-root token. */
  readonly dialect: HarnessDialect;
  /** Layout axis: where the instruction file / skills / agents / hooks live on disk. */
  readonly layout: PluginLayout;
  /** Transport axis: the agent binary to spawn + the mock-model env. */
  readonly runtime: HarnessRuntime;
  /** Transport axis: how a hook signals a block/deny (exit code + decision values). */
  readonly hookProtocol: HookProtocol;
  /** Transport axis: the mock model's wire format + endpoints. */
  readonly modelMock: ModelMock;
  /**
   * Whether a repo at `root` looks like it targets this harness — used by the
   * CLI to auto-detect which adapter to use (the library selects by import).
   */
  detect(root: string): boolean;
}
