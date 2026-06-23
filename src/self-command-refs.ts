/**
 * Self-command-reference verification — the cross-reference moat applied to
 * vigiles's OWN docs. vigiles verifies that a CLAUDE.md's commands resolve; its
 * own docs cite ITS OWN commands, and nothing checked those until a rename left
 * `vigiles compile-hook` / `vigiles run-skill` rotting in the docs. This is the
 * deterministic gate: every `vigiles <cmd>` reference in a doc/comment must
 * resolve to a real command (a VERB or a `hook-runtime <kind>`).
 *
 * HIGH-PRECISION by construction (don't-cry-wolf). A reference is inspected only
 * when it's an unambiguous COMMAND — i.e. it sits inside an inline `` `span` ``,
 * inside a ```shell fence```, or is prefixed `npx vigiles` / `Usage: vigiles` /
 * is a `cli.js` invocation. Prose ("vigiles compiles the spec", "adds vigiles to
 * devDependencies") and non-shell fences (```text agent prompts, ```ts) are
 * never matched. A bare unknown VERB is flagged only when hyphenated (every
 * renamed vigiles command is — `compile-hook`, `run-skill`) or in an explicit
 * invocation; `hook-runtime <kind>` is checked in any command context. Source of
 * truth: {@link VERBS} / {@link HOOK_RUNTIME_KINDS}.
 *
 * KNOWN LIMITATION (measured, deliberately not "fixed"): this catches the
 * `vigiles <cmd>` / `cli.js <cmd>` INVOCATION form. It does NOT flag a BARE
 * command name (`agent-hook` without the `vigiles ` prefix) nor a bare file path
 * (`src/foo.ts`), because both collide with legitimate non-references: bare
 * command names double as CONCEPT names (`the refs-hook nudge` appears as a
 * feature name in ~10 files; `agent-hook` as a rail name + in test labels +
 * `makeTmpDir("agent-hook-cli")`), and bare paths collide with ILLUSTRATIVE
 * examples (the README's `src/auth/login.ts`, `docs/foo.md`) and test fixtures
 * (`session.test.ts` builds fake `src/compile.ts` diffs). A denylist over either
 * would cry wolf on dozens of valid usages — so terminology/path-accuracy stays
 * the JUDGMENT half the `doc-consistency` rule assigns to discipline, not a check.
 */
import { VERBS, HOOK_RUNTIME_KINDS } from "./cli-commands.js";

export interface CommandRefIssue {
  readonly file: string;
  readonly line: number;
  /** The offending invocation, e.g. `vigiles compile-hook`. */
  readonly ref: string;
  readonly reason: string;
}

export interface KnownCommands {
  readonly verbs: readonly string[];
  readonly kinds: readonly string[];
}

const DEFAULT_KNOWN: KnownCommands = {
  verbs: VERBS,
  kinds: HOOK_RUNTIME_KINDS,
};

const TOKEN = "[a-z][a-z0-9-]*";
// `[npx ][vigiles|cli.js] <verb> [<kind>]` — capture the optional prefix + literal.
const INVOKE = new RegExp(
  String.raw`(npx |Usage: )?\b(vigiles|cli\.js)\s+(${TOKEN})(?:\s+(${TOKEN}))?`,
  "g",
);
// A bare `hook-runtime <kind>` (e.g. `node ${CLI} hook-runtime agent` in a test).
const KIND = new RegExp(String.raw`hook-runtime\s+(${TOKEN})`, "g");
const SHELL_FENCE = /^\s*```(?:bash|sh|shell|zsh|console|shell-session)\s*$/;
const FENCE = /^\s*```/;

/** Inclusive index ranges of inline `code spans` in a line. */
function codeSpans(line: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const m of line.matchAll(/`[^`\n]+`/g))
    ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}
const inSpan = (i: number, spans: [number, number][]): boolean =>
  spans.some(([a, b]) => i >= a && i < b);

function scanLine(
  line: string,
  inShellFence: boolean,
  known: KnownCommands,
): { ref: string; reason: string }[] {
  const spans = inShellFence ? null : codeSpans(line);
  const ctx = (i: number): boolean => inShellFence || inSpan(i, spans ?? []);
  const out: { ref: string; reason: string }[] = [];
  const seen = new Set<string>();
  const push = (ref: string, reason: string): void => {
    const key = ref + "\0" + reason;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ ref, reason });
    }
  };

  for (const m of line.matchAll(INVOKE)) {
    const explicit = inShellFence || Boolean(m[1]) || m[2] === "cli.js";
    if (!explicit && !ctx(m.index)) continue;
    const verb = m[3];
    if (verb === "hook-runtime") {
      if (m[4] !== undefined && !known.kinds.includes(m[4]))
        push(`hook-runtime ${m[4]}`, `unknown hook-runtime kind "${m[4]}"`);
    } else if (
      !known.verbs.includes(verb) &&
      (verb.includes("-") || explicit)
    ) {
      push(`${m[2]} ${verb}`, `unknown/removed command "${verb}"`);
    }
  }
  // Bare `hook-runtime <kind>` (no vigiles/cli.js literal) inside a command context.
  for (const m of line.matchAll(KIND)) {
    if (!ctx(m.index)) continue;
    if (!known.kinds.includes(m[1]))
      push(`hook-runtime ${m[1]}`, `unknown hook-runtime kind "${m[1]}"`);
  }
  return out;
}

/**
 * Find stale/unknown vigiles command references across the given files. Pure —
 * the caller supplies file contents (so it works over the repo in a test, or any
 * file set).
 */
export function findStaleCommandRefs(
  files: readonly { readonly path: string; readonly content: string }[],
  known: KnownCommands = DEFAULT_KNOWN,
): CommandRefIssue[] {
  const issues: CommandRefIssue[] = [];
  for (const { path, content } of files) {
    let inAnyFence = false;
    let inShellFence = false;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (FENCE.test(line)) {
        if (inAnyFence) {
          inAnyFence = inShellFence = false;
        } else {
          inAnyFence = true;
          inShellFence = SHELL_FENCE.test(line);
        }
        continue;
      }
      if (line.includes("vigiles:ignore-cmd")) continue;
      for (const f of scanLine(line, inShellFence, known))
        issues.push({ file: path, line: i + 1, ref: f.ref, reason: f.reason });
    }
  }
  return issues;
}
