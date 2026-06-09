/**
 * vigiles — deterministic Claude Code harness testing.
 *
 * Test what your *harness* does — hooks, settings, skills, instruction files —
 * without paying for or depending on a real model. `runHarnessTest` spins up the
 * real `claude` CLI (so your real hooks and settings fire exactly as in
 * production) but points it at a scripted mock model (`src/mock-model.ts`), so
 * the agent's turns are fixed and the outcome is reproducible. No API key, no
 * cost, CI-friendly.
 *
 *   const r = await runHarnessTest({
 *     settings: { hooks: { Stop: [{ hooks: [{ type: "command",
 *       command: "test -f DONE || { echo 'not done' >&2; exit 2; }" }] }] } },
 *     model: scriptModel([
 *       { text: "I'm done" },                              // tries to stop → blocked
 *       { tool: "Bash", input: { command: "touch DONE" } },
 *       { text: "now done" },
 *     ]),
 *   });
 *   assert(JSON.parse(r.stdout).num_turns > 1);            // the Stop hook fired
 *
 * The "steps" are the scripted model turns — their real home is deterministic
 * harness testing, not production enforcement.
 *
 * Note: the mock drives Bash and Stop hooks, and — verified on claude 2.1.169 —
 * the Edit/Write tools too (allowlisted past the permission prompt), so their
 * PreToolUse/PostToolUse hooks fire in this tier. The events the mock can't
 * trigger (PreCompact / Notification / SessionEnd / SubagentStop) belong to the
 * `runHook` unit tier.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";

import { startMock, type ModelTurn } from "./mock-model.js";
import { resolveHarness } from "./plugin-loader.js";

export { scriptModel, type ModelTurn } from "./mock-model.js";
export { loadPlugin, resolveHarness } from "./plugin-loader.js";

export interface HarnessTestSpec {
  /** Fixture files to write in a fresh temp working dir (path → contents). */
  readonly files?: Record<string, string>;
  /** `.claude/settings.json` contents — the hooks/permissions under test. */
  readonly settings?: unknown;
  /**
   * Path to a real plugin/repo whose harness (hooks + CLAUDE.md + skills) is
   * loaded into the sandbox, so you test the assembled machine, not a retyped
   * subset. Inline `settings`/`files` layer on top. See src/plugin-loader.ts.
   */
  readonly plugin?: string;
  /**
   * Path to a plugin dir to install NATIVELY via `claude --plugin-dir`, so its
   * skills / commands / agents / hooks register and ACTIVATE the real way — a
   * scripted `Skill` tool_use resolves, and the real model can trigger them.
   * Unlike `plugin` (which materializes a file subset that does NOT register
   * skills for the `Skill` tool), this is the real install path, so point it at a
   * COMPLETE plugin (internal references resolve). Inline `settings`/`files` and
   * `plugin` still layer on top. Resolved to an absolute path.
   */
  readonly pluginDir?: string;
  /** The scripted model turns the agent will take. */
  readonly model: readonly ModelTurn[];
  /** The user prompt. Default: "go". */
  readonly prompt?: string;
  /** Tools the agent may use. Default: Read Edit Write Bash. */
  readonly allowedTools?: readonly string[];
  /**
   * Capture the full event transcript (`--output-format stream-json`) into
   * `stdout`, instead of just the final result object, so you can assert on what
   * the agent's tools returned — e.g. the body a `Skill` tool_use resolved. With
   * this on, `stdout` is newline-delimited JSON events, not a single object.
   */
  readonly transcript?: boolean;
  /** Per-run wall-clock timeout in ms. Default 60000. */
  readonly timeoutMs?: number;
}

/**
 * The observable record of ONE run — the unified shape produced by BOTH testing
 * tiers: `runHarnessTest`'s result and `runEval`'s `measure` ctx (`eval.ts`)
 * both satisfy it. That's what lets the bare predicates in `harness-assert.ts`
 * (`usedTool` / `skillResolved` / `toolCount` / `toolUsedWith`) run over either,
 * with the testing helpers asserting and eval measuring over the same vocabulary.
 *
 * Deferred: `trace.hooks` (which hook fired + its decision). It needs new mock
 * instrumentation to *record* hook invocations rather than infer them from
 * marker files — punted until something needs it.
 */
export interface Trace {
  /**
   * The tools the agent invoked, each paired with its result — parsed from the
   * transcript. Empty unless the run captured the stream (`transcript: true` on
   * the harness tier; always on the eval tier). Lets a test assert on the
   * agent's *actions* (skills, MCP tools, subagents) instead of grepping stdout.
   */
  readonly toolCalls: readonly ToolCall[];
  /** The agent's final answer text (the terminal `result` event), or "". */
  readonly output: string;
  /** Number of model turns. */
  readonly turns: number;
  /** Final contents of a file under the working dir, or null if absent. */
  file(path: string): string | null;
}

export interface HarnessTestResult extends Trace {
  readonly exitCode: number;
  readonly stdout: string;
  /** Hook block messages and diagnostics land here. */
  readonly stderr: string;
  /** The temp working dir (inspect or clean it up). */
  readonly cwd: string;
  /** Number of model turns the agent took (mock turns served). */
  readonly turns: number;
  /** Remove the temp working dir. */
  cleanup(): void;
}

/** A tool the agent invoked, paired with its result (transcript mode only). */
export interface ToolCall {
  readonly name: string;
  readonly input: unknown;
  /** The tool_result text ("" if none / not captured). */
  readonly resultText: string;
  /** Whether the tool_result came back flagged as an error. */
  readonly isError: boolean;
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) => {
      if (typeof b === "string") return b;
      const t = (b as { text?: unknown }).text;
      return typeof t === "string" ? t : "";
    })
    .join("");
}

/**
 * Parse `--output-format stream-json` (the `transcript: true` output) into the
 * tools the agent invoked, each joined to its result by id. Returns [] for the
 * non-stream `json` output. The seam that lets a test assert on the agent's
 * actions, not a brittle stdout substring.
 */
export function parseToolCalls(streamJson: string): ToolCall[] {
  const uses: { id: string; name: string; input: unknown }[] = [];
  const results = new Map<string, { text: string; isError: boolean }>();
  for (const line of streamJson.split("\n")) {
    if (!line.trim()) continue;
    let evt: { message?: { content?: unknown } };
    try {
      evt = JSON.parse(line) as { message?: { content?: unknown } };
    } catch {
      continue;
    }
    const content = evt.message?.content;
    if (!Array.isArray(content)) continue;
    for (const b of content as Array<Record<string, unknown>>) {
      if (b.type === "tool_use" && typeof b.name === "string") {
        const id = typeof b.id === "string" ? b.id : "";
        uses.push({ id, name: b.name, input: b.input });
      } else if (b.type === "tool_result") {
        const id = typeof b.tool_use_id === "string" ? b.tool_use_id : "";
        results.set(id, {
          text: contentText(b.content),
          isError: b.is_error === true,
        });
      }
    }
  }
  return uses.map((u) => ({
    name: u.name,
    input: u.input,
    resultText: results.get(u.id)?.text ?? "",
    isError: results.get(u.id)?.isError ?? false,
  }));
}

/**
 * The terminal `result` event — present in BOTH `--output-format` shapes (a
 * `{type:"result", …}` line in stream-json, the single object in `json`), or
 * null. The seam for the final answer + turn count without parsing twice.
 */
export function parseResultEvent(
  stdout: string,
): Record<string, unknown> | null {
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    let evt: Record<string, unknown>;
    try {
      evt = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (evt.type === "result") return evt;
  }
  return null;
}

/** The agent's final answer text from a transcript / result object, or "". */
export function parseOutput(stdout: string): string {
  const result = parseResultEvent(stdout)?.result;
  return typeof result === "string" ? result : "";
}

/** Whether the `claude` CLI is available — harness tests need it. */
export function claudeAvailable(): boolean {
  try {
    return spawnSync("claude", ["--version"], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

function writeFixture(
  cwd: string,
  files: Record<string, string>,
  settings: unknown,
): void {
  for (const [p, content] of Object.entries(files)) {
    const full = resolve(cwd, p);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  if (settings !== undefined) {
    // `{cwd}` in any hook command is substituted with the working dir, so a
    // hook can reference an absolute path inside it (hooks don't run with the
    // project dir as cwd).
    const json = JSON.stringify(settings, null, 2).replaceAll("{cwd}", cwd);
    writeFileSync(join(cwd, "settings.json"), json);
  }
}

interface RunOut {
  code: number;
  stdout: string;
  stderr: string;
}

function spawnClaude(
  args: string[],
  cwd: string,
  baseUrl: string,
  timeoutMs: number,
): Promise<RunOut> {
  return new Promise((resolvePromise) => {
    const child = spawn("claude", args, {
      cwd,
      env: {
        ...process.env,
        ANTHROPIC_BASE_URL: baseUrl,
        // Any value works — the mock ignores auth; this avoids needing a real key.
        ANTHROPIC_API_KEY: "sk-vigiles-mock",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? 0, stdout, stderr });
    });
  });
}

/**
 * Run the real `claude` CLI against a scripted mock model, with the given
 * fixture and settings (hooks). Deterministic — same script, same result.
 */
export async function runHarnessTest(
  spec: HarnessTestSpec,
): Promise<HarnessTestResult> {
  const cwd = mkdtempSync(join(tmpdir(), "vigiles-harness-"));
  const { files, settings } = resolveHarness({
    plugin: spec.plugin,
    settings: spec.settings,
    files: spec.files,
  });
  writeFixture(cwd, files, settings);

  const mock = await startMock(spec.model);
  try {
    const tools = spec.allowedTools ?? ["Read", "Edit", "Write", "Bash"];
    const args = [
      "-p",
      spec.prompt ?? "go",
      ...(spec.transcript
        ? ["--output-format", "stream-json", "--verbose"]
        : ["--output-format", "json"]),
      "--model",
      "claude-sonnet-4-5",
      ...(spec.pluginDir !== undefined
        ? ["--plugin-dir", resolve(spec.pluginDir)]
        : []),
      ...(settings !== undefined ? ["--settings", "settings.json"] : []),
      "--allowedTools",
      ...tools,
    ];
    const out = await spawnClaude(args, cwd, mock.url, spec.timeoutMs ?? 60000);
    return {
      exitCode: out.code,
      stdout: out.stdout,
      stderr: out.stderr,
      cwd,
      turns: mock.count,
      toolCalls: parseToolCalls(out.stdout),
      output: parseOutput(out.stdout),
      file: (p: string): string | null => {
        const f = resolve(cwd, p);
        return existsSync(f) ? readFileSync(f, "utf-8") : null;
      },
      cleanup: (): void => {
        rmSync(cwd, { recursive: true, force: true });
      },
    };
  } finally {
    mock.close();
  }
}
