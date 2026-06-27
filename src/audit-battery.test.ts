/**
 * Safety-battery suite (vitest, no model/claude — runs real shell hooks). Since
 * `audit` can no longer run the battery headless (it's a local report, execution
 * is TTY-consent only), the battery's block/allow + orchestration coverage lives
 * here, calling runSafetyBattery directly. Block/allow correctness of a single
 * hook is also covered by guardrail-check.test.ts (verifyGuardrail).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runSafetyBattery, runnableSafetyHooks } from "./audit-battery.js";
import type { ScanReport } from "./scan.js";

/** A ScanReport with only the `hooks` the battery reads (the rest is irrelevant). */
function reportWithHooks(hooks: ScanReport["hooks"]): ScanReport {
  return { hooks } as unknown as ScanReport;
}

function hook(command: string, script: string): ScanReport["hooks"][number] {
  return {
    script,
    command,
    status: "ok",
    event: "PreToolUse",
  } as unknown as ScanReport["hooks"][number];
}

describe("runnableSafetyHooks", () => {
  it("keeps ok PreToolUse (and unknown-event) hooks, drops others", () => {
    const r = reportWithHooks([
      hook("a.sh", "a.sh"),
      { script: "b", command: "b.sh", status: "ok", event: "SessionStart" },
      { script: "c", command: "c.sh", status: "missing", event: "PreToolUse" },
      { script: "d", command: "", status: "ok", event: "PreToolUse" },
      { script: "e", command: "e.sh", status: "ok", event: undefined },
    ] as unknown as ScanReport["hooks"]);
    const got = runnableSafetyHooks(r).map((h) => h.script);
    expect(got).toEqual(["a.sh", "e"]);
  });
});

describe("runSafetyBattery", () => {
  let dir: string;
  let blockAll: string;
  let permitAll: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "audit-battery-"));
    mkdirSync(dir, { recursive: true });
    blockAll = join(dir, "block.sh");
    writeFileSync(blockAll, "#!/usr/bin/env bash\nexit 2\n");
    chmodSync(blockAll, 0o755);
    permitAll = join(dir, "permit.sh");
    writeFileSync(permitAll, "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(permitAll, 0o755);
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("no runnable hooks → null summary + a 'no hooks' line (Safety n/a)", () => {
    const r = runSafetyBattery(reportWithHooks([]), process.cwd());
    expect(r.summary).toBeNull();
    expect(r.lines.join("\n")).toMatch(/no PreToolUse safety hooks/);
  });

  // Own-repo (root === cwd) so the hook runs (direct here — no bubblewrap in the
  // test env; a warning is emitted, asserted below).
  it("a blocking hook (exit 2) blocks every disaster", () => {
    const r = runSafetyBattery(
      reportWithHooks([hook(`bash ${blockAll}`, "block.sh")]),
      process.cwd(),
    );
    expect(r.summary).not.toBeNull();
    expect(r.summary?.totalBlocked).toBe(r.summary?.totalRun);
    expect(r.summary?.totalRun).toBeGreaterThan(0);
    expect(r.lines.join("\n")).toMatch(/blocks (\d+)\/\1 disasters/);
  });

  it("a permissive hook (exit 0) blocks nothing (the false-confidence signal)", () => {
    const r = runSafetyBattery(
      reportWithHooks([hook(`bash ${permitAll}`, "permit.sh")]),
      process.cwd(),
    );
    expect(r.summary?.totalBlocked).toBe(0);
    expect(r.summary?.totalRun).toBeGreaterThan(0);
    expect(r.lines.join("\n")).toMatch(/blocks 0\//);
  });

  it("own-repo with no sandbox warns it ran WITHOUT network confinement", () => {
    // The test env has no bubblewrap → the own-repo path runs direct + warns.
    const r = runSafetyBattery(
      reportWithHooks([hook(`bash ${permitAll}`, "permit.sh")]),
      process.cwd(),
    );
    expect(r.lines.join("\n")).toMatch(/WITHOUT network confinement/);
  });

  it("a FOREIGN plugin with no sandbox is skipped loudly (never run unconfined)", () => {
    // root !== cwd and no bubblewrap → skip, never execute a stranger's hook.
    const r = runSafetyBattery(
      reportWithHooks([hook(`bash ${permitAll}`, "permit.sh")]),
      dir, // a non-cwd dir
    );
    expect(r.summary?.hooksSkipped).toBe(1);
    expect(r.summary?.totalRun).toBe(0);
    expect(r.lines.join("\n")).toMatch(/skipped — testing a non-cwd plugin/);
  });
});
