/**
 * vigiles — hook settings normalization (the typed boundary for shipped hooks).
 *
 * A repo's hooks ship as raw, untrusted, parsed JSON/TOML — `unknown` at the
 * loader edge (`LoadedPlugin.settings.hooks`). Rather than have every detector
 * re-walk that `unknown` with inline casts (parse-don't-validate violated N
 * times), this parses it ONCE at the boundary into a typed, flattened
 * `HookRegistration[]` that the walkers consume.
 *
 * HARNESS-AGNOSTIC BY TOLERANCE, NOT BY A PORT. Two shipping shapes exist:
 *   - Claude Code (JSON):  `{ Event: [{ matcher, hooks: [{ command }] }] }`
 *   - Codex (TOML):        `{ Event: [{ command }] }`  (`[[hooks.Event]] command=…`)
 * A single tolerant reader absorbs both — a missing `hooks` array means the
 * entry itself is the lone command holder. The difference is small enough that
 * one parser covers it, so we deliberately DON'T add a per-harness port for it
 * (rule-of-three / YAGNI: design the neutral shape first, defer the abstraction
 * until a harness needs a genuinely divergent shape). If one ever does, this is
 * the single seam to lift behind the layout/dialect.
 *
 * Pure + fully testable (no IO); the script resolution that turns a `command`
 * into an on-disk path stays in the caller (it needs the plugin root + fs).
 */

/**
 * One flattened hook registration: a single command bound to an event, with its
 * optional matcher. The neutral form every hook detector reads — CC-nested and
 * Codex-flat both collapse to this.
 */
export interface HookRegistration {
  /** The event the hook registers under, e.g. `"PreToolUse"`. */
  readonly event: string;
  /** The tool/path matcher, or `null` when the entry declares none. */
  readonly matcher: string | null;
  /** The shell command the hook runs (non-empty). */
  readonly command: string;
}

/** True for a non-null, non-array object. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** The string `matcher` of an entry, or `null` when absent/empty. */
function entryMatcher(entry: Record<string, unknown>): string | null {
  const m = entry.matcher;
  return typeof m === "string" && m.length > 0 ? m : null;
}

/**
 * Flatten ONE `{ event: [...] }` group's entry into registrations. Tolerant of
 * both shapes: a Claude Code entry nests `hooks: [{command}]`; a Codex flat
 * entry IS the command holder (no `hooks` array), so the entry stands in for it.
 */
function flattenEntry(event: string, entry: unknown): HookRegistration[] {
  if (!isRecord(entry)) return [];
  const matcher = entryMatcher(entry);
  const nested = entry.hooks;
  const holders: unknown[] = Array.isArray(nested) ? nested : [entry];
  const out: HookRegistration[] = [];
  for (const h of holders) {
    if (!isRecord(h)) continue;
    const command = h.command;
    if (typeof command !== "string" || command.length === 0) continue;
    out.push({ event, matcher, command });
  }
  return out;
}

/**
 * Parse the raw `settings.hooks` value into typed registrations. Returns `[]`
 * for any non-object / malformed input — never throws.
 */
export function normalizeHooks(raw: unknown): HookRegistration[] {
  if (!isRecord(raw)) return [];
  const out: HookRegistration[] = [];
  for (const [event, arr] of Object.entries(raw)) {
    if (!Array.isArray(arr)) continue;
    for (const entry of arr) out.push(...flattenEntry(event, entry));
  }
  return out;
}

/** Distinct event names present in the raw hooks object (object-keyed shape). */
export function hookEventNames(raw: unknown): string[] {
  return isRecord(raw) ? Object.keys(raw) : [];
}
