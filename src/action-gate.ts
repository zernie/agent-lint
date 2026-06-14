/**
 * vigiles — Action gates (the dynamic-workflow reframe).
 *
 * A skill gate is bound to a *step* (a fixed position in a plan). When the plan
 * is generated at runtime (dynamic workflows), the step is the wrong unit. An
 * **action gate** binds a deterministic check to a *tool action type* instead —
 * "any time a Write happens to a `.ts` file, eslint must pass on it" — so it
 * fires regardless of where in the runtime plan the action occurs.
 *
 * It is the same deterministic gate primitive (reuses `runGate` + the
 * author-time reference resolution), re-anchored from step → action. Delivered
 * as a PostToolUse hook (`vigiles action-hook`): exit 2 blocks the action and
 * feeds the reason back, exit 0 allows it.
 *
 * Config: `.vigiles/action-gates.json` → `{ "gates": [ { on, gate, when? } ] }`.
 * The gate command may contain `{file}`, substituted with the action's path.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  runGate,
  gateLabel,
  type RuntimeGate,
} from "./adapters/claude-code/skill-runtime.js";

export interface ActionGate {
  /** Tool name to gate, e.g. "Write" | "Edit" | "Bash". */
  readonly on: string;
  /** Deterministic check; a `cmd` command may include `{file}`. */
  readonly gate: RuntimeGate;
  /** Optional substring the (JSON-serialized) tool input must contain. */
  readonly when?: string;
}

export interface ActionEvent {
  /** The tool that just ran (PostToolUse `tool_name`). */
  readonly tool: string;
  /** The tool input (`tool_input`), e.g. `{ file_path, command }`. */
  readonly input?: Record<string, unknown>;
}

export interface ActionDecision {
  readonly allow: boolean;
  readonly message: string;
}

/** The file path an action touched, for `{file}` substitution. */
function fileOf(event: ActionEvent): string {
  const i = event.input ?? {};
  const v = i.file_path ?? i.path;
  return typeof v === "string" ? v : "";
}

/** Substitute `{file}` in a cmd gate with the action's path. */
function resolveGate(gate: RuntimeGate, event: ActionEvent): RuntimeGate {
  if (gate.kind !== "cmd" || !gate.command.includes("{file}")) return gate;
  return { ...gate, command: gate.command.replaceAll("{file}", fileOf(event)) };
}

/**
 * Evaluate action gates against a tool event. Runs every gate whose `on`
 * matches the tool (and whose `when` substring matches the input); the first
 * failure blocks. Plan-agnostic — order in any runtime workflow is irrelevant.
 */
export function evaluateAction(
  event: ActionEvent,
  gates: readonly ActionGate[],
  cwd: string,
): ActionDecision {
  const inputStr = JSON.stringify(event.input ?? "");
  for (const g of gates) {
    if (g.on !== event.tool) continue;
    if (g.when && !inputStr.includes(g.when)) continue;
    const outcome = runGate(resolveGate(g.gate, event), cwd);
    if (!outcome.ok) {
      const tail = outcome.output ? `\n${outcome.output}` : "";
      return {
        allow: false,
        message: `Action gate failed after ${event.tool}: ${gateLabel(g.gate)} did not pass.${tail}`,
      };
    }
  }
  return { allow: true, message: "" };
}

/** Load action gates from `.vigiles/action-gates.json`. */
export function loadActionGates(cwd: string): ActionGate[] {
  const p = resolve(cwd, ".vigiles/action-gates.json");
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, "utf-8")) as {
      gates?: ActionGate[];
    };
    return Array.isArray(parsed.gates) ? parsed.gates : [];
  } catch {
    return [];
  }
}
