/**
 * The `audit` safety battery — run each runnable hook against the DISASTER_CATALOG
 * to prove (or disprove) it actually blocks. An OPT-IN executing check: `audit`
 * reaches it only when a human consents at a TTY (a plain/headless `audit` never
 * executes a hook — it's a local report, not a CI step).
 *
 * STATE-SAFE: a hook is arbitrary code that could reach a real Postgres / API, so
 * where bubblewrap is available the battery runs EVERY hook under `sandbox:"auto"`
 * — a no-egress network namespace, so a hook can't touch your DB/network during
 * the probe (own-repo AND foreign alike; provenance protects the host, confinement
 * protects your external state). Where no sandbox exists (macOS / hardened CI): a
 * FOREIGN plugin's hooks are SKIPPED loudly (never a stranger's code unconfined),
 * and the user's OWN hooks run DIRECT with a LOUD warning that they executed
 * WITHOUT network confinement (so a hook that hits your DB/API would have).
 *
 * Lives in its own module (not cli.ts) so it's unit-testable without booting the
 * CLI — the CLI can no longer run it headless, so this is where its coverage lives.
 */
import { resolve } from "node:path";

import {
  verifyGuardrail,
  unblockedDisasters,
  formatGuardrailReport,
  DISASTER_CATALOG,
} from "./guardrail-check.js";
import { sandboxAvailable } from "./sandbox.js";
import type { BatterySummary } from "./audit-score.js";
import type { ScanReport } from "./scan.js";

/**
 * The hooks the safety battery tests — only those that can actually BLOCK a tool
 * call (PreToolUse guards). A SessionStart / PostToolUse / Stop hook can't (and
 * shouldn't) block the disaster catalog, so testing it would unfairly tank Safety
 * (a cry-wolf). An unknown-event hook (non-object config shape) is included
 * best-effort. ONE predicate, reused by the executable-surface check + the battery
 * so they can't drift (one-detector-no-drift).
 */
export function runnableSafetyHooks(report: ScanReport): ScanReport["hooks"] {
  return report.hooks.filter(
    (h) =>
      h.status === "ok" &&
      h.command.trim() !== "" &&
      (h.event === undefined || h.event === "PreToolUse"),
  );
}

/**
 * Run the battery over a scanned report. Returns the human-readable lines AND the
 * aggregate `summary` (the Safety category's input) so the caller can both feed
 * the rings and print the detail. `summary` is null when there's no runnable hook
 * to test (Safety → n/a).
 */
export function runSafetyBattery(
  report: ScanReport,
  root: string,
): { lines: string[]; summary: BatterySummary | null } {
  const isForeign = resolve(root) !== process.cwd();
  const confined = sandboxAvailable();
  const runnableHooks = runnableSafetyHooks(report);
  if (runnableHooks.length === 0) {
    return {
      lines: ["\nSafety battery: no PreToolUse safety hooks to test"],
      summary: null,
    };
  }
  const lines: string[] = [
    `\nSafety battery (${String(runnableHooks.length)} hook(s) × ${String(DISASTER_CATALOG.length)} disasters):`,
  ];
  if (!confined && !isForeign) {
    lines.push(
      `  ⚠ no sandbox (bubblewrap) here — running YOUR hooks WITHOUT network ` +
        `confinement. A hook that reaches a DB/API would do so now.`,
    );
  }
  let totalBlocked = 0;
  let totalRun = 0;
  let hooksSkipped = 0;
  for (const hook of runnableHooks) {
    // Confine network when we can (own + foreign); only fall through to a direct
    // run for the user's OWN hooks when no sandbox exists (warned above).
    if (!confined && isForeign) {
      hooksSkipped += 1;
      lines.push(
        `  ⊘ ${hook.script}: skipped — testing a non-cwd plugin's hooks needs a sandbox (bubblewrap), not available`,
      );
      continue;
    }
    let results;
    try {
      results = confined
        ? verifyGuardrail(hook.command, { cwd: root, sandbox: "auto" })
        : verifyGuardrail(hook.command, { cwd: root });
    } catch {
      hooksSkipped += 1;
      lines.push(
        `  ⊘ ${hook.script}: skipped — could not confine the hook run (sandbox error)`,
      );
      continue;
    }
    const blocked = results.filter((r) => r.blocked).length;
    totalBlocked += blocked;
    totalRun += results.length;
    lines.push(
      `  ${hook.script}: blocks ${String(blocked)}/${String(results.length)} disasters`,
    );
    const missed = unblockedDisasters(results);
    if (missed.length > 0) {
      lines.push(
        formatGuardrailReport(hook.command, results)
          .split("\n")
          .map((l) => `  ${l}`)
          .join("\n"),
      );
    }
  }
  if (totalRun > 0) {
    lines.push(
      `  Total: blocks ${String(totalBlocked)}/${String(totalRun)} disasters`,
    );
  }
  return { lines, summary: { totalBlocked, totalRun, hooksSkipped } };
}
