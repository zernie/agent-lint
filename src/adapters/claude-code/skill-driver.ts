/**
 * vigiles — Skill driver: the generator (durable-imperative) form of a skill.
 *
 * PARKED (2026-08-16) — see the header of `src/core/compile-generator.ts`.
 * Exported from no package subpath; absent from `docs/skills.md` on purpose.
 *
 * The declarative `skill({ steps })` form compiles to a *static* SKILL.md — it
 * can't express branching/looping, because that control flow depends on runtime
 * values. The generator form does: a skill is a generator that `yield`s
 * effects, and the harness drives it with `.next()`. Branches are real `if`,
 * loops are real `for`/`while`; the harness owns the loop and runs the
 * deterministic gates between yields, short-circuiting on failure (Railway).
 *
 * The model is an injected seam: `runStep(prose)` is what executes a prose step
 * (in production it calls the LLM; in tests it's a scripted mock and the answer
 * is fed back into the generator). Gates are deterministic and reuse the gate
 * runtime. This module is the mechanics — fully testable without a live model.
 */

import type { Gate } from "../../core/spec.js";
import {
  runGate,
  type RuntimeGate,
  type GateOutcome,
} from "./skill-runtime.js";

export type SkillEffect =
  | { readonly kind: "act"; readonly prose: string }
  | { readonly kind: "gate"; readonly gate: Gate; readonly retry: number }
  | { readonly kind: "result"; readonly gate: Gate };

/** A prose step for the model to perform. Its answer is yielded back in. */
export function act(prose: string): SkillEffect {
  return { kind: "act", prose };
}

/** A deterministic checkpoint gate the harness runs after the prior step(s). */
export function checkpoint(gate: Gate, retry = 1): SkillEffect {
  return { kind: "gate", gate, retry };
}

/** The terminal result gate — the skill is done only when it passes. */
export function finish(gate: Gate): SkillEffect {
  return { kind: "result", gate };
}

/**
 * A skill program: a generator that yields effects and receives, for each
 * `act`, the model's answer back in (`const x = yield act(...)`).
 */
export type SkillProgram = () => Generator<SkillEffect, void, string>;

/** Frontmatter metadata for a generator skill. */
export interface GeneratorSkillMeta {
  readonly name: string;
  readonly description: string;
  readonly disableModelInvocation?: boolean;
}

/**
 * A generator skill = metadata + a generator program. Authored as
 * `export default genSkill({ name, description }, function* () { … })`.
 * The CLI compiles it to SKILL.md by parsing the source (it can't execute a
 * generator to markdown); `runSkill`/`driveSkill` execute `program` directly.
 */
export interface GeneratorSkill extends GeneratorSkillMeta {
  readonly _specType: "skill-generator";
  readonly program: SkillProgram;
}

/** Define a generator skill (metadata + program). */
export function genSkill(
  meta: GeneratorSkillMeta,
  program: SkillProgram,
): GeneratorSkill {
  return { _specType: "skill-generator", ...meta, program };
}

/** Convert a spec-level Gate to the runtime gate the executor understands. */
function toRuntimeGate(gate: Gate, retry: number): RuntimeGate {
  if (gate._ref === "cmd") return { kind: "cmd", command: gate.command, retry };
  if (gate._ref === "role") return { kind: "role", role: gate.role, retry };
  return { kind: "file", path: gate.path, retry };
}

export interface DriveStep {
  readonly effect: SkillEffect;
  /** The model's answer, for an `act` effect. */
  readonly answer?: string;
  /** The gate outcome, for a `gate`/`result` effect. */
  readonly outcome?: GateOutcome;
}

export interface DriveReport {
  readonly ok: boolean;
  /** Index (in the trace) of the gate that blocked, or null if all passed. */
  readonly blockedAt: number | null;
  readonly trace: readonly DriveStep[];
}

/**
 * Drive a skill program to completion (or to the first failed gate). `runStep`
 * is the model seam: it executes a prose step and returns the model's answer,
 * which is fed back into the generator so branches can switch on it.
 */
export function driveSkill(
  program: SkillProgram,
  cwd: string,
  runStep: (prose: string) => string,
): DriveReport {
  const gen = program();
  const trace: DriveStep[] = [];
  let input = "";

  for (;;) {
    const { value: effect, done } = gen.next(input);
    if (done) break;

    if (effect.kind === "act") {
      const answer = runStep(effect.prose);
      trace.push({ effect, answer });
      input = answer;
      continue;
    }

    const retry = effect.kind === "gate" ? effect.retry : 1;
    const outcome = runGate(toRuntimeGate(effect.gate, retry), cwd);
    trace.push({ effect, outcome });
    if (!outcome.ok) return { ok: false, blockedAt: trace.length - 1, trace };
    input = "";
  }

  return { ok: true, blockedAt: null, trace };
}
