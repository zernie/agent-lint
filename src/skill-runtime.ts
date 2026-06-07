/**
 * vigiles — Skill runtime: the deterministic gate ladder.
 *
 * Parses the `vigiles:gate` / `vigiles:result` markers a compiled SKILL.md
 * carries (emitted by compileSkill) and *executes* them: run each step's gate
 * in document order, short-circuit on the first failure (Railway error track),
 * then run the terminal result gate. This is the deterministic spine of the
 * skill driver — the part that turns the markers from documentation into
 * enforcement.
 *
 * Scope (v0): this runs the GATES only. It does not drive the LLM through the
 * prose steps one at a time — that needs a live harness and is a later phase.
 * `retry:N` is parsed and surfaced but executed once here: re-running a
 * deterministic gate without a model in the loop to fix the step yields the
 * same result. Retry is meaningful only once the model re-does the step
 * between attempts.
 *
 * Safety: this executes the gate commands the skill author declared (e.g.
 * `npm test`, `validate.py`) via an explicit, user-invoked command
 * (`vigiles run-skill`). It is not a silent hook and runs nothing the spec
 * didn't declare as a gate.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export type RuntimeGate =
  | { readonly kind: "cmd"; readonly command: string; readonly retry: number }
  | { readonly kind: "file"; readonly path: string; readonly retry: number };

export interface SkillGates {
  /** Per-step gates, in document order. */
  readonly steps: readonly {
    readonly step: number;
    readonly gate: RuntimeGate;
  }[];
  /** Terminal postcondition gate, if any. */
  readonly result?: RuntimeGate;
}

const STEP_RE = /^###\s+Step\s+(\d+)/;
const GATE_CMD_RE = /<!--\s*vigiles:gate\s+"([^"]*)"(?:\s+retry:(\d+))?\s*-->/;
const GATE_FILE_RE = /<!--\s*vigiles:gate\s+file:(\S+)\s*-->/;
const RESULT_CMD_RE = /<!--\s*vigiles:result\s+"([^"]*)"\s*-->/;
const RESULT_FILE_RE = /<!--\s*vigiles:result\s+file:(\S+)\s*-->/;

/** Parse a single line into a gate, or null if it carries none. */
function parseGateLine(line: string): RuntimeGate | null {
  const cmd = GATE_CMD_RE.exec(line);
  if (cmd) {
    return { kind: "cmd", command: cmd[1], retry: cmd[2] ? Number(cmd[2]) : 1 };
  }
  const fileM = GATE_FILE_RE.exec(line);
  if (fileM) return { kind: "file", path: fileM[1], retry: 1 };
  return null;
}

/** Parse the terminal result gate from a line, or null. */
function parseResultLine(line: string): RuntimeGate | null {
  const cmd = RESULT_CMD_RE.exec(line);
  if (cmd) return { kind: "cmd", command: cmd[1], retry: 1 };
  const fileM = RESULT_FILE_RE.exec(line);
  if (fileM) return { kind: "file", path: fileM[1], retry: 1 };
  return null;
}

/** Extract the step gates and result gate from a compiled SKILL.md. */
export function parseSkillGates(markdown: string): SkillGates {
  const steps: { step: number; gate: RuntimeGate }[] = [];
  let result: RuntimeGate | undefined;
  let currentStep = 0;

  for (const line of markdown.split("\n")) {
    const stepMatch = STEP_RE.exec(line);
    if (stepMatch) {
      currentStep = Number(stepMatch[1]);
      continue;
    }
    const resultGate = parseResultLine(line);
    if (resultGate) {
      result = resultGate;
      continue;
    }
    const gate = parseGateLine(line);
    if (gate) steps.push({ step: currentStep, gate });
  }

  return { steps, result };
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export interface GateOutcome {
  readonly ok: boolean;
  readonly output: string;
}

/** Run one gate against `cwd`: a command (exit 0 = pass) or a file existence. */
export function runGate(gate: RuntimeGate, cwd: string): GateOutcome {
  if (gate.kind === "file") {
    const there = existsSync(resolve(cwd, gate.path));
    return { ok: there, output: there ? "" : `${gate.path} not found` };
  }
  try {
    const out = execSync(gate.command, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, output: out.trim() };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    const output = [err.stdout, err.stderr].filter(Boolean).join("\n").trim();
    return { ok: false, output };
  }
}

export interface GateRunResult {
  /** Step number, or "result" for the terminal gate. */
  readonly at: number | "result";
  readonly gate: RuntimeGate;
  readonly ok: boolean;
  readonly output: string;
}

export interface SkillRunReport {
  readonly results: readonly GateRunResult[];
  /** Where the ladder short-circuited, or null when every gate passed. */
  readonly blockedAt: number | "result" | null;
  readonly ok: boolean;
}

/**
 * Run the gate ladder: step gates in order (short-circuiting on the first
 * failure), then the result gate. Mirrors a Sequence behavior tree —
 * ordered AND with short-circuit on FAILURE.
 */
export function runSkillGates(gates: SkillGates, cwd: string): SkillRunReport {
  const results: GateRunResult[] = [];

  for (const { step, gate } of gates.steps) {
    const r = runGate(gate, cwd);
    results.push({ at: step, gate, ok: r.ok, output: r.output });
    if (!r.ok) return { results, blockedAt: step, ok: false };
  }

  if (gates.result) {
    const r = runGate(gates.result, cwd);
    results.push({
      at: "result",
      gate: gates.result,
      ok: r.ok,
      output: r.output,
    });
    if (!r.ok) return { results, blockedAt: "result", ok: false };
  }

  return { results, blockedAt: null, ok: true };
}
