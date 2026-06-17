/**
 * Tool-fake interception — the eval-tier half of the tool-call spy.
 *
 * The eval tier drives the REAL model, so the agent's tool decisions are genuine.
 * But letting a side-effecting tool actually run — a paid image API, `git push`,
 * spawning a paid subagent — makes the eval expensive and dangerous. A **fake**
 * lets the model emit the `tool_use` (so its arguments are captured in the
 * `Trace`, where `toolWith` / `notTool` assert on them) while a PreToolUse hook
 * **denies the real execution** and feeds the model a canned result. The run stays
 * cheap and side-effect-free, but the agent's *decision* — the thing a completion
 * grader can't see — is fully observable.
 *
 * This module is the PURE decision + wiring core, mirroring the agent-contract
 * rail (`src/adapters/claude-code/agent-runtime.ts`):
 *
 * - `decideFakeTool` — does this call get faked, and with what result;
 * - `buildFakeToolSettings` — the PreToolUse hook fragment routing matched tools
 *   through `vigiles fake-tool-hook`;
 * - `serializeFakeTools` / `parseFakeTools` — the env round-trip (incl. RegExp
 *   matchers) the hook subprocess reads back.
 *
 * The hook denies via exit 2 + a stderr message (the same block mechanism the
 * agent rail uses). IMPORTANT — Claude Code surfaces that to the model as a
 * *blocked* call, NOT a successful return. So this is **intercept-and-prevent +
 * observe the attempt**, not a faithful tool mock: it's sound for "did the agent
 * ATTEMPT X / call it with these args / push to the wrong branch" (first-attempt
 * questions, where what happens after doesn't matter), and unsound for "stub the
 * tool and let the trajectory continue as if it succeeded" (the model is told it
 * was blocked, so a multi-step flow that needs the real result will derail). CC
 * exposes no "skip execution but return this as success" primitive for arbitrary
 * tools, so deny+reason is the closest available — with that ceiling.
 */
import { type ArgMatcher, matchesArgs } from "./arg-match.js";

/** Env var the spawned `vigiles fake-tool-hook` reads its fake list from. */
export const FAKE_TOOLS_ENV = "VIGILES_FAKE_TOOLS";

/** Declare a tool to intercept: deny its real execution, return a canned result. */
export interface FakeTool {
  /** The tool to fake (e.g. `"Bash"`, `"WebFetch"`, `"Task"`, `"mcp__img__gen"`). */
  readonly tool: string;
  /**
   * Only fake calls whose `input` matches (so you can fake `git push` while
   * letting other `Bash` through). Omit to fake every call to `tool`.
   */
  readonly when?: ArgMatcher;
  /**
   * The denial reason shown to the model when the call is intercepted. This is a
   * *block* message (CC surfaces it as a denied call), not a successful return —
   * so phrase it as "this was prevented; don't retry", not "here's your result".
   * Defaults to {@link DEFAULT_FAKE_RESULT}.
   */
  readonly result?: string;
}

/** The default denial reason — honest that the call was prevented, not faked-success. */
export const DEFAULT_FAKE_RESULT =
  "vigiles intercepted this tool call for testing — it was NOT executed. " +
  "Do not retry it; treat the tool as unavailable and continue.";

/** The decision for one tool call: intercept it (deny + reason), or let it run. */
export type FakeDecision =
  | { readonly fake: true; readonly result: string }
  | { readonly fake: false };

/**
 * Decide whether a tool call should be intercepted. Returns the first matching
 * fake's denial reason (preventing real execution), or `{ fake: false }` to let
 * the call run for real. Pure — the same logic `vigiles fake-tool-hook` runs.
 */
export function decideFakeTool(
  toolName: string,
  input: unknown,
  fakes: readonly FakeTool[],
): FakeDecision {
  for (const f of fakes) {
    if (f.tool !== toolName) continue;
    if (f.when && !matchesArgs(input, f.when)) continue;
    return { fake: true, result: f.result ?? DEFAULT_FAKE_RESULT };
  }
  return { fake: false };
}

/**
 * Decide from a raw PreToolUse event JSON (the hook's stdin). Parses `tool_name`
 * + `tool_input`, then defers to {@link decideFakeTool}. Malformed input or a
 * missing tool name is a no-op (let it run) — never fail closed on a parse error.
 */
export function fakeToolHookDecision(
  rawEvent: string,
  fakes: readonly FakeTool[],
): FakeDecision {
  let parsed: { tool_name?: string; tool_input?: unknown };
  try {
    parsed = JSON.parse(rawEvent) as {
      tool_name?: string;
      tool_input?: unknown;
    };
  } catch {
    return { fake: false };
  }
  const tool = parsed.tool_name ?? "";
  if (!tool) return { fake: false };
  return decideFakeTool(tool, parsed.tool_input ?? {}, fakes);
}

// ---------------------------------------------------------------------------
// Settings fragment — the PreToolUse hook registration
// ---------------------------------------------------------------------------

/** A `.claude/settings.json` fragment registering the fake-tool PreToolUse hook. */
export interface FakeToolSettings {
  readonly hooks: { readonly PreToolUse: readonly unknown[] };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueToolNames(fakes: readonly FakeTool[]): string[] {
  return [...new Set(fakes.map((f) => f.tool))];
}

/**
 * Build the PreToolUse hook fragment that routes every faked tool through
 * `vigiles fake-tool-hook`. The `matcher` is a CC tool-name regex over the union
 * of faked tool names (each escaped), so unrelated tools are never intercepted.
 * Merge the result into an arm's `settings`; the fake list itself travels in the
 * {@link FAKE_TOOLS_ENV} env var (see {@link serializeFakeTools}).
 */
export function buildFakeToolSettings(
  fakes: readonly FakeTool[],
  opts: { command?: string } = {},
): FakeToolSettings {
  const command = opts.command ?? "npx vigiles fake-tool-hook";
  const matcher = uniqueToolNames(fakes).map(escapeRegex).join("|");
  return {
    hooks: {
      PreToolUse: [{ matcher, hooks: [{ type: "command", command }] }],
    },
  };
}

// ---------------------------------------------------------------------------
// Env round-trip — the hook subprocess reads the fake list back (RegExp-safe)
// ---------------------------------------------------------------------------

type WireValue = string | number | boolean | { re: string; flags: string };
type WireMatcher = Record<string, WireValue>;

function isWireRegex(v: WireValue): v is { re: string; flags: string } {
  return typeof v === "object" && v !== null && "re" in v;
}

function encodeMatcher(m: ArgMatcher): WireMatcher {
  const out: WireMatcher = {};
  for (const [k, v] of Object.entries(m)) {
    out[k] = v instanceof RegExp ? { re: v.source, flags: v.flags } : v;
  }
  return out;
}

function decodeMatcher(w: WireMatcher): ArgMatcher {
  const out: ArgMatcher = {};
  for (const [k, v] of Object.entries(w)) {
    out[k] = isWireRegex(v) ? new RegExp(v.re, v.flags) : v;
  }
  return out;
}

/**
 * Serialize a fake list to a JSON string for {@link FAKE_TOOLS_ENV}. RegExp
 * matchers are encoded as `{ re, flags }` so they round-trip exactly (a plain
 * `JSON.stringify` would drop them to `{}`).
 */
export function serializeFakeTools(fakes: readonly FakeTool[]): string {
  return JSON.stringify(
    fakes.map((f) => ({
      tool: f.tool,
      result: f.result,
      when: f.when ? encodeMatcher(f.when) : undefined,
    })),
  );
}

/** Parse a fake list from the env JSON (tolerant — a bad entry is skipped). */
export function parseFakeTools(json: string): FakeTool[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: FakeTool[] = [];
  for (const item of data) {
    if (item === null || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.tool !== "string") continue;
    out.push({
      tool: o.tool,
      result: typeof o.result === "string" ? o.result : undefined,
      when:
        o.when !== null && typeof o.when === "object"
          ? decodeMatcher(o.when as WireMatcher)
          : undefined,
    });
  }
  return out;
}
