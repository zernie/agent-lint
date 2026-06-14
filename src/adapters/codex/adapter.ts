/**
 * codexAdapter — EXPERIMENTAL, internal-only prototype `HarnessAdapter`. Bundles
 * the five Codex ports + a `detect`. It exists to PROVE the kit generalizes: it
 * passes `assertAdapterConformance` / `assertAdapterLoadsHooks` and drives the
 * compiler + loader against real Codex-shaped fixtures (see codex.test.ts).
 *
 * It is deliberately NOT registered in `src/adapter-registry.ts` and NOT exported
 * from any `vigiles/*` subpath, so the CLI never auto-detects Codex and consumers
 * can't import it. Promote it (register + `vigiles/codex` export + the deferred
 * transport renderers) only when Codex support actually ships.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { HarnessAdapter } from "../../core/adapter.js";
import { codexDialect } from "./dialect.js";
import { codexLayout } from "./layout.js";
import { codexRuntime } from "./runtime.js";
import { codexHookProtocol } from "./hook-protocol.js";
import { codexModelMock } from "./model-mock.js";

export const codexAdapter: HarnessAdapter = {
  name: "codex",
  // Full convergence with Claude Code: mockable (Responses SSE) + shell hooks
  // with veto (permissionDecision/exit 2). Both pillars, all tiers.
  capabilities: {
    referenceVerification: true,
    harnessTesting: true,
    shellHooks: true,
  },
  dialect: codexDialect,
  layout: codexLayout,
  runtime: codexRuntime,
  hookProtocol: codexHookProtocol,
  modelMock: codexModelMock,
  detect(root: string): number {
    // A `.codex/config.toml` is a strong signal; a bare AGENTS.md is weak (many
    // harnesses read it). (Unused while unregistered — kept for symmetry.)
    if (existsSync(join(root, ".codex", "config.toml"))) return 3;
    if (existsSync(join(root, codexLayout.instructionFile))) return 1;
    return 0;
  },
};
