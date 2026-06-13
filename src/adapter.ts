/**
 * `vigiles/adapter` — the harness-adapter authoring kit.
 *
 * Everything you need to teach vigiles a new harness, in one import: the five
 * port interfaces to implement, the `HarnessAdapter` bundle that groups them,
 * the conformance kit to validate yours, and the registry the CLI detects
 * through. vigiles ships a Claude Code adapter; building your own is welcome and
 * supported — see `docs/authoring-an-adapter.md`.
 *
 *   import {
 *     type HarnessAdapter, type HarnessDialect, type PluginLayout,
 *     type HarnessRuntime, type HookProtocol, type ModelMock,
 *     assertAdapterConformance,
 *   } from "vigiles/adapter";
 *
 *   export const myHarnessAdapter: HarnessAdapter = { name: "my-harness", … };
 */
export type { HarnessAdapter } from "./core/adapter.js";
export type { HarnessDialect } from "./core/dialect.js";
export type { PluginLayout } from "./core/layout.js";
export type { HarnessRuntime } from "./core/runtime.js";
export type { HookProtocol } from "./core/hook-protocol.js";
export type { ModelMock } from "./core/model-mock.js";

export {
  checkAdapterConformance,
  assertAdapterConformance,
  assertAdapterLoadsHooks,
  type ConformanceResult,
} from "./adapter-conformance.js";
export {
  ADAPTERS,
  defaultAdapter,
  detectAdapter,
  detectAdapterResult,
  resolveAdapter,
  getAdapter,
  type DetectResult,
} from "./adapter-registry.js";
