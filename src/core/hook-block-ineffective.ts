/**
 * Hook-block-ineffective detector — the #1 verified hook pain ("false confidence").
 *
 * A safety hook that LOOKS like it blocks but SILENTLY DOESN'T. Two shapes:
 *
 * 1. **wrong-event** — the script tries to block (contains `exit 2`, a legacy
 *    `"decision":"block"` JSON, or a `"permissionDecision":"deny"`) but is
 *    registered on an event that CANNOT block (the action has already run, or
 *    the harness ignores the deny field on that event). Real bug #19009: authors
 *    copied a blocking template onto a PostToolUse hook and believed the gate was
 *    in place, but PostToolUse fires AFTER the tool runs — exit 2 there is a
 *    "blocking error" in the logs, not an actual veto.
 *
 * 2. **wrong-field** — the hook IS on a permission-gated event (e.g. PreToolUse)
 *    but emits the LEGACY top-level `"decision":"block"` field instead of the
 *    required `hookSpecificOutput.permissionDecision:"deny"`. A copied template
 *    (PostToolUse style → PreToolUse registration) is the usual cause; the deny
 *    is silently discarded, nothing is blocked.
 *
 * Both shapes cause identical user-visible behaviour: the hook "works" (exits,
 * no crash) but never actually stops anything. The only signal is "why did this
 * run anyway?" after an incident.
 *
 * FP-SAFETY — conservative literal patterns only, `warn` severity by default:
 *   - `exit 2` is matched by a shell-context regex that requires surrounding
 *     whitespace/control chars to avoid false-positives on `exit 200` or a
 *     `git status --exit-code 2` argument.
 *   - JSON decision patterns are matched literally (no partial JSON walking).
 *   - Nothing is flagged on an unknown event (we only know which events CAN
 *     block because the caller injected that set).
 *
 * HARNESS-NEUTRAL — the sets of blocking events and permission-decision events
 * are INJECTED from the dialect (never hard-coded here). The caller supplies the
 * Claude Code sets; a Codex adapter supplies its own. This is the same
 * dependency-injection pattern used by `verifyHookEvents` and `verifyToolContract`
 * (core ⊄ adapter — one-detector-no-drift).
 *
 * ONE detector reused by scan + the `hook-block-ineffective` lint rule (two
 * callers, no drift). See `research/hook-pain-points.md` for the verified corpus
 * and `docs/compiled-hooks.md` for the authoritative fix (compiled hooks make
 * this whole class unrepresentable).
 */
import { readFileSync as nodeReadFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The two "looks like it blocks but doesn't" failure shapes. */
export type HookBlockKind = "wrong-event" | "wrong-field";

/** One false-confidence finding: a hook that appears to block but silently won't. */
export interface HookBlockFinding {
  readonly event: string;
  readonly kind: HookBlockKind;
  /** The hook script that was inspected (path if resolved from a script file, else null = inline command). */
  readonly scriptPath: string | null;
  readonly message: string;
}

/** A single hook registration to inspect. */
export interface HookScriptEntry {
  readonly event: string;
  readonly matcher?: string;
  /** The hook command line as registered. */
  readonly command: string;
  /** Resolved path to the script file the command runs, if known (else null → inspect `command`). */
  readonly scriptPath?: string | null;
}

/** Options for {@link hookBlockIssues}. All fields are injectable for testability. */
export interface HookBlockOptions {
  /**
   * Events on this harness whose hooks CAN veto/block (injected from the dialect).
   * A hook on any OTHER event cannot block — exit 2 or a deny field there is a
   * "blocking error" at best, a silent no-op at worst.
   */
  readonly blockingEvents: ReadonlySet<string>;
  /**
   * Events that require the structured `permissionDecision` field for a deny
   * (e.g. `PreToolUse`). On these events the legacy top-level `"decision":"block"`
   * field is ignored; only `hookSpecificOutput.permissionDecision:"deny"` works.
   */
  readonly permissionDecisionEvents: ReadonlySet<string>;
  /**
   * Injectable file read (default: node:fs `readFileSync(p, "utf8")`).
   * Returns `""` on any error so a missing / unreadable script doesn't crash
   * the detector — it simply produces no findings for that entry.
   */
  readonly readFileSync?: (p: string) => string;
}

// ---------------------------------------------------------------------------
// Block-mechanism patterns (conservative / FP-safe)
// ---------------------------------------------------------------------------

/**
 * An `exit 2` statement.
 *
 * Requires a shell-context separator before `exit` (start-of-line, whitespace,
 * `;`, `&`, `|`) and word-boundary / separator after `2` — so `exit 200` and
 * `--exit-code 2` are NOT matched.
 */
const EXIT_2 = /(^|[\s;&|])exit\s+2(\s|;|$)/m;

/**
 * A legacy top-level `"decision":"block"` or `"decision":"deny"` JSON field.
 * This is the OLD Claude Code hook output format. On permission-gated events
 * (PreToolUse) it is ignored; on non-blocking events it never had any effect.
 */
const DECISION_BLOCK = /"decision"\s*:\s*"(block|deny)"/;

/**
 * The CORRECT structured deny for permission-gated events:
 * `"permissionDecision":"deny"` or `"permissionDecision":"ask"`.
 * (Both require a structured response, as opposed to the legacy field.)
 */
const PERMISSION_DENY = /"permissionDecision"\s*:\s*"(deny|ask)"/;

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

function defaultReadFile(p: string): string {
  try {
    return nodeReadFileSync(p, "utf8");
  } catch {
    return "";
  }
}

/**
 * Detect false-confidence "blocks" across a set of hook entries.
 *
 * Returns one {@link HookBlockFinding} per entry (at most one per entry —
 * `wrong-event` takes precedence over `wrong-field`). Identical
 * (event, kind, scriptPath) pairs are de-duped.
 *
 * @param entries - The hook registrations to inspect (event + command/script).
 * @param opts    - Injected sets of blocking/permission events, and an optional
 *                  `readFileSync` (default: node:fs).
 */
export function hookBlockIssues(
  entries: readonly HookScriptEntry[],
  opts: HookBlockOptions,
): HookBlockFinding[] {
  const { blockingEvents, permissionDecisionEvents } = opts;
  const readFile = opts.readFileSync ?? defaultReadFile;
  const findings: HookBlockFinding[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    // Determine the script text and the canonical "path" label for findings.
    const scriptPath = entry.scriptPath ?? null;
    const text =
      scriptPath !== null ? readFile(scriptPath) : (entry.command ?? "");

    // Detect block mechanisms.
    const hasExit2 = EXIT_2.test(text);
    const hasDecisionBlock = DECISION_BLOCK.test(text);
    const hasPermissionDeny = PERMISSION_DENY.test(text);

    const triesBlock = hasExit2 || hasDecisionBlock || hasPermissionDeny;
    if (!triesBlock) continue;

    const isBlockingEvent = blockingEvents.has(entry.event);
    const isPermissionEvent = permissionDecisionEvents.has(entry.event);

    let kind: HookBlockKind | null = null;
    let message = "";

    if (!isBlockingEvent) {
      // wrong-event: the hook tries to block on an event that cannot block.
      kind = "wrong-event";
      message =
        `This hook tries to block (exit 2 / "decision" / "permissionDecision") ` +
        `but "${entry.event}" hooks cannot veto — the action already ran and the ` +
        `block is silently ignored (the harness may print a "blocking error" to ` +
        `logs, but nothing is prevented). Move the gate to a blocking event ` +
        `(e.g. PreToolUse) so the deny fires BEFORE the action.`;
    } else if (isPermissionEvent && hasDecisionBlock && !hasPermissionDeny) {
      // wrong-field: on a permission-gated event, uses the legacy field.
      kind = "wrong-field";
      message =
        `On "${entry.event}" a deny must use ` +
        `\`hookSpecificOutput.permissionDecision:"deny"\`; this script uses the ` +
        `legacy top-level \`"decision"\` field, which is ignored on this event, ` +
        `so nothing is blocked. Update the JSON output to the structured form: ` +
        `\`{"hookSpecificOutput":{"permissionDecision":"deny"}}\`.`;
    }

    if (kind === null) continue;

    // De-dupe identical (event, kind, scriptPath) triples.
    const dedupeKey = `${entry.event}:${kind}:${scriptPath ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    findings.push({ event: entry.event, kind, scriptPath, message });
  }

  return findings;
}
