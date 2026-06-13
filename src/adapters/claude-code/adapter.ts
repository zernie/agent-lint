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
  detect(root: string): number {
    // Most specific signal wins: a plugin manifest (3) > repo settings (2) >
    // a bare CLAUDE.md (1, weak — many tools also read it / AGENTS.md).
    const has = (rel: string): boolean => existsSync(join(root, rel));
    if (has(claudeCodeLayout.manifestPath)) return 3;
    if (has(claudeCodeLayout.settingsPath)) return 2;
    if (has(claudeCodeLayout.instructionFile)) return 1;
    return 0;
  },
};
