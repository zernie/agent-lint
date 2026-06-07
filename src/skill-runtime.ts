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
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { resolve, dirname } from "node:path";

export type RuntimeGate =
  | { readonly kind: "cmd"; readonly command: string; readonly retry: number }
  | { readonly kind: "file"; readonly path: string; readonly retry: number }
  | { readonly kind: "role"; readonly role: string; readonly retry: number };

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
const GATE_ROLE_RE =
  /<!--\s*vigiles:gate\s+role:(\w+)(?:\s+retry:(\d+))?\s*-->/;
const RESULT_CMD_RE = /<!--\s*vigiles:result\s+"([^"]*)"\s*-->/;
const RESULT_FILE_RE = /<!--\s*vigiles:result\s+file:(\S+)\s*-->/;
const RESULT_ROLE_RE = /<!--\s*vigiles:result\s+role:(\w+)\s*-->/;

/** Parse a single line into a gate, or null if it carries none. */
function parseGateLine(line: string): RuntimeGate | null {
  const cmd = GATE_CMD_RE.exec(line);
  if (cmd) {
    return { kind: "cmd", command: cmd[1], retry: cmd[2] ? Number(cmd[2]) : 1 };
  }
  const role = GATE_ROLE_RE.exec(line);
  if (role) {
    return {
      kind: "role",
      role: role[1],
      retry: role[2] ? Number(role[2]) : 1,
    };
  }
  const fileM = GATE_FILE_RE.exec(line);
  if (fileM) return { kind: "file", path: fileM[1], retry: 1 };
  return null;
}

/** Parse the terminal result gate from a line, or null. */
function parseResultLine(line: string): RuntimeGate | null {
  const cmd = RESULT_CMD_RE.exec(line);
  if (cmd) return { kind: "cmd", command: cmd[1], retry: 1 };
  const role = RESULT_ROLE_RE.exec(line);
  if (role) return { kind: "role", role: role[1], retry: 1 };
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

/** Execute a shell command in `cwd`; exit 0 = pass, capturing output. */
function execCommand(command: string, cwd: string): GateOutcome {
  try {
    const out = execSync(command, {
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

const NPM_FOR_ROLE: Record<string, string> = {
  test: "npm test",
  build: "npm run build",
  lint: "npm run lint",
};

/**
 * Resolve a project role (test/build/lint) to the host project's real command,
 * detected from its ecosystem. Returns null when no command can be found —
 * which the caller surfaces as a failed gate rather than a silent pass.
 */
export function detectProjectCommand(role: string, cwd: string): string | null {
  const pkg = resolve(cwd, "package.json");
  if (existsSync(pkg)) {
    try {
      const scripts =
        (
          JSON.parse(readFileSync(pkg, "utf-8")) as {
            scripts?: Record<string, string>;
          }
        ).scripts ?? {};
      if (scripts[role]) return NPM_FOR_ROLE[role] ?? null;
    } catch {
      /* fall through to other ecosystems */
    }
  }
  if (
    existsSync(resolve(cwd, "pyproject.toml")) ||
    existsSync(resolve(cwd, "setup.cfg"))
  ) {
    if (role === "test") return "pytest";
    if (role === "lint") return "ruff check .";
  }
  if (existsSync(resolve(cwd, "Cargo.toml"))) {
    if (role === "test") return "cargo test";
    if (role === "build") return "cargo build";
    if (role === "lint") return "cargo clippy";
  }
  if (existsSync(resolve(cwd, "go.mod"))) {
    if (role === "test") return "go test ./...";
    if (role === "build") return "go build ./...";
  }
  return null;
}

/**
 * Run one gate against `cwd`: a command (exit 0 = pass), a file existence, or
 * a project role resolved to the host project's command.
 */
export function runGate(gate: RuntimeGate, cwd: string): GateOutcome {
  if (gate.kind === "file") {
    const there = existsSync(resolve(cwd, gate.path));
    return { ok: there, output: there ? "" : `${gate.path} not found` };
  }
  if (gate.kind === "role") {
    const command = detectProjectCommand(gate.role, cwd);
    if (!command) {
      return {
        ok: false,
        output: `No ${gate.role} command detected for this project`,
      };
    }
    return execCommand(command, cwd);
  }
  return execCommand(gate.command, cwd);
}

/** Human-readable label for a gate (for reports and hook messages). */
export function gateLabel(gate: RuntimeGate): string {
  if (gate.kind === "cmd") return `\`${gate.command}\``;
  if (gate.kind === "role") return `the project's ${gate.role} command`;
  return `${gate.path} exists`;
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

// ---------------------------------------------------------------------------
// Stop-hook enforcement
// ---------------------------------------------------------------------------
//
// A skill is "active" while the agent is executing it. The Stop hook then runs
// the active skill's result gate and blocks completion until it passes — so the
// agent cannot declare a skill done until its result is deterministically
// proven. Which skill is active is tracked in `.vigiles/active-skill.json`
// (Claude Code hooks don't surface the active skill, so we record it). Wiring
// `skill-start` to fire automatically is the integration step; the decision
// logic below is harness-agnostic and fully testable.

const ACTIVE_PATH = ".vigiles/active-skill.json";

/** Record the skill the agent is currently executing. */
export function setActiveSkill(cwd: string, skillPath: string): void {
  const p = resolve(cwd, ACTIVE_PATH);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ skill: skillPath }) + "\n");
}

/** Clear the active-skill marker (the skill finished). */
export function clearActiveSkill(cwd: string): void {
  const p = resolve(cwd, ACTIVE_PATH);
  if (existsSync(p)) rmSync(p);
}

/** The path of the active skill, or null when none is in progress. */
export function readActiveSkill(cwd: string): string | null {
  const p = resolve(cwd, ACTIVE_PATH);
  if (!existsSync(p)) return null;
  try {
    const parsed = JSON.parse(readFileSync(p, "utf-8")) as { skill?: unknown };
    return typeof parsed.skill === "string" ? parsed.skill : null;
  } catch {
    return null;
  }
}

export interface StopDecision {
  /** Whether the agent may stop (true) or must keep working (false). */
  readonly allow: boolean;
  /** Message for the user (allow) or fed back to the model (block). */
  readonly message: string;
}

/**
 * Stop-hook decision. If a skill is active and declares a result gate, run it:
 * allow the stop only when the gate passes; otherwise block and tell the model
 * what to fix. With no active skill (or no result gate), always allow.
 */
export function evaluateStopHook(cwd: string): StopDecision {
  const skillPath = readActiveSkill(cwd);
  if (!skillPath) return { allow: true, message: "" };

  const full = resolve(cwd, skillPath);
  if (!existsSync(full)) return { allow: true, message: "" };

  const gates = parseSkillGates(readFileSync(full, "utf-8"));
  if (!gates.result) return { allow: true, message: "" };

  const outcome = runGate(gates.result, cwd);
  const desc = gateLabel(gates.result);

  if (outcome.ok) {
    return {
      allow: true,
      message: `✓ ${skillPath}: result gate ${desc} passed.`,
    };
  }
  const tail = outcome.output ? `\n${outcome.output}` : "";
  return {
    allow: false,
    message: `Skill "${skillPath}" is not done: result gate ${desc} failed. Fix it, then finish.${tail}`,
  };
}
