/**
 * The local, agent-readable "flight recorder" ledger — `.vigiles/runs.jsonl`.
 *
 * The connective layer of the four-instrument loop (see the Direction section of
 * CLAUDE.md and `research/harness-observability-direction.md`): every instrument
 * (verify / gate / measure / observe) appends a typed record here, and the file is
 * read three ways off ONE schema — by `vigiles audit`, by the agent debugging its own
 * harness, and (later) by an aggregation surface.
 *
 * Harness-agnostic by construction: the record kinds are neutral concepts, so this
 * lives at the composition/library root (adapters + cli CALL it; it imports no adapter,
 * and it is NOT part of the reference-verification `core/` domain).
 *
 * Append is best-effort — recording must never break a live session.
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Bumped when the record shape changes in a non-additive way. */
export const OBSERVE_VERSION = 1;

/** The ledger filename under the `.vigiles/` directory. */
export const LEDGER_FILE = "runs.jsonl";

/** Fields every record carries; `v`/`ts` are stamped by the writer, not the caller. */
export interface ObservationBase {
  /** schema version (`OBSERVE_VERSION`) */
  v: number;
  /** ISO-8601 timestamp */
  ts: string;
}

/** A gate/hook decision observed in a real session. */
export interface HookObservation extends ObservationBase {
  kind: "hook";
  event: string;
  decision: "allow" | "deny" | "ask";
  /** the compiled-hook rule/name, when known */
  rule?: string;
  /** enforce actually blocked; observe recorded a would-be block */
  mode?: "enforce" | "observe";
  /** the bash command inspected, when the gate keyed on one */
  cmd?: string;
  reason?: string;
}

/** A subagent tool-contract decision (the PreToolUse rail). */
export interface AgentObservation extends ObservationBase {
  kind: "agent";
  /** the dispatched subagent */
  name: string;
  tool: string;
  allowed: boolean;
  reason?: string;
}

/** Whether a skill fired for a turn (behavioral surface — best-effort per harness). */
export interface SkillObservation extends ObservationBase {
  kind: "skill";
  name: string;
  fired: boolean;
}

/** A measured eval outcome (recall, cost, a check rate, …). */
export interface EvalObservation extends ObservationBase {
  kind: "eval";
  name: string;
  metric: string;
  value: number;
}

/** A capability/blast-radius change observed at PR time. */
export interface CapabilityDiffObservation extends ObservationBase {
  kind: "capability-diff";
  pr?: number;
  added: string[];
  removed?: string[];
  /** true when the change loosened the agent's effect surface */
  widened: boolean;
}

/** The discriminated union every reader narrows on `kind`. */
export type ObservationRecord =
  | HookObservation
  | AgentObservation
  | SkillObservation
  | EvalObservation
  | CapabilityDiffObservation;

/** What a caller supplies — the writer stamps `v` + `ts`. */
export type ObservationInput =
  | Omit<HookObservation, "v" | "ts">
  | Omit<AgentObservation, "v" | "ts">
  | Omit<SkillObservation, "v" | "ts">
  | Omit<EvalObservation, "v" | "ts">
  | Omit<CapabilityDiffObservation, "v" | "ts">;

/** Serialize one record to a single JSONL line (trailing newline included). */
export function formatObservation(record: ObservationRecord): string {
  return JSON.stringify(record) + "\n";
}

/**
 * Append one observation to `<cwd>/.vigiles/runs.jsonl`. Best-effort: any failure is
 * swallowed so recording can never break a live session (the `ts`/`clock` here is a
 * runtime side effect, intentionally — this module records reality, it is not a spec).
 */
export function appendObservation(
  input: ObservationInput,
  cwd: string = process.cwd(),
): void {
  try {
    const dir = resolve(cwd, ".vigiles");
    mkdirSync(dir, { recursive: true });
    const record = {
      v: OBSERVE_VERSION,
      ts: new Date().toISOString(),
      ...input,
    } as ObservationRecord;
    appendFileSync(resolve(dir, LEDGER_FILE), formatObservation(record));
  } catch {
    /* best-effort — recording is never allowed to break a session */
  }
}

/**
 * Read the ledger back. Tolerant by design: a malformed or partially-written line is
 * skipped rather than throwing, so a torn append never nukes the whole read.
 */
export function readObservations(
  cwd: string = process.cwd(),
): ObservationRecord[] {
  let raw: string;
  try {
    raw = readFileSync(resolve(cwd, ".vigiles", LEDGER_FILE), "utf8");
  } catch {
    return [];
  }
  const out: ObservationRecord[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = tryParseRecord(trimmed);
    if (parsed) out.push(parsed);
  }
  return out;
}

/** Filter the ledger to one record kind, narrowing the type for the caller. */
export function observationsOfKind<K extends ObservationRecord["kind"]>(
  records: readonly ObservationRecord[],
  kind: K,
): Extract<ObservationRecord, { kind: K }>[] {
  return records.filter(
    (r): r is Extract<ObservationRecord, { kind: K }> => r.kind === kind,
  );
}

/** Parse one JSONL line into a record, or `null` if it is not a well-formed record. */
function tryParseRecord(line: string): ObservationRecord | null {
  try {
    const value: unknown = JSON.parse(line);
    if (
      value &&
      typeof value === "object" &&
      typeof (value as { kind?: unknown }).kind === "string"
    ) {
      return value as ObservationRecord;
    }
  } catch {
    /* tolerate a torn/malformed line */
  }
  return null;
}
