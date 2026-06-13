/**
 * claudeCodeAdapter — the Claude Code `HarnessAdapter`: the five port
 * implementations bundled, plus a `detect` that recognizes a Claude Code repo
 * (a `.claude-plugin/` manifest, a `.claude/settings.json`, or a `CLAUDE.md`).
 * This is the reference adapter a second harness (Codex, Gemini, …) mirrors.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { HarnessAdapter } from "../../core/adapter.js";
import { claudeCodeDialect } from "./dialect.js";
import { claudeCodeLayout } from "./layout.js";
import { claudeCodeRuntime } from "./runtime.js";
import { claudeCodeHookProtocol } from "./hook-protocol.js";
import { claudeCodeModelMock } from "./model-mock.js";

export const claudeCodeAdapter: HarnessAdapter = {
  name: "claude-code",
  dialect: claudeCodeDialect,
  layout: claudeCodeLayout,
  runtime: claudeCodeRuntime,
  hookProtocol: claudeCodeHookProtocol,
  modelMock: claudeCodeModelMock,
  detect(root: string): boolean {
    return [
      claudeCodeLayout.manifestPath,
      claudeCodeLayout.settingsPath,
      claudeCodeLayout.instructionFile,
    ].some((rel) => existsSync(join(root, rel)));
  },
};
