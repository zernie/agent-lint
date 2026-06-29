/**
 * Hook-block-ineffective detector suite (vitest) — the "false confidence" class.
 * Asserts both failure shapes (wrong-event on a NO-EFFECT event / wrong-field),
 * the FP-safety calibration (PostToolUse exit 2 is FEEDBACK, never flagged),
 * de-duplication, and the injectable `readFileSync` seam. All I/O is faked.
 */
import { describe, it } from "vitest";
import assert from "node:assert/strict";

import {
  hookBlockIssues,
  type HookBlockOptions,
  type HookScriptEntry,
} from "./hook-block-ineffective.js";

// The Claude Code dialect values, supplied by the caller (harness-neutral
// injection). noEffectEvents = where a block is silently ignored ENTIRELY (no
// veto, no model feedback); PostToolUse is deliberately NOT here (it feeds back).
const CC_OPTS: HookBlockOptions = {
  noEffectEvents: new Set([
    "SessionStart",
    "SessionEnd",
    "Notification",
    "PreCompact",
  ]),
  permissionDecisionEvents: new Set(["PreToolUse"]),
};

function withFiles(
  files: Record<string, string>,
  base: HookBlockOptions = CC_OPTS,
): HookBlockOptions {
  return { ...base, readFileSync: (p: string) => files[p] ?? "" };
}

// ---------------------------------------------------------------------------
// wrong-event: a block on a NO-EFFECT event (ignored entirely)
// ---------------------------------------------------------------------------

describe("wrong-event (no-effect events only)", () => {
  it("SessionStart script with exit 2 → one wrong-event finding", () => {
    const script = "/hooks/session-guard.sh";
    const entries: HookScriptEntry[] = [
      { event: "SessionStart", command: `bash ${script}`, scriptPath: script },
    ];
    const findings = hookBlockIssues(
      entries,
      withFiles({ [script]: "#!/bin/sh\necho hi\nexit 2\n" }),
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, "wrong-event");
    assert.equal(findings[0].event, "SessionStart");
    assert.equal(findings[0].scriptPath, script);
  });

  it('Notification hook with a legacy "decision":"block" → wrong-event', () => {
    const entries: HookScriptEntry[] = [
      {
        event: "Notification",
        command: `echo '{"decision":"block"}'`,
        scriptPath: null,
      },
    ];
    const findings = hookBlockIssues(entries, CC_OPTS);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, "wrong-event");
    assert.equal(findings[0].scriptPath, null); // inline command inspected
  });

  it("inline SessionEnd command containing exit 2 → wrong-event (scriptPath null)", () => {
    const entries: HookScriptEntry[] = [
      { event: "SessionEnd", command: `bash -c 'cleanup; exit 2'` },
    ];
    const findings = hookBlockIssues(entries, CC_OPTS);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, "wrong-event");
    assert.equal(findings[0].scriptPath, null);
  });
});

// ---------------------------------------------------------------------------
// FP-safety: PostToolUse exit 2 is a FEEDBACK channel — never flagged
// ---------------------------------------------------------------------------

describe("FP-safety: feedback + blocking events are not flagged", () => {
  it("PostToolUse exit 2 → NO finding (it feeds stderr back to the model)", () => {
    // The dogfood lesson: vigiles's own refs-nudge.sh is exactly this shape.
    const entries: HookScriptEntry[] = [
      { event: "PostToolUse", command: `bash -c 'echo nudge >&2; exit 2'` },
    ];
    assert.deepEqual(hookBlockIssues(entries, CC_OPTS), []);
  });

  it("PreToolUse exit 2 → NO finding (a valid block on a blocking event)", () => {
    const entries: HookScriptEntry[] = [
      { event: "PreToolUse", command: `bash -c 'deny; exit 2'` },
    ];
    assert.deepEqual(hookBlockIssues(entries, CC_OPTS), []);
  });

  it("Stop/SubagentStop exit 2 → NO finding (they genuinely block)", () => {
    const entries: HookScriptEntry[] = [
      { event: "Stop", command: `bash -c 'exit 2'` },
      { event: "SubagentStop", command: `bash -c 'exit 2'` },
    ];
    assert.deepEqual(hookBlockIssues(entries, CC_OPTS), []);
  });

  it("a benign SessionStart hook (no block mechanism) → NO finding", () => {
    const entries: HookScriptEntry[] = [
      { event: "SessionStart", command: `echo 'hello'` },
    ];
    assert.deepEqual(hookBlockIssues(entries, CC_OPTS), []);
  });
});

// ---------------------------------------------------------------------------
// wrong-field: PreToolUse using the legacy top-level `decision` field
// ---------------------------------------------------------------------------

describe("wrong-field (permission-gated events)", () => {
  it('PreToolUse with top-level "decision":"block" (no permissionDecision) → wrong-field', () => {
    const entries: HookScriptEntry[] = [
      {
        event: "PreToolUse",
        command: `echo '{"decision":"block"}'`,
        scriptPath: null,
      },
    ];
    const findings = hookBlockIssues(entries, CC_OPTS);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, "wrong-field");
  });

  it("PreToolUse using the correct permissionDecision deny → NO finding", () => {
    const entries: HookScriptEntry[] = [
      {
        event: "PreToolUse",
        command: `echo '{"hookSpecificOutput":{"permissionDecision":"deny"}}'`,
      },
    ];
    assert.deepEqual(hookBlockIssues(entries, CC_OPTS), []);
  });
});

// ---------------------------------------------------------------------------
// Robustness
// ---------------------------------------------------------------------------

describe("robustness", () => {
  it("a readFileSync that returns '' (missing/unreadable) → no crash, no finding", () => {
    const entries: HookScriptEntry[] = [
      {
        event: "SessionStart",
        command: `bash /hooks/gone.sh`,
        scriptPath: "/hooks/gone.sh",
      },
    ];
    const findings = hookBlockIssues(entries, withFiles({}));
    assert.deepEqual(findings, []);
  });

  it("two identical (event, kind, scriptPath) entries → one finding", () => {
    const script = "/hooks/dup.sh";
    const entries: HookScriptEntry[] = [
      { event: "SessionStart", command: `bash ${script}`, scriptPath: script },
      { event: "SessionStart", command: `bash ${script}`, scriptPath: script },
    ];
    const findings = hookBlockIssues(
      entries,
      withFiles({ [script]: "exit 2\n" }),
    );
    assert.equal(findings.length, 1);
  });
});
