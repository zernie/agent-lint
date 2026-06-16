/**
 * `vigiles/check` — the declarative check vocabulary (Phase 0 of the testing-API
 * revamp; see `research/testing-api-design.md`).
 *
 * A **check** is *data*, not a throwing assertion: a small object that knows how
 * to `eval` itself against a result and how to `toJSON`. One vocabulary, evaluated
 * two ways downstream — strict (`expect`, throws on first fail) for the
 * deterministic tiers, and scored (`measure`, 0–1 across trials) for evals — so
 * `tool("Bash")` reads as pass/fail on one run AND as a rate across many. Because
 * a check serializes, JSON/JUnit/baseline output and a promptfoo bridge fall out
 * for free.
 *
 * Pure + model-free: every check is fully unit-testable without a `claude`
 * subprocess. Checks over a {@link Trace} (the agent-run shape, from
 * `runHarness`/`runEval`) and checks over a {@link HookRunResult} (the hook
 * decision shape, from `runHook`) are distinguished at the type level, so
 * `expect(result, checks)` only accepts checks that match the result.
 */
import type { Trace, ToolCall, HookFire } from "./harness-test.js";
import type { HookRunResult } from "./run-hook.js";
import { judge as runJudge } from "./judge.js";

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/** The outcome of evaluating one check against one result. */
export interface CheckResult {
  /** Did the check hold? */
  readonly pass: boolean;
  /** 0..1 — `pass ? 1 : 0` for a boolean check; a fraction for graded ones. */
  readonly score: number;
  /** A human message: confirming on pass, actionable on failure. */
  readonly message: string;
}

/** A check's serialized form (for JSON/JUnit output and the promptfoo bridge). */
export interface CheckJSON {
  readonly kind: string;
  readonly [field: string]: unknown;
}

/** A declarative check over a result of type `T` ({@link Trace} or {@link HookRunResult}). */
export interface Check<T> {
  /** Discriminator, e.g. `"tool"`, `"skill"`, `"blocked"`. */
  readonly kind: string;
  /** Evaluate this check against a result. Pure. */
  eval(target: T): CheckResult;
  /** Serialize to a plain object — `expect`/`measure` use this for reports. */
  toJSON(): CheckJSON;
}

/** Evaluate every check against a target. Pure — the shared core of `expect`
 * (strict) and `measure` (scored). */
export function evalChecks<T>(
  target: T,
  checks: readonly Check<T>[],
): CheckResult[] {
  return checks.map((c) => c.eval(target));
}

/**
 * Strict evaluator (Phase 1): throw if any check fails, collecting **all**
 * failures into one actionable message (Validation-applicative, not
 * short-circuit). The deterministic-tier verdict — use it in `node:test`, or any
 * runner, over a `runHook` / `runHarness` result. `measure` (Phase 3) is the
 * scored counterpart over trials.
 */
export function assertChecks<T>(target: T, checks: readonly Check<T>[]): void {
  const failures = evalChecks(target, checks).filter((r) => !r.pass);
  if (failures.length > 0) {
    throw new Error(
      `${String(failures.length)} of ${String(checks.length)} check(s) failed:\n` +
        failures.map((f) => `  ✗ ${f.message}`).join("\n"),
    );
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const ok = (message: string): CheckResult => ({
  pass: true,
  score: 1,
  message,
});
const no = (message: string): CheckResult => ({
  pass: false,
  score: 0,
  message,
});

function distinctToolNames(calls: readonly ToolCall[]): string {
  const names = [...new Set(calls.map((c) => c.name))];
  return names.length > 0 ? `[${names.join(", ")}]` : "no tools";
}

function truncate(s: string, n = 120): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
}

// ---------------------------------------------------------------------------
// Trace checks (an agent run — runHarness / runEval)
// ---------------------------------------------------------------------------

/** The agent invoked a tool by this name (regardless of result). */
export function tool(name: string): Check<Trace> {
  return {
    kind: "tool",
    eval: (t) =>
      t.toolCalls.some((c) => c.name === name)
        ? ok(`agent used tool "${name}"`)
        : no(
            `expected the agent to use tool "${name}", but it used ${distinctToolNames(t.toolCalls)}`,
          ),
    toJSON: () => ({ kind: "tool", name }),
  };
}

/** A skill resolved to this id (`<plugin>:<skill>`) without erroring. */
export function skill(id: string): Check<Trace> {
  return {
    kind: "skill",
    eval: (t) => {
      const call = t.toolCalls.find(
        (c) =>
          c.name === "Skill" && (c.input as { skill?: string })?.skill === id,
      );
      if (call && !call.isError) return ok(`skill "${id}" resolved`);
      const skills = t.toolCalls
        .filter((c) => c.name === "Skill")
        .map((c) => (c.input as { skill?: string })?.skill ?? "?");
      return no(
        `expected skill "${id}" to resolve; it did not (skills invoked: ${skills.length > 0 ? `[${skills.join(", ")}]` : "none"})`,
      );
    },
    toJSON: () => ({ kind: "skill", id }),
  };
}

/** The agent's final output contains a substring / matches a RegExp. */
export function output(matcher: string | RegExp): Check<Trace> {
  const isRe = matcher instanceof RegExp;
  return {
    kind: "output",
    eval: (t) => {
      const pass = isRe ? matcher.test(t.output) : t.output.includes(matcher);
      return pass
        ? ok(`output matched ${String(matcher)}`)
        : no(
            `expected output to ${isRe ? "match" : "contain"} ${String(matcher)}; got "${truncate(t.output) || "(empty)"}"`,
          );
    },
    toJSON: () => ({ kind: "output", matcher: String(matcher), regex: isRe }),
  };
}

/** A hook fired for this event (e.g. `"PreToolUse"`, `"Stop"`). */
export function hookFired(event: string): Check<Trace> {
  return {
    kind: "hookFired",
    eval: (t) => {
      const fired = t.hooks.filter((h: HookFire) => h.event === event);
      return fired.length > 0
        ? ok(`hook fired for ${event}`)
        : no(
            `expected a hook to fire for ${event}; hooks that fired: ${t.hooks.length > 0 ? `[${[...new Set(t.hooks.map((h) => h.event))].join(", ")}]` : "none"}`,
          );
    },
    toJSON: () => ({ kind: "hookFired", event }),
  };
}

/** The agent wrote (or left) a file at this path in the work dir. */
export function wrote(path: string): Check<Trace> {
  return {
    kind: "wrote",
    eval: (t) =>
      t.file(path) !== null
        ? ok(`file "${path}" exists`)
        : no(`expected the agent to create "${path}", but it does not exist`),
    toJSON: () => ({ kind: "wrote", path }),
  };
}

// ---------------------------------------------------------------------------
// Hook-decision checks (a single hook — runHook)
// ---------------------------------------------------------------------------

/** The hook blocked the event (exit 2 / deny / block). */
export function blocked(): Check<HookRunResult> {
  return {
    kind: "blocked",
    eval: (r) =>
      r.blocked
        ? ok("hook blocked the event")
        : no(
            `expected the hook to block, but it allowed (exit ${String(r.exitCode)})`,
          ),
    toJSON: () => ({ kind: "blocked" }),
  };
}

/** The hook allowed the event through. */
export function allowed(): Check<HookRunResult> {
  return {
    kind: "allowed",
    eval: (r) =>
      r.blocked
        ? no(
            `expected the hook to allow, but it blocked (exit ${String(r.exitCode)})`,
          )
        : ok("hook allowed the event"),
    toJSON: () => ({ kind: "allowed" }),
  };
}

// ---------------------------------------------------------------------------
// MCP — a tool call is just a name in the Trace; MCP tools are `mcp__srv__tool`
// ---------------------------------------------------------------------------

/** The agent used an MCP tool `<server>/<tool>` (CC names it `mcp__server__tool`). */
export function mcp(server: string, toolName: string): Check<Trace> {
  const full = `mcp__${server}__${toolName}`;
  return {
    kind: "mcp",
    eval: (t) =>
      t.toolCalls.some((c) => c.name === full)
        ? ok(`used MCP tool ${server}/${toolName}`)
        : no(
            `expected MCP tool ${server}/${toolName} (${full}), but the agent used ${distinctToolNames(t.toolCalls)}`,
          ),
    toJSON: () => ({ kind: "mcp", server, tool: toolName }),
  };
}

// ---------------------------------------------------------------------------
// Model-graded — `judged` (LLM rubric). Closes the promptfoo `llm-rubric` /
// DeepEval `GEval` gap: a subjective check that composes into measure/toJUnit
// like any other. The Check.eval is sync (judge() blocks via spawnSync), so it
// fits the same interface; the `judge` fn is injectable for testing.
// ---------------------------------------------------------------------------

/** A model-graded judge: grades `output` against a `rubric` → score in [0,1]. */
export type JudgeFn = (opts: {
  output: string;
  rubric: string;
  threshold?: number;
}) => { score: number; pass: boolean; reason?: string };

/**
 * A model-graded check: the agent's `output` scores ≥ `min` against `rubric`,
 * judged by a model. Unlike the deterministic checks this one calls a model
 * (cost), so it's for the scored `measure` tier; the `judge` fn is injectable
 * (default: the real `judge()`), so the logic is unit-testable with a fake.
 */
export function judged(
  rubric: string,
  opts: { min?: number; judge?: JudgeFn } = {},
): Check<Trace> {
  const min = opts.min ?? 0.5;
  const judgeFn: JudgeFn = opts.judge ?? ((o) => runJudge(o));
  return {
    kind: "judged",
    eval: (t) => {
      const r = judgeFn({ output: t.output, rubric, threshold: min });
      const pass = r.score >= min;
      const tail = r.reason ? ` — ${r.reason}` : "";
      return {
        pass,
        score: r.score,
        message: pass
          ? `judge ${r.score.toFixed(2)} ≥ ${String(min)}${tail}`
          : `judge ${r.score.toFixed(2)} < ${String(min)} for "${rubric}"${tail}`,
      };
    },
    toJSON: () => ({ kind: "judged", rubric, min }),
  };
}

// ---------------------------------------------------------------------------
// Resource checks — over a run's usage (cost / latency / tokens). Only the
// eval tier (`RunContext`) carries usage, so these are `Check<UsageTrace>`,
// usable in `measure` but not over a plain harness `Trace` (which has none).
// ---------------------------------------------------------------------------

interface UsageTrace {
  readonly usage: {
    readonly costUsd: number;
    readonly durationMs: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
}

/** The run cost at most `maxUsd`. */
export function cost(opts: { maxUsd: number }): Check<UsageTrace> {
  return {
    kind: "cost",
    eval: (t) => {
      const v = t.usage.costUsd;
      return v <= opts.maxUsd
        ? ok(`cost $${v.toFixed(4)} ≤ $${String(opts.maxUsd)}`)
        : no(`expected cost ≤ $${String(opts.maxUsd)}, got $${v.toFixed(4)}`);
    },
    toJSON: () => ({ kind: "cost", maxUsd: opts.maxUsd }),
  };
}

/** The run took at most `maxMs` of wall-clock time. */
export function latency(opts: { maxMs: number }): Check<UsageTrace> {
  return {
    kind: "latency",
    eval: (t) => {
      const v = t.usage.durationMs;
      return v <= opts.maxMs
        ? ok(`latency ${String(v)}ms ≤ ${String(opts.maxMs)}ms`)
        : no(`expected latency ≤ ${String(opts.maxMs)}ms, got ${String(v)}ms`);
    },
    toJSON: () => ({ kind: "latency", maxMs: opts.maxMs }),
  };
}

/** The run used at most `max` total (input + output) tokens. */
export function tokens(opts: { max: number }): Check<UsageTrace> {
  return {
    kind: "tokens",
    eval: (t) => {
      const v = t.usage.inputTokens + t.usage.outputTokens;
      return v <= opts.max
        ? ok(`${String(v)} tokens ≤ ${String(opts.max)}`)
        : no(`expected ≤ ${String(opts.max)} tokens, got ${String(v)}`);
    },
    toJSON: () => ({ kind: "tokens", max: opts.max }),
  };
}
