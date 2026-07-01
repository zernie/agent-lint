import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  appendObservation,
  readObservations,
  observationsOfKind,
  formatObservation,
  OBSERVE_VERSION,
  LEDGER_FILE,
  type ObservationRecord,
} from "./observe.js";

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(resolve(tmpdir(), "vigiles-observe-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("observe ledger", () => {
  it("append stamps v + ts and round-trips through read", () => {
    const cwd = tmp();
    appendObservation(
      {
        kind: "hook",
        event: "PreToolUse",
        decision: "deny",
        rule: "no-force-push",
        cmd: "git push -f",
      },
      cwd,
    );
    appendObservation(
      { kind: "skill", name: "commit-helper", fired: true },
      cwd,
    );

    const records = readObservations(cwd);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      v: OBSERVE_VERSION,
      kind: "hook",
      decision: "deny",
    });
    expect(typeof records[0].ts).toBe("string");
    expect(records[1]).toMatchObject({
      kind: "skill",
      name: "commit-helper",
      fired: true,
    });
  });

  it("appends (never truncates) across calls", () => {
    const cwd = tmp();
    appendObservation(
      { kind: "eval", name: "trigger-rate", metric: "recall", value: 0.55 },
      cwd,
    );
    appendObservation(
      { kind: "eval", name: "trigger-rate", metric: "precision", value: 0.9 },
      cwd,
    );
    expect(readObservations(cwd)).toHaveLength(2);
  });

  it("reads an empty/absent ledger as []", () => {
    expect(readObservations(tmp())).toEqual([]);
  });

  it("tolerates a torn/malformed line instead of throwing", () => {
    const cwd = tmp();
    mkdirSync(resolve(cwd, ".vigiles"), { recursive: true });
    const good = formatObservation({
      v: 1,
      ts: "t",
      kind: "skill",
      name: "a",
      fired: true,
    });
    // a half-written line + a non-record json line between two good records
    writeFileSync(
      resolve(cwd, ".vigiles", LEDGER_FILE),
      good + '{"kind":"hook"' + "\n" + "42\n" + good,
    );
    const records = readObservations(cwd);
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.kind === "skill")).toBe(true);
  });

  it("observationsOfKind narrows to one kind", () => {
    const records: ObservationRecord[] = [
      { v: 1, ts: "t", kind: "hook", event: "PreToolUse", decision: "allow" },
      { v: 1, ts: "t", kind: "skill", name: "x", fired: false },
      { v: 1, ts: "t", kind: "skill", name: "y", fired: true },
    ];
    const skills = observationsOfKind(records, "skill");
    expect(skills.map((s) => s.name)).toEqual(["x", "y"]);
  });

  it("append is best-effort — an unwritable cwd does not throw", () => {
    // a path whose parent is a file, so mkdir/append fail; append must swallow it
    const cwd = tmp();
    writeFileSync(resolve(cwd, "afile"), "x");
    expect(() => {
      appendObservation(
        { kind: "skill", name: "z", fired: true },
        resolve(cwd, "afile"),
      );
    }).not.toThrow();
  });

  it("formatObservation is one newline-terminated JSON line", () => {
    const line = formatObservation({
      v: 1,
      ts: "t",
      kind: "skill",
      name: "a",
      fired: true,
    });
    expect(line.endsWith("\n")).toBe(true);
    expect(line.trimEnd().includes("\n")).toBe(false);
    expect(JSON.parse(line)).toMatchObject({ kind: "skill" });
  });
});
