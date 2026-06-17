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
import type {
  Trace,
  ToolCall,
  HookFire,
  SubagentTrace,
} from "./harness-test.js";
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

/** Render any tool-input value as a string for matching / messages. */
function stringifyValue(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint")
    return String(v);
  if (typeof v === "symbol") return v.toString();
  if (typeof v === "function") return "[function]";
  if (v === null || v === undefined) return String(v);
  try {
    return JSON.stringify(v) ?? "[object]";
  } catch {
    return "[object]";
  }
}

/**
 * A declarative matcher over a tool call's `input`, keyed by **dot-path** (e.g.
 * `"body.prompt"`). Each value is matched against the value at that path: a
 * `RegExp` is a pattern over the stringified value (use this for "contains"), and
 * a `string`/`number`/`boolean` is an **exact** match (use this for "equals", e.g.
 * a push target). All keys must match (AND). Serializable, so a check carrying one
 * still round-trips through `toJSON`.
 */
export type ArgMatcher = Record<string, string | number | boolean | RegExp>;

/** Resolve a dot-path (`"a.b.c"`) within an arbitrary value, or undefined. */
function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Does `input` satisfy every entry of `matcher`? (RegExp = pattern, else exact.) */
function matchesArgs(input: unknown, matcher: ArgMatcher): boolean {
  return Object.entries(matcher).every(([key, m]) => {
    const value = getPath(input, key);
    return m instanceof RegExp ? m.test(stringifyValue(value)) : value === m;
  });
}

/** A human-readable form of a matcher for failure messages. */
function describeArgs(matcher: ArgMatcher): string {
  return Object.entries(matcher)
    .map(
      ([k, m]) => `${k}=${m instanceof RegExp ? String(m) : JSON.stringify(m)}`,
    )
    .join(", ");
}

/** Serialize a matcher for `toJSON` (RegExp → its string form). */
function serializeArgs(
  matcher: ArgMatcher,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, m] of Object.entries(matcher)) {
    out[k] = m instanceof RegExp ? String(m) : m;
  }
  return out;
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

/**
 * The agent used tool `name` with at least one call whose `input` matches `args`
 * — the **argument** half of the tool-call spy. Asserts not just *that* a tool was
 * reached but *how* it was called (the image-request body carried the style suffix,
 * the panel spawn requested a non-expert), which a completion grader can't see.
 */
export function toolWith(name: string, args: ArgMatcher): Check<Trace> {
  return {
    kind: "toolWith",
    eval: (t) => {
      const calls = t.toolCalls.filter((c) => c.name === name);
      const want = describeArgs(args);
      if (calls.length === 0) {
        return no(
          `expected the agent to use tool "${name}" (with ${want}), but it used ${distinctToolNames(t.toolCalls)}`,
        );
      }
      return calls.some((c) => matchesArgs(c.input, args))
        ? ok(`agent used "${name}" with ${want}`)
        : no(
            `agent used "${name}" but never with ${want} (saw ${calls
              .map((c) => truncate(stringifyValue(c.input), 60))
              .join("; ")})`,
          );
    },
    toJSON: () => ({ kind: "toolWith", name, args: serializeArgs(args) }),
  };
}

/**
 * The agent did NOT use tool `name` — the **safety / negative** assertion. With
 * `args`, only calls whose `input` matches are forbidden (so "did not push to
 * `main`" still allows pushing elsewhere; "no paid API call" forbids it outright).
 * This is the highest-value, most-overlooked check, and the one a
 * completion-grading eval structurally cannot make: it sees the agent's *decision*
 * to act, not just its final text.
 */
export function notTool(name: string, args?: ArgMatcher): Check<Trace> {
  return {
    kind: "notTool",
    eval: (t) => {
      const calls = t.toolCalls.filter((c) => c.name === name);
      const offending = args
        ? calls.filter((c) => matchesArgs(c.input, args))
        : calls;
      const what = args ? `"${name}" with ${describeArgs(args)}` : `"${name}"`;
      const first = offending[0];
      if (!first) return ok(`agent never used ${what}`);
      return no(
        `expected the agent NOT to use ${what}, but it did (${truncate(stringifyValue(first.input), 60)})`,
      );
    },
    toJSON: () =>
      args
        ? { kind: "notTool", name, args: serializeArgs(args) }
        : { kind: "notTool", name },
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

/**
 * The model RECEIVED text matching `matcher` in some request — i.e. it actually
 * reached the model. Covers **slash-command expansion** (a `commands/` file
 * expands into the user prompt) and **injected context** (a SessionStart hook's
 * text). Reads `modelRequests`, which the harness/mock tier captures; the eval
 * tier drives the real API and captures none, so use this on `runHarness`.
 */
export function received(matcher: string | RegExp): Check<Trace> {
  const isRe = matcher instanceof RegExp;
  return {
    kind: "received",
    eval: (t) => {
      const text = t.modelRequests
        .map((r) => `${r.system} ${r.messages.map((m) => m.text).join(" ")}`)
        .join(" ");
      const pass = isRe ? matcher.test(text) : text.includes(matcher);
      return pass
        ? ok(`the model received ${String(matcher)}`)
        : no(
            `expected the model to receive ${String(matcher)} (a slash-command expansion or injected context); ${t.modelRequests.length === 0 ? "no requests captured (eval tier captures none — use runHarness)" : `got "${truncate(text)}"`}`,
          );
    },
    toJSON: () => ({ kind: "received", matcher: String(matcher), regex: isRe }),
  };
}

/**
 * The agent took a number of model turns in range — a **multi-turn** observable
 * (`{ min: 2 }` asserts a back-and-forth happened, not a one-shot answer; `{ max }`
 * caps runaway loops). The deterministic harness scripts the model turns; this
 * checks how many the agent actually took.
 */
export function turns(opts: { min?: number; max?: number }): Check<Trace> {
  return {
    kind: "turns",
    eval: (t) => {
      const n = t.turns;
      const pass =
        (opts.min === undefined || n >= opts.min) &&
        (opts.max === undefined || n <= opts.max);
      const bound = [
        opts.min !== undefined ? `≥ ${String(opts.min)}` : null,
        opts.max !== undefined ? `≤ ${String(opts.max)}` : null,
      ]
        .filter((x): x is string => x !== null)
        .join(" and ");
      return pass
        ? ok(`${String(n)} turn(s) (${bound || "any"})`)
        : no(`expected ${bound || "any"} turn(s), got ${String(n)}`);
    },
    toJSON: () => ({ kind: "turns", min: opts.min, max: opts.max }),
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
// Subagent — a `Task` run as a nested trace. Run checks over what the SUBAGENT
// did, not just that `Task` fired. Composes the whole vocabulary recursively.
// ---------------------------------------------------------------------------

/** Wrap a subagent's tool calls as a minimal `Trace` so checks run over it. */
function subTrace(sub: SubagentTrace): Trace {
  return {
    toolCalls: sub.toolCalls,
    hooks: [],
    output: "",
    modelRequests: [],
    turns: 0,
    subagents: [],
    file: () => null,
  };
}

/** The named subagent (`Task` `subagent_type`) ran and passed every nested check. */
export function subagent(
  name: string,
  checks: readonly Check<Trace>[],
): Check<Trace> {
  return {
    kind: "subagent",
    eval: (t) => {
      const subs = t.subagents ?? [];
      const sub = subs.find((s) => s.name === name);
      if (!sub) {
        return no(
          `expected subagent "${name}" to run; subagents that ran: ${subs.length > 0 ? `[${subs.map((s) => s.name).join(", ")}]` : "none"}`,
        );
      }
      const failures = checks
        .map((c) => c.eval(subTrace(sub)))
        .filter((r) => !r.pass);
      return failures.length === 0
        ? ok(`subagent "${name}" passed ${String(checks.length)} check(s)`)
        : no(
            `subagent "${name}": ${failures.map((f) => f.message).join("; ")}`,
          );
    },
    toJSON: () => ({
      kind: "subagent",
      name,
      checks: checks.map((c) => c.toJSON()),
    }),
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
