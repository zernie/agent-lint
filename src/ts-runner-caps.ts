/**
 * Can this project RUN a TypeScript script — and therefore, may we suggest one?
 *
 * Extracted from `adapters/claude-code/run-scripts.ts` (which still re-exports it)
 * because two places need the same answer and they were giving opposite ones:
 *
 *   - the RUNNER (`interpreterArgs`) refuses a `.ts` script with no `tsx` and no
 *     native type stripping, and
 *   - the SUGGESTER (`testFileExt`) recommended `.ts` from a `tsconfig.json`
 *     alone, never asking.
 *
 * On Node 20 — which this repo's own CI still runs — a project holding a
 * `tsconfig.json` but no local `tsx` got told to write `foo.harness.ts`, and
 * `vigiles test` then declined to run the very file it had asked for. A finding
 * whose remedy the tool rejects is worse than no finding: the author does the work
 * and is told no.
 *
 * Harness-agnostic on purpose: this is a fact about the Node process and the
 * project's `node_modules`, not about Claude Code, so the harness-agnostic
 * detectors may depend on it without reaching into an adapter.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Node runtime capabilities that decide how a TypeScript script is run. */
export interface NodeCaps {
  /** `tsx` is installed locally (the preferred, version-agnostic TS loader). */
  readonly tsx: boolean;
  /** Node supports `--experimental-strip-types` (>= 22.6). */
  readonly stripTypes: boolean;
}

/** Detect TS-running capabilities for a project root. */
export function detectNodeCaps(cwd: string): NodeCaps {
  const tsx =
    existsSync(resolve(cwd, "node_modules/tsx/package.json")) ||
    existsSync(resolve(cwd, "node_modules/.bin/tsx"));
  const stripTypes = process.allowedNodeEnvironmentFlags.has(
    "--experimental-strip-types",
  );
  return { tsx, stripTypes };
}

/**
 * Is there ANY path by which `vigiles test` could execute a TypeScript script
 * here? The exact disjunction `interpreterArgs` branches on — one predicate, so
 * the suggester and the runner cannot drift back apart.
 */
export function canRunTypeScript(caps: NodeCaps): boolean {
  return caps.tsx || caps.stripTypes;
}
